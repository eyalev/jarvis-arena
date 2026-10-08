# Jarvis Arena v0: one workflow, entirely on Cloudflare, video + verdict + cost

Eyal 2026-10-08: "make it on Cloudflare, make sure it works, private repo first, easy to reproduce, then public".

- [ ] Scaffold: Worker + Run DO (container, durable_object policy) + D1 + R2, private repo
- [ ] Stage image: Xvfb + Chromium (phone pane + world browser) + ffmpeg, scene runner (server.mjs)
- [ ] AI through the Worker (ai.arena intercept): chat (glm-4.7-flash, tools), TTS aura-2, STT nova-3, gateway `jarvis`
- [ ] Workflow v0 file format: lines + expect; first workflow `qodebase-browse`
- [ ] Local test of the stage image with docker (AI via deployed Worker)
- [ ] Deploy, run one workflow on Cloudflare, watch the mp4, check verdict + cost
- [ ] Cost: per-run ledger in D1 (container seconds, tokens, TTS chars, STT minutes); cloudcost line
- [ ] README: deploy-your-own steps (wrangler deploy + D1/R2 create), what it costs
- [ ] Register on Workbench; report to Eyal
