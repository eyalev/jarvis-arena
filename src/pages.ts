// Server-rendered pages (tokens: DESIGN.md). Public: the reel + list (home), one run, about,
// privacy, feedback, 404. Admin (/admin): the same home with Run buttons.
import type { Workflow } from './index';
import { REPO, CONTACT, KINDS } from './site';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const usd = (n: unknown) => (typeof n === 'number' ? (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`) : '–');
const mmss = (s: unknown) => { const n = Math.round(Number(s) || 0); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
export const ORIGIN = 'https://jarvis-arena.kapps.dev';

const CSS = `
:root { --bg:#fff; --surface:#f1f2f4; --surface-2:#e4e6ea; --line:#dfe2e6; --fg:#0e1013; --dim:#5b626c; --accent:#e2461a; --pass:#128a5a; --miss:#c8283d; --stage:#08090b; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#08090b; --surface:#131519; --surface-2:#1c1f25; --line:#23262d; --fg:#f2f3f5; --dim:#9aa1ab; --accent:#ff5c2b; --pass:#3ddc97; --miss:#ff5c6c; color-scheme: dark; } }
:root[data-theme="dark"] { --bg:#08090b; --surface:#131519; --surface-2:#1c1f25; --line:#23262d; --fg:#f2f3f5; --dim:#9aa1ab; --accent:#ff5c2b; --pass:#3ddc97; --miss:#ff5c6c; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif; overflow-wrap: anywhere; -webkit-tap-highlight-color: transparent; }
button { font: inherit; color: inherit; touch-action: manipulation; }
.wrap { max-width: 1120px; margin: 0 auto; padding-left: 16px; padding-right: 16px; }
.narrow { max-width: 720px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: calc(8px + env(safe-area-inset-top)); padding-bottom: 4px; }
.mark { display: inline-flex; align-items: center; gap: 9px; min-height: 44px; color: var(--fg); text-decoration: none; font: 800 21px/1 "Bricolage Grotesque", Georgia, serif; font-stretch: 75%; letter-spacing: .01em; }
.mark i { width: 12px; height: 12px; border-radius: 3px; background: var(--accent); box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 70%, transparent); }
.top nav { display: flex; gap: 4px; }
.top nav a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 10px; color: var(--dim); text-decoration: none; font-weight: 500; }
.display, h1, h2 { font-family: "Bricolage Grotesque", Georgia, serif; font-stretch: 75%; letter-spacing: 0; text-wrap: balance; }
h1 { font-size: 44px; line-height: .98; font-weight: 800; margin: 18px 0 10px; }
h2 { font-size: 26px; line-height: 1.05; font-weight: 700; margin: 40px 0 12px; }
p { text-wrap: pretty; }
a { color: var(--accent); text-underline-offset: 3px; }
a[target=_blank]::after { content: ""; display: inline-block; width: .72em; height: .72em; margin-left: .2em; vertical-align: -.04em; background: currentColor;
  -webkit-mask: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>') center / contain no-repeat;
  mask: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>') center / contain no-repeat; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.lede { color: var(--dim); font-size: 17px; margin: 0; max-width: 34em; }
.dim { color: var(--dim); } .small { font-size: 14px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px; border-radius: 12px; border: 0; background: var(--accent); color: #fff; font-weight: 500; cursor: pointer; text-decoration: none; }
.btn.quiet { background: var(--surface); color: var(--fg); }
.btn[disabled] { opacity: .5; }

/* ---- score + vote ---- */
.score { display: inline-flex; align-items: baseline; gap: 2px; font: 800 20px/1 "Bricolage Grotesque", Georgia, serif; font-stretch: 75%; font-variant-numeric: tabular-nums; color: var(--fg); }
.score.all { color: var(--pass); } .score.some { color: var(--miss); }
.score small { font-size: 13px; font-weight: 500; font-family: "IBM Plex Sans", sans-serif; font-stretch: 100%; color: var(--dim); margin-left: 4px; }
.vote { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; min-width: 56px; padding: 0 12px; border-radius: 12px; border: 0; background: var(--surface); cursor: pointer; font-variant-numeric: tabular-nums; font-weight: 500; transition: background-color 160ms ease-out, color 160ms ease-out; }
.vote svg { width: 14px; height: 14px; }
.vote[aria-pressed="true"] { background: var(--accent); color: #fff; }

/* ---- the reel ---- */
.reel-head { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin: 28px 0 12px; }
.reel-head h2 { margin: 0; }
.reel-nav { display: none; gap: 8px; }
.reel-nav button { width: 44px; height: 44px; border-radius: 12px; border: 0; background: var(--surface); cursor: pointer; display: grid; place-items: center; }
.reel-nav svg { width: 18px; height: 18px; }
.reel { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-left: 16px; padding: 0 16px 6px; margin: 0 -16px; scrollbar-width: none; overscroll-behavior-x: contain; }
.reel::-webkit-scrollbar { display: none; }
.card { position: relative; flex: none; width: min(76vw, 340px); aspect-ratio: 9 / 16; border-radius: 18px; overflow: hidden; background: var(--stage); scroll-snap-align: start; isolation: isolate; color: #f2f3f5; }
.card video, .card img.poster { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.card.wide video, .card.wide img.poster { object-fit: contain; }
.card .tap { position: absolute; inset: 0; z-index: 1; border: 0; background: none; cursor: pointer; }
.card .hud { position: absolute; left: 0; right: 0; top: 0; z-index: 2; display: flex; justify-content: space-between; align-items: start; padding: 10px; pointer-events: none; }
.card .hud > * { pointer-events: auto; }
.chip { display: inline-flex; align-items: baseline; gap: 4px; padding: 7px 10px; border-radius: 10px; background: rgb(8 9 11 / .72); backdrop-filter: blur(8px); color: #f2f3f5; }
.chip .score { color: #f2f3f5; } .chip .score.all { color: #3ddc97; } .chip .score.some { color: #ff5c6c; }
.card .vote { background: rgb(8 9 11 / .72); backdrop-filter: blur(8px); color: #f2f3f5; }
.card .vote[aria-pressed="true"] { background: #ff5c2b; }
.card .info { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; padding: 56px 14px 12px; background: linear-gradient(to top, rgb(8 9 11 / .94), rgb(8 9 11 / .7) 55%, transparent); }
.card .info a { color: #f2f3f5; text-decoration: none; display: block; font-weight: 500; line-height: 1.3; min-height: 44px; }
.card .meta { display: flex; gap: 12px; margin-top: 2px; font-size: 13px; color: #b4bac3; font-variant-numeric: tabular-nums; }
.card .sound { position: absolute; z-index: 2; right: 10px; bottom: 92px; width: 44px; height: 44px; border-radius: 12px; border: 0; background: rgb(8 9 11 / .72); color: #f2f3f5; display: grid; place-items: center; cursor: pointer; }
.card .sound svg { width: 20px; height: 20px; }
.card .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; z-index: 3; background: rgb(255 255 255 / .18); }
.card .bar i { display: block; height: 100%; width: 0; background: #ff5c2b; }
.dots { display: flex; justify-content: center; gap: 6px; margin-top: 12px; }
.dots i { width: 6px; height: 6px; border-radius: 3px; background: var(--surface-2); transition: width 160ms ease-out, background-color 160ms ease-out; }
.dots i.on { width: 18px; background: var(--accent); }
@media (min-width: 760px) { .reel-nav { display: flex; } .card { width: 300px; } .dots { display: none; } h1 { font-size: 64px; } }

/* ---- list ---- */
.list { display: grid; gap: 8px; }
.row { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 8px; border-radius: 12px; background: var(--surface); }
.row .thumb { width: 54px; aspect-ratio: 9 / 16; border-radius: 8px; overflow: hidden; background: var(--stage); }
.row .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.row .thumb.wide img { object-fit: contain; }
.row a.t { color: var(--fg); text-decoration: none; font-weight: 500; line-height: 1.3; display: block; }
.row .sub { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; font-size: 13px; color: var(--dim); margin-top: 2px; font-variant-numeric: tabular-nums; }
.row .sub .score { font-size: 17px; }
.status-err { color: var(--miss); }
.how { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; counter-reset: s; }
.how li { padding: 14px 16px; border-radius: 12px; background: var(--surface); }
.how b { display: block; font: 700 19px/1.1 "Bricolage Grotesque", Georgia, serif; font-stretch: 75%; margin-bottom: 4px; }
@media (min-width: 760px) { .how { grid-template-columns: repeat(3, 1fr); } }
.wf { padding: 14px 16px; border-radius: 12px; background: var(--surface); margin-bottom: 8px; }
.wf ol { padding-left: 20px; margin: 8px 0 0; color: var(--dim); font-size: 14px; }

/* ---- run page ---- */
.player { display: grid; gap: 16px; margin-top: 8px; }
.screen { position: relative; border-radius: 18px; overflow: hidden; background: var(--stage); }
.screen video { display: block; width: 100%; max-height: 78svh; aspect-ratio: 9 / 16; object-fit: contain; background: var(--stage); }
.screen.wide video { aspect-ratio: 16 / 9; }
.runbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.speed { display: flex; gap: 6px; flex-wrap: wrap; }
.speed button { min-height: 44px; min-width: 52px; padding: 0 10px; border-radius: 12px; border: 0; background: var(--surface); font-variant-numeric: tabular-nums; cursor: pointer; }
.speed button[aria-pressed="true"] { background: var(--fg); color: var(--bg); }
@media (min-width: 900px) { .player { grid-template-columns: minmax(0, 420px) minmax(0, 1fr); align-items: start; } .player .side { position: sticky; top: 16px; } }
.turn { display: grid; gap: 4px; padding: 12px 0; border-top: 1px solid var(--line); }
.turn .who { font-size: 13px; color: var(--dim); }
.turn .m { font-size: 13px; color: var(--dim); display: flex; flex-wrap: wrap; gap: 4px 12px; }
.pass { color: var(--pass); } .miss { color: var(--miss); }
table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
td { padding: 6px 0; border-top: 1px solid var(--line); } td:last-child { text-align: right; }
pre { white-space: pre-wrap; font-size: 12px; background: var(--surface); padding: 12px; border-radius: 8px; overflow-x: auto; }
.steps { padding-left: 20px; } .steps li { margin: 6px 0; }
form.fb { display: grid; gap: 14px; }
form.fb label { display: grid; gap: 6px; font-weight: 500; }
form.fb textarea, form.fb input, form.fb select { font: inherit; font-size: 16px; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; min-height: 44px; width: 100%; }
form.fb textarea { min-height: 140px; resize: vertical; }
.hp { position: absolute; left: -9999px; }
.note { padding: 12px 14px; border-radius: 12px; background: var(--surface); }
.note.bad { color: var(--miss); }
footer { padding-top: 24px; padding-bottom: calc(32px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); margin-top: 40px; font-size: 14px; color: var(--dim); }
footer nav { display: flex; flex-wrap: wrap; gap: 4px 18px; }
footer nav a { color: var(--dim); display: inline-flex; align-items: center; min-height: 44px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } .reel { scroll-behavior: auto; } }
`;

const ICON = {
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l8 12H4z" fill="currentColor"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
};

type PageOpts = { path: string; desc?: string; admin?: boolean; noindex?: boolean; image?: string; wide?: boolean };
const DEFAULT_DESC = 'Watch a voice assistant try real tasks: a synthetic voice talks to Jarvis, Jarvis drives a real browser, and every run is recorded with a pass or miss per step and what it cost.';

function page(title: string, body: string, o: PageOpts, script = '') {
  const desc = o.desc || DEFAULT_DESC;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${ORIGIN}${esc(o.path)}">${o.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website"><meta property="og:site_name" content="Jarvis Arena"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${ORIGIN}${esc(o.path)}"><meta property="og:image" content="${ORIGIN}${o.image || '/og.png'}">${o.image ? '' : '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'}<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#08090b" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/BricolageGrotesque-var.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/fonts/fonts.css">
<style>${CSS}</style>${o.admin ? `<script>try{localStorage.setItem('k:self','1');document.cookie='arena_self=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax'}catch(e){}</script>` : ''}
<script defer src="https://stats.kapps.dev/k.js" data-site="jarvis-arena" data-endpoint="/e"></script></head><body>
<header class="top wrap"><a class="mark" href="/"><i></i>Jarvis Arena</a><nav aria-label="Main">${o.admin ? '<a href="/admin">Admin</a>' : ''}<a href="/about">About</a></nav></header>
<main class="wrap${o.wide ? '' : ' narrow'}">${body}</main>
<footer class="wrap${o.wide ? '' : ' narrow'}"><nav aria-label="Site"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/feedback?page=${encodeURIComponent(o.path)}">Feedback</a><a href="${REPO}" target="_blank" rel="noopener">Source<span class="sr"> (opens github.com)</span></a></nav>
<p>Made by <a href="https://eyalev.com" target="_blank" rel="noopener">Eyal<span class="sr"> (opens eyalev.com)</span></a>. Write to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p></footer>
${script ? `<script>${script}</script>` : ''}</body></html>`;
}

function ago(iso: unknown) {
  const ts = Date.parse(String(iso || ''));
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  const label = s < 3600 ? `${Math.max(1, Math.floor(s / 60))} min ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  return `<time datetime="${esc(new Date(ts).toISOString())}">${label}</time>`;
}
const result = (r: Record<string, unknown>) => { try { return JSON.parse(String(r.result || 'null')) || {}; } catch { return {}; } };
function score(r: Record<string, unknown>, small = true) {
  const x = result(r);
  if (!x.checks) return '';
  const cls = x.passed === x.checks ? 'all' : 'some';
  return `<span class="score ${cls}" aria-label="${x.passed} of ${x.checks} checks passed">${x.passed}/${x.checks}${small ? '<small>checks</small>' : ''}</span>`;
}
const voteBtn = (r: Record<string, unknown>) => `<button type="button" class="vote" data-vote="${esc(r.id)}" aria-pressed="false" aria-label="Vote for this run, ${Number(r.votes) || 0} votes">${ICON.up}<span>${Number(r.votes) || 0}</span></button>`;
const titleOf = (workflows: Workflow[], r: Record<string, unknown>) => workflows.find((w) => w.name === r.workflow)?.title || String(r.workflow);

/** Votes: optimistic toggle, remembered on this device; the server keeps one per browser. */
const VOTE_JS = `(() => {
  let mine = []; try { mine = JSON.parse(localStorage.getItem('arena-votes') || '[]'); } catch (e) {}
  const save = () => { try { localStorage.setItem('arena-votes', JSON.stringify(mine)); } catch (e) {} };
  const paint = (id, up, n) => document.querySelectorAll('[data-vote="' + id + '"]').forEach((b) => { b.setAttribute('aria-pressed', String(up)); if (n != null) { b.querySelector('span').textContent = n; b.setAttribute('aria-label', 'Vote for this run, ' + n + ' votes'); } });
  mine.forEach((id) => paint(id, true));
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-vote]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const id = b.dataset.vote, up = b.getAttribute('aria-pressed') !== 'true';
    const n0 = Number(b.querySelector('span').textContent) || 0;
    paint(id, up, Math.max(0, n0 + (up ? 1 : -1)));
    try {
      const r = await fetch('/api/vote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run: id, up }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
      paint(id, up, j.votes); mine = up ? [...new Set([...mine, id])] : mine.filter((x) => x !== id); save();
      window.kstat && kstat('vote', { a: id, b: up ? 'up' : 'down' });
    } catch (err) { paint(id, !up, n0); }
  }, true);
})();`;

/** The reel: the most visible card plays (muted until a tap), the others pause; dots and arrows follow. */
const REEL_JS = `(() => {
  const reel = document.querySelector('.reel'); if (!reel) return;
  const cards = [...reel.querySelectorAll('.card')];
  const dots = [...document.querySelectorAll('.dots i')];
  let sound = false, current = null;
  const setSoundIcons = () => cards.forEach((c) => { const b = c.querySelector('.sound'); if (b) { b.innerHTML = sound ? ${JSON.stringify(ICON.sound)} : ${JSON.stringify(ICON.muted)}; b.setAttribute('aria-label', sound ? 'Mute' : 'Turn sound on'); } });
  const vid = (c) => { let v = c.querySelector('video'); if (!v) { v = document.createElement('video'); v.muted = true; v.playsInline = true; v.loop = true; v.preload = 'auto'; v.poster = c.dataset.poster || ''; v.src = c.dataset.src; c.prepend(v);
      const bar = c.querySelector('.bar i'); v.addEventListener('timeupdate', () => { if (v.duration) bar.style.width = (v.currentTime / v.duration * 100) + '%'; }); } return v; };
  const activate = (c) => {
    if (current === c) return; current = c;
    cards.forEach((x, i) => { const v = x.querySelector('video'); if (x !== c && v) v.pause(); if (dots[i]) dots[i].classList.toggle('on', x === c); });
    const v = vid(c); v.muted = !sound; v.play().catch(() => {});
  };
  const io = new IntersectionObserver((es) => { const best = es.filter((e) => e.isIntersecting && e.intersectionRatio > 0.6).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (best) activate(best.target); }, { root: reel, threshold: [0.6, 0.9] });
  cards.forEach((c) => io.observe(c));
  // Off screen (scrolled past the reel, tab hidden): stop playing.
  new IntersectionObserver(([e]) => { const v = current && current.querySelector('video'); if (!v) return; e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }, { threshold: 0.25 }).observe(reel);
  document.addEventListener('visibilitychange', () => { const v = current && current.querySelector('video'); if (v && document.hidden) v.pause(); });
  reel.addEventListener('click', (e) => {
    const c = e.target.closest('.card'); if (!c) return;
    if (e.target.closest('.sound') || e.target.closest('.tap')) {
      sound = !sound; setSoundIcons(); activate(c); const v = vid(c); v.muted = !sound; v.play().catch(() => {});
      window.kstat && kstat('sound', { a: sound ? 'on' : 'off' });
    }
  });
  const step = (d) => { const i = Math.max(0, Math.min(cards.length - 1, cards.indexOf(current) + d)); cards[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); };
  document.querySelector('[data-reel=prev]')?.addEventListener('click', () => step(-1));
  document.querySelector('[data-reel=next]')?.addEventListener('click', () => step(1));
  setSoundIcons();
})();`;

export function renderHome(workflows: Workflow[], runs: Record<string, unknown>[], admin: string | null) {
  const watchable = runs.filter((r) => r.status === 'done' && r.video_key);
  const vertical = watchable.filter((r) => r.layout === 'vertical');
  // The reel: vertical recordings first (they fill a phone), best voted first, then newest.
  const byVotes = (a: Record<string, unknown>, b: Record<string, unknown>) => (Number(b.votes) || 0) - (Number(a.votes) || 0) || String(b.created_at).localeCompare(String(a.created_at));
  const reelRuns = [...vertical.sort(byVotes), ...watchable.filter((r) => r.layout !== 'vertical').sort(byVotes)].slice(0, 12);
  const card = (r: Record<string, unknown>) => {
    const x = result(r);
    return `<article class="card${r.layout === 'vertical' ? '' : ' wide'}" data-src="/video/${esc(r.id)}.mp4" data-poster="${r.poster_key ? `/poster/${esc(r.id)}.jpg` : ''}">
      ${r.poster_key ? `<img class="poster" src="/poster/${esc(r.id)}.jpg" alt="" loading="lazy" decoding="async">` : ''}
      <button type="button" class="tap" aria-label="Play ${esc(titleOf(workflows, r))} with sound"></button>
      <div class="hud"><span class="chip">${score(r, false) || '<span class="small">run</span>'}</span>${voteBtn(r)}</div>
      <button type="button" class="sound" aria-label="Turn sound on"></button>
      <div class="info"><a href="/runs/${esc(r.id)}">${esc(titleOf(workflows, r))}</a>
        <div class="meta"><span>${mmss(x.video_seconds)}</span><span>${usd(r.cost_usd)}</span><span>${ago(r.created_at)}</span></div></div>
      <div class="bar"><i></i></div>
    </article>`;
  };
  const row = (r: Record<string, unknown>) => `<div class="row">
      <div class="thumb${r.layout === 'vertical' ? '' : ' wide'}">${r.poster_key ? `<img src="/poster/${esc(r.id)}.jpg" alt="" loading="lazy" decoding="async">` : ''}</div>
      <div><a class="t" href="/runs/${esc(r.id)}">${esc(titleOf(workflows, r))}</a>
        <div class="sub">${score(r) || (r.status === 'error' ? '<span class="status-err">failed</span>' : `<span>${esc(r.status)}</span>`)}<span>${usd(r.cost_usd)}</span><span>${ago(r.created_at)}</span></div></div>
      ${r.status === 'done' && r.video_key ? voteBtn(r) : '<span></span>'}
    </div>`;
  const ranked = [...runs].sort((a, b) => byVotes(a, b));
  const wfStats = (name: string) => { const d = runs.filter((r) => r.workflow === name && r.status === 'done'); return d.length ? `${d.length} run${d.length > 1 ? 's' : ''}` : 'No runs yet'; };
  return page('Jarvis Arena: watch voice agents do real things', `
    <h1>Voice agents, doing real things.</h1>
    <p class="lede">Each video is one run: a synthetic voice asks, Jarvis drives a real browser and answers, and every step is checked. Swipe through, tap for sound, vote for the best.</p>
    ${reelRuns.length ? `<div class="reel-head"><h2>Now showing</h2><div class="reel-nav"><button type="button" data-reel="prev" aria-label="Previous video">${ICON.prev}</button><button type="button" data-reel="next" aria-label="Next video">${ICON.next}</button></div></div>
    <div class="reel" aria-label="Recorded runs">${reelRuns.map(card).join('')}</div>
    <div class="dots" aria-hidden="true">${reelRuns.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>` : '<p class="dim">Nothing has been recorded yet.</p>'}
    <h2>All runs, top voted first</h2>
    <div class="list">${ranked.map(row).join('')}</div>
    <h2>How a run works</h2>
    <ol class="how">
      <li><b>A voice asks</b>A workflow is a short script. A synthetic voice says each line; Jarvis hears it through speech recognition, mishearings and all.</li>
      <li><b>Jarvis acts</b>A language model with four browser tools opens, clicks, reads and scrolls a real browser, then answers out loud.</li>
      <li><b>Everything is checked</b>After each line the address, the answer or the page is checked, and the run is priced to the tenth of a cent.</li>
    </ol>
    <p class="small dim">All on Cloudflare, open source: <a href="${REPO}" target="_blank" rel="noopener">deploy your own<span class="sr"> (opens github.com)</span></a>. <a href="/about">More about it</a>.</p>
    ${admin ? `<h2>Run a workflow</h2>${workflows.map((w) => `<div class="wf"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><b>${esc(w.title)}</b><div class="small dim">${esc(wfStats(w.name))}</div></div>
      <div style="display:flex;gap:8px"><button class="btn" data-run="${esc(w.name)}" data-layout="vertical">Run</button><button class="btn quiet" data-run="${esc(w.name)}" data-layout="wide">Wide</button></div></div>
      <ol>${w.lines.map((l) => `<li>"${esc(l.text)}"</li>`).join('')}</ol></div>`).join('')}` : ''}`,
  { path: admin ? '/admin' : '/', admin: !!admin, noindex: !!admin, wide: true },
  REEL_JS + VOTE_JS + (admin ? `document.querySelectorAll('[data-run]').forEach((b) => b.onclick = async () => {
     const t = b.textContent; b.disabled = true; b.textContent = 'Starting…';
     try { const r = await fetch('/admin/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow: b.dataset.run, layout: b.dataset.layout }) });
       const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); location.href = j.url; }
     catch (e) { b.disabled = false; b.textContent = String(e.message || e).slice(0, 50); setTimeout(() => { b.textContent = t; }, 4000); }
   });` : ''));
}

export function renderRun(row: Record<string, unknown>, wf?: Workflow) {
  const res = result(row);
  const running = ['queued', 'running'].includes(String(row.status));
  const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const turns = (res.turns || []).map((t: any) => `<div class="turn">
      <div><span class="who">You</span> "${esc(t.said)}"</div>
      ${t.heard && norm(t.heard) !== norm(t.said) ? `<div class="m">Heard as "${esc(t.heard)}"</div>` : ''}
      ${(t.tools || []).length ? `<div class="m">${t.tools.map((x: any) => `<span>${esc(x.name)}(${esc(Object.values(x.args || {}).join(', '))})${x.ok ? '' : ' failed'}</span>`).join('')}</div>` : ''}
      <div><span class="who">Jarvis</span> ${esc(t.reply)}</div>
      <div class="m">${t.latency != null ? `<span>answered in ${esc(t.latency)} s</span>` : ''}${t.verdict ? `<span class="${t.verdict.pass ? 'pass' : 'miss'}">${t.verdict.pass ? 'Pass' : 'Miss'}: ${esc(t.verdict.why)}</span>` : ''}</div>
    </div>`).join('');
  const costRows = res.cost ? Object.entries(res.cost.lines).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td>${usd(v)}</td></tr>`).join('') + `<tr><td><b>Total</b></td><td><b>${usd(res.cost.total_usd)}</b></td></tr>` : '';
  const title = wf?.title || String(row.workflow);
  const checks = res.checks ? `${res.passed} of ${res.checks} checks passed` : '';
  const desc = `${title}: a recorded Jarvis Arena run${checks ? `, ${checks}` : ''}${typeof row.cost_usd === 'number' ? `, ${usd(row.cost_usd)}` : ''}.`;
  const vertical = row.layout === 'vertical';
  return page(`${title}: a Jarvis Arena run`, `<div class="player">
    <div class="side">${row.video_key ? `<div class="screen${vertical ? '' : ' wide'}"><video id="vid" controls playsinline preload="metadata" ${row.poster_key ? `poster="/poster/${esc(row.id)}.jpg"` : ''} src="/video/${esc(row.id)}.mp4"></video></div>` : running ? `<div class="note" id="live">Starting the stage…</div>` : ''}
    </div>
    <div>
      <h1 style="margin-top:0">${esc(title)}</h1>
      <div class="runbar">${score(row) || (row.status === 'error' ? '<span class="status-err">failed</span>' : `<span class="dim">${esc(row.status)}</span>`)}${row.status === 'done' && row.video_key ? voteBtn(row) : ''}<span class="small dim">${usd(row.cost_usd)}</span><span class="small dim">${ago(row.created_at)}</span></div>
      ${row.video_key ? `<div class="speed" role="group" aria-label="Playback speed" style="margin-top:12px">${[1, 1.5, 2, 3, 4].map((r) => `<button type="button" data-rate="${r}" aria-pressed="false">${r}×</button>`).join('')}</div>` : ''}
      ${res.error ? `<h2>What went wrong</h2><pre>${esc(res.error)}</pre>` : ''}
      ${turns ? `<h2>Turn by turn</h2>${turns}` : ''}
      ${costRows ? `<h2>What it cost</h2><table>${costRows}</table><p class="dim small">List prices of ${esc(res.cost.prices)}, before Workers Paid's included monthly usage. Container CPU is an upper bound (it is billed on actual use). The container ran ${esc(res.container_seconds)} s; the model was called ${esc(res.usage?.chat_calls ?? 0)} times (${esc(row.model || '')}).</p>` : ''}
      ${wf ? `<h2>The workflow</h2><p class="dim small">What the voice says, what Jarvis is told, and what is checked: <a href="${REPO}/blob/master/workflows/${esc(wf.name)}.json" target="_blank" rel="noopener">${esc(wf.name)}.json<span class="sr"> (opens github.com)</span></a>.</p>` : ''}
      ${res.events ? `<h2>Stage log</h2><pre>${esc(JSON.stringify(res.events, null, 1)).slice(0, 8000)}</pre>` : ''}
    </div></div>`,
  { path: `/runs/${row.id}`, desc, noindex: !row.video_key, wide: true, image: row.poster_key ? `/poster/${row.id}.jpg` : undefined },
  SPEED + VOTE_JS + (running ? `const id = ${JSON.stringify(row.id)};
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

// Playback speed: buttons by the video, the choice remembered on this device (also keys 1-5).
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
      <li><b>On your device:</b> the playback speed you pick and the runs you voted for are kept in your browser's local storage.</li>
      <li><b>Votes:</b> your first vote sets a cookie named <code>aid</code> holding a random id, so each browser counts once per run. The vote table keeps that id, the run and the time; nothing else about you.</li>
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
