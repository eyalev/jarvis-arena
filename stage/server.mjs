// The stage: runs one workflow as a recorded scene.
//
// A virtual 1920x1080 screen (Xvfb) holds two Chromium windows: the phone pane
// (phone.html, 480 px, left) and the world (a normal browser window, right).
// ffmpeg records the screen. For each line of the workflow the synthetic user's
// words are spoken (TTS), heard (STT), and handed to Jarvis: an LLM with
// browser tools that acts on the world window over CDP and answers out loud.
// The voices are mixed onto the video afterwards from the timeline, so the
// container needs no sound card.
//
// AI goes through AI_BASE (default http://ai.arena, answered by the Worker's
// outbound intercept, so the container holds no keys). Logs are JSONL on stdout.
//
//   POST /run {id, workflow}   start a scene (one at a time)
//   GET  /status               progress, transcript, verdicts, usage
//   GET  /video                the finished mp4
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, createReadStream, rmSync } from 'node:fs';

const PORT = 8080, W = 1920, H = 1080, PHONE_W = 480;
const AI = process.env.AI_BASE || 'http://ai.arena';
const AI_TOKEN = process.env.AI_TOKEN || '';
const WORK = process.env.WORK || '/work';
const SCENE_LIMIT_MS = 9 * 60_000;
const DIR = new URL('.', import.meta.url).pathname;

let state = { status: 'idle' };
const events = [];
const log = (event, data = {}) => {
  const line = { ts: new Date().toISOString(), module: 'stage', event, ...data };
  console.log(JSON.stringify(line));
  events.push(line); if (events.length > 400) events.shift();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- AI (through the Worker) ---------------- */

const usage = { chat_in: 0, chat_out: 0, chat_calls: 0, tts_chars: 0, stt_seconds: 0 };
async function ai(path, body, type = 'application/json') {
  const r = await fetch(`${AI}${path}`, { method: 'POST', headers: { 'content-type': type, ...(AI_TOKEN ? { 'x-arena-token': AI_TOKEN } : {}) }, body });
  if (!r.ok) throw new Error(`ai ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r;
}
async function tts(text, speaker, file) {
  const r = await ai('/tts', JSON.stringify({ text, speaker }));
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  usage.tts_chars += text.length;
  return probe(file);
}
let keyterms = '';
async function stt(file, seconds) {
  const r = await fetch(`${AI}/stt`, { method: 'POST', body: readFileSync(file), headers: { 'content-type': 'audio/mpeg', 'x-keyterms': keyterms, ...(AI_TOKEN ? { 'x-arena-token': AI_TOKEN } : {}) } });
  if (!r.ok) throw new Error(`ai /stt: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  usage.stt_seconds += seconds;
  return (await r.json()).text || '';
}
async function chat(messages, tools) {
  const r = await (await ai('/chat', JSON.stringify({ messages, tools }))).json();
  usage.chat_calls++;
  usage.chat_in += r.usage?.prompt_tokens || 0;
  usage.chat_out += r.usage?.completion_tokens || 0;
  return r.choices?.[0]?.message || { content: '' };
}

/* ---------------- processes ---------------- */

const procs = [];
function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { env: { ...process.env, DISPLAY: ':99' }, stdio: ['pipe', 'ignore', 'pipe'], ...opts });
  let err = '';
  p.stderr?.on('data', (d) => { err = (err + d).slice(-2000); });
  p.on('exit', (code, sig) => { if (code && cmd !== 'chromium') log('proc_exit', { cmd, code, sig, err: err.slice(-500) }); });
  p.lastErr = () => err;
  p.exited = new Promise((r) => p.on('exit', (code, sig) => r({ code, sig })));
  procs.push(p);
  return p;
}
function probe(file) {
  return new Promise((res) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    let out = ''; p.stdout.on('data', (d) => (out += d)); p.on('close', () => res(Number(out.trim()) || 0));
  });
}
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(150); }
  throw new Error(`timed out waiting for ${what}`);
}
function chromium(port, dir, args) {
  return run('chromium', ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter,OptimizationHints', '--password-store=basic', '--force-device-scale-factor=1',
    '--disable-session-crashed-bubble', '--test-type', '--disable-infobars', '--hide-crash-restore-bubble', '--lang=en-US',
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, ...args]);
}

/* ---------------- CDP ---------------- */

class Tab {
  static async open(port) {
    const t = await until(async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'), 15000, `chromium :${port}`);
    const tab = new Tab(); tab.port = port;
    log('cdp_attach', { port, url: t.url, title: t.title });
    tab.ws = new WebSocket(t.webSocketDebuggerUrl);
    tab.seq = 0; tab.pending = new Map(); tab.waiters = [];
    tab.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && tab.pending.has(d.id)) { const p = tab.pending.get(d.id); tab.pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
      else if (d.method) tab.waiters = tab.waiters.filter((w) => !(w.method === d.method && (w.res(d.params), true)));
    };
    await new Promise((r, j) => { tab.ws.onopen = r; tab.ws.onerror = j; });
    await tab.send('Page.enable');
    return tab;
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  wait(method, ms) { return Promise.race([new Promise((res) => this.waiters.push({ method, res })), sleep(ms)]); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result?.value;
  }
  async goto(url) {
    const loaded = this.wait('Page.loadEventFired', 12000);
    await this.send('Page.navigate', { url });
    await loaded; await sleep(700);
  }
}

/* ---------------- Jarvis's tools (act on the world window) ---------------- */

const TOOLS = [
  { type: 'function', function: { name: 'open_url', description: 'Open a web address in the browser on the computer.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'click', description: 'Click the link or button whose visible text best matches.', parameters: { type: 'object', properties: { text: { type: 'string', description: 'visible text of the link or button' } }, required: ['text'] } } },
  { type: 'function', function: { name: 'read_page', description: 'Read the page that is open: title, address, visible text, and its links and buttons.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'scroll', description: 'Scroll the page.', parameters: { type: 'object', properties: { direction: { type: 'string', enum: ['down', 'up', 'top'] } }, required: ['direction'] } } },
];

const READ = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const items = [...document.querySelectorAll('a,button,[role=button],[role=tab],summary')].filter(vis)
    .map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ')).filter((t) => t && t.length < 80);
  return { title: document.title, url: location.href, text: document.body.innerText.replace(/\\n{3,}/g, '\\n\\n').slice(0, 3000), links_and_buttons: [...new Set(items)].slice(0, 60) };
})()`;

const FIND = (text) => `(() => {
  const want = ${JSON.stringify(String(text).toLowerCase().trim())};
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const label = (e) => (e.innerText || e.getAttribute('aria-label') || e.value || '').trim().replace(/\\s+/g, ' ');
  const all = [...document.querySelectorAll('a,button,[role=button],[role=tab],summary,input[type=submit]')].filter(vis);
  const score = (e) => { const l = label(e).toLowerCase(); if (!l) return 0; if (l === want) return 3; if (l.startsWith(want)) return 2; if (l.includes(want) || want.includes(l)) return 1; return 0; };
  const best = all.map((e) => [score(e), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || label(a[1]).length - label(b[1]).length)[0];
  if (!best) return null;
  const e = best[1];
  if (e.tagName === 'A') e.removeAttribute('target');
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: label(e).slice(0, 60) };
})()`;

async function tool(world, name, args) {
  if (name === 'open_url') {
    let url = String(args.url || '').trim();
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    await world.goto(url);
    return { ok: true, url: await world.eval('location.href'), title: await world.eval('document.title'), say: `Opened ${new URL(url).hostname}` };
  }
  if (name === 'click') {
    const hit = await world.eval(FIND(args.text));
    if (!hit) return { ok: false, error: `nothing on the page matches "${args.text}"`, say: `No "${args.text}" on the page` };
    await sleep(250);
    const loaded = world.wait('Page.loadEventFired', 2500);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await world.send('Input.dispatchMouseEvent', { type, x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
    }
    await loaded; await sleep(900);
    return { ok: true, clicked: hit.label, url: await world.eval('location.href'), title: await world.eval('document.title'), say: `Clicked "${hit.label}"` };
  }
  if (name === 'read_page') { const r = await world.eval(READ); return { ...r, say: 'Read the page' }; }
  if (name === 'scroll') {
    const d = args.direction === 'up' ? -700 : 700;
    await world.eval(args.direction === 'top' ? 'scrollTo({top:0,behavior:"smooth"})' : `scrollBy({top:${d},behavior:"smooth"})`);
    await sleep(700);
    return { ok: true, say: `Scrolled ${args.direction}` };
  }
  return { ok: false, error: `unknown tool ${name}` };
}

/* ---------------- the scene ---------------- */

const SYSTEM = `You are Jarvis, a voice assistant. The user talks to you from a phone; you control a web browser on their computer through tools.
Rules:
- Act with the tools first, then answer. Your answer is spoken aloud: one or two short sentences, no markdown, no lists, never read a web address aloud.
- If the user asks what is on the screen or about the open page, call read_page before answering.
- Never say you did something you did not do. If a tool failed, say so plainly.
- If you are not sure what they meant, do the most likely thing and say what you did.
- Use as few tools as you can: usually one action, then answer. Only read the page when the question needs what is on it.
- Never put web addresses, links or parentheses in your answer.
- Never read code, lists or long text aloud: say in a sentence what it is and that it is on the screen.`;

// Spoken answers stay short: whole sentences up to ~260 characters (a voice reading a page aloud
// is useless and Aura bills per character: one 3,000-character answer cost $0.09 on 2026-10-08).
const MAX_SPOKEN = 260;
function shorten(t) {
  if (t.length <= MAX_SPOKEN) return t;
  let out = '';
  for (const s of t.match(/[^.!?]+[.!?]+/g) || []) { if ((out + s).length > MAX_SPOKEN) break; out += s; }
  return (out || t.slice(0, MAX_SPOKEN).replace(/\s+\S*$/, '') + '…').trim();
}

/** What gets spoken: no markdown, links, addresses or line breaks. */
const speakable = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\([^)]*(https?:|www\.|\.\w{2,}\/)[^)]*\)/g, '')
  .replace(/https?:\/\/\S+/g, '').replace(/[*_#`>]/g, '').replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

function check(expect, reply, url, pageText) {
  if (!expect) return null;
  const fails = [];
  if (expect.url_includes && !url.includes(expect.url_includes)) fails.push(`address does not include "${expect.url_includes}"`);
  if (expect.reply_matches && !new RegExp(expect.reply_matches, 'i').test(reply)) fails.push(`reply does not match /${expect.reply_matches}/`);
  if (expect.page_includes && !pageText.toLowerCase().includes(expect.page_includes.toLowerCase())) fails.push(`page does not show "${expect.page_includes}"`);
  return { pass: fails.length === 0, why: fails.join('; ') || 'as expected' };
}

async function runScene(id, wf) {
  const t0wall = Date.now();
  const dir = `${WORK}/${id}`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(`${dir}/audio`, { recursive: true });
  state = { status: 'starting', id, workflow: wf.name, turns: [], startedAt: new Date().toISOString() };
  const lines = wf.lines || [];
  keyterms = (wf.keyterms || []).join(',');
  const userVoice = wf.voices?.user || 'arcas', jarvisVoice = wf.voices?.jarvis || 'draco';

  // Every user line is made before recording starts, so the video has no gaps for it.
  const said = [];
  for (const [i, l] of lines.entries()) {
    const file = `${dir}/audio/user-${i}.mp3`;
    said.push({ file, seconds: await tts(l.say || l.text, userVoice, file) });
  }
  log('user_lines_ready', { id, n: said.length, ms: Date.now() - t0wall });

  run('Xvfb', [':99', '-screen', '0', `${W}x${H}x24`, '-nolisten', 'tcp']);
  await until(() => existsSync('/tmp/.X11-unix/X99'), 8000, 'Xvfb');
  chromium(19223, `${dir}/chrome-phone`, [`--app=http://127.0.0.1:${PORT}/phone`, '--window-position=0,0', `--window-size=${PHONE_W},${H}`]);
  chromium(19222, `${dir}/chrome-world`, [`--window-position=${PHONE_W},0`, `--window-size=${W - PHONE_W},${H}`, wf.start_url || 'about:blank']);
  const phone = await Tab.open(19223), world = await Tab.open(19222);
  await until(() => phone.eval('!!window.scene'), 10000, 'phone page').catch(async (e) => {
    log('phone_not_ready', { href: await phone.eval('location.href').catch((x) => String(x)), targets: await (await fetch('http://127.0.0.1:19223/json')).json().then((a) => a.map((x) => `${x.type} ${x.url}`)).catch((x) => String(x)) });
    throw e;
  });
  const P = (js) => phone.eval(`scene.${js}`).catch((e) => log('phone_failed', { js: js.slice(0, 80), error: String(e) }));
  await P(`title(${JSON.stringify(wf.title || wf.name)})`);
  await sleep(1500);

  const ff = run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '25', '-video_size', `${W}x${H}`, '-i', ':99',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', `${dir}/screen.mp4`], { stdio: ['pipe', 'ignore', 'pipe'] });
  const t0 = Date.now();
  const at = () => (Date.now() - t0) / 1000;
  const audio = [];
  state.status = 'running';
  await sleep(1200);

  const messages = [{ role: 'system', content: SYSTEM + (wf.context ? `\n\nWhat you know for this task:\n${wf.context}` : '') }];
  for (const [i, l] of lines.entries()) {
    if (Date.now() - t0wall > SCENE_LIMIT_MS) { log('scene_limit', { id, turn: i }); break; }
    const turn = { n: i + 1, said: l.text };
    state.turns.push(turn);
    await P(`turn(${i + 1}, ${lines.length})`);
    // The user speaks.
    await P(`user(${JSON.stringify(l.text)})`);
    await P(`status('listening', 'Listening…')`);
    audio.push({ file: said[i].file, at: at() });
    await sleep(said[i].seconds * 1000 + 250);
    const tEnd = Date.now();
    await P(`status('thinking', 'Thinking…')`);
    turn.heard = (await stt(said[i].file, said[i].seconds).catch((e) => { log('stt_failed', { error: String(e) }); return l.text; })).trim() || l.text;
    if (turn.heard.toLowerCase().replace(/[^a-z0-9 ]/g, '') !== l.text.toLowerCase().replace(/[^a-z0-9 ]/g, '')) await P(`heard(${JSON.stringify(turn.heard)})`);

    // Jarvis acts, then answers.
    const screen = await world.eval('({ title: document.title, url: location.href })').catch(() => ({}));
    messages.push({ role: 'user', content: `${turn.heard}\n\n[Browser now: ${screen.title || ''} ${screen.url || ''}]` });
    turn.tools = [];
    let reply = '';
    for (let step = 0; step < 6; step++) {
      const msg = await chat(messages, TOOLS);
      const calls = msg.tool_calls || [];
      messages.push({ role: 'assistant', content: msg.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
      if (!calls.length) { reply = speakable(msg.content); break; }
      for (const c of calls) {
        let args = {};
        try { args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : c.function.arguments || {}; } catch {}
        const out = await tool(world, c.function.name, args).catch((e) => ({ ok: false, error: String(e.message || e) }));
        turn.tools.push({ name: c.function.name, args, ok: out.ok !== false, error: out.error });
        if (out.say) await P(`action(${JSON.stringify(out.say)})`);
        log('tool', { id, turn: i + 1, name: c.function.name, args, ok: out.ok !== false, error: out.error });
        const { say, ...rest } = out;
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(rest).slice(0, 4000) });
      }
    }
    if (!reply) {
      // Out of steps: one last call with no tools, so it says what it did instead of giving up.
      const last = await chat([...messages, { role: 'user', content: 'Stop using tools now. In one short spoken sentence, say what you did and what is on the screen.' }], undefined);
      reply = speakable(last.content) || "Sorry, I couldn't finish that.";
      turn.out_of_steps = true;
    }
    if (reply.length > MAX_SPOKEN) { turn.reply_full = reply; reply = shorten(reply); }
    turn.reply = reply;
    const rf = `${dir}/audio/jarvis-${i}.mp3`;
    const rs = await tts(reply, jarvisVoice, rf).catch((e) => { log('tts_failed', { id, turn: i + 1, error: String(e) }); return 0; });
    turn.latency = Math.round((Date.now() - tEnd) / 100) / 10;
    await P(`jarvis(${JSON.stringify(reply)})`);
    await P(`status('speaking', 'Speaking…')`);
    // A clip ffprobe cannot read would break the final mix: leave it out and say so in the log.
    if (rs > 0) audio.push({ file: rf, at: at() }); else log('reply_unvoiced', { id, turn: i + 1 });
    await sleep(Math.max(rs, 1.5) * 1000 + 200);

    const url = await world.eval('location.href').catch(() => '');
    const text = l.expect?.page_includes ? await world.eval('document.body.innerText').catch(() => '') : '';
    turn.url = url;
    turn.verdict = check(l.expect, reply, url, text);
    if (turn.verdict) await P(`verdict(${turn.verdict.pass}, ${JSON.stringify(turn.verdict.why)})`);
    log('turn', { id, ...turn });
    // Older page reads only cost tokens and time: keep each finished turn's tool results short.
    for (const m of messages) if (m.role === 'tool' && m.content.length > 400) m.content = m.content.slice(0, 400) + '…';
    await P(`status('', 'Ready')`);
    await sleep(500);
  }
  const verdicts = state.turns.map((t) => t.verdict).filter(Boolean);
  await P(`status('', ${JSON.stringify(verdicts.length ? `Done: ${verdicts.filter((v) => v.pass).length} of ${verdicts.length} checks passed` : 'Done')})`);
  await sleep(2500);

  // Stop recording, then lay the voices onto the video at their times.
  state.status = 'encoding';
  // SIGINT makes ffmpeg finish the file (writes the moov atom); a kill would not.
  ff.kill('SIGINT');
  const fx = await Promise.race([ff.exited, sleep(20000).then(() => null)]);
  log('screen_stopped', { id, exit: fx, err: ff.lastErr().slice(-300) });
  if (!fx) { ff.kill('SIGKILL'); throw new Error('ffmpeg did not stop'); }
  const ins = audio.flatMap((a) => ['-i', a.file]);
  const chains = audio.map((a, k) => `[${k + 1}:a]adelay=${Math.round(a.at * 1000)}|${Math.round(a.at * 1000)}[a${k}]`).join(';');
  const mix = `${chains};${audio.map((_, k) => `[a${k}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest[a]`;
  await new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', `${dir}/screen.mp4`, ...ins, '-filter_complex', mix, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', `${dir}/out.mp4`]);
    let e = ''; p.stderr.on('data', (d) => (e += d)); p.on('close', (c) => (c ? rej(new Error(`mux failed: ${e.slice(-400)}`)) : res()));
  });
  const seconds = await probe(`${dir}/out.mp4`);
  for (const p of procs.splice(0)) { try { p.kill('SIGKILL'); } catch {} }
  state = { ...state, status: 'done', video: `${dir}/out.mp4`, videoBytes: statSync(`${dir}/out.mp4`).size, videoSeconds: seconds, usage: { ...usage }, sceneSeconds: (Date.now() - t0wall) / 1000,
    passed: verdicts.filter((v) => v.pass).length, checks: verdicts.length, finishedAt: new Date().toISOString() };
  log('scene_done', { id, seconds, bytes: state.videoBytes, usage, passed: state.passed, checks: state.checks });
}

/* ---------------- HTTP ---------------- */

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true, status: state.status });
    if (url.pathname === '/phone') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(readFileSync(`${DIR}phone.html`)); }
    if (url.pathname === '/status') return json(res, 200, { ...state, events: events.slice(-60) });
    if (url.pathname === '/video') {
      if (state.status !== 'done') return json(res, 409, { error: `no video yet (${state.status})` });
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': statSync(state.video).size });
      return createReadStream(state.video).pipe(res);
    }
    if (url.pathname === '/run' && req.method === 'POST') {
      if (['starting', 'running', 'encoding'].includes(state.status)) return json(res, 409, { error: `busy (${state.status})` });
      let body = ''; for await (const c of req) body += c;
      const { id, workflow } = JSON.parse(body);
      Object.assign(usage, { chat_in: 0, chat_out: 0, chat_calls: 0, tts_chars: 0, stt_seconds: 0 });
      runScene(String(id || Date.now()), workflow).catch((e) => {
        for (const p of procs.splice(0)) { try { p.kill('SIGKILL'); } catch {} }
        state = { ...state, status: 'error', error: String(e.stack || e), usage: { ...usage } };
        log('scene_failed', { id, error: String(e.stack || e) });
      });
      return json(res, 202, { ok: true });
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    log('http_error', { path: url.pathname, error: String(e) });
    json(res, 500, { error: String(e) });
  }
}).listen(PORT, () => log('listening', { port: PORT, ai: AI }));
