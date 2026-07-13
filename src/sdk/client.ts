export interface VerixClientOptions {
  baseUrl?: string;
  apiKey: string;
}

export interface SearchOptions {
  limit?: number;
  scrape?: boolean;
  maxTokens?: number;
}

export interface SearchResult {
  id: string;
  url: string;
  title: string;
  snippet?: string;
  provider: string;
  publishedAt?: string;
  author?: string;
  finalScore: number;
  signals: Record<string, number>;
}

export interface SearchResponse {
  traceId: string;
  intent?: string;
  language?: string;
  providersUsed: string[];
  results: SearchResult[];
  latencyMs: number;
  degraded?: boolean;
  cached?: boolean;
}

export interface ResearchOptions {
  depth?: number;
  maxTokens?: number;
}

export interface ResearchResponse {
  question: string;
  summary: string;
  keyFacts: string[];
  confidence: { score: number; evidence: string[]; unknowns: string[] };
  citations: Array<{ url: string; title: string; author?: string }>;
}

export interface ExtractOptions {
  schema?: Record<string, unknown>;
}

export interface ExtractResponse {
  url: string;
  title: string;
  markdown: string;
  structured?: Record<string, unknown>;
}

export class VerixClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(opts: VerixClientOptions) {
    this.baseUrl = opts.baseUrl ?? "http://localhost:5000";
    this.apiKey = opts.apiKey;
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
    };
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchResponse> {
    const res = await fetch(`${this.baseUrl}/v1/search`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ query, ...opts }),
    });
    if (!res.ok) throw new Error(`Verix search failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<SearchResponse>;
  }

  async research(question: string, opts?: ResearchOptions): Promise<ResearchResponse> {
    const res = await fetch(`${this.baseUrl}/v1/research`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ question, ...opts }),
    });
    if (!res.ok) throw new Error(`Verix research failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<ResearchResponse>;
  }

  async extract(url: string, opts?: ExtractOptions): Promise<ExtractResponse> {
    const res = await fetch(`${this.baseUrl}/v1/extract`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ url, ...opts }),
    });
    if (!res.ok) throw new Error(`Verix extract failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<ExtractResponse>;
  }

  async verifyClaim(claim: string, sourceUrl: string): Promise<{
    verdict: string;
    confidence: number;
    evidenceVerified: boolean;
    evidence?: string;
  }> {
    const res = await fetch(`${this.baseUrl}/v1/verify-claim`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ claim, sourceUrl }),
    });
    if (!res.ok) throw new Error(`Verix verify failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ verdict: string; confidence: number; evidenceVerified: boolean; evidence?: string }>;
  }

  async *researchStream(question: string): AsyncGenerator<{ type: string; message?: string; data?: unknown }> {
    const res = await fetch(`${this.baseUrl}/v1/research/stream?question=${encodeURIComponent(question)}`, {
      headers: { "X-API-Key": this.apiKey },
    });
    if (!res.ok) throw new Error(`Verix research stream failed: ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try { yield JSON.parse(line.slice(6)); }
          catch { /* skip malformed */ }
        }
      }
    }
  }
}
