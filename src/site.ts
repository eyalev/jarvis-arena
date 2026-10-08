// The public shell: feedback (central inbox), kstats forwarder, about/privacy, robots, sitemap.
const INBOX = 'https://remote-manage.kapps.dev/api/agent/feedback';
export const REPO = 'https://github.com/eyalev/jarvis-arena';
export const CONTACT = 'hello@kapps.dev';

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LINE_CONTROL = /[\u0000-\u001F\u007F]/g;
const clean = (v: unknown, max: number, multiline = false) => {
  const s = String(v ?? '').replace(multiline ? CONTROL : LINE_CONTROL, '').trim();
  return s ? s.slice(0, max) : null;
};
export const ownPath = (v: unknown) => {
  const s = clean(v, 300);
  return s && s.startsWith('/') && !s.startsWith('//') && !/[\s\\]/.test(s) ? s : null;
};
export function device(ua = '') {
  const os = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : /windows/i.test(ua) ? 'windows' : /mac os x|macintosh/i.test(ua) ? 'mac' : /linux|cros/i.test(ua) ? 'linux' : 'other';
  const br = /edg\//i.test(ua) ? 'edge' : /firefox|fxios/i.test(ua) ? 'firefox' : /samsungbrowser/i.test(ua) ? 'samsung' : /crios|chrome/i.test(ua) ? 'chrome' : /safari/i.test(ua) ? 'safari' : 'other';
  return `${os}/${br}`;
}
export const KINDS: [string, string][] = [['problem', 'Something is wrong'], ['idea', 'An idea or a workflow to try'], ['praise', 'I like it'], ['other', 'Something else']];

/** Forward a feedback form post to the central inbox. Only {ok:true} means it was stored. */
export async function submitFeedback(request: Request, env: { FEEDBACK_KEY?: string }) {
  let f: Record<string, string> = {};
  try {
    const raw = await request.text();
    if (raw.length > 16384) return { ok: false, message: 'That is longer than this form takes. Shorten it and send again.', fields: {} as Record<string, string | null> };
    f = Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return { ok: false, message: 'We could not read that message. Please send it again.', fields: {} };
  }
  const fields = { msg: clean(f.msg, 4000, true), kind: KINDS.some(([k]) => k === f.kind) ? f.kind : null, email: clean(f.email, 160), page: ownPath(f.page) };
  if (clean(f.website, 200)) { console.log(JSON.stringify({ module: 'feedback', event: 'honeypot' })); return { ok: true, message: null, fields: {} }; }
  if (!fields.msg) return { ok: false, message: 'The message is empty. Write something and press Send again.', fields };
  const self = f.self === '1' || /(?:^|;\s*)arena_self=1/.test(request.headers.get('cookie') || '') ? 1 : 0;
  const body = { project: 'jarvis-arena', kind: fields.kind, msg: fields.msg, email: fields.email, page: fields.page, loc: 'en', dev: device(request.headers.get('user-agent') || ''), self };
  let status: number | null = null;
  try {
    if (!env.FEEDBACK_KEY) throw new Error('FEEDBACK_KEY is not set');
    const res = await fetch(INBOX, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.FEEDBACK_KEY}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    status = res.status;
    const out = (await res.json().catch(() => null)) as { ok?: boolean; id?: unknown; error?: string } | null;
    if (!res.ok || !out?.ok) throw new Error(`inbox ${res.status}${out?.error ? `: ${out.error}` : ''}`);
    console.log(JSON.stringify({ module: 'feedback', event: 'sent', id: out.id ?? null, kind: body.kind, self }));
    return { ok: true, message: null, fields };
  } catch (e) {
    console.error(JSON.stringify({ module: 'feedback', event: 'failed', status, error: String((e as Error).stack || e), chars: body.msg?.length }));
    return { ok: false, message: `It did not go through: something broke on our side, and it was not saved. Your message is still in the box; try again in a minute, or email ${CONTACT}.`, fields };
  }
}

/** Same-origin analytics: the page's beacon posts to /e, forwarded to kstats (kstats integrations/cloudflare-worker.js). */
export async function kstats(request: Request, env: { KSTATS_KEY?: string }, ctx: ExecutionContext) {
  if (request.method === 'GET') {
    const on = new URL(request.url).searchParams.get('self') !== '0';
    return new Response(`<!doctype html><meta charset=utf-8><title>kstats</title><body style="font:15px system-ui;padding:2rem;background:#0d0f12;color:#e9edf2"><script>try{${on ? "localStorage.setItem('k:self','1')" : "localStorage.removeItem('k:self')"};document.body.append('${on ? 'This browser is now excluded from stats on ' : 'This browser is counted again on '}'+location.hostname)}catch(e){document.body.append('localStorage unavailable')}</script>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  // Read the body now: a stream forwarded inside waitUntil is cancelled once this handler returns (kstats README, opendev).
  const body = await request.text();
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf || {};
  ctx.waitUntil(fetch('https://stats.kapps.dev/e', {
    method: 'POST', body,
    headers: { 'content-type': 'application/json', 'x-k-key': env.KSTATS_KEY || '', 'x-k-ip': request.headers.get('cf-connecting-ip') || '', 'x-k-ua': request.headers.get('user-agent') || '', 'x-k-cc': String(cf.country || ''), 'x-k-vbot': String(cf.verifiedBotCategory || ''), 'x-k-asn': String(cf.asn || ''), 'x-k-asorg': String(cf.asOrganization || '') },
  }).then((r) => { if (!r.ok) console.error(JSON.stringify({ module: 'kstats', event: 'forward_rejected', status: r.status })); })
    .catch((err) => console.error(JSON.stringify({ module: 'kstats', event: 'forward_failed', err: String(err) }))));
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

export const ROBOTS = (origin: string) => `User-agent: *\nAllow: /\nDisallow: /video/\nDisallow: /admin\nDisallow: /api/\nDisallow: /login\nDisallow: /e\n\nSitemap: ${origin}/sitemap.xml\n`;
