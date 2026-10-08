// Server-rendered pages: workflows + runs (home) and one run (video, transcript, verdicts, cost).
import type { Workflow } from './index';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const usd = (n: unknown) => (typeof n === 'number' ? (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`) : '–');

const CSS = `
:root { --bg:#fff; --card:#f4f5f7; --card-2:#eaecf0; --line:#e0e3e8; --dim:#5d6571; --fg:#14171c; --accent:#d6461d; --ok:#1f7a4d; --bad:#b42318; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0d0f12; --card:#161a1f; --card-2:#1d2228; --line:#272d35; --dim:#8f99a5; --fg:#e9edf2; --accent:#ff7448; --ok:#4cc38a; --bad:#f87171; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif; -webkit-text-size-adjust: 100%; overflow-wrap: anywhere; }
main { max-width: 760px; margin: 0 auto; padding: 16px 16px 64px; }
h1, h2 { font-family: "Bricolage Grotesque", Georgia, serif; letter-spacing: -0.01em; }
h1 { font-size: 30px; line-height: 1.1; margin: 16px 0 6px; }
h2 { font-size: 21px; margin: 32px 0 10px; }
a { color: var(--accent); text-underline-offset: 3px; }
.dim { color: var(--dim); }
.card { background: var(--card); border-radius: 12px; padding: 14px 16px; margin: 0 0 10px; }
.row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.btn { min-height: 44px; padding: 0 16px; border-radius: 12px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 500; cursor: pointer; }
.btn[disabled] { opacity: .5; }
.tag { display: inline-block; font-size: 12px; line-height: 1.35; padding: 2px 6px; border-radius: 4px; background: var(--card-2); color: var(--dim); font-variant-numeric: tabular-nums; }
.tag.done { color: var(--ok); } .tag.error { color: var(--bad); } .tag.running, .tag.queued { color: var(--accent); }
ol.lines { padding-left: 20px; margin: 8px 0 0; color: var(--dim); font-size: 14px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
td { padding: 6px 0; border-top: 1px solid var(--line); } td:last-child { text-align: right; }
video { width: 100%; border-radius: 12px; background: #000; aspect-ratio: 16 / 9; display: block; }
.turn { display: grid; gap: 4px; padding: 12px 0; border-top: 1px solid var(--line); }
.turn .who { font-size: 13px; color: var(--dim); }
.turn .j { color: var(--fg); }
.turn .meta { font-size: 13px; color: var(--dim); display: flex; flex-wrap: wrap; gap: 4px 12px; }
.pass { color: var(--ok); } .miss { color: var(--bad); }
pre { white-space: pre-wrap; font-size: 12px; background: var(--card); padding: 12px; border-radius: 8px; overflow-x: auto; }
/* freshbar: horizon 7 days (remote-manage/src/lib/fresh.js form) */
.fresh { position: relative; display: inline-block; font-size: 12px; line-height: 1.35; color: var(--dim); border-radius: 5px; padding: 2px 6px 6px; min-width: 6.4em; font-variant-numeric: tabular-nums; background: color-mix(in srgb, var(--fg) 3.5%, var(--card)); }
.fresh::after { content: ""; position: absolute; left: 6px; right: 6px; bottom: 3px; height: 2px; border-radius: 2px; background: linear-gradient(to right, color-mix(in srgb, var(--dim) 75%, var(--card)) var(--f, 0%), var(--line) 0); }
`;

const page = (title: string, body: string, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;

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
  return `<span class="fresh" style="--f:${Math.round(f * 1000) / 10}%" title="${esc(new Date(ts).toISOString())}">${label}</span>`;
}

export function renderHome(workflows: Workflow[], runs: Record<string, unknown>[]) {
  const est = (name: string) => {
    const done = runs.filter((r) => r.workflow === name && r.status === 'done' && typeof r.cost_usd === 'number');
    if (!done.length) return 'No runs yet';
    const avg = done.reduce((a, r) => a + (r.cost_usd as number), 0) / done.length;
    return `About ${usd(avg)} a run, from ${done.length} run${done.length > 1 ? 's' : ''}`;
  };
  const wf = workflows.map((w) => `<div class="card">
    <div class="row"><div><b>${esc(w.title)}</b><div class="dim" style="font-size:14px">${esc(est(w.name))}</div></div>
    <button class="btn" data-run="${esc(w.name)}">Run</button></div>
    <ol class="lines">${w.lines.map((l) => `<li>"${esc(l.text)}"</li>`).join('')}</ol></div>`).join('');
  const rows = runs.map((r) => {
    let pc = '';
    try { const x = JSON.parse(String(r.result || 'null')); if (x?.checks) pc = `${x.passed} of ${x.checks} checks`; } catch {}
    return `<div class="card"><div class="row"><a href="/runs/${esc(r.id)}">${esc(workflows.find((w) => w.name === r.workflow)?.title || r.workflow)}</a>${fresh(r.created_at)}</div>
      <div class="row dim" style="font-size:14px;justify-content:flex-start"><span class="tag ${esc(r.status)}">${esc(r.status)}</span>${pc ? `<span>${esc(pc)}</span>` : ''}<span>${usd(r.cost_usd)}</span></div></div>`;
  }).join('');
  return page('Jarvis Arena', `<h1>Jarvis Arena</h1>
    <p class="dim">Voice-agent workflows, run on Cloudflare: a synthetic voice talks to Jarvis, Jarvis drives a real browser, and the whole thing is recorded with a pass or miss for each step and what it cost.</p>
    <h2>Workflows</h2>${wf}
    <h2>Runs</h2>${rows || '<p class="dim">Nothing has run yet.</p>'}`,
  `document.querySelectorAll('[data-run]').forEach((b) => b.onclick = async () => {
     b.disabled = true; b.textContent = 'Starting…';
     try { const r = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow: b.dataset.run }) });
       const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); location.href = j.url; }
     catch (e) { b.disabled = false; b.textContent = 'Run'; alert(String(e.message || e)); }
   });`);
}

export function renderRun(row: Record<string, unknown>, wf?: Workflow) {
  const res = row.result ? JSON.parse(String(row.result)) : null;
  const running = ['queued', 'running'].includes(String(row.status));
  const turns = (res?.turns || []).map((t: any) => `<div class="turn">
      <div><span class="who">You</span> "${esc(t.said)}"</div>
      ${t.heard && t.heard.toLowerCase().replace(/[^a-z0-9 ]/g, '') !== String(t.said).toLowerCase().replace(/[^a-z0-9 ]/g, '') ? `<div class="meta">Heard as "${esc(t.heard)}"</div>` : ''}
      ${(t.tools || []).length ? `<div class="meta">${t.tools.map((x: any) => `<span>${esc(x.name)}(${esc(Object.values(x.args || {}).join(', '))})${x.ok ? '' : ' failed'}</span>`).join('')}</div>` : ''}
      <div class="j"><span class="who">Jarvis</span> ${esc(t.reply)}</div>
      <div class="meta">${t.latency != null ? `<span>answered in ${esc(t.latency)} s</span>` : ''}${t.verdict ? `<span class="${t.verdict.pass ? 'pass' : 'miss'}">${t.verdict.pass ? 'Pass' : 'Miss'}: ${esc(t.verdict.why)}</span>` : ''}</div>
    </div>`).join('');
  const costRows = res?.cost ? Object.entries(res.cost.lines).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td>${usd(v)}</td></tr>`).join('') + `<tr><td><b>Total</b></td><td><b>${usd(res.cost.total_usd)}</b></td></tr>` : '';
  return page(`${wf?.title || row.workflow} · run`, `<p><a href="/">Jarvis Arena</a></p>
    <h1>${esc(wf?.title || row.workflow)}</h1>
    <div class="row" style="justify-content:flex-start"><span class="tag ${esc(row.status)}" id="st">${esc(row.status)}</span>${fresh(row.created_at)}${res?.checks ? `<span>${res.passed} of ${res.checks} checks passed</span>` : ''}</div>
    ${row.video_key ? `<h2>Recording</h2><video controls playsinline preload="metadata" src="/video/${esc(row.id)}.mp4"></video>` : running ? `<div class="card" style="margin-top:16px" id="live">Starting the stage…</div>` : ''}
    ${res?.error ? `<h2>What went wrong</h2><pre>${esc(res.error)}</pre>` : ''}
    ${turns ? `<h2>Turns</h2>${turns}` : ''}
    ${costRows ? `<h2>What it cost</h2><table>${costRows}</table><p class="dim" style="font-size:13px">List prices of ${esc(res.cost.prices)}, before Workers Paid's included monthly usage. Container CPU is an upper bound (billed on actual use). Container: ${esc(res.container_seconds)} s, ${esc(res.usage?.chat_calls ?? 0)} model calls.</p>` : ''}
    ${res?.events ? `<h2>Stage log</h2><pre>${esc(JSON.stringify(res.events, null, 1)).slice(0, 8000)}</pre>` : ''}`,
  running ? `const id = ${JSON.stringify(row.id)};
    async function poll() {
      try { const j = await (await fetch('/api/runs/' + id)).json();
        if (!['queued','running'].includes(j.status)) return location.reload();
        const l = j.live && j.live.live; const el = document.getElementById('live');
        if (el) el.textContent = l ? (l.status + (l.turns ? ' · turn ' + l.turns.length + ': "' + (l.turns.at(-1)?.said || '') + '"' : '')) : (j.live ? j.live.phase : 'queued');
      } catch (e) {}
      setTimeout(poll, 3000);
    }
    poll();` : '');
}
