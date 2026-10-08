# jarvis-arena

Read `README.md` first. **Public repo and public site** since 2026-10-08:
https://jarvis-arena.kapps.dev (gallery, read-only). Runs start only from `/admin`
(Cloudflare Access app `eb30a782-…`, Eyal's Google email; fallback `/login?token=`, token in
`~/.config/jarvis-arena/token`). Long-run checklist: `TASKS.md`.

- Deploy: `npx wrangler deploy --tag "$(git rev-parse --short HEAD)"` (the tag is what
  `/version.json` and `/health.json` report; `wrangler secret put` leaves the version
  untagged, so redeploy with the tag after it). Then `node scripts/check-390.mjs`.
- D1 migrations are applied by hand (`wrangler d1 migrations apply jarvis-arena --remote`)
  before pushing code that needs them.

- **Costs money per run** (container + Workers AI). Max 2 concurrent runs (API) and 12 min
  per run (the DO destroys the container). Never loop runs unattended without a cap.
- AI calls go through AI Gateway `jarvis` (in remote-manage's `AI_BREAKER_GATEWAYS`); the
  account is at the 20-gateway limit, so do not create another.
- The stage needs no keys: the container calls `http://ai.arena`, intercepted by
  `ArenaOutbound`. A stage run outside Cloudflare (local docker test) uses
  `AI_BASE=https://<worker>/ai` + `AI_TOKEN=<ADMIN_TOKEN>`.
- Voices are mixed onto the video after recording from the timeline (no sound card in
  the container).
- Logs: JSONL, `module: arena` (Worker) and `module: stage` (container stdout).

## Baseline

- Feedback: central inbox (remote-manage), `FEEDBACK_KEY` set. Privacy, about, 404, og:image,
  robots, sitemap, `/version.json`, `/health.json`, kstats (`jarvis-arena`, own ingest key),
  check script: done 2026-10-08.
- No Workers Builds: the stage container image is built by `wrangler deploy` with Docker on
  the laptop; Workers Builds container support was not tried yet. Deploy from the laptop.
- No crawler gate: public pages read at most 30 rows (indexed) or one row by primary key,
  memoised at the edge; `/video/` is disallowed in robots and cached a day. Nothing public
  calls a paid API: runs start only from `/admin`.
- No alerts beyond feedback: runs are started by hand and watched; `/health.json` flags a
  run stuck over 15 minutes.
- Speed: "ready" = the run list or the video element on screen; pages are server-rendered,
  fonts self-hosted, no third-party CSS. Not yet measured with a throttled phone profile.
