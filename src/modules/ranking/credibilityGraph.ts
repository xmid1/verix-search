import { prisma } from "../../infra/db.js";

export interface CredibilityRecord {
  domain: string;
  provider: string;
  score: number;
  signals: number;
  lastUpdated: string;
}

export async function recordFeedback(
  domain: string,
  provider: string,
  signal: number,
  _reason?: string
): Promise<void> {
  try {
    const existing = await prisma.sourceCredibility.findUnique({
      where: { domain_provider: { domain, provider } },
    });

    if (!existing) {
      await prisma.sourceCredibility.create({
        data: { domain, provider, score: signal, signals: 1 },
      });
      return;
    }

    const newScore = existing.signals < 10
      ? existing.score + signal
      : existing.score * 0.95 + signal * 0.05;

    await prisma.sourceCredibility.update({
      where: { domain_provider: { domain, provider } },
      data: {
        score: Math.round(Math.max(0, Math.min(100, newScore))),
        signals: { increment: 1 },
        lastUpdated: new Date(),
      },
    });
  } catch { }
}

export async function getCredibility(
  domain: string,
  provider: string
): Promise<number | null> {
  try {
    const row = await prisma.sourceCredibility.findUnique({
      where: { domain_provider: { domain, provider } },
      select: { score: true },
    });
    return row?.score ?? null;
  } catch {
    return null;
  }
}

export async function credibilityMultiplier(
  domain: string,
  provider: string
): Promise<number> {
  const cred = await getCredibility(domain, provider);
  if (cred === null) return 1.0;
  return 0.8 + (cred / 100) * 0.4;
}

export function heuristicCredibility(domain: string, provider: string): number {
  let score = 50;

  const highTrustDomains = [
    ".edu", ".gov", ".mil", "wikipedia.org", "arxiv.org", "github.com",
    "stackoverflow.com", "stackexchange.com", "developer.mozilla.org",
    "scholar.google.com", "semanticscholar.org", "pubmed.ncbi.nlm.nih.gov",
    "ieee.org", "acm.org", "nature.com", "science.org", "springer.com",
  ];
  const lowTrustDomains = [
    "medium.com", "dev.to", "vocal.media", "quora.com", "hubpages.com",
    "wikihow.com", "buzzfeed.com", "dailymail.co.uk",
  ];

  for (const htd of highTrustDomains) {
    if (domain.endsWith(htd) || domain.includes(htd)) {
      score += 15;
      break;
    }
  }

  for (const ltd of lowTrustDomains) {
    if (domain.includes(ltd)) {
      score -= 15;
      break;
    }
  }

  const highTrustProviders = ["arxiv", "semanticscholar", "pubmed", "github", "mdn"];
  if (highTrustProviders.includes(provider)) score += 10;

  return Math.max(0, Math.min(100, score));
}
