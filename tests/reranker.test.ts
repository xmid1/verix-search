import { describe, it, expect } from "vitest";
import { computeTopicAlignment, rerank } from "../src/modules/ranking/reranker.js";

describe("computeTopicAlignment", () => {
  it("high alignment for matching document", () => {
    const score = computeTopicAlignment(
      "autonomous coding agent with memory tools planning execution self correction",
      "OpenHands: An Autonomous AI Software Engineering Agent",
      "OpenHands is a platform for autonomous coding agents with memory, planning, and execution capabilities.",
      "arxiv"
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it("low alignment for keyword-hijacked document", () => {
    const score = computeTopicAlignment(
      "build production grade autonomous coding agent with memory tools planning execution",
      "Express Tutorial Part 7: Deploying to production",
      "Now that you've created a sample website using Express, it's time to deploy it to production.",
      "mdn"
    );
    // "production" matches but nothing about agents, memory, planning, execution
    expect(score).toBeLessThan(0.4);
  });

  it("penalizes dev.to for research queries about agents", () => {
    const score = computeTopicAlignment(
      "best open source autonomous coding agent paper",
      "Guarding the till while autonomous data agents do the digging",
      "Autonomous agents are genuinely good at answering messy business questions.",
      "devto"
    );
    // Should get source penalty because dev.to + research topic
    expect(score).toBeLessThan(0.6);
  });

  it("moderate alignment for partially matching document", () => {
    const score = computeTopicAlignment(
      "autonomous coding agent memory planning execution",
      "LangGraph: Building Stateful Multi-Agent Applications",
      "LangGraph provides tools for building agent applications with planning and execution.",
      "github"
    );
    expect(score).toBeGreaterThan(0.3);
  });
});

describe("rerank", () => {
  it("reorders results by topic alignment", () => {
    const results = [
      { id: "1", query: "autonomous coding agent", title: "Express deployment to production", snippet: "deploy express to production", provider: "mdn", finalScore: 90 },
      { id: "2", query: "autonomous coding agent", title: "OpenHands: AI Coding Agent", snippet: "autonomous coding agent with tools", provider: "github", finalScore: 70 },
    ];
    const reranked = rerank("autonomous coding agent", results);
    // Result 2 should now be first (better topic alignment)
    expect(reranked[0].id).toBe("2");
    expect(reranked[0].finalScore).toBeGreaterThan(reranked[1].finalScore);
  });

  it("react.dev drops below relevant arxiv paper after rerank (P1)", () => {
    // Simulates the real scenario: reactjs/react.dev has zero concept overlap
    // with an AI-agent query, but scored high due to BM25.
    const results = [
      {
        id: "github-repo-reactjs-react.dev",
        query: "SWE-agent OpenHands Devin ReAct Reflexion papers autonomous software engineering agents",
        title: "reactjs/react.dev",
        snippet: "reactjs/react.dev — GitHub repository",
        provider: "github",
        finalScore: 72,
      },
      {
        id: "arxiv-2405.15793",
        query: "SWE-agent OpenHands Devin ReAct Reflexion papers autonomous software engineering agents",
        title: "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering",
        snippet: "Language model (LM) agents are increasingly being used to automate complicated tasks in digital environments.",
        provider: "arxiv",
        finalScore: 52,
      },
    ];
    const reranked = rerank(
      "SWE-agent OpenHands Devin ReAct Reflexion papers autonomous software engineering agents",
      results
    );
    // The arxiv paper about SWE-agent should rank above react.dev
    const arxivIdx = reranked.findIndex((r) => r.id.includes("arxiv-2405"));
    const reactIdx = reranked.findIndex((r) => r.id.includes("react"));
    expect(arxivIdx).toBeLessThan(reactIdx);
    // Alignment should dominate: react.dev has near-zero overlap with the
    // agent-focused query, so it MUST not outrank a directly relevant paper.
    const reactResult = reranked.find((r) => r.id.includes("react"))!;
    const arxivResult = reranked.find((r) => r.id.includes("arxiv"))!;
    expect(reactResult.finalScore).toBeLessThan(arxivResult.finalScore);
  });
});
