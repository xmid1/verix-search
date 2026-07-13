const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]{2,}`/g;
const EXAMPLE_INDICATORS = [
  /\bexample\b/i, /\btutorial\b/i, /\bguide\b/i, /\bhow.to\b/i,
  /\bdemo\b/i, /\bsample\b/i, /\brecipe\b/i, /\bquickstart\b/i,
  /\bgetting.started\b/i, /\bwalkthrough\b/i, /\bcookbook\b/i,
  /\bplayground\b/i, /\bsandbox\b/i,
];

export function hasExamplesScore(text?: string): number {
  if (!text || text.trim().length === 0) return 0.5;

  const codeBlocks = text.match(CODE_BLOCK_RE);
  const codeBlockCount = codeBlocks ? codeBlocks.length : 0;

  const inlineCodes = text.match(INLINE_CODE_RE);
  const inlineCodeCount = inlineCodes ? inlineCodes.length : 0;

  if (codeBlockCount >= 3) return 0.95;
  if (codeBlockCount >= 1) return 0.85;
  if (inlineCodeCount >= 5) return 0.75;
  if (inlineCodeCount >= 2) return 0.65;

  const hasExampleKeyword = EXAMPLE_INDICATORS.some((re) => re.test(text));
  if (hasExampleKeyword) return 0.6;

  return 0.5;
}
