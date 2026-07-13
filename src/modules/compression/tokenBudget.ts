const TOKENS_PER_CHAR = 0.25;
const BASE_RESPONSE_OVERHEAD = 50;

export interface TokenBudgetResult {
  maxResults: number;
  maxCharsPerResult: number;
  maxTotalChars: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

export function computeTokenBudget(
  maxTokens: number,
  estimatedCharsPerResult: number = 2000,
  overheadTokens: number = BASE_RESPONSE_OVERHEAD
): TokenBudgetResult {
  const availableForResults = maxTokens - overheadTokens;
  if (availableForResults <= 0) {
    return { maxResults: 0, maxCharsPerResult: 0, maxTotalChars: 0 };
  }
  const charsPerResult = Math.min(estimatedCharsPerResult, Math.floor(availableForResults / TOKENS_PER_CHAR));
  const maxPossible = Math.floor(availableForResults / (charsPerResult * TOKENS_PER_CHAR));
  return {
    maxResults: Math.min(maxPossible, 20),
    maxCharsPerResult: charsPerResult,
    maxTotalChars: Math.floor(availableForResults / TOKENS_PER_CHAR),
  };
}

export function truncateToBudget<T extends { title: string; snippet?: string }>(results: T[], budget: TokenBudgetResult): T[] {
  const truncated: T[] = [];
  let totalChars = 0;
  for (const r of results) {
    const snippet = r.snippet?.slice(0, budget.maxCharsPerResult) ?? "";
    const entry = { ...r, title: r.title.slice(0, budget.maxCharsPerResult), snippet };
    const entryChars = entry.title.length + (entry.snippet?.length ?? 0);
    if (totalChars + entryChars > budget.maxTotalChars || truncated.length >= budget.maxResults) break;
    totalChars += entryChars;
    truncated.push(entry);
  }
  return truncated;
}
