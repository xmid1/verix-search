import type { FastifyPluginAsync } from "fastify";
import { runDeepResearch } from "../modules/research/index.js";
import { executeSearch } from "../modules/search/orchestrator.js";
import { createEmitter } from "../modules/streaming/events.js";
import { verifyApiKey } from "../modules/auth/apiKey.js";
import { verifyJwt } from "../modules/auth/jwt.js";

interface WsRequest {
  id: string;
  action: "search" | "research";
  payload: { query?: string; question?: string; limit?: number };
}

/**
 * WebSocket gateway (spec's realtime channel): a single long-lived socket
 * that accepts { id, action, payload } messages and streams back progress +
 * a final result tagged with the same id, so a client can multiplex several
 * in-flight requests over one connection.
 */
const wsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/v1/ws", { websocket: true, schema: { hide: true } }, (socket, request) => {
    const token =
      (request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : null) ??
      (request.query as Record<string, string> | undefined)?.["apiKey"] ??
      null;

    let authorized = false;
    void (async () => {
      if (!token) return;
      authorized = token.split(".").length === 3 ? Boolean(verifyJwt(token)) : Boolean(await verifyApiKey(token));
    })();

    socket.on("message", async (raw: Buffer) => {
      if (!authorized) {
        socket.send(JSON.stringify({ type: "error", message: "Unauthorized: provide a valid API key or bearer token" }));
        return;
      }
      let msg: WsRequest;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid JSON message" }));
        return;
      }

      const emit = createEmitter((event) => socket.send(JSON.stringify({ id: msg.id, ...event })));

      try {
        if (msg.action === "search" && msg.payload.query) {
          const result = await executeSearch(msg.payload.query, { limit: msg.payload.limit });
          socket.send(JSON.stringify({ id: msg.id, type: "result", data: result }));
        } else if (msg.action === "research" && msg.payload.question) {
          const result = await runDeepResearch(msg.payload.question, { emit });
          socket.send(JSON.stringify({ id: msg.id, type: "result", data: result }));
        } else {
          socket.send(JSON.stringify({ id: msg.id, type: "error", message: "Unknown action or missing payload field" }));
        }
      } catch (err) {
        socket.send(JSON.stringify({ id: msg.id, type: "error", message: (err as Error).message }));
      }
    });
  });
};

export default wsRoutes;
