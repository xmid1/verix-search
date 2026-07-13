import type { FastifyPluginAsync } from "fastify";
import { nanoid } from "nanoid";
import { generateApiKey } from "../modules/auth/apiKey.js";
import { ROLE_DEFAULT_SCOPES, type Scope } from "../modules/auth/rbac.js";
import { prisma } from "../infra/db.js";
import { IssueApiKeySchema, ErrorResponseSchema } from "./schemas.js";

type RoleKey = keyof typeof ROLE_DEFAULT_SCOPES;

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Issuing new API keys is itself an admin-scoped action — bootstrapping the
  // very first key happens out-of-band via scripts/seed.ts.
  fastify.post(
    "/v1/auth/keys",
    {
      preHandler: fastify.requireAuth("admin"),
      schema: {
        tags: ["Auth"],
        summary: "Issue a new API key (admin only)",
        body: IssueApiKeySchema,
        response: { 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request) => {
      const { name, role, projectId } = request.body as { name: string; role: RoleKey; projectId?: string };
      const generated = generateApiKey();
      const record = await prisma.apiKey.create({
        data: {
          id: nanoid(),
          name,
          role: role as any,
          scopes: (ROLE_DEFAULT_SCOPES[role] ?? []) as Scope[],
          hash: generated.hash,
          prefix: generated.prefix,
          projectId,
        },
      });
      // The plaintext key is returned exactly once — only the hash is stored.
      return { id: record.id, name: record.name, role: record.role, scopes: record.scopes, apiKey: generated.plaintext };
    }
  );

  fastify.delete(
    "/v1/auth/keys/:id",
    { preHandler: fastify.requireAuth("admin"), schema: { tags: ["Auth"], summary: "Revoke an API key (admin only)" } },
    async (request) => {
      const { id } = request.params as { id: string };
      await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
      return { revoked: true, id };
    }
  );
};

export default authRoutes;
