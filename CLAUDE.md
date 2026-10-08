# jarvis-arena

Read `README.md` first. Private repo until Eyal says public. Deployed to his account as
`jarvis-arena` (workers.dev), token in `~/.config/jarvis-arena/token` (login:
`/login?token=…`). Long-run checklist: `TASKS.md`.

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
