// Server-rendered pages. Public: home (workflows + runs), one run, about, privacy, feedback, 404.
// Admin (/admin): the same home with Run buttons.
import type { Workflow } from './index';
import { REPO, CONTACT, KINDS } from './site';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const usd = (n: unknown) => (typeof n === 'number' ? (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`) : '–');
export const ORIGIN = 'https://jarvis-arena.kapps.dev';

const CSS = `
:root { --bg:#fff; --card:#f4f5f7; --card-2:#eaecf0; --line:#e0e3e8; --dim:#5d6571; --fg:#14171c; --accent:#d6461d; --ok:#1f7a4d; --bad:#b42318; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0d0f12; --card:#161a1f; --card-2:#1d2228; --line:#272d35; --dim:#8f99a5; --fg:#e9edf2; --accent:#ff7448; --ok:#4cc38a; --bad:#f87171; color-scheme: dark; } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif; overflow-wrap: anywhere; -webkit-tap-highlight-color: transparent; }
main, .top, footer { max-width: 760px; margin: 0 auto; padding-left: 16px; padding-right: 16px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: calc(10px + env(safe-area-inset-top)); padding-bottom: 6px; }
.mark { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: var(--fg); text-decoration: none; font: 700 17px/1 "Bricolage Grotesque", Georgia, serif; }
.mark i { width: 12px; height: 12px; border-radius: 3px; background: var(--accent); }
main { padding-bottom: 32px; }
h1, h2, h3 { font-family: "Bricolage Grotesque", Georgia, serif; letter-spacing: -0.01em; text-wrap: balance; }
h1 { font-size: 32px; line-height: 1.1; margin: 16px 0 8px; }
h2 { font-size: 21px; line-height: 1.2; margin: 36px 0 10px; }
p { text-wrap: pretty; }
a { color: var(--accent); text-underline-offset: 3px; }
a[target=_blank]::after { content: ""; display: inline-block; width: .75em; height: .75em; margin-left: .2em; vertical-align: -.05em; background: currentColor;
  -webkit-mask: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>') center / contain no-repeat;
  mask: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>') center / contain no-repeat; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.lede { color: var(--dim); font-size: 17px; margin: 0 0 8px; }
.dim { color: var(--dim); }
.card { background: var(--card); border-radius: 12px; padding: 14px 16px; margin: 0 0 10px; }
a.card { display: block; color: inherit; text-decoration: none; }
a.card:active { background: var(--card-2); }
@media (hover: hover) { a.card:hover { background: var(--card-2); } }
.row { display: flex; gap: 8px 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.row.start { justify-content: flex-start; }
.btn { min-height: 44px; padding: 0 16px; border-radius: 12px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 500; cursor: pointer; }
.btn.quiet { background: var(--card-2); color: var(--fg); }
.btn[disabled] { opacity: .5; }
.tag { display: inline-block; font-size: 12px; line-height: 1.35; padding: 2px 6px; border-radius: 4px; background: var(--card-2); color: var(--dim); font-variant-numeric: tabular-nums; }
.tag.done { color: var(--ok); } .tag.error { color: var(--bad); } .tag.running, .tag.queued { color: var(--accent); }
.title { font-weight: 500; }
.small { font-size: 14px; }
ol.lines { padding-left: 20px; margin: 8px 0 0; color: var(--dim); font-size: 14px; }
.steps { padding-left: 20px; } .steps li { margin: 6px 0; }
table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
td { padding: 6px 0; border-top: 1px solid var(--line); } td:last-child { text-align: right; }
.speed { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.speed button { min-height: 44px; min-width: 56px; padding: 0 12px; border-radius: 12px; border: 0; background: var(--card); color: var(--fg); font: inherit; font-variant-numeric: tabular-nums; cursor: pointer; }
.speed button[aria-pressed="true"] { background: var(--accent); color: #fff; }
video { width: 100%; border-radius: 12px; background: #000; aspect-ratio: 16 / 9; display: block; }
.turn { display: grid; gap: 4px; padding: 12px 0; border-top: 1px solid var(--line); }
.turn .who { font-size: 13px; color: var(--dim); }
.turn .meta { font-size: 13px; color: var(--dim); display: flex; flex-wrap: wrap; gap: 4px 12px; }
.pass { color: var(--ok); } .miss { color: var(--bad); }
pre { white-space: pre-wrap; font-size: 12px; background: var(--card); padding: 12px; border-radius: 8px; overflow-x: auto; }
form.fb { display: grid; gap: 14px; }
form.fb label { display: grid; gap: 6px; font-weight: 500; }
form.fb textarea, form.fb input, form.fb select { font: inherit; font-size: 16px; color: var(--fg); background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; min-height: 44px; width: 100%; }
form.fb textarea { min-height: 140px; resize: vertical; }
.hp { position: absolute; left: -9999px; }
.note { padding: 12px 14px; border-radius: 10px; background: var(--card); }
.note.bad { color: var(--bad); }
footer { padding-top: 24px; padding-bottom: calc(32px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); margin-top: 24px; font-size: 14px; color: var(--dim); }
footer nav { display: flex; flex-wrap: wrap; gap: 4px 18px; }
footer nav a { color: var(--dim); display: inline-flex; align-items: center; min-height: 44px; }
.fresh { position: relative; display: inline-block; font-size: 12px; line-height: 1.35; color: var(--dim); border-radius: 5px; padding: 2px 6px 6px; min-width: 6.6em; font-variant-numeric: tabular-nums; background: color-mix(in srgb, var(--fg) 3.5%, var(--card)); }
.card .fresh { background: color-mix(in srgb, var(--fg) 5%, var(--card)); }
.fresh::after { content: ""; position: absolute; left: 6px; right: 6px; bottom: 3px; height: 2px; border-radius: 2px; background: linear-gradient(to right, color-mix(in srgb, var(--dim) 75%, var(--card)) var(--f, 0%), var(--line) 0); }
.legend { font-size: 12px; color: var(--dim); margin: -4px 0 10px; }
`;

type PageOpts = { path: string; desc?: string; admin?: boolean; noindex?: boolean; image?: string };
const DEFAULT_DESC = 'Voice-agent workflows run on Cloudflare: a synthetic voice talks to Jarvis, Jarvis drives a real browser, and every run is recorded with a pass or miss per step and what it cost.';

function page(title: string, body: string, o: PageOpts, script = '') {
  const desc = o.desc || DEFAULT_DESC;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${ORIGIN}${esc(o.path)}">${o.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website"><meta property="og:site_name" content="Jarvis Arena"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${ORIGIN}${esc(o.path)}"><meta property="og:image" content="${ORIGIN}${o.image || '/og.png'}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0d0f12" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/IBMPlexSans-400.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/fonts/fonts.css">
<style>${CSS}</style>${o.admin ? `<script>try{localStorage.setItem('k:self','1');document.cookie='arena_self=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax'}catch(e){}</script>` : ''}
<script defer src="https://stats.kapps.dev/k.js" data-site="jarvis-arena" data-endpoint="/e"></script></head><body>
<header class="top"><a class="mark" href="/"><i></i>Jarvis Arena</a>${o.admin ? '<a href="/admin">Admin</a>' : ''}</header>
<main>${body}</main>
<footer><nav aria-label="Site"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/feedback?page=${encodeURIComponent(o.path)}">Feedback</a><a href="${REPO}" target="_blank" rel="noopener">Source<span class="sr"> (opens github.com)</span></a></nav>
<p>Made by <a href="https://eyalev.com" target="_blank" rel="noopener">Eyal<span class="sr"> (opens eyalev.com)</span></a>. Write to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p></footer>
${script ? `<script>${script}</script>` : ''}</body></html>`;
}

// Fills with age: empty when new, full at 7 days; quarters at 6 h, 1 d, 3 d, 7 d.
function fresh(iso: unknown) {
  const ts = Date.parse(String(iso || ''));
  if (!ts) return '';
  const h = Math.max(0, (Date.now() - ts) / 3600e3);
  const S = [0, 6, 24, 72, 168];
  let f = 1;
  if (h < 168) { let i = 0; while (h >= S[i + 1]) i++; f = (i + (Math.log1p(h) - Math.log1p(S[i])) / (Math.log1p(S[i + 1]) - Math.log1p(S[i]))) / 4; }
  const s = (Date.now() - ts) / 1000;
  const label = s < 3600 ? `${Math.max(1, Math.floor(s / 60))} min ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  return `<span class="fresh" style="--f:${Math.round(f * 1000) / 10}%"><time datetime="${esc(new Date(ts).toISOString())}">${label}</time></span>`;
}
const LEGEND = '<p class="legend">The line under each date fills as it ages: empty when new, full at a week.</p>';

const checksOf = (r: Record<string, unknown>) => { try { const x = JSON.parse(String(r.result || 'null')); return x?.checks ? `${x.passed} of ${x.checks} checks passed` : ''; } catch { return ''; } };

export function renderHome(workflows: Workflow[], runs: Record<string, unknown>[], admin: string | null) {
  const stats = (name: string) => {
    const done = runs.filter((r) => r.workflow === name && r.status === 'done' && typeof r.cost_usd === 'number');
    if (!done.length) return 'No runs yet';
    const avg = done.reduce((a, r) => a + (r.cost_usd as number), 0) / done.length;
    return `${done.length} run${done.length > 1 ? 's' : ''}, about ${usd(avg)} each`;
  };
  const wf = workflows.map((w) => `<div class="card">
    <div class="row"><div><div class="title">${esc(w.title)}</div><div class="dim small">${esc(stats(w.name))}</div></div>
    ${admin ? `<button class="btn" data-run="${esc(w.name)}">Run</button>` : ''}</div>
    <ol class="lines">${w.lines.map((l) => `<li>"${esc(l.text)}"</li>`).join('')}</ol></div>`).join('');
  const rows = runs.map((r) => `<a class="card" href="/runs/${esc(r.id)}"><div class="row"><span class="title">${esc(workflows.find((w) => w.name === r.workflow)?.title || r.workflow)}</span>${fresh(r.created_at)}</div>
      <div class="row start dim small" style="margin-top:4px"><span class="tag ${esc(r.status)}">${esc(r.status)}</span>${checksOf(r) ? `<span>${esc(checksOf(r))}</span>` : ''}<span>${usd(r.cost_usd)}</span></div></a>`).join('');
  return page('Jarvis Arena: voice agents, recorded doing things', `<h1>Jarvis Arena</h1>
    <p class="lede">Watch a voice assistant try real tasks. A synthetic voice talks to Jarvis, Jarvis drives a real browser, and every run is recorded with a pass or miss for each step and what it cost.</p>
    <p class="dim small">Everything runs on Cloudflare, and the code is open: <a href="${REPO}" target="_blank" rel="noopener">deploy your own<span class="sr"> (opens github.com)</span></a> and run the same workflows.</p>
    <h2>Runs</h2>${rows ? LEGEND + rows : '<p class="dim">Nothing has run yet.</p>'}
    <h2>Workflows</h2>${wf}`, { path: admin ? '/admin' : '/', admin: !!admin, noindex: !!admin },
  admin ? `document.querySelectorAll('[data-run]').forEach((b) => b.onclick = async () => {
     b.disabled = true; b.textContent = 'Starting…';
     try { const r = await fetch('/admin/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow: b.dataset.run }) });
       const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); location.href = j.url; }
     catch (e) { b.disabled = false; b.textContent = String(e.message || e).slice(0, 60); setTimeout(() => { b.textContent = 'Run'; }, 4000); }
   });` : '');
}

export function renderRun(row: Record<string, unknown>, wf?: Workflow) {
  const res = row.result ? JSON.parse(String(row.result)) : null;
  const running = ['queued', 'running'].includes(String(row.status));
  const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const turns = (res?.turns || []).map((t: any) => `<div class="turn">
      <div><span class="who">You</span> "${esc(t.said)}"</div>
      ${t.heard && norm(t.heard) !== norm(t.said) ? `<div class="meta">Heard as "${esc(t.heard)}"</div>` : ''}
      ${(t.tools || []).length ? `<div class="meta">${t.tools.map((x: any) => `<span>${esc(x.name)}(${esc(Object.values(x.args || {}).join(', '))})${x.ok ? '' : ' failed'}</span>`).join('')}</div>` : ''}
      <div><span class="who">Jarvis</span> ${esc(t.reply)}</div>
      <div class="meta">${t.latency != null ? `<span>answered in ${esc(t.latency)} s</span>` : ''}${t.verdict ? `<span class="${t.verdict.pass ? 'pass' : 'miss'}">${t.verdict.pass ? 'Pass' : 'Miss'}: ${esc(t.verdict.why)}</span>` : ''}</div>
    </div>`).join('');
  const costRows = res?.cost ? Object.entries(res.cost.lines).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td>${usd(v)}</td></tr>`).join('') + `<tr><td><b>Total</b></td><td><b>${usd(res.cost.total_usd)}</b></td></tr>` : '';
  const title = wf?.title || String(row.workflow);
  const desc = `${title}: a recorded Jarvis Arena run${checksOf(row) ? `, ${checksOf(row)}` : ''}${typeof row.cost_usd === 'number' ? `, ${usd(row.cost_usd)}` : ''}.`;
  return page(`${title}: a Jarvis Arena run`, `<h1>${esc(title)}</h1>
    <div class="row start"><span class="tag ${esc(row.status)}">${esc(row.status)}</span>${fresh(row.created_at)}${checksOf(row) ? `<span class="small">${esc(checksOf(row))}</span>` : ''}</div>
    ${row.video_key ? `<h2>Recording</h2><video id="vid" controls playsinline preload="metadata" src="/video/${esc(row.id)}.mp4"></video>
      <div class="speed" role="group" aria-label="Playback speed">${[1, 1.5, 2, 3, 4].map((r) => `<button type="button" data-rate="${r}" aria-pressed="false">${r}×</button>`).join('')}</div>` : running ? `<div class="card" style="margin-top:16px" id="live">Starting the stage…</div>` : ''}
    ${res?.error ? `<h2>What went wrong</h2><pre>${esc(res.error)}</pre>` : ''}
    ${turns ? `<h2>Turns</h2>${turns}` : ''}
    ${costRows ? `<h2>What it cost</h2><table>${costRows}</table><p class="dim small">List prices of ${esc(res.cost.prices)}, before Workers Paid's included monthly usage. Container CPU is an upper bound (it is billed on actual use). The container ran ${esc(res.container_seconds)} s; the model was called ${esc(res.usage?.chat_calls ?? 0)} times (${esc(row.model || '')}).</p>` : ''}
    ${wf ? `<h2>The workflow</h2><p class="dim small">What the voice says, what Jarvis is told, and what is checked: <a href="${REPO}/blob/master/workflows/${esc(wf.name)}.json" target="_blank" rel="noopener">${esc(wf.name)}.json<span class="sr"> (opens github.com)</span></a>.</p>` : ''}
    ${res?.events ? `<h2>Stage log</h2><pre>${esc(JSON.stringify(res.events, null, 1)).slice(0, 8000)}</pre>` : ''}`,
  { path: `/runs/${row.id}`, desc, noindex: !row.video_key },
  SPEED + (running ? `const id = ${JSON.stringify(row.id)};
    async function poll() {
      try { const j = await (await fetch('/api/runs/' + id)).json();
        if (!['queued','running'].includes(j.status)) return location.reload();
        const l = j.live && j.live.live; const el = document.getElementById('live');
        if (el) el.textContent = l ? (l.status + (l.turns && l.turns.length ? ', turn ' + l.turns.length + ': "' + (l.turns.at(-1)?.said || '') + '"' : '')) : (j.live ? j.live.phase : 'queued');
      } catch (e) {}
      setTimeout(poll, 3000);
    }
    poll();` : ''));
}

// Playback speed: buttons under the video, the choice remembered on this device (also keys 1-5).
const SPEED = `(() => {
  const v = document.getElementById('vid'); if (!v) return;
  const btns = [...document.querySelectorAll('.speed button')];
  const set = (r) => { v.playbackRate = r; v.defaultPlaybackRate = r; btns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === r))); try { localStorage.setItem('arena-rate', String(r)); } catch (e) {} };
  let saved = 1; try { saved = Number(localStorage.getItem('arena-rate')) || 1; } catch (e) {}
  set(saved);
  v.addEventListener('loadedmetadata', () => { v.playbackRate = saved; });
  btns.forEach((b) => b.onclick = () => { saved = Number(b.dataset.rate); set(saved); });
  document.addEventListener('keydown', (e) => { const i = '12345'.indexOf(e.key); if (i >= 0 && !e.target.closest('input,textarea')) { saved = Number(btns[i].dataset.rate); set(saved); } });
})();`;

export function renderAbout() {
  return page('About Jarvis Arena', `<h1>About</h1>
    <p>Jarvis Arena records voice assistants trying real tasks, so anyone can see what works today and what does not.</p>
    <h2>How a run works</h2>
    <ol class="steps">
      <li>A <b>workflow</b> is a short script: what a person says, line by line, and what should be true after each line.</li>
      <li>A synthetic voice (Deepgram Aura-2) says each line, and Jarvis hears it through speech recognition (Deepgram Nova-3), so mishearings are real.</li>
      <li>Jarvis is a language model (GLM-4.7-Flash by default) with four browser tools: open a page, click, read the page, scroll. It acts on a real Chromium window, then answers out loud.</li>
      <li>After each line the checks run: the address, the answer, what is on the page.</li>
      <li>The screen and both voices are recorded. The video, the transcript, the checks and the cost of the run are kept.</li>
    </ol>
    <p>All of it runs on Cloudflare: a Worker, one Container per run, Workers AI, D1 and R2. Runs are started by hand; the voice in the videos is synthetic and nobody's real conversation is recorded.</p>
    <h2>Run it yourself</h2>
    <p>The code is open source (MIT): <a href="${REPO}" target="_blank" rel="noopener">github.com/eyalev/jarvis-arena<span class="sr"> (opens github.com)</span></a>. Deploy it to your own Cloudflare account, write workflows, and compare models.</p>
    <h2>Contact</h2>
    <p>Made by <a href="https://eyalev.com" target="_blank" rel="noopener">Eyal<span class="sr"> (opens eyalev.com)</span></a>. For anything, including corrections and removal requests, write to <a href="mailto:${CONTACT}">${CONTACT}</a>, or use the <a href="/feedback?page=/about">feedback form</a>.</p>`,
  { path: '/about', desc: 'What Jarvis Arena is, how a run works, and how to run it yourself.' });
}

export function renderPrivacy() {
  return page('Privacy: Jarvis Arena', `<h1>Privacy</h1>
    <p>This page says what this site keeps. Every sentence is about what the code does.</p>
    <h2>When you visit</h2>
    <ul class="steps">
      <li><b>Visit statistics:</b> pages you open and taps on controls are counted by kstats, our own first-party analytics, through this site's <code>/e</code>. It keeps a daily visitor hash (from your IP address and browser, which are not stored), your country and a coarse device type. No cookies are set for it and nothing is sold or shared.</li>
      <li><b>On your device:</b> the playback speed you pick is kept in your browser's local storage.</li>
      <li>Cloudflare, which hosts the site, sees your connection as any host does.</li>
    </ul>
    <h2>The feedback form</h2>
    <p>It keeps what you write, the kind you chose, your email if you give one (only to reply), the page you came from and a coarse device type (like "android/chrome"). It goes to Eyal's private feedback inbox.</p>
    <h2>The recordings</h2>
    <p>The runs shown here use a synthetic voice reading a script. No visitor's voice, words or screen are recorded. The browser in the videos is a fresh one, signed in to nothing.</p>
    <h2>Questions</h2>
    <p>Write to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`,
  { path: '/privacy', desc: 'What Jarvis Arena keeps: visit statistics, the feedback form, and the recordings.' });
}

export function renderFeedback(o: { page: string | null; sent?: boolean; error?: string | null; fields?: Record<string, string | null> }) {
  const f = o.fields || {};
  if (o.sent) return page('Thank you: Jarvis Arena', `<h1>Thank you</h1><p>It reached Eyal. If you left an email, he can write back.</p><p><a href="${esc(o.page || '/')}">Back to where you were</a></p>`, { path: '/feedback', noindex: true });
  return page('Feedback: Jarvis Arena', `<h1>Feedback</h1>
    <p class="dim">Something wrong, a workflow you would like to see, a model to compare? Tell us.</p>
    ${o.error ? `<p class="note bad" role="alert">${esc(o.error)}</p>` : ''}
    <form class="fb" method="post" action="/feedback">
      <label>Message<textarea name="msg" required maxlength="4000">${esc(f.msg || '')}</textarea></label>
      <label>Kind<select name="kind"><option value="">Choose one (optional)</option>${KINDS.map(([k, l]) => `<option value="${k}"${f.kind === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label>Email, only to reply (optional)<input type="email" name="email" maxlength="160" autocomplete="email" value="${esc(f.email || '')}"></label>
      <input type="hidden" name="page" value="${esc(o.page || '')}">
      <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <div><button class="btn" type="submit">Send</button></div>
    </form>`, { path: '/feedback', noindex: true, desc: 'Tell us what is wrong, missing or good on Jarvis Arena.' });
}

export function renderNotFound() {
  return page('Not found: Jarvis Arena', `<h1>Not found</h1><p>There is no page here. <a href="/">See the runs</a>.</p>`, { path: '/404', noindex: true });
}
