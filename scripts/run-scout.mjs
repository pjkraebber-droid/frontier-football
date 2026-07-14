#!/usr/bin/env node
/**
 * Frontier Football — Lower League Scout daily runner
 *
 * Calls the Anthropic API with web search enabled, using the Scout v1.1
 * spec as the system prompt. Writes two artifacts:
 *   content/briefings/YYYY-MM-DD.md   (the briefing, with frontmatter)
 *   data/signals/YYYY-MM-DD.json      (the structured signals ledger)
 *
 * Requires: Node 20+, ANTHROPIC_API_KEY in env.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/New_York",
}); // YYYY-MM-DD in ET

const systemPrompt = await readFile(
  path.join(ROOT, "prompts", "scout-v1.1.md"),
  "utf8"
);

const userPrompt = [
  `Today's date is ${today} (US Eastern Time).`,
  `Run the full Lower League Daily briefing for today.`,
  `Cover the last 24-48 hours across USL Championship, USL League One,`,
  `USL League Two, and UPSL. Then emit the signals ledger as specified.`,
].join(" ");

console.log(`[scout] running for ${today}...`);

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 15,
      },
    ],
  }),
});

if (!res.ok) {
  console.error(`[scout] API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();

// Assemble all text blocks (web search responses interleave block types).
const fullText = data.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("\n");

if (!fullText.trim()) {
  console.error("[scout] Empty response — aborting without writing files.");
  process.exit(1);
}

// Split the briefing from the signals ledger (last fenced json block).
const jsonBlocks = [...fullText.matchAll(/```json\s*([\s\S]*?)```/g)];
let signals = [];
let briefing = fullText;

if (jsonBlocks.length > 0) {
  const lastBlock = jsonBlocks[jsonBlocks.length - 1];
  try {
    signals = JSON.parse(lastBlock[1]);
    briefing = fullText.slice(0, lastBlock.index).trim();
  } catch (err) {
    console.warn("[scout] Signals block failed to parse; keeping raw text.", err.message);
  }
} else {
  console.warn("[scout] No signals block found in output.");
}

// Basic schema hygiene: drop signals missing required fields; force booleans.
const REQUIRED = ["club", "league", "tier", "date", "event", "category", "confirmed"];
signals = (Array.isArray(signals) ? signals : []).filter((s) =>
  REQUIRED.every((k) => k in s)
);

const confirmedCount = signals.filter((s) => s.confirmed === true).length;

// Write briefing with frontmatter (Astro/Next content-collection friendly).
const briefingDir = path.join(ROOT, "content", "briefings");
const signalsDir = path.join(ROOT, "data", "signals");
await mkdir(briefingDir, { recursive: true });
await mkdir(signalsDir, { recursive: true });

const frontmatter = [
  "---",
  `title: "Lower League Daily | ${today}"`,
  `date: ${today}`,
  `signals_total: ${signals.length}`,
  `signals_confirmed: ${confirmedCount}`,
  `status: draft`, // flip to 'published' manually or via approval step
  "---",
  "",
].join("\n");

await writeFile(path.join(briefingDir, `${today}.md`), frontmatter + briefing + "\n");
await writeFile(
  path.join(signalsDir, `${today}.json`),
  JSON.stringify(signals, null, 2) + "\n"
);

console.log(
  `[scout] wrote briefing (${briefing.length} chars) and ${signals.length} signals (${confirmedCount} confirmed).`
);
