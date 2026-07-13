# Frontier Football — Lower League Scout Pipeline

Automated daily intelligence on the American soccer pyramid (Tiers 2–4),
producing a publishable briefing **and** a structured signals ledger that
feeds The American Pyramid power rankings.

```
GitHub Actions cron (daily 7am ET)
  └─ scripts/run-scout.mjs → Claude API (web search, Scout v1.1 prompt)
       ├─ content/briefings/YYYY-MM-DD.md   ← briefing (status: draft)
       └─ data/signals/YYYY-MM-DD.json      ← per-club signals ledger
  └─ commit → Vercel auto-deploys the Astro/Next site

Weekly (manual or cron):
  └─ scripts/draft-rankings.mjs → reads confirmed signals → rankings DRAFT
       └─ content/rankings-drafts/YYYY-MM-DD-draft.md  ← human review required
```

## Setup (one time, ~15 minutes)

1. Copy this folder's contents into your Frontier Football site repo
   (or keep it as its own repo — the workflow is self-contained).
2. In the GitHub repo: **Settings → Secrets and variables → Actions →
   New repository secret** → name `ANTHROPIC_API_KEY`, paste your key
   from console.anthropic.com.
3. Push. The workflow appears under the **Actions** tab. Hit
   **Run workflow** on `Lower League Scout (daily)` to test immediately —
   no need to wait for the cron.
4. Point your Astro/Next content collection at `content/briefings/`.
   Briefings ship with `status: draft` frontmatter — render only
   `status: published` on the live site, and flip the field when you've
   reviewed (or change the default in `run-scout.mjs` once you trust it).

## Editorial guarantees built in

- **Confirmed-only rankings.** `draft-rankings.mjs` hard-filters to
  `"confirmed": true` signals. Unverified scores can appear in a briefing
  (flagged UNCONFIRMED) but can never move a ranking.
- **Human-in-the-loop where it counts.** Briefings can auto-publish;
  ranking movements are always drafts. So are social posts.
- **Firewall.** The Scout prompt forbids non-public sourcing. Public
  reporting only, every run.

## Costs

Daily run: ~10–15 web searches + one Sonnet completion ≈ $0.15–0.60/day.
Weekly rankings draft: pennies (no search, just the ledger as input).

## Extending

- **LinkedIn/blog drafts:** add a third script that takes today's briefing
  + signals and rewrites for the target channel (90–130 word script
  register for reels; longer for blog). Same pattern as `draft-rankings.mjs`.
- **Deep dives:** pass a league name as an argument and widen the window
  to 7 days in the user prompt.
- **Club pages:** a small build step can group `data/signals/*.json` by
  club slug into per-club timelines for the site's JSON club files.
