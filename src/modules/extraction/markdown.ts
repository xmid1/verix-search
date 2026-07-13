import TurndownService from "turndown";
import type { HTMLNode } from "turndown";

/**
 * Creates a TurndownService instance configured with ATX-style headings and
 * fenced code blocks. A custom rule preserves the language tag from
 * <pre><code class="language-xxx"> or <pre><code class="lang-xxx"> elements.
 */
function createTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Rule 1: All <pre> elements (including syntax-highlighted ones without <code>).
  // Most documentation sites (Wikipedia, MDN, GitHub) use <pre> blocks with inline
  // <span> elements for syntax highlighting, NOT <pre><code>.
  // This rule must come FIRST so it takes priority over the default fencedCodeBlock rule.
  td.addRule("pre", {
    filter: "pre",
    replacement(content: string, node: HTMLNode): string {
      const className = node.getAttribute("class") ?? "";
      const preText = node.textContent ?? "";

      // Try to extract language from <pre> class or any child <code> class
      let language = "";
      const langMatch = className.match(/(?:language-|lang-|brush:|highlight-)([a-zA-Z0-9_+\-.]+)/);
      if (langMatch?.[1]) {
        language = langMatch[1];
      } else {
        const codeEl = node.querySelector("code");
        if (codeEl) {
          const codeClass = codeEl.getAttribute("class") ?? "";
          const codeLangMatch = codeClass.match(/(?:language-|lang-)([a-zA-Z0-9_+\-.]+)/);
          if (codeLangMatch?.[1]) language = codeLangMatch[1];
        }
      }

      const code = preText.trim();
      if (!code) return content;
      return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    },
  });

  return td;
}

// Singleton instance — TurndownService is stateless after construction.
const turndownService = createTurndownService();

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}
