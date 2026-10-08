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
import mapLisbon from '../workflows/map-lisbon.json';
import { renderHome, renderRun, renderAbout, renderPrivacy, renderFeedback, renderNotFound, ORIGIN } from './pages';
import { admin } from './access';
import { submitFeedback, kstats, ownPath, ROBOTS } from './site';

export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
  FEEDBACK_KEY?: string;
  KSTATS_KEY?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_ALLOWED_EMAIL?: string;
  DB: D1Database;
  VIDEOS: R2Bucket;
  RUN: DurableObjectNamespace<Run>;
  ADMIN_TOKEN: string;
  GATEWAY?: string;
  MODEL: string;
}

export type Workflow = { name: string; title: string; keyterms?: string[]; start_url?: string; context?: string; voices?: { user?: string; jarvis?: string }; lines: { text: string; say?: string; expect?: Record<string, string> }[] };
export const WORKFLOWS: Record<string, Workflow> = Object.fromEntries([wikiLookup, mapLisbon, qodebaseBrowse].map((w) => [w.name, w as Workflow]));

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
      // The workflow's own words (product names) help the transcriber, as they would a real user's.
      const keyterm = (request.headers.get('x-keyterms') || '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 20).join(' ');
      // Straight to the binding, not through the gateway: AI Gateway refuses a stream body
      // ("does not support ReadableStreams yet", 2026-10-08) and nova-3 accepts nothing else.
      // Bounded anyway: one call per user line, runs capped at 2 at a time and 12 minutes.
      const raw: any = await env.AI.run(PRICES.stt.model as never, { audio: { body: request.body, contentType: request.headers.get('content-type') || 'audio/mpeg' }, language: 'en', smart_format: true, ...(keyterm ? { keyterm } : {}) } as never);
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

type RunState = { id: string; workflow: Workflow; layout: string; phase: 'starting' | 'posted' | 'finishing' | 'done' | 'error'; startedAt: number; containerStartedAt?: number; lastStatus?: string };

export class Run extends DurableObject<Env> {
  private get c() { return this.ctx.container!; }
  private port() { return this.c.getTcpPort(8080); }

  async start(id: string, workflow: Workflow, layout = 'vertical') {
    const st: RunState = { id, workflow, layout, phase: 'starting', startedAt: Date.now() };
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
        const r = await this.port().fetch('http://container/run', { method: 'POST', body: JSON.stringify({ id: st.id, workflow: st.workflow, layout: st.layout }) });
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
        // The poster frame (best effort: a run without one still shows, with a plain card).
        let poster_key: string | undefined;
        const pr = await this.port().fetch('http://container/poster').catch(() => null);
        if (pr?.ok) { poster_key = `runs/${st.id}.jpg`; await this.env.VIDEOS.put(poster_key, await pr.arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg' } }); }
        else log('poster_missing', { id: st.id, status: pr?.status ?? null });
        return this.#finish(st, 'done', { stage: s, video_key: key, poster_key });
      }
      if (s.status === 'error') return this.#finish(st, 'error', { error: s.error, stage: s });
      return again(3000);
    } catch (e) {
      log('alarm_error', { id: st.id, error: String(e) });
      return again(3000);
    }
  }

  async #finish(st: RunState, phase: 'done' | 'error', r: { error?: string; stage?: Record<string, any>; video_key?: string; poster_key?: string }) {
    const secs = st.containerStartedAt ? (Date.now() - st.containerStartedAt) / 1000 : 0;
    try { if (this.c.running) await this.c.destroy(); } catch (e) { log('destroy_failed', { id: st.id, error: String(e) }); }
    st.phase = phase; await this.ctx.storage.put('run', st);
    const c = cost(secs, r.stage?.usage);
    const result = { turns: r.stage?.turns ?? [], usage: r.stage?.usage ?? null, passed: r.stage?.passed ?? null, checks: r.stage?.checks ?? null, video_seconds: r.stage?.videoSeconds ?? null, container_seconds: Math.round(secs), cost: c, error: r.error ?? null, events: phase === 'error' ? r.stage?.events ?? null : null };
    await this.env.DB.prepare(`UPDATE runs SET status = ?, finished_at = ?, result = ?, cost_usd = ?, video_key = ?, poster_key = ?, layout = ? WHERE id = ?`)
      .bind(phase, new Date().toISOString(), JSON.stringify(result), c.total_usd, r.video_key ?? null, r.poster_key ?? null, st.layout, st.id).run();
    log('run_finished', { id: st.id, phase, container_seconds: Math.round(secs), cost_usd: c.total_usd, passed: result.passed, checks: result.checks, error: r.error });
  }
}

/* ---------------- HTTP ---------------- */

const html = (body: string, status = 200, cache = 'no-store') => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache } });

/** Public pages are the same for everyone: keep each rendered answer at the edge for a while (per colo). */
async function memo(request: Request, ctx: ExecutionContext, ttl: number, render: () => Promise<Response>) {
  const key = new Request(new URL(request.url).origin + new URL(request.url).pathname, { method: 'GET' });
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const res = await render();
  if (res.status === 200) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('cache-control', `public, max-age=${ttl}`);
    ctx.waitUntil(caches.default.put(key, copy));
  }
  return res;
}

const RUN_LIST = `SELECT id, workflow, status, created_at, finished_at, cost_usd, result, layout, poster_key, video_key, votes FROM runs ORDER BY created_at DESC LIMIT 30`;

async function health(env: Env) {
  const checks: { id: string; label: string; status: string; detail: string; at: string }[] = [];
  const at = new Date().toISOString();
  try {
    const stuck = await env.DB.prepare(`SELECT COUNT(*) AS n FROM runs WHERE status IN ('queued','running') AND created_at < ?`).bind(new Date(Date.now() - 15 * 60_000).toISOString()).first<{ n: number }>();
    checks.push({ id: 'stuck', label: 'Runs stuck over 15 min', status: (stuck?.n ?? 0) ? 'bad' : 'ok', detail: String(stuck?.n ?? 0), at });
    const last = await env.DB.prepare(`SELECT status, created_at FROM runs ORDER BY created_at DESC LIMIT 1`).first<{ status: string; created_at: string }>();
    checks.push({ id: 'last_run', label: 'Last run', status: !last ? 'unknown' : last.status === 'error' ? 'warn' : 'ok', detail: last ? `${last.status} at ${last.created_at}` : 'none yet', at });
  } catch (e) {
    checks.push({ id: 'db', label: 'Database', status: 'unknown', detail: `could not read: ${String(e).slice(0, 120)}`, at });
  }
  return { sha: env.CF_VERSION_METADATA?.tag || null, built: env.CF_VERSION_METADATA?.timestamp || null, checks };
}

/**
 * One vote per browser per run: a random id in a first-party cookie (`aid`), set here on the
 * first vote. {run, up} toggles it; the count lives on the run row so lists read no extra rows.
 * At most 60 votes per browser a day. Not identity, just enough to keep counts honest-ish.
 */
async function vote(request: Request, env: Env) {
  let body: { run?: string; up?: boolean };
  try { body = await request.json(); } catch { return Response.json({ error: 'bad body' }, { status: 400 }); }
  const run = String(body.run || '');
  if (!/^[\w-]{6,40}$/.test(run)) return Response.json({ error: 'bad run' }, { status: 400 });
  let aid = /(?:^|;\s*)aid=([\w-]{16,64})/.exec(request.headers.get('cookie') || '')?.[1];
  const fresh = !aid;
  if (!aid) aid = crypto.randomUUID();
  const now = new Date().toISOString();
  const today = await env.DB.prepare(`SELECT COUNT(*) AS n FROM votes WHERE voter = ? AND created_at > ?`).bind(aid, new Date(Date.now() - 86400e3).toISOString()).first<{ n: number }>();
  if (body.up !== false && (today?.n ?? 0) >= 60) return Response.json({ error: 'too many votes today' }, { status: 429 });
  const exists = await env.DB.prepare(`SELECT 1 FROM runs WHERE id = ? AND status = 'done'`).bind(run).first();
  if (!exists) return Response.json({ error: 'no such run' }, { status: 404 });
  const res = body.up === false
    ? await env.DB.prepare(`DELETE FROM votes WHERE run_id = ? AND voter = ?`).bind(run, aid).run()
    : await env.DB.prepare(`INSERT OR IGNORE INTO votes (run_id, voter, created_at) VALUES (?, ?, ?)`).bind(run, aid, now).run();
  if (res.meta.changes) await env.DB.prepare(`UPDATE runs SET votes = MAX(0, votes + ?) WHERE id = ?`).bind(body.up === false ? -1 : 1, run).run();
  const row = await env.DB.prepare(`SELECT votes FROM runs WHERE id = ?`).bind(run).first<{ votes: number }>();
  log('vote', { run, up: body.up !== false, changed: res.meta.changes, votes: row?.votes });
  const h = new Headers({ 'cache-control': 'no-store' });
  if (fresh) h.set('set-cookie', `aid=${aid}; Path=/; Secure; SameSite=Lax; HttpOnly; Max-Age=63072000`);
  return Response.json({ run, votes: row?.votes ?? 0, up: body.up !== false }, { headers: h });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const p = url.pathname;

    // The workers.dev address only serves the operator's scripts; people use the real one.
    if (url.hostname.endsWith('.workers.dev') && !p.startsWith('/ai/') && !p.startsWith('/api/') && p !== '/login') return Response.redirect(ORIGIN + p + url.search, 301);

    /* ---- public ---- */
    if (p === '/' && request.method === 'GET') return memo(request, ctx, 60, async () => {
      const { results } = await env.DB.prepare(RUN_LIST).all();
      return html(renderHome(Object.values(WORKFLOWS), results as Record<string, unknown>[], null));
    });
    let m = /^\/runs\/([\w-]+)$/.exec(p);
    if (m && request.method === 'GET') {
      const id = m[1];
      const row = await env.DB.prepare(`SELECT * FROM runs WHERE id = ?`).bind(id).first();
      if (!row) return html(renderNotFound(), 404);
      const done = !['queued', 'running'].includes(String(row.status));
      return html(renderRun(row as Record<string, unknown>, WORKFLOWS[String(row.workflow)]), 200, done ? 'public, max-age=300' : 'no-store');
    }
    m = /^\/poster\/([\w-]+)\.jpg$/.exec(p);
    if (m) {
      const obj = await env.VIDEOS.get(`runs/${m[1]}.jpg`);
      if (!obj) return new Response('not found', { status: 404 });
      return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=604800, immutable' } });
    }
    if (p === '/api/vote' && request.method === 'POST') return vote(request, env);
    m = /^\/video\/([\w-]+)\.mp4$/.exec(p);
    if (m) {
      const range = request.headers.get('range');
      const rm = range && /bytes=(\d+)-(\d*)/.exec(range);
      const obj = await env.VIDEOS.get(`runs/${m[1]}.mp4`, rm ? { range: rm[2] ? { offset: Number(rm[1]), length: Number(rm[2]) - Number(rm[1]) + 1 } : { offset: Number(rm[1]) } } : {});
      if (!obj) return new Response('not found', { status: 404 });
      const h = new Headers({ 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400', 'x-robots-tag': 'noindex' });
      if (rm && obj.range && 'offset' in obj.range) {
        const off = obj.range.offset ?? 0, len = obj.range.length ?? obj.size - off;
        h.set('content-range', `bytes ${off}-${off + len - 1}/${obj.size}`); h.set('content-length', String(len));
        return new Response(obj.body, { status: 206, headers: h });
      }
      h.set('content-length', String(obj.size));
      return new Response(obj.body, { headers: h });
    }
    m = /^\/api\/runs\/([\w-]+)$/.exec(p);
    if (m && request.method === 'GET') {
      const row = await env.DB.prepare(`SELECT id, workflow, status, created_at, finished_at, cost_usd, video_key FROM runs WHERE id = ?`).bind(m[1]).first();
      if (!row) return Response.json({ error: 'not found' }, { status: 404 });
      const live = ['queued', 'running'].includes(String(row.status)) ? await env.RUN.get(env.RUN.idFromName(m[1])).status() : null;
      return Response.json({ ...row, live }, { headers: { 'cache-control': 'no-store' } });
    }
    if (p === '/about') return memo(request, ctx, 3600, async () => html(renderAbout()));
    if (p === '/privacy') return memo(request, ctx, 3600, async () => html(renderPrivacy()));
    if (p === '/feedback') {
      if (request.method === 'POST') {
        const r = await submitFeedback(request, env);
        const fields = r.fields as Record<string, string | null>;
        return html(renderFeedback({ page: fields.page ?? null, sent: r.ok, error: r.message, fields }), r.ok ? 200 : 502);
      }
      return html(renderFeedback({ page: ownPath(url.searchParams.get('page')) }));
    }
    if (p === '/e') return kstats(request, env, ctx);
    if (p === '/version.json') return Response.json({ sha: env.CF_VERSION_METADATA?.tag || null, built: env.CF_VERSION_METADATA?.timestamp || null }, { headers: { 'cache-control': 'no-store' } });
    if (p === '/health.json') return memo(request, ctx, 300, async () => Response.json(await health(env)));
    if (p === '/robots.txt') return new Response(ROBOTS(ORIGIN), { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=3600' } });
    if (p === '/sitemap.xml') return memo(request, ctx, 3600, async () => {
      const { results } = await env.DB.prepare(`SELECT id, finished_at FROM runs WHERE status = 'done' AND video_key IS NOT NULL ORDER BY created_at DESC LIMIT 500`).all<{ id: string; finished_at: string }>();
      const urls = ['/', '/about', '/privacy'].map((u) => `<url><loc>${ORIGIN}${u}</loc></url>`).concat(results.map((r) => `<url><loc>${ORIGIN}/runs/${r.id}</loc><lastmod>${r.finished_at}</lastmod></url>`));
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, { headers: { 'content-type': 'application/xml' } });
    });

    /* ---- the operator ---- */
    if (p === '/login') {
      if (!env.ADMIN_TOKEN || url.searchParams.get('token') !== env.ADMIN_TOKEN) return html(renderNotFound(), 404);
      const next = url.searchParams.get('next') || '/admin';
      return new Response(null, { status: 302, headers: { location: next.startsWith('/') && !next.startsWith('//') ? next : '/admin', 'set-cookie': `arena=${env.ADMIN_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000` } });
    }
    if (p === '/admin' || p.startsWith('/ai/') || (p === '/admin/runs' && request.method === 'POST')) {
      const who = await admin(request, env);
      if (!who) return html(renderNotFound(), 404);
      if (p.startsWith('/ai/') && request.method === 'POST') return aiHandler(request, env);   // a stage run outside Cloudflare (local test)
      if (p === '/admin') {
        const { results } = await env.DB.prepare(RUN_LIST).all();
        return html(renderHome(Object.values(WORKFLOWS), results as Record<string, unknown>[], who));
      }
      const { workflow, layout: lay } = (await request.json()) as { workflow: string; layout?: string };
      const layout = lay === 'wide' ? 'wide' : 'vertical';
      const wf = WORKFLOWS[workflow];
      if (!wf) return Response.json({ error: `unknown workflow ${workflow}` }, { status: 404 });
      const busy = await env.DB.prepare(`SELECT COUNT(*) AS n FROM runs WHERE status IN ('queued','running') AND created_at > ?`).bind(new Date(Date.now() - RUN_LIMIT_MS).toISOString()).first<{ n: number }>();
      if ((busy?.n ?? 0) >= 2) return Response.json({ error: 'two runs are already going; wait for one to finish' }, { status: 429 });
      const id = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${crypto.randomUUID().slice(0, 6)}`;
      await env.DB.prepare(`INSERT INTO runs (id, workflow, status, created_at, model, layout) VALUES (?, ?, 'queued', ?, ?, ?)`).bind(id, wf.name, new Date().toISOString(), env.MODEL, layout).run();
      await env.RUN.get(env.RUN.idFromName(id)).start(id, wf, layout);
      log('run_requested', { id, workflow: wf.name, by: who });
      return Response.json({ id, url: `/runs/${id}` }, { status: 201 });
    }
    return html(renderNotFound(), 404);
  },
} satisfies ExportedHandler<Env>;
