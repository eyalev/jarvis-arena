// Jarvis Arena: run a voice-agent workflow on Cloudflare and keep the video.
//
// - A Run Durable Object per run starts the stage container (stage/, durable_object
//   policy), hands it the workflow, polls it, then copies the mp4 to R2 and the
//   transcript, verdicts and cost to D1, and stops the container.
// - The container has no keys: its AI calls go to http://ai.arena, which an outbound
//   intercept (ArenaOutbound) answers through the AI binding and the AI Gateway.
// - One operator: every page and API needs ADMIN_TOKEN (cookie after /login?token=).
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import qodebaseBrowse from '../workflows/qodebase-browse.json';
import wikiLookup from '../workflows/wiki-lookup.json';
import { renderHome, renderRun } from './pages';

export interface Env {
  AI: Ai;
  DB: D1Database;
  VIDEOS: R2Bucket;
  RUN: DurableObjectNamespace<Run>;
  ADMIN_TOKEN: string;
  GATEWAY?: string;
  MODEL: string;
}

export type Workflow = { name: string; title: string; start_url?: string; context?: string; voices?: { user?: string; jarvis?: string }; lines: { text: string; say?: string; expect?: Record<string, string> }[] };
export const WORKFLOWS: Record<string, Workflow> = Object.fromEntries([qodebaseBrowse, wikiLookup].map((w) => [w.name, w as Workflow]));

const INSTANCE = 'standard-3';                 // 2 vCPU, 8 GiB, 16 GB: Chromium x2 + ffmpeg
const RUN_LIMIT_MS = 12 * 60_000;
const log = (event: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ module: 'arena', event, ...extra }));

/* ---------------- cost (list prices, USD; checked 2026-10-08 on developers.cloudflare.com) ---------------- */
// Containers: memory and disk are billed on what is provisioned, CPU on active use, so the
// CPU line is an upper bound (full use of both vCPUs). Workers Paid's monthly included
// usage is ignored: this is what a run costs once that allowance is spent.
export const PRICES = {
  version: '2026-10-08',
  container: { vcpu: 2, mem_gib: 8, disk_gb: 16, usd_per_gib_s: 0.0000025, usd_per_vcpu_s: 0.00002, usd_per_gb_s: 0.00000007 },
  chat: { model: '@cf/zai-org/glm-4.7-flash', usd_per_m_in: 0.0605, usd_per_m_out: 0.40 },
  tts: { model: '@cf/deepgram/aura-2-en', usd_per_1k_chars: 0.03 },
  stt: { model: '@cf/deepgram/nova-3', usd_per_min: 0.0052 },
};
export function cost(containerSeconds: number, u: { chat_in?: number; chat_out?: number; tts_chars?: number; stt_seconds?: number } = {}) {
  const c = PRICES.container;
  const lines = {
    container_memory: containerSeconds * c.mem_gib * c.usd_per_gib_s,
    container_disk: containerSeconds * c.disk_gb * c.usd_per_gb_s,
    container_cpu_max: containerSeconds * c.vcpu * c.usd_per_vcpu_s,
    chat: ((u.chat_in || 0) * PRICES.chat.usd_per_m_in + (u.chat_out || 0) * PRICES.chat.usd_per_m_out) / 1e6,
    tts: ((u.tts_chars || 0) / 1000) * PRICES.tts.usd_per_1k_chars,
    stt: ((u.stt_seconds || 0) / 60) * PRICES.stt.usd_per_min,
  };
  const total = Object.values(lines).reduce((a, b) => a + b, 0);
  return { total_usd: Math.round(total * 1e5) / 1e5, lines: Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6])), prices: PRICES.version };
}

/* ---------------- AI for the container ---------------- */

function gw(env: Env) { return env.GATEWAY ? { gateway: { id: env.GATEWAY } } : {}; }

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
function toOpenAI(raw: Record<string, any>) {
  if (Array.isArray(raw.choices)) return raw;
  const calls: ToolCall[] = (raw.tool_calls ?? []).map((c: any, i: number) => ({ id: c.id ?? `call_${i}`, type: 'function', function: { name: c.name, arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? {}) } }));
  const content = typeof raw.response === 'string' ? raw.response : raw.response == null ? null : JSON.stringify(raw.response);
  return { choices: [{ index: 0, finish_reason: calls.length ? 'tool_calls' : 'stop', message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls } : {}) } }], usage: raw.usage };
}

export async function aiHandler(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/ai/, '');
  const t0 = Date.now();
  try {
    if (path === '/chat') {
      const { messages, tools } = (await request.json()) as { messages: unknown[]; tools?: unknown[] };
      const raw = (await env.AI.run(env.MODEL as never, { messages, tools, max_tokens: 2000 } as never, gw(env) as never)) as unknown as Record<string, any>;
      const out = toOpenAI(raw);
      log('ai_chat', { ms: Date.now() - t0, tools: out.choices?.[0]?.message?.tool_calls?.length ?? 0, usage: out.usage });
      return Response.json(out);
    }
    if (path === '/tts') {
      const { text, speaker } = (await request.json()) as { text: string; speaker?: string };
      const r: any = await env.AI.run(PRICES.tts.model as never, { text, speaker: speaker || 'draco', encoding: 'mp3' } as never, { ...gw(env), returnRawResponse: true } as never);
      const body = r instanceof Response ? r.body : r;
      log('ai_tts', { ms: Date.now() - t0, chars: text.length });
      return new Response(body, { headers: { 'content-type': 'audio/mpeg' } });
    }
    if (path === '/stt') {
      // Straight to the binding, not through the gateway: AI Gateway refuses a stream body
      // ("does not support ReadableStreams yet", 2026-10-08) and nova-3 accepts nothing else.
      // Bounded anyway: one call per user line, runs capped at 2 at a time and 12 minutes.
      const raw: any = await env.AI.run(PRICES.stt.model as never, { audio: { body: request.body, contentType: request.headers.get('content-type') || 'audio/mpeg' }, language: 'en', smart_format: true } as never);
      const text = raw?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? raw?.text ?? '';
      log('ai_stt', { ms: Date.now() - t0, chars: text.length, ...(text ? {} : { raw: JSON.stringify(raw).slice(0, 300) }) });
      return Response.json({ text });
    }
    return Response.json({ error: `unknown ai path ${path}` }, { status: 404 });
  } catch (e) {
    log('ai_failed', { path, error: String(e) });
    return Response.json({ error: String(e) }, { status: 502 });
  }
}

/** The container's outbound requests to http://ai.arena. */
export class ArenaOutbound extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).hostname !== 'ai.arena') return new Response('not intercepted', { status: 404 });
    return aiHandler(request, this.env);
  }
}

/* ---------------- one run ---------------- */

type RunState = { id: string; workflow: Workflow; phase: 'starting' | 'posted' | 'finishing' | 'done' | 'error'; startedAt: number; containerStartedAt?: number; lastStatus?: string };

export class Run extends DurableObject<Env> {
  private get c() { return this.ctx.container!; }
  private port() { return this.c.getTcpPort(8080); }

  async start(id: string, workflow: Workflow) {
    const st: RunState = { id, workflow, phase: 'starting', startedAt: Date.now() };
    await this.ctx.storage.put('run', st);
    if (!this.c.running) {
      this.c.start({ image: (this.c as any).images.stage, instance: INSTANCE, enableInternet: true } as never);
      st.containerStartedAt = Date.now();
      await this.ctx.storage.put('run', st);
    }
    const ob = (this.ctx as unknown as { exports: Record<string, (o: unknown) => Fetcher> }).exports.ArenaOutbound({});
    await this.c.interceptOutboundHttp('ai.arena', ob);
    await this.ctx.storage.setAlarm(Date.now() + 2000);
    log('run_start', { id, workflow: workflow.name, instance: INSTANCE });
  }

  async status() {
    const st = await this.ctx.storage.get<RunState>('run');
    let live: unknown = null;
    if (this.c.running && st && st.phase === 'posted') {
      try { live = await (await this.port().fetch('http://container/status', { signal: AbortSignal.timeout(3000) })).json(); } catch {}
    }
    return { phase: st?.phase ?? 'unknown', running: !!this.c.running, live };
  }

  async alarm() {
    const st = await this.ctx.storage.get<RunState>('run');
    if (!st || st.phase === 'done' || st.phase === 'error') return;
    const again = (ms: number) => this.ctx.storage.setAlarm(Date.now() + ms);
    if (Date.now() - st.startedAt > RUN_LIMIT_MS) return this.#finish(st, 'error', { error: 'run took longer than 12 minutes' });
    if (!this.c.running) return this.#finish(st, 'error', { error: 'container stopped unexpectedly' });
    try {
      if (st.phase === 'starting') {
        const h = await this.port().fetch('http://container/health', { signal: AbortSignal.timeout(3000) }).catch(() => null);
        if (!h?.ok) return again(1500);
        const r = await this.port().fetch('http://container/run', { method: 'POST', body: JSON.stringify({ id: st.id, workflow: st.workflow }) });
        if (r.status !== 202) return this.#finish(st, 'error', { error: `stage refused the run: ${r.status} ${await r.text()}` });
        st.phase = 'posted'; await this.ctx.storage.put('run', st);
        await this.env.DB.prepare(`UPDATE runs SET status = 'running', started_at = ? WHERE id = ?`).bind(new Date().toISOString(), st.id).run();
        log('run_posted', { id: st.id, boot_ms: Date.now() - st.startedAt });
        return again(3000);
      }
      const s = (await (await this.port().fetch('http://container/status', { signal: AbortSignal.timeout(5000) })).json()) as Record<string, any>;
      if (s.status !== st.lastStatus) { st.lastStatus = s.status; await this.ctx.storage.put('run', st); log('run_status', { id: st.id, status: s.status, turns: s.turns?.length }); }
      if (s.status === 'done') {
        const v = await this.port().fetch('http://container/video');
        if (!v.ok || !v.body) return this.#finish(st, 'error', { error: `video fetch failed: ${v.status}`, stage: s });
        const key = `runs/${st.id}.mp4`;
        const len = Number(v.headers.get('content-length') || 0);
        // R2 needs a known length for a stream; the stage sends content-length.
        await this.env.VIDEOS.put(key, len ? v.body.pipeThrough(new FixedLengthStream(len)) : await v.arrayBuffer(), { httpMetadata: { contentType: 'video/mp4' } });
        return this.#finish(st, 'done', { stage: s, video_key: key });
      }
      if (s.status === 'error') return this.#finish(st, 'error', { error: s.error, stage: s });
      return again(3000);
    } catch (e) {
      log('alarm_error', { id: st.id, error: String(e) });
      return again(3000);
    }
  }

  async #finish(st: RunState, phase: 'done' | 'error', r: { error?: string; stage?: Record<string, any>; video_key?: string }) {
    const secs = st.containerStartedAt ? (Date.now() - st.containerStartedAt) / 1000 : 0;
    try { if (this.c.running) await this.c.destroy(); } catch (e) { log('destroy_failed', { id: st.id, error: String(e) }); }
    st.phase = phase; await this.ctx.storage.put('run', st);
    const c = cost(secs, r.stage?.usage);
    const result = { turns: r.stage?.turns ?? [], usage: r.stage?.usage ?? null, passed: r.stage?.passed ?? null, checks: r.stage?.checks ?? null, video_seconds: r.stage?.videoSeconds ?? null, container_seconds: Math.round(secs), cost: c, error: r.error ?? null, events: phase === 'error' ? r.stage?.events ?? null : null };
    await this.env.DB.prepare(`UPDATE runs SET status = ?, finished_at = ?, result = ?, cost_usd = ?, video_key = ? WHERE id = ?`)
      .bind(phase, new Date().toISOString(), JSON.stringify(result), c.total_usd, r.video_key ?? null, st.id).run();
    log('run_finished', { id: st.id, phase, container_seconds: Math.round(secs), cost_usd: c.total_usd, passed: result.passed, checks: result.checks, error: r.error });
  }
}

/* ---------------- HTTP ---------------- */

const authed = (req: Request, env: Env) => {
  const cookie = /(?:^|;\s*)arena=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];
  const header = req.headers.get('x-arena-token') || (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  return !!env.ADMIN_TOKEN && (cookie === env.ADMIN_TOKEN || header === env.ADMIN_TOKEN);
};
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/login') {
      if (url.searchParams.get('token') !== env.ADMIN_TOKEN || !env.ADMIN_TOKEN) return html('<p>Wrong token.</p>', 403);
      return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': `arena=${env.ADMIN_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000` } });
    }
    if (!authed(request, env)) return html('<p>Jarvis Arena is private for now.</p>', 401);

    if (url.pathname.startsWith('/ai/') && request.method === 'POST') return aiHandler(request, env);   // for a stage run outside Cloudflare (local test)

    if (url.pathname === '/api/runs' && request.method === 'POST') {
      const { workflow } = (await request.json()) as { workflow: string };
      const wf = WORKFLOWS[workflow];
      if (!wf) return Response.json({ error: `unknown workflow ${workflow}` }, { status: 404 });
      const busy = await env.DB.prepare(`SELECT COUNT(*) AS n FROM runs WHERE status IN ('queued','running') AND created_at > ?`).bind(new Date(Date.now() - RUN_LIMIT_MS).toISOString()).first<{ n: number }>();
      if ((busy?.n ?? 0) >= 2) return Response.json({ error: 'two runs are already going; wait for one to finish' }, { status: 429 });
      const id = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${crypto.randomUUID().slice(0, 6)}`;
      await env.DB.prepare(`INSERT INTO runs (id, workflow, status, created_at, model) VALUES (?, ?, 'queued', ?, ?)`).bind(id, wf.name, new Date().toISOString(), env.MODEL).run();
      await env.RUN.get(env.RUN.idFromName(id)).start(id, wf);
      return Response.json({ id, url: `/runs/${id}` }, { status: 201 });
    }
    let m = /^\/api\/runs\/([\w-]+)$/.exec(url.pathname);
    if (m) {
      const row = await env.DB.prepare(`SELECT * FROM runs WHERE id = ?`).bind(m[1]).first();
      if (!row) return Response.json({ error: 'not found' }, { status: 404 });
      const live = ['queued', 'running'].includes(String(row.status)) ? await env.RUN.get(env.RUN.idFromName(m[1])).status() : null;
      return Response.json({ ...row, result: row.result ? JSON.parse(String(row.result)) : null, live });
    }
    m = /^\/video\/([\w-]+)\.mp4$/.exec(url.pathname);
    if (m) {
      const range = request.headers.get('range');
      const rm = range && /bytes=(\d+)-(\d*)/.exec(range);
      const obj = await env.VIDEOS.get(`runs/${m[1]}.mp4`, rm ? { range: rm[2] ? { offset: Number(rm[1]), length: Number(rm[2]) - Number(rm[1]) + 1 } : { offset: Number(rm[1]) } } : {});
      if (!obj) return new Response('not found', { status: 404 });
      const h = new Headers({ 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' });
      if (rm && obj.range && 'offset' in obj.range) {
        const off = obj.range.offset ?? 0, len = obj.range.length ?? obj.size - off;
        h.set('content-range', `bytes ${off}-${off + len - 1}/${obj.size}`); h.set('content-length', String(len));
        return new Response(obj.body, { status: 206, headers: h });
      }
      h.set('content-length', String(obj.size));
      return new Response(obj.body, { headers: h });
    }
    m = /^\/runs\/([\w-]+)$/.exec(url.pathname);
    if (m) {
      const row = await env.DB.prepare(`SELECT * FROM runs WHERE id = ?`).bind(m[1]).first();
      if (!row) return html('<p>No such run.</p>', 404);
      return html(renderRun(row as Record<string, unknown>, WORKFLOWS[String(row.workflow)]));
    }
    if (url.pathname === '/') {
      const { results } = await env.DB.prepare(`SELECT id, workflow, status, created_at, finished_at, cost_usd, result FROM runs ORDER BY created_at DESC LIMIT 30`).all();
      return html(renderHome(Object.values(WORKFLOWS), results as Record<string, unknown>[]));
    }
    return html('<p>Not found.</p>', 404);
  },
} satisfies ExportedHandler<Env>;
