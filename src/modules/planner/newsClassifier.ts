export type NewsCategory =
  | "cybersecurity"
  | "technology"
  | "business"
  | "science"
  | "politics"
  | "entertainment"
  | "health"
  | "general";

interface ClassificationResult {
  category: NewsCategory;
  keywords: string[];
}

const CATEGORY_RULES: Array<{
  category: NewsCategory;
  patterns: RegExp[];
  keywords: string[];
}> = [
  {
    category: "cybersecurity",
    patterns: [
      /\b(breach|breached|breaches)\b/i,
      /\b(exploit|exploits|exploited|exploitation)\b/i,
      /\b(vulnerab|vulnerability|vulnerabilities)\b/i,
      /\b(malware|ransomware|spyware|trojan|virus|worm)\b/i,
      /\b(CVE-\d+|zero.day|0day)\b/i,
      /\b(hacker|hackers|hacking|hacked|hack)\b/i,
      /\b(cyber|cybersecurity|cyber.attack|cybercrime|cyber.war)\b/i,
      /\b(data.leak|data.breach|data.exfiltrat)\b/i,
      /\b(phishing|social.engineering|DDoS|botnet)\b/i,
      /\b(pen.test|penetration.test|red.team|blue.team|security.research)\b/i,
    ],
    keywords: [
      "breach", "exploit", "vulnerability", "malware", "ransomware",
      "CVE", "hacker", "cybersecurity", "phishing", "vulnerability",
      "attack", "security", "threat", "patch", "fix",
    ],
  },
  {
    category: "technology",
    patterns: [
      /\b(AI|artificial.intelligence|machine.learning|deep.learning)\b/i,
      /\b(startup|start.up|funding|series.[ABCDE]|venture.capital)\b/i,
      /\b(launch|launched|product.launch|new.release)\b/i,
      /\b(software|hardware|chip|semiconductor|processor|GPU|CPU)\b/i,
      /\b(robot|automation|autonomous|self.driving)\b/i,
      /\b(blockchain|crypto|bitcoin|ethereum|NFT)\b/i,
      /\b(cloud|SaaS|PaaS|IaaS|infrastructure|platform)\b/i,
    ],
    keywords: [
      "AI", "startup", "funding", "launch", "software", "technology",
      "cloud", "platform", "app", "digital", "innovation",
    ],
  },
  {
    category: "business",
    patterns: [
      /\b(stock|stock.market|share|shares|trading|investor)\b/i,
      /\b(market|economy|economic|inflation|recession|GDP)\b/i,
      /\b(finance|financial|bank|banking|interest.rate|Fed)\b/i,
      /\b(IPO|acquisition|merger|mergers|M&A|takeover)\b/i,
      /\b(earnings|revenue|profit|quarterly|fiscal)\b/i,
      /\b(CEO|CFO|executive|management|leadership|corporate)\b/i,
    ],
    keywords: [
      "stock", "market", "economy", "finance", "IPO", "acquisition",
      "earnings", "revenue", "business", "corporate", "investment",
    ],
  },
  {
    category: "science",
    patterns: [
      /\b(research|study|studies|scientist|scientists|researcher)\b/i,
      /\b(discover|discovery|breakthrough|findings)\b/i,
      /\b(NASA|space|astronomy|telescope|planet|galaxy|mars)\b/i,
      /\b(medical|medicine|drug|clinical.trial|FDA|treatment)\b/i,
      /\b(climate|climate.change|global.warming|environment|ecosystem)\b/i,
      /\b(physics|chemistry|biology|genetic|genome|dna|evolution)\b/i,
    ],
    keywords: [
      "research", "study", "discovery", "science", "NASA", "space",
      "medical", "climate", "environment", "scientist",
    ],
  },
  {
    category: "politics",
    patterns: [
      /\b(election|vote|voting|campaign|president|congress|senate)\b/i,
      /\b(government|policy|legislation|regulation|law|legal)\b/i,
      /\b(democrat|republican|bipartisan|senator|representative)\b/i,
      /\b(foreign.policy|diplomacy|sanction|treaty|summit)\b/i,
      /\b(supreme.court|justice|judge|ruling|constitutional)\b/i,
    ],
    keywords: [
      "election", "government", "policy", "politics", "congress",
      "president", "law", "regulation", "vote", "legislation",
    ],
  },
  {
    category: "entertainment",
    patterns: [
      /\b(movie|film|cinema|actor|actress|director|Hollywood)\b/i,
      /\b(music|album|song|concert|band|singer|musician)\b/i,
      /\b(game|gaming|video.game|console|playstation|xbox|nintendo)\b/i,
      /\b(celebrity|famous|star|tabloid|gossip)\b/i,
      /\b(TV|television|series|episode|streaming|Netflix|Disney)\b/i,
    ],
    keywords: [
      "movie", "music", "game", "celebrity", "TV", "streaming",
      "entertainment", "film", "album", "concert",
    ],
  },
  {
    category: "health",
    patterns: [
      /\b(health|healthcare|medical|hospital|clinic|patient)\b/i,
      /\b(disease|outbreak|epidemic|pandemic|virus|covid|vaccine)\b/i,
      /\b(FDA|CDC|WHO|approval|drug|medicine|treatment|therapy)\b/i,
      /\b(mental.health|depression|anxiety|wellness|nutrition)\b/i,
      /\b(cancer|diabetes|heart|stroke|alzheimer|dementia)\b/i,
    ],
    keywords: [
      "health", "disease", "vaccine", "FDA", "medical", "treatment",
      "hospital", "healthcare", "medicine", "patient", "cancer",
    ],
  },
];

const ALL_PATTERNS = CATEGORY_RULES.flatMap((r) => r.patterns);

export function classifyNews(query: string): ClassificationResult {
  const lower = query.toLowerCase();
  let maxScore = 0;
  let bestCategory: NewsCategory = "general";
  let bestKeywords: string[] = [];

  const hasAnyPattern = ALL_PATTERNS.some((p) => p.test(query));

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      const matches = (query.match(pattern) || []).length;
      score += matches;
    }
    if (score > maxScore) {
      maxScore = score;
      bestCategory = rule.category;
      bestKeywords = rule.keywords;
    }
  }

  if (!hasAnyPattern) {
    return { category: "general", keywords: [] };
  }

  return { category: bestCategory, keywords: bestKeywords };
}
