import { prisma } from "../../infra/db.js";

export interface SourceMemory {
  domain: string;
  provider: string;
  topicTags: string[];
  avgScore: number;
  timesUsed: number;
  lastQueried: string | null;
}

export async function rememberSourceUse(
  domain: string,
  provider: string,
  query: string,
  score: number
): Promise<void> {
  try {
    const topics = extractTopics(query);
    const existing = await prisma.sourceMemory.findUnique({
      where: { domain_provider: { domain, provider } },
      select: { topicTags: true, avgScore: true, timesUsed: true },
    });

    if (!existing) {
      await prisma.sourceMemory.create({
        data: {
          domain, provider,
          topicTags: topics,
          avgScore: Math.round(score * 100) / 100,
          timesUsed: 1,
          lastQueried: new Date(),
        },
      });
      return;
    }

    const mergedTags = [...new Set([...existing.topicTags, ...topics])];
    const newAvg = (existing.avgScore * existing.timesUsed + score) / (existing.timesUsed + 1);

    await prisma.sourceMemory.update({
      where: { domain_provider: { domain, provider } },
      data: {
        topicTags: mergedTags,
        avgScore: Math.round(newAvg * 100) / 100,
        timesUsed: { increment: 1 },
        lastQueried: new Date(),
      },
    });
  } catch { }
}

export async function getSourceMemory(
  domain: string,
  provider: string
): Promise<SourceMemory | null> {
  try {
    const row = await prisma.sourceMemory.findUnique({
      where: { domain_provider: { domain, provider } },
    });
    return row as SourceMemory | null;
  } catch {
    return null;
  }
}

export async function findBestSources(query: string): Promise<{ domain: string; provider: string; score: number }[]> {
  try {
    const topics = extractTopics(query);
    if (topics.length === 0) return [];

    const rows = await prisma.sourceMemory.findMany({
      where: {
        topicTags: { hasSome: topics },
      },
      orderBy: [{ avgScore: "desc" }, { timesUsed: "desc" }],
      take: 10,
      select: { domain: true, provider: true, avgScore: true },
    });

    return rows.map((r) => ({ domain: r.domain, provider: r.provider, score: r.avgScore }));
  } catch {
    return [];
  }
}

function extractTopics(query: string): string[] {
  const stopwords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "it", "its", "this", "that",
    "what", "which", "who", "how", "where", "when", "why",
    "want", "need", "get", "make", "use", "build", "can", "will", "would",
    "should", "could", "about", "into", "over", "up", "out", "just", "also",
    "very", "too", "much", "many", "some", "any", "all", "more", "most",
    "not", "no", "yes", "like", "well", "back", "going", "looking",
  ]);

  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !stopwords.has(w));
}
