import type { BenchmarkQuery, JudgedResult, RelevanceGrade } from "./types.js";

const j = (url: string, title: string, grade: RelevanceGrade, note?: string): JudgedResult => ({
  url, title, grade, note,
});

export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // ── Programming ──────────────────────────────────────────────
  {
    id: "prog-ts-generics",
    query: "typescript generics best practices advanced patterns",
    domain: "programming",
    intent: "programming",
    expectedProviders: ["github", "stackexchange", "mdn", "devto", "medium"],
    expectedTopics: ["TypeScript", "generics", "constraints", "conditional types"],
    excludedTopics: ["JavaScript without types", "React components", "CSS"],
    relevanceJudgments: [
      j("https://www.typescriptlang.org/docs/handbook/2/generics.html", "TypeScript Handbook: Generics", "perfect", "Official docs, comprehensive"),
      j("https://github.com/microsoft/TypeScript", "Microsoft/TypeScript", "good", "Source repo, authoritative"),
      j("https://stackoverflow.com/questions/tagged/typescript-generics", "Stack Overflow: TypeScript Generics", "good", "Community Q&A, practical patterns"),
      j("https://dev.to/t/typescript", "Dev.to TypeScript articles", "fair", "Community blog, variable quality"),
      j("https://medium.com/tag/typescript", "Medium TypeScript stories", "fair", "Mixed quality, some SEO spam"),
    ],
    notes: "Should prioritize official docs over blog posts",
  },
  {
    id: "prog-rust-ownership",
    query: "Rust ownership borrowing rules explained with examples",
    domain: "programming",
    intent: "programming",
    expectedProviders: ["github", "wikipedia", "stackexchange", "reddit", "medium"],
    expectedTopics: ["Rust", "ownership", "borrowing", "lifetimes", "memory safety"],
    excludedTopics: ["C++ pointers", "garbage collection", "JavaScript"],
    relevanceJudgments: [
      j("https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html", "The Rust Book: Ownership", "perfect", "Official docs, canonical"),
      j("https://github.com/rust-lang/rust", "rust-lang/rust", "good", "Source repo"),
      j("https://stackoverflow.com/questions/tagged/rust+ownership", "Stack Overflow: Rust ownership", "good", "Practical examples"),
      j("https://en.wikipedia.org/wiki/Rust_(programming_language)", "Wikipedia: Rust", "fair", "Overview, not deep"),
    ],
  },
  {
    id: "prog-react-server-components",
    query: "React Server Components vs Client Components differences when to use each",
    domain: "programming",
    intent: "programming",
    expectedProviders: ["github", "mdn", "stackexchange", "devto", "medium", "reddit"],
    expectedTopics: ["React", "Server Components", "Client Components", "RSC", "Next.js"],
    excludedTopics: ["Vue", "Angular", "Svelte", "jQuery"],
    relevanceJudgments: [
      j("https://react.dev/blog/2023/03/22/introducing-react-server-components", "Introducing React Server Components", "perfect", "Official announcement, authoritative"),
      j("https://github.com/facebook/react", "facebook/react", "good", "Source repo"),
      j("https://stackoverflow.com/questions/tagged/react-server-components", "Stack Overflow: RSC", "good", "Practical Q&A"),
      j("https://dev.to/t/react", "Dev.to React articles", "fair", "Community content"),
    ],
  },

  // ── Research: AI Agents ──────────────────────────────────────
  {
    id: "research-swe-agent",
    query: "SWE-agent OpenHands Devin autonomous software engineering agents comparison benchmarks",
    domain: "research_ai",
    intent: "research",
    expectedProviders: ["arxiv", "github", "semanticscholar", "wikipedia"],
    expectedTopics: ["SWE-agent", "OpenHands", "Devin", "SWE-bench", "autonomous coding", "LLM agents"],
    excludedTopics: ["React", "web development", "CSS", "Express.js", "deployment"],
    relevanceJudgments: [
      j("https://arxiv.org/abs/2401.00893", "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering", "perfect", "Primary source paper"),
      j("https://arxiv.org/abs/2401.00893", "SWE-agent arXiv paper", "perfect", "Same paper, primary source"),
      j("https://github.com/princeton-nlp/SWE-agent", "SWE-agent GitHub repository", "good", "Open source implementation"),
      j("https://github.com/All-Hands-AI/OpenHands", "OpenHands GitHub repository", "good", "Open source implementation"),
      j("https://arxiv.org/abs/2401.00893", "Devin: Cognition AI", "good", "Technical report"),
      j("https://en.wikipedia.org/wiki/Software_engineering", "Wikipedia: Software Engineering", "fair", "Background, not specific"),
      j("https://react.dev/blog/2023/03/22/introducing-react-server-components", "React Server Components", "bad", "Completely off-topic, keyword hijack"),
    ],
    notes: "Critical: Must NOT return React or web dev content. The react.dev hijack was a past bug.",
  },
  {
    id: "research-re-act-reflexion",
    query: "ReAct Reflexion reasoning action patterns LLM agents compared",
    domain: "research_ai",
    intent: "research",
    expectedProviders: ["arxiv", "semanticscholar", "github", "wikipedia"],
    expectedTopics: ["ReAct", "Reflexion", "reasoning", "acting", "LLM agents", "chain-of-thought"],
    excludedTopics: ["React.js", "frontend", "web framework", "chemical reaction"],
    relevanceJudgments: [
      j("https://arxiv.org/abs/2210.03629", "ReAct: Synergizing Reasoning and Acting in Language Models", "perfect", "Original ReAct paper"),
      j("https://arxiv.org/abs/2303.11366", "Reflexion: Language Agents with Verbal Reinforcement Learning", "perfect", "Original Reflexion paper"),
      j("https://github.com/ysymyth/ReAct", "ReAct GitHub repo", "good", "Official implementation"),
      j("https://github.com/noahshinn/reflexion", "Reflexion GitHub repo", "good", "Official implementation"),
    ],
    notes: "Must NOT confuse ReAct (reasoning agent) with React (web framework)",
  },
  {
    id: "research-llm-agents-survey",
    query: "LLM agent frameworks survey 2024 tool use planning memory autonomous systems",
    domain: "research_ai",
    intent: "research",
    expectedProviders: ["arxiv", "semanticscholar", "github", "wikipedia"],
    expectedTopics: ["LLM agents", "tool use", "planning", "memory", "autonomous", "survey"],
    excludedTopics: ["ChatGPT consumer tips", "prompt engineering tricks"],
    relevanceJudgments: [
      j("https://arxiv.org/abs/2308.11432", "Survey of LLM Agents", "perfect", "Comprehensive survey paper"),
      j("https://github.com/microsoft/autogen", "AutoGen", "good", "Popular framework"),
      j("https://github.com/langchain-ai/langchain", "LangChain", "good", "Popular framework"),
      j("https://github.com/crewAIInc/crewAI", "CrewAI", "fair", "Multi-agent framework"),
    ],
  },

  // ── Research: Security ───────────────────────────────────────
  {
    id: "research-zero-day",
    query: "critical zero day exploit CVE 2024 remote code execution actively exploited in the wild",
    domain: "research_security",
    intent: "security",
    expectedProviders: ["cve", "osv", "googlenews", "github", "reddit"],
    expectedTopics: ["CVE", "zero-day", "RCE", "exploit", "vulnerability"],
    excludedTopics: ["gaming cheats", "minecraft exploits"],
    relevanceJudgments: [
      j("https://www.cve.org/", "CVE.org", "perfect", "Official CVE database"),
      j("https://osv.dev/", "OSV.dev", "good", "Open source vulnerability DB"),
    ],
  },

  // ── News ─────────────────────────────────────────────────────
  {
    id: "news-cybersecurity-breach",
    query: "major data breach 2024 leaked credentials authentication bypass",
    domain: "news_cybersecurity",
    intent: "news",
    newsCategory: "cybersecurity",
    expectedProviders: ["googlenews", "rss", "twitter", "reddit", "hackernews"],
    expectedTopics: ["data breach", "leaked credentials", "authentication bypass", "cybersecurity"],
    excludedTopics: ["celebrity news", "sports", "entertainment"],
    relevanceJudgments: [
      j("https://news.google.com/search?q=data+breach+2024", "Google News: Data Breach", "good", "News aggregation"),
      j("https://thehackernews.com/", "The Hacker News", "good", "Cybersecurity news"),
    ],
    notes: "should exclude hackernews provider per cybersecurity category rule",
  },

  // ── Academic ─────────────────────────────────────────────────
  {
    id: "academic-attention-mechanism",
    query: "attention is all you need transformer architecture explained implementation details",
    domain: "academic",
    intent: "academic",
    expectedProviders: ["arxiv", "semanticscholar", "crossref", "wikipedia", "github"],
    expectedTopics: ["attention", "transformer", "self-attention", "multi-head attention", "positions encoding"],
    excludedTopics: ["CNNs", "RNNs", "LSTMs", "computer vision"],
    relevanceJudgments: [
      j("https://arxiv.org/abs/1706.03762", "Attention Is All You Need", "perfect", "Original paper, seminal"),
      j("https://en.wikipedia.org/wiki/Attention_(machine_learning)", "Wikipedia: Attention", "good", "Reference"),
      j("https://github.com/tensorflow/tensor2tensor", "Tensor2Tensor", "good", "Original implementation"),
    ],
  },
  {
    id: "academic-llm-benchmark",
    query: "MMLU HumanEval SWE-bench LLM benchmark evaluation results comparison methodology",
    domain: "academic",
    intent: "academic",
    expectedProviders: ["arxiv", "semanticscholar", "github", "wikipedia"],
    expectedTopics: ["MMLU", "HumanEval", "SWE-bench", "LLM evaluation", "benchmark"],
    excludedTopics: ["game benchmarks", "CPU benchmarks"],
    relevanceJudgments: [
      j("https://arxiv.org/abs/2009.03393", "MMLU: Massive Multitask Language Understanding", "perfect", "Original MMLU paper"),
      j("https://github.com/hendrycks/test", "MMLU GitHub", "good", "Official dataset"),
      j("https://github.com/princeton-nlp/SWE-bench", "SWE-bench GitHub", "good", "Official benchmark"),
    ],
  },

  // ── Documentation ────────────────────────────────────────────
  {
    id: "docs-fastify-plugin",
    query: "fastify plugin development typescript decorators hooks lifecycle best practices",
    domain: "documentation",
    intent: "documentation",
    expectedProviders: ["mdn", "stackexchange", "github", "reddit", "medium"],
    expectedTopics: ["Fastify", "plugin", "decorator", "hook", "lifecycle", "TypeScript"],
    excludedTopics: ["Express.js", "Koa", "Hapi", "NestJS"],
    relevanceJudgments: [
      j("https://fastify.dev/docs/latest/Reference/Plugins/", "Fastify Plugins Documentation", "perfect", "Official docs"),
      j("https://github.com/fastify/fastify", "fastify/fastify", "good", "Source repo"),
      j("https://stackoverflow.com/questions/tagged/fastify", "Stack Overflow: Fastify", "fair", "Community Q&A"),
    ],
  },

  // ── Package ─────────────────────────────────────────────────
  {
    id: "package-npm-zod",
    query: "zod validation library npm typescript schema parsing runtime type safety",
    domain: "package",
    intent: "package",
    expectedProviders: ["npm", "github", "mdn", "stackexchange", "reddit"],
    expectedTopics: ["zod", "validation", "TypeScript", "schema", "runtime types"],
    excludedTopics: ["yup", "joi", "class-validator"],
    relevanceJudgments: [
      j("https://www.npmjs.com/package/zod", "npm: zod", "perfect", "Official package page"),
      j("https://github.com/colinhacks/zod", "colinhacks/zod", "good", "Source repo"),
    ],
  },

  // ── Comparison ───────────────────────────────────────────────
  {
    id: "comparison-bun-deno-node",
    query: "Bun vs Deno vs Node.js 2024 performance comparison runtime benchmarks features",
    domain: "comparison",
    intent: "comparison",
    expectedProviders: ["github", "reddit", "stackexchange", "medium", "youtube", "wikipedia"],
    expectedTopics: ["Bun", "Deno", "Node.js", "performance", "comparison", "runtime", "benchmarks"],
    excludedTopics: ["Python", "Rust", "Go", "Java"],
    relevanceJudgments: [
      j("https://bun.sh/", "Bun.sh", "good", "Official site"),
      j("https://deno.com/", "Deno.com", "good", "Official site"),
      j("https://nodejs.org/", "Node.js", "good", "Official site"),
      j("https://github.com/oven-sh/bun", "oven-sh/bun", "good", "Bun source"),
      j("https://github.com/denoland/deno", "denoland/deno", "good", "Deno source"),
      j("https://github.com/nodejs/node", "nodejs/node", "good", "Node source"),
    ],
  },

  // ── Tutorial ────────────────────────────────────────────────
  {
    id: "tutorial-nextjs-app-router",
    query: "Next.js 14 app router tutorial step by step server components data fetching",
    domain: "tutorial",
    intent: "tutorial",
    expectedProviders: ["github", "mdn", "devto", "youtube", "medium", "reddit"],
    expectedTopics: ["Next.js", "app router", "server components", "data fetching", "tutorial"],
    excludedTopics: ["pages router", "class components", "PHP"],
    relevanceJudgments: [
      j("https://nextjs.org/docs", "Next.js Documentation", "perfect", "Official docs"),
      j("https://github.com/vercel/next.js", "vercel/next.js", "good", "Source repo"),
      j("https://www.youtube.com/results?search_query=nextjs+app+router+tutorial", "YouTube tutorials", "fair", "Video content"),
    ],
  },
];
