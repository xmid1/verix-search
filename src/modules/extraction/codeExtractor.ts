import type { ExtractedCodeBlock } from "../../core/types.js";

interface Block {
  language: string;
  code: string;
  lines: number;
}

const LANGUAGE_HEURISTICS: Array<{ lang: string; patterns: RegExp[] }> = [
  {
    lang: "rust",
    patterns: [
      /\bfn\s+\w+/,
      /\blet\s+mut\b/,
      /println!/,
      /macro_rules!/,
      /\bimpl\s+\w+/,
      /\btrait\s+\w+/,
      /\bstruct\s+\w+/,
      /\benum\s+\w+/,
      /\bmatch\s+\w+/,
      /\bunsafe\s+\{/,
      /\buse\s+\w+::/,
      /\bpub\s+(fn|struct|enum|trait|mod|use|type)/,
      /fn\s+main\s*\(/,
    ],
  },
  {
    lang: "python",
    patterns: [
      /^def\s+\w+/m,
      /^import\s+\w+/m,
      /^from\s+\w+\s+import/m,
      /^class\s+\w+/m,
      /if\s+__name__\s*==\s*["']__main__["']/,
      /print\s*\(/,
      /\blambda\s+\w+\s*:/,
      /async\s+def\b/,
      /with\s+\w+\s+as\b/,
    ],
  },
  {
    lang: "javascript",
    patterns: [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=\s*(\([^)]*\)\s*=>|[^;]*=>)/,
      /=>\s*\{/,
      /export\s+(default|const|function|class)\b/,
      /import\s+.*\s+from\s+['"]/,
      /require\s*\(['"]/,
      /console\.log\s*\(/,
      /document\.\w+/,
      /document\.getElementById\b/,
      /addEventListener\s*\(/,
      /async\s+function\b/,
      /await\s+\w+/,
    ],
  },
  {
    lang: "typescript",
    patterns: [
      /:\s*(string|number|boolean|void|any|never|unknown)\b/,
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /as\s+\w+/,
      /<\w+>/,
      /Array<\w+>/,
    ],
  },
  {
    lang: "go",
    patterns: [
      /^func\s+\w+/m,
      /^package\s+main\b/m,
      /import\s+"/,
      /\bdefer\s+/,
      /\bgo\s+\w+\(/,
      /\bchan\s+/,
      /\bstruct\s*\{/,
      /\berr\s*!=\s*nil/,
    ],
  },
  {
    lang: "java",
    patterns: [
      /public\s+(static\s+)?(void|int|String|boolean|class|final)/,
      /System\.out\.println/,
      /@Override/,
      /class\s+\w+\s*(extends|implements)/,
      /private\s+\w+\s+\w+/,
      /protected\s+\w+/,
    ],
  },
  {
    lang: "c",
    patterns: [
      /#include\s*[<"][^>"]+[>"]/,
      /int\s+main\s*\(/,
      /printf\s*\(/,
      /scanf\s*\(/,
      /\bNULL\b/,
      /\bsizeof\b/,
      /\bstruct\s+\w+/,
      /\bfree\s*\(/,
    ],
  },
  {
    lang: "cpp",
    patterns: [
      /std::/,
      /#include\s*<iostream>/,
      /template\s*<.*>/,
      /cout\s*<</,
      /cin\s*>>/,
      /::\w+\(/,
      /\bvirtual\b/,
    ],
  },
  {
    lang: "ruby",
    patterns: [
      /^def\s+\w+/m,
      /^class\s+\w+/m,
      /^module\s+\w+/m,
      /attr_accessor\b/,
      /do\s*\|/,
      /end\b/,
      /require\s+['"]/,
      /gem\s+['"]/,
    ],
  },
  {
    lang: "bash",
    patterns: [
      /^#!/m,
      /\bexport\s+\w+=/,
      /\bchmod\b/,
      /\bgrep\b/,
      /\bcurl\b/,
      /\bwget\b/,
      /\bapt-get\b/,
      /\byum\b/,
      /\bbrew\b/,
      /\[\[?\s+.*\s+\]\]?/,
    ],
  },
  {
    lang: "html",
    patterns: [
      /<!DOCTYPE\s+html/i,
      /<html[\s>]/i,
      /<div[\s>]/i,
      /<body[\s>]/i,
      /<head[\s>]/i,
      /<\/\w+>/,
      /class\s*=\s*["']\w+/,
    ],
  },
  {
    lang: "css",
    patterns: [
      /@media\b/,
      /@import\b/,
      /@keyframes\b/,
      /\.\w+\s*\{/,
      /#\w+\s*\{/,
      /\bfont-size\b/,
      /\bdisplay\s*:/,
      /\bflex\b/,
      /\bgrid\b/,
    ],
  },
  {
    lang: "yaml",
    patterns: [
      /^---\s*$/m,
      /^\w+:\s+\w+/m,
      /^\s+-\s+\w+/m,
    ],
  },
  {
    lang: "sql",
    patterns: [
      /\bSELECT\b.*\bFROM\b/is,
      /\bCREATE\s+TABLE\b/i,
      /\bINSERT\s+INTO\b/i,
      /\bALTER\s+TABLE\b/i,
      /\bWHERE\b.*=/i,
      /\bJOIN\b/i,
    ],
  },
  {
    lang: "dockerfile",
    patterns: [
      /^FROM\s+\w+/m,
      /^RUN\s+/m,
      /^CMD\s+/m,
      /^COPY\s+/m,
      /^WORKDIR\s+/m,
      /^EXPOSE\s+\d+/m,
    ],
  },
];

function detectLanguage(code: string): string {
  let bestScore = 0;
  let bestLang = "text";
  for (const { lang, patterns } of LANGUAGE_HEURISTICS) {
    let score = 0;
    for (const p of patterns) {
      if (p.test(code)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }
  return bestScore >= 2 ? bestLang : "text";
}

export function extractCodeBlocks(markdown: string): ExtractedCodeBlock[] {
  const raw: Block[] = [];

  const fenceRegex = /^(`{3,}|~{3,})([\w+\-]*)[ \t]*\r?\n([\s\S]*?)^\1[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(markdown)) !== null) {
    let language = (match[2] ?? "").trim() || "text";
    const code = match[3] ?? "";
    const lines = code.split("\n").length;
    if (!language || language === "text") {
      language = detectLanguage(code);
    }
    raw.push({ language, code, lines });
  }

  const indentRegex = /(?:^|\n\n)((?: {4,}|\t)[^\n]+(?:\n(?: {4,}|\t)[^\n]+)*)/g;
  while ((match = indentRegex.exec(markdown)) !== null) {
    const block = match[1] ?? "";
    const lines = block.split("\n").length;
    const code = block.replace(/^ {4}|^\t/gm, "").trim();
    if (!code) continue;
    const isDuplicate = raw.some((r) => r.code.includes(code.slice(0, 50)));
    if (!isDuplicate) {
      let language = "text";
      language = detectLanguage(code);
      raw.push({ language, code, lines });
    }
  }

  if (raw.length === 0) return [];

  const wordCount = markdown.split(/\s+/).filter(Boolean).length;
  const hasLongBlock = raw.some((b) => b.lines >= 80);
  const looksLikeApiOrTutorial =
    wordCount < 2000 && raw.length >= 2 && raw.every((b) => b.lines < 30);

  return raw.map(({ language, code, lines }): ExtractedCodeBlock => {
    let kind: ExtractedCodeBlock["kind"];

    if (lines >= 80) {
      kind = "production";
    } else if (looksLikeApiOrTutorial && lines < 15) {
      kind = "example";
    } else if (!hasLongBlock && wordCount >= 2000 && lines < 15) {
      kind = "example";
    } else {
      kind = "unknown";
    }

    return { language, code, lines, kind };
  });
}
