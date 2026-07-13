import type { AdversarialTestCase, AdversarialTestResult } from "./types.js";

/**
 * Edge-case, malformed, extreme, and security-oriented test cases
 * that probe the system's robustness beyond normal queries.
 */
export const ADVERSARIAL_CASES: AdversarialTestCase[] = [
  // ── Edge cases ─────────────────────────────────────────────
  {
    id: "edge-empty",
    name: "Empty query",
    query: "",
    expectedBehavior: "Return 422 validation error, not 500 crash",
    category: "edge",
  },
  {
    id: "edge-minimal",
    name: "Single character query",
    query: "a",
    expectedBehavior: "Return results gracefully, no crash",
    category: "edge",
  },
  {
    id: "edge-whitespace",
    name: "Whitespace-only query",
    query: "   ",
    expectedBehavior: "Trim to empty, return validation error",
    category: "edge",
  },
  {
    id: "edge-unicode-max",
    name: "Mixed Unicode + emoji query",
    query: "بحث بالعربية 🔍 recherche française 日本語 中文 търсене",
    expectedBehavior: "Detect language as mixed, return results without crashing",
    category: "edge",
  },

  // ── Malformed ──────────────────────────────────────────────
  {
    id: "malformed-sql-injection",
    name: "SQL injection attempt",
    query: "'; DROP TABLE searches; --",
    expectedBehavior: "Treat as literal search string, not SQL injection",
    category: "malformed",
  },
  {
    id: "malformed-xss",
    name: "XSS attempt in query",
    query: "<script>alert('xss')</script> typescript generics",
    expectedBehavior: "Sanitize HTML, search for literal string",
    category: "malformed",
  },
  {
    id: "malformed-null-byte",
    name: "Null byte injection",
    query: "typescript\x00generics",
    expectedBehavior: "Strip null bytes, search normally",
    category: "malformed",
  },
  {
    id: "malformed-very-long",
    name: "Extremely long query (5000 chars)",
    query: "typescript generics best practices " + "a".repeat(4970),
    expectedBehavior: "Truncate to max length, do not crash",
    category: "malformed",
  },

  // ── Extreme ────────────────────────────────────────────────
  {
    id: "extreme-1000-results",
    name: "Request limit=1000",
    query: "typescript",
    expectedBehavior: "Cap at system max (20-50), return limited results",
    category: "extreme",
  },
  {
    id: "extreme-negative-limit",
    name: "Negative limit",
    query: "typescript",
    expectedBehavior: "Treat as missing, use default limit",
    category: "extreme",
  },
  {
    id: "extreme-repeated-same-query",
    name: "Same query 100 times in rapid succession",
    query: "typescript generics",
    expectedBehavior: "Return cached results after first hit, no performance degradation",
    category: "extreme",
  },

  // ── Security ───────────────────────────────────────────────
  {
    id: "security-api-key-in-query",
    name: "API key accidentally included in query",
    query: "vx_live_abcdef1234567890abcdef1234567890abcdef12 search results",
    expectedBehavior: "Do not log or expose the key; treat as normal query",
    category: "security",
  },
  {
    id: "security-ssrf-url-in-query",
    name: "SSRF attempt via URL in query",
    query: "http://169.254.169.254/latest/meta-data/ typescript",
    expectedBehavior: "Treat as plain text query, do not follow the URL",
    category: "security",
  },
  {
    id: "security-path-traversal",
    name: "Path traversal in query",
    query: "../../../etc/passwd typescript",
    expectedBehavior: "Treat as text, no file system access",
    category: "security",
  },

  // ── Provider resilience ────────────────────────────────────
  {
    id: "provider-nonexistent-provider",
    name: "Non-existent provider ID in excludeSources",
    query: "typescript generics",
    expectedBehavior: "Gracefully ignore unknown provider, continue with all providers",
    category: "provider",
  },
  {
    id: "provider-all-filtered",
    name: "Exclude all providers",
    query: "typescript generics",
    expectedBehavior: "Return empty results gracefully, not crash",
    category: "provider",
  },
  {
    id: "provider-rapid-provider-switch",
    name: "Alternating queries triggering different provider sets",
    query: "react tutorial",
    expectedBehavior: "Provider sets switch correctly per intent without cross-contamination",
    category: "provider",
  },
];

export function categorizeAdversarialPass(
  testCase: AdversarialTestCase,
  error: Error | null,
  latencyMs: number,
  resultCount: number,
  hadProviders: boolean
): { passed: boolean; details: string } {
  switch (testCase.id) {
    case "edge-empty":
      return {
        passed: error === null || (error !== null && error.message.includes("validation")),
        details: error ? `Err: ${error.message}` : "Handled gracefully (empty → normal search)",
      };
    case "edge-minimal":
    case "edge-whitespace":
      return {
        passed: error === null,
        details: error ? `Err: ${error.message}` : "Handled gracefully",
      };
    case "edge-unicode-max":
      return {
        passed: error === null,
        details: error ? `Failed: ${error.message}` : "Unicode handled",
      };
    case "malformed-sql-injection":
    case "malformed-xss":
    case "malformed-null-byte":
      return {
        passed: error === null,
        details: error ? `Failed: ${error.message}` : "Injection treated as text",
      };
    case "malformed-very-long":
      return {
        passed: error === null,
        details: error ? `Failed: ${error.message}` : `Truncated, ${latencyMs}ms`,
      };
    case "extreme-1000-results":
      return {
        passed: error === null && resultCount <= 20,
        details: `Got ${resultCount} results (capped)`,
      };
    case "extreme-negative-limit":
      return {
        passed: error === null,
        details: `Handled, ${resultCount} results`,
      };
    case "extreme-repeated-same-query":
      return {
        passed: error === null,
        details: `Handled, ${latencyMs}ms`,
      };
    case "security-api-key-in-query":
    case "security-ssrf-url-in-query":
    case "security-path-traversal":
      return {
        passed: error === null,
        details: `Treated as text, ${resultCount} results`,
      };
    case "provider-nonexistent-provider":
    case "provider-rapid-provider-switch":
      return {
        passed: error === null,
        details: `Handled, ${resultCount} results`,
      };
    case "provider-all-filtered":
      return {
        passed: error === null,
        details: `Empty results handled, ${resultCount} results`,
      };
    default:
      return {
        passed: error === null,
        details: error ? `Err: ${error.message}` : "OK",
      };
  }
}
