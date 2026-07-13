export interface EntityExpansion {
  entities: string[];
  expandedQueries: string[];
  preferredSources: string[];
  excludeSources: string[];
}

const DOMAIN_ENTITY_MAP: Array<{
  domain: string;
  patterns: RegExp[];
  entities: string[];
  expandedQueries: string[];
  preferredSources: string[];
  excludeSources: string[];
}> = [
  {
    domain: "ai_coding_agent",
    patterns: [
      /\b(autonomous\s*(coding|software|code)\s*agent)\b/i,
      /\b(AI\s*(coding|software|code)\s*agent)\b/i,
      /\b(LLM\s*agent|language\s*model\s*agent)\b/i,
      /\b(SWE.?agent|OpenHands|OpenDevin|AutoGPT|CrewAI|LangGraph|MetaGPT|Devin)\b/i,
      /\b(coding\s*agent|code\s*agent|software\s*agent)\b/i,
      /\b(memory\s*(tools?|management|system).*planning.*execution)\b/i,
      /\b(self.?correction|self.?reflect|reflexion)\b/i,
      /\b(repository.?level\s*code\s*gen)\b/i,
    ],
    entities: [
      "OpenHands", "SWE-agent", "SWE-bench", "AutoGPT", "LangGraph",
      "CrewAI", "MetaGPT", "AgentBench", "Reflexion", "ReAct",
      "Voyager", "MemGPT", "CodeAct", "OpenDevin", "Devin", "Devika",
      "AgentCoder", "ChatDev", "CodeGen", "ToolLLM", "Toolformer",
      "autonomous coding agent", "software engineering agent",
      "LLM agent framework", "self-correcting agent",
    ],
    expandedQueries: [
      "SWE-agent autonomous coding agent architecture",
      "OpenHands AI software engineering agent",
      "ReAct reflexion self-correcting agent",
      "MemGPT memory-augmented LLM agent",
      "LangGraph agent planning execution",
      "AutoGPT autonomous task completion agent",
      "CrewAI multi-agent collaboration framework",
      "Devin Cognition autonomous software engineering agent",
      "best open source autonomous coding agents github",
      "LLM agent memory planning execution survey paper",
    ],
    preferredSources: ["arxiv", "semanticscholar", "github"],
    excludeSources: ["mdn", "wikipedia", "devto"],
  },
  {
    domain: "cybersecurity_competition",
    patterns: [
      /\b(cybersecurity|cyber\s*security)\s*(competition|challenge|contest|CTF)\b/i,
      /\b(CTF|capture\s*the\s*flag)\b/i,
      /\b(hacking\s*competition|hackathon.*security)\b/i,
      /\b(DEF\s*CON|defcon)\b/i,
      /\b(cyber\s*challenge|national\s*cyber\s*league)\b/i,
    ],
    entities: [
      "CTF", "DEF CON", "DEFCON CTF", "Cyber Challenge",
      "National Cyber League", "PicoCTF", "HackTheBox",
      "TryHackMe", "CyberPatriot", "SECCDC",
    ],
    expandedQueries: [
      "CTF cybersecurity competition winners 2026",
      "DEF CON CTF winning techniques tools",
      "cybersecurity competition writeup techniques",
    ],
    preferredSources: ["googlenews", "twitter", "hackernews", "stackexchange"],
    excludeSources: ["wikipedia"],
  },
  {
    domain: "llm_research_paper",
    patterns: [
      /\b(LLM|large\s*language\s*model)\s*(paper|research|survey|benchmark)\b/i,
      /\b(state.?of.?the.?art|SOTA)\s*(LLM|language\s*model)\b/i,
      /\b(best\s*(open.?source|OSS)\s*(LLM|model|project))\b/i,
    ],
    entities: [
      "LLM survey", "language model benchmark", "SOTA LLM",
    ],
    expandedQueries: [
      "state of the art LLM survey 2026",
      "best open source LLM models comparison",
    ],
    preferredSources: ["semanticscholar", "arxiv", "pubmed", "github"],
    excludeSources: ["mdn", "devto"],
  },
];

export function expandEntities(query: string): EntityExpansion | null {
  const lower = query.toLowerCase();
  for (const domain of DOMAIN_ENTITY_MAP) {
    const matched = domain.patterns.some((p) => p.test(query));
    if (matched) {
      return {
        entities: domain.entities,
        expandedQueries: domain.expandedQueries,
        preferredSources: domain.preferredSources,
        excludeSources: domain.excludeSources,
      };
    }
  }
  return null;
}
