/**
 * Static map of technology keywords to preferred authoritative domains.
 * Used by ranking and provider-selection layers to boost results from
 * official or highly-trusted sources for a given technology.
 */
const technologyDomains: Record<string, string[]> = {
  react: ["react.dev", "github.com/facebook/react"],
  next: ["nextjs.org", "github.com/vercel/next.js"],
  nextjs: ["nextjs.org", "github.com/vercel/next.js"],
  vue: ["vuejs.org", "github.com/vuejs/core"],
  angular: ["angular.dev", "github.com/angular/angular"],
  svelte: ["svelte.dev", "github.com/sveltejs/svelte"],
  node: ["nodejs.org", "github.com/nodejs/node"],
  nodejs: ["nodejs.org", "github.com/nodejs/node"],
  deno: ["deno.com", "github.com/denoland/deno"],
  bun: ["bun.sh", "github.com/oven-sh/bun"],
  fastify: ["fastify.dev", "github.com/fastify/fastify"],
  express: ["expressjs.com", "github.com/expressjs/express"],
  hono: ["hono.dev", "github.com/honojs/hono"],
  typescript: ["typescriptlang.org", "github.com/microsoft/TypeScript"],
  python: ["docs.python.org", "github.com/python/cpython"],
  django: ["docs.djangoproject.com", "github.com/django/django"],
  flask: ["flask.palletsprojects.com", "github.com/pallets/flask"],
  fastapi: ["fastapi.tiangolo.com", "github.com/tiangolo/fastapi"],
  rust: ["doc.rust-lang.org", "github.com/rust-lang/rust"],
  go: ["go.dev", "github.com/golang/go"],
  golang: ["go.dev", "github.com/golang/go"],
  java: ["docs.oracle.com/en/java", "github.com/openjdk/jdk"],
  kotlin: ["kotlinlang.org", "github.com/JetBrains/kotlin"],
  swift: ["swift.org", "github.com/apple/swift"],
  docker: ["docs.docker.com", "github.com/docker/cli"],
  kubernetes: ["kubernetes.io", "github.com/kubernetes/kubernetes"],
  k8s: ["kubernetes.io", "github.com/kubernetes/kubernetes"],
  terraform: ["developer.hashicorp.com/terraform", "github.com/hashicorp/terraform"],
  postgres: ["postgresql.org", "github.com/postgres/postgres"],
  postgresql: ["postgresql.org", "github.com/postgres/postgres"],
  mysql: ["dev.mysql.com/doc", "github.com/mysql/mysql-server"],
  redis: ["redis.io", "github.com/redis/redis"],
  mongodb: ["mongodb.com/docs", "github.com/mongodb/mongo"],
  graphql: ["graphql.org", "github.com/graphql/graphql-spec"],
  prisma: ["prisma.io", "github.com/prisma/prisma"],
  openai: ["platform.openai.com/docs", "github.com/openai/openai-python"],
  langchain: ["python.langchain.com", "github.com/langchain-ai/langchain"],
  vite: ["vitejs.dev", "github.com/vitejs/vite"],
  webpack: ["webpack.js.org", "github.com/webpack/webpack"],
  tailwind: ["tailwindcss.com", "github.com/tailwindlabs/tailwindcss"],
  tailwindcss: ["tailwindcss.com", "github.com/tailwindlabs/tailwindcss"],
  linux: ["kernel.org", "man7.org/linux/man-pages"],
  aws: ["docs.aws.amazon.com", "github.com/aws/aws-sdk-js"],
  gcp: ["cloud.google.com/docs", "github.com/googleapis/google-cloud-node"],
  azure: ["learn.microsoft.com/azure", "github.com/Azure/azure-sdk-for-js"],
};

/**
 * Returns the list of preferred domains for a given technology keyword.
 * Lookup is case-insensitive. Returns [] if the technology is unknown.
 */
export function domainsForTechnology(tech: string): string[] {
  const key = tech.toLowerCase().trim();
  return technologyDomains[key] ?? [];
}

export const domainAffinityMap: Readonly<Record<string, string[]>> = technologyDomains;
