import "../src/config/env.js";
import { prisma } from "../src/infra/db.js";
import { generateApiKey } from "../src/modules/auth/apiKey.js";

async function main() {
  const email = process.argv[2] || "admin@verix.dev";
  const role = (process.argv[3] || "ADMIN") as "ADMIN" | "DEVELOPER" | "READ_ONLY" | "SEARCH_ONLY";

  const user = await prisma.user.upsert({
    where: { email },
    update: { role },
    create: { email, name: "Admin", role },
  });

  const key = generateApiKey();

  await prisma.apiKey.create({
    data: {
      prefix: key.prefix,
      hash: key.hash,
      name: "Default admin key",
      role,
      scopes: ["search", "research", "extraction", "streaming", "crawler", "admin"],
      userId: user.id,
    },
  });

  console.log(`\n  User: ${user.email} (${role})`);
  console.log(`  API Key: ${key.plaintext}\n`);
  console.log("  Store this key securely — it will not be shown again.\n");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
