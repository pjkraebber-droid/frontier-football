#!/usr/bin/env node
/**
 * Frontier Football — weekly power-rankings drafter
 *
 * Reads the last N days of signals, filters to confirmed-only, and asks
 * Claude to draft ranking movements with receipts using the Frontier
 * Football methodology (40% on-field, 30% trajectory, 20% community,
 * 10% ambition). Output is a DRAFT for human review — never auto-published.
 *
 * Usage: node scripts/draft-rankings.mjs [days-back, default 7]
 */

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const daysBack = Number(process.argv[2] ?? 7);
const cutoff = new Date(Date.now() - daysBack * 86400 * 1000);

const signalsDir = path.join(ROOT, "data", "signals");
const files = (await readdir(signalsDir)).filter((f) => f.endsWith(".json"));

let signals = [];
for (const f of files) {
  const fileDate = new Date(f.replace(".json", ""));
  if (isNaN(fileDate) || fileDate < cutoff) continue;
  const batch = JSON.parse(await readFile(path.join(signalsDir, f), "utf8"));
  signals.push(...batch);
}

// HARD RULE: rankings only ever consider confirmed signals.
signals = signals.filter((s) => s.confirmed === true);

if (signals.length === 0) {
  console.log("[rankings] No confirmed signals in window — nothing to draft.");
  process.exit(0);
}

console.log(`[rankings] drafting from ${signals.length} confirmed signals (${daysBack}d window)...`);

const system = `You are the rankings analyst for Frontier Football's "The American Pyramid."
Methodology weights: on_field 40%, trajectory 30%, community 20%, ambition 10%.
You receive a JSON array of confirmed signals from the past ${daysBack} days.
Draft proposed power-ranking MOVEMENTS (risers, fallers, watchlist adds) as markdown.
Every proposed movement must cite the specific signal(s) driving it — club, event, date, source.
Do not invent facts beyond the signals provided. If the evidence is thin for a club, say so.
Confident sports-anchor register. Numbers-backed. No manufactured hype.
This is a DRAFT for editorial review, and should be labeled as such at the top.`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: JSON.stringify(signals) }],
  }),
});

if (!res.ok) {
  console.error(`[rankings] API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
const draft = data.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("\n");

const outDir = path.join(ROOT, "content", "rankings-drafts");
await mkdir(outDir, { recursive: true });
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const outPath = path.join(outDir, `${today}-draft.md`);
await writeFile(outPath, draft + "\n");

console.log(`[rankings] draft written to ${outPath} — review before publishing.`);
