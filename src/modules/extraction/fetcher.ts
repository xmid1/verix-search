import { env } from "../../config/env.js";
import { childLogger } from "../../infra/logger.js";
import { lookup as dnsLookup } from "node:dns/promises";

const log = childLogger({ module: "extraction" });

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
const USER_AGENT = "VerixBot/1.0 (+https://verix.dev/bot)";

/**
 * Returns true if the given IP address (IPv4 or IPv6) is in a private,
 * loopback, link-local, or otherwise reserved range.
 *
 * CIDR ranges checked:
 *   IPv4: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8,
 *         169.254.0.0/16, 0.0.0.0/8
 *   IPv6: ::1, fc00::/7, fe80::/10
 */
function isPrivateIp(ip: string): boolean {
  // IPv6
  if (ip.includes(":")) {
    const normalized = expandIPv6(ip).toLowerCase();
    // ::1 loopback
    if (normalized === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
    // fc00::/7 — unique local (fc00:: to fdff::)
    const firstGroup = parseInt(normalized.slice(0, 4), 16);
    if ((firstGroup & 0xfe00) === 0xfc00) return true;
    // fe80::/10 — link-local
    if ((firstGroup & 0xffc0) === 0xfe80) return true;
    return false;
  }

  // IPv4
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    // Unrecognisable — treat as private to be safe
    return true;
  }
  const [a, b] = parts as [number, number, number, number];

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (172.16.x.x – 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  return false;
}

/**
 * Expand a possibly-compressed IPv6 address to its full 8-group form.
 * Only handles the common compressed notation (::).
 */
function expandIPv6(ip: string): string {
  // Remove surrounding brackets if present (e.g., [::1])
  ip = ip.replace(/^\[|\]$/g, "");

  if (!ip.includes("::")) {
    return ip.padStart(39, "0"); // already full
  }

  const [left, right] = ip.split("::");
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const missing = 8 - leftGroups.length - rightGroups.length;
  const middle = Array<string>(missing).fill("0000");
  return [...leftGroups, ...middle, ...rightGroups]
    .map((g) => g.padStart(4, "0"))
    .join(":");
}

async function validateHost(hostname: string): Promise<void> {
  let addresses: string[];
  try {
    const results = await dnsLookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch (err) {
    throw new Error(`SSRF guard: DNS resolution failed for ${hostname}: ${String(err)}`);
  }

  if (addresses.length === 0) {
    throw new Error(`SSRF guard: no addresses resolved for ${hostname}`);
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error(
        `SSRF guard: ${hostname} resolved to private/reserved IP ${addr} — request blocked`
      );
    }
  }
}

export async function fetchResource(
  url: string
): Promise<{ contentType: string; buffer: Buffer; finalUrl: string }> {
  // Validate scheme first
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`fetchResource: invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`fetchResource: unsupported protocol ${parsed.protocol} — only http/https allowed`);
  }

  // SSRF check on initial hostname
  await validateHost(parsed.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.EXTRACTION_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
      },
      redirect: "follow",
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`fetchResource: fetch failed for ${url}: ${String(err)}`);
  }

  // Re-validate the final URL (after redirects) against SSRF rules
  const finalUrl = response.url || url;
  let finalParsed: URL;
  try {
    finalParsed = new URL(finalUrl);
  } catch {
    clearTimeout(timer);
    throw new Error(`fetchResource: final URL is invalid: ${finalUrl}`);
  }

  if (finalParsed.hostname !== parsed.hostname) {
    // Hostname changed after redirect — re-validate
    await validateHost(finalParsed.hostname).catch((err) => {
      clearTimeout(timer);
      throw err;
    });
  }

  // Check Content-Length header guard
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
      clearTimeout(timer);
      throw new Error(
        `fetchResource: Content-Length ${contentLength} exceeds 15 MB limit for ${url}`
      );
    }
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  // Stream body with size guard
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    if (!response.body) {
      clearTimeout(timer);
      return { contentType, buffer: Buffer.alloc(0), finalUrl };
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_DOWNLOAD_BYTES) {
          reader.cancel().catch(() => undefined);
          throw new Error(
            `fetchResource: response body exceeded 15 MB limit for ${url}`
          );
        }
        chunks.push(Buffer.from(value));
      }
    }
  } finally {
    clearTimeout(timer);
  }

  const buffer = Buffer.concat(chunks);
  log.debug({ url, finalUrl, contentType, bytes: buffer.length }, "fetchResource complete");

  return { contentType, buffer, finalUrl };
}
