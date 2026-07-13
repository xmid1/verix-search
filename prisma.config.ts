import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * `prisma generate` only reads schema.prisma and never opens a DB
 * connection, but the Prisma CLI still loads this config file (and would
 * eagerly throw via `env()`) for every command, including `generate`. Build
 * stages (e.g. Docker builds on Railway) commonly run `prisma generate`
 * without the real database secret present. Read the variable directly with
 * a harmless placeholder fallback so `generate` never fails; commands that
 * actually connect (`db push`, `migrate`, `studio`) still require the real
 * SUPABASE_DATABASE_URL to be set in that environment, and will fail with a
 * clear connection error if it isn't.
 */
export default defineConfig({
  datasource: {
    url: process.env.SUPABASE_DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
