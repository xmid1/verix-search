import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply, preHandlerHookHandler } from "fastify";
import { verifyApiKey } from "../modules/auth/apiKey.js";
import { verifyJwt } from "../modules/auth/jwt.js";
import { hasScope, type Scope } from "../modules/auth/rbac.js";
import type { AuthContext } from "../core/types.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
  interface FastifyInstance {
    requireAuth(requiredScope?: Scope): preHandlerHookHandler;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  const apiKeyHeader = req.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) return apiKeyHeader;
  return null;
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("requireAuth", function requireAuth(requiredScope?: Scope) {
    return async function preHandler(req: FastifyRequest, reply: FastifyReply) {
      const token = extractToken(req);
      if (!token) {
        return reply.code(401).send({ error: "unauthorized", message: "Missing API key or bearer token" });
      }

      let auth: AuthContext | null = null;
      if (token.split(".").length === 3) {
        const jwtPayload = verifyJwt(token);
        if (jwtPayload) {
          auth = { apiKeyId: jwtPayload.sub, role: jwtPayload.role, scopes: jwtPayload.scopes, projectId: null };
        }
      } else {
        auth = await verifyApiKey(token);
      }

      if (!auth) {
        return reply.code(401).send({ error: "unauthorized", message: "Invalid or revoked credentials" });
      }

      if (requiredScope && !hasScope(auth.scopes, requiredScope)) {
        return reply.code(403).send({ error: "forbidden", message: `Missing required scope: ${requiredScope}` });
      }

      req.auth = auth;
    };
  });
};

export default fp(authPlugin, { name: "verix-auth" });
