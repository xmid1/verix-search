import { type SearchProvider } from "../../core/types.js";

// ── Original 10 providers ──
import { GithubProvider } from "./github.js";
import { WikipediaProvider } from "./wikipedia.js";
import { HackerNewsProvider } from "./hackernews.js";
import { RedditProvider } from "./reddit.js";
import { StackExchangeProvider } from "./stackexchange.js";
import { NpmProvider } from "./npm.js";
import { PypiProvider } from "./pypi.js";
import { ArxivProvider } from "./arxiv.js";
import { CrossrefProvider } from "./crossref.js";
import { MdnProvider } from "./mdn.js";

// ── New providers (Phase 2 — SearXNG competitor) ──
import { DuckDuckGoProvider } from "./duckduckgo.js";
import { BraveProvider } from "./brave.js";
import { YouTubeProvider } from "./youtube.js";
import { DevToProvider as DevtoProvider } from "./devto.js";
import { MediumProvider } from "./medium.js";
import { SemanticScholarProvider } from "./semanticscholar.js";
import { PubMedProvider } from "./pubmed.js";
import { TwitterProvider } from "./twitter.js";
import { GoogleNewsProvider } from "./googlenews.js";

// ── Phase 3 — Specialised providers ──
import { GDELTProvider } from "./gdelt.js";
import { CVEProvider } from "./cve.js";
import { OSVProvider } from "./osv.js";
import { WikidataProvider } from "./wikidata.js";
import { CommonCrawlProvider } from "./commoncrawl.js";
import { InternetArchiveProvider } from "./internetarchive.js";
import { RSSFeedProvider } from "./rss.js";

export const allProviders: SearchProvider[] = [
  // Tier 1 — General search (priority 9-7)
  new BraveProvider(),          // 9
  new GithubProvider(),         // 8
  new SemanticScholarProvider(),// 8
  new PubMedProvider(),         // 8
  new DuckDuckGoProvider(),     // 7
  new StackExchangeProvider(),  // 7
  new MdnProvider(),            // 7
  new ArxivProvider(),          // 7
  new HackerNewsProvider(),     // 7
  new GoogleNewsProvider(),     // 7

  // Tier 2 — Community & docs (priority 6-5)
  new DevtoProvider(),          // 6
  new YouTubeProvider(),        // 6
  new CrossrefProvider(),       // 5
  new RedditProvider(),         // 5
  new MediumProvider(),         // 5
  new TwitterProvider(),        // 5
  new NpmProvider(),            // 5
  new PypiProvider(),           // 5
  new WikipediaProvider(),      // 5

  // Tier 3 — Specialised & archival (priority 4-3)
  new GDELTProvider(),          // 4
  new CVEProvider(),            // 4
  new OSVProvider(),            // 4
  new WikidataProvider(),       // 4
  new CommonCrawlProvider(),    // 3
  new InternetArchiveProvider(),// 3
  new RSSFeedProvider(),        // 3
];

export const providersById: Record<string, SearchProvider> = Object.fromEntries(
  allProviders.map((p) => [p.id, p]),
);

// Re-exports
export { GithubProvider } from "./github.js";
export { WikipediaProvider } from "./wikipedia.js";
export { HackerNewsProvider } from "./hackernews.js";
export { RedditProvider } from "./reddit.js";
export { StackExchangeProvider } from "./stackexchange.js";
export { NpmProvider } from "./npm.js";
export { PypiProvider } from "./pypi.js";
export { ArxivProvider } from "./arxiv.js";
export { CrossrefProvider } from "./crossref.js";
export { MdnProvider } from "./mdn.js";
export { DuckDuckGoProvider } from "./duckduckgo.js";
export { BraveProvider } from "./brave.js";
export { YouTubeProvider } from "./youtube.js";
export { DevToProvider as DevtoProvider } from "./devto.js";
export { MediumProvider } from "./medium.js";
export { SemanticScholarProvider } from "./semanticscholar.js";
export { PubMedProvider } from "./pubmed.js";
export { TwitterProvider } from "./twitter.js";
export { GoogleNewsProvider } from "./googlenews.js";
export { GDELTProvider } from "./gdelt.js";
export { CVEProvider } from "./cve.js";
export { OSVProvider } from "./osv.js";
export { WikidataProvider } from "./wikidata.js";
export { CommonCrawlProvider } from "./commoncrawl.js";
export { InternetArchiveProvider } from "./internetarchive.js";
export { RSSFeedProvider } from "./rss.js";
