# Jarvis Arena v0: one workflow, entirely on Cloudflare, video + verdict + cost

Eyal 2026-10-08: "make it on Cloudflare, make sure it works, private repo first, easy to reproduce, then public".

- [x] Scaffold: Worker + Run DO (container, durable_object policy) + D1 + R2, private repo
- [x] Stage image: Xvfb + Chromium (phone pane + world browser) + ffmpeg, scene runner (server.mjs)
- [x] AI through the Worker (ai.arena intercept): chat (glm-4.7-flash, tools), TTS aura-2, STT nova-3 (direct: gateway refuses streams)
- [x] Workflow v0 file format: lines + expect + keyterms; `qodebase-browse`, `wiki-lookup`
- [x] Local test of the stage image with docker (AI via deployed Worker)
- [x] Deploy, run on Cloudflare: wiki-lookup 4/4 ($0.023), qodebase-browse 4/4 ($0.034)
- [x] Cost: per-run ledger in D1; cloudcost line (local settings.json)
- [x] README: deploy-your-own steps
- [ ] Replays: run each workflow N times, show pass rate (agent varies run to run)
- [ ] Stricter checks: "Show me the code" passed on the address while Jarvis asked a question instead
- [ ] Model choice per run (compare models: the arena part)
- [ ] One-click deploy (Deploy to Cloudflare button / qodebase install), then public — Eyal's call
