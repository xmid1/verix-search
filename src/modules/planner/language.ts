/**
 * Lightweight script-based language detection — good enough to route a query
 * to the right provider set without pulling in a heavy NLP dependency.
 * Falls back to "en" when no strong signal is found.
 */
const SCRIPT_RANGES: Array<{ lang: string; regex: RegExp }> = [
  { lang: "ar", regex: /[\u0600-\u06FF\u0750-\u077F]/ },
  { lang: "zh", regex: /[\u4E00-\u9FFF]/ },
  { lang: "ja", regex: /[\u3040-\u30FF]/ },
  { lang: "ru", regex: /[\u0400-\u04FF]/ },
  { lang: "ko", regex: /[\uAC00-\uD7AF]/ },
];

const LATIN_HINTS: Array<{ lang: string; words: RegExp }> = [
  { lang: "fr", words: /\b(le|la|les|des|est|une|pour|avec|comment)\b/i },
  { lang: "es", words: /\b(el|la|los|las|es|una|para|con|como|qué)\b/i },
  { lang: "de", words: /\b(der|die|das|und|ist|eine|für|mit|wie)\b/i },
];

export function detectLanguage(text: string): string {
  for (const { lang, regex } of SCRIPT_RANGES) {
    if (regex.test(text)) return lang;
  }
  for (const { lang, words } of LATIN_HINTS) {
    if (words.test(text)) return lang;
  }
  return "en";
}
