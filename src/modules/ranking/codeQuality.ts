const CODE_DOMAIN_PATTERNS = [
  { pattern: /^https?:\/\/(www\.)?github\.com\//i, score: 0.9 },
  { pattern: /^https?:\/\/(www\.)?gitlab\.com\//i, score: 0.85 },
  { pattern: /^https?:\/\/(www\.)?bitbucket\.org\//i, score: 0.8 },
  { pattern: /^https?:\/\/(www\.)?npmjs\.com\//i, score: 0.85 },
  { pattern: /^https?:\/\/(www\.)?pypi\.org\//i, score: 0.8 },
  { pattern: /^https?:\/\/crates\.io\//i, score: 0.85 },
  { pattern: /^https?:\/\/docs\.rs\//i, score: 0.9 },
  { pattern: /^https?:\/\/deno\.land\//i, score: 0.8 },
  { pattern: /^https?:\/\/unpkg\.com\//i, score: 0.75 },
  { pattern: /^https?:\/\/cdn\.jsdelivr\.net\//i, score: 0.75 },
  { pattern: /^https?:\/\/stackblitz\.com\//i, score: 0.7 },
  { pattern: /^https?:\/\/codesandbox\.io\//i, score: 0.7 },
  { pattern: /^https?:\/\/replit\.com\//i, score: 0.7 },
  { pattern: /^https?:\/\/codepen\.io\//i, score: 0.7 },
  { pattern: /^https?:\/\/(www\.)?sourceforge\.net\//i, score: 0.65 },
];

export function codeQualityScore(url?: string, snippet?: string): number {
  if (!url) return 0.5;

  for (const { pattern, score } of CODE_DOMAIN_PATTERNS) {
    if (pattern.test(url)) return score;
  }

  if (snippet) {
    const codeIndicators = [
      /\b(typescript|javascript|python|rust|go|java|c\+\+|ruby)\b/i,
      /\b(git|commit|branch|merge|pr|pull.request)\b/i,
      /\b(api|sdk|library|framework|module|package|dependency)\b/i,
      /\b(install|npm install|pip install|cargo install|go get)\b/i,
      /\b(function|class|interface|type|import|export|const|let|var)\b/i,
    ];
    const matchCount = codeIndicators.filter((re) => re.test(snippet)).length;
    if (matchCount >= 3) return 0.75;
    if (matchCount >= 1) return 0.6;
  }

  return 0.5;
}
