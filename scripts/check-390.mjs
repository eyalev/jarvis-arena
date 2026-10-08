// Phone check: every public page at 390x844 (touch), light and dark, plus 1440 desktop.
// Asserts no sideways scroll, controls a thumb must reach are >= 44 px and on screen,
// inputs don't zoom (font-size >= 16 px), the share image and canonical are set.
// Marks itself as our own traffic before any page script runs. Screenshots -> shots/.
//   node scripts/check-390.mjs [base]          exit 1 on any failure
import { chromium, devices } from '/home/eyalev/projects/personal/2026-10/recipes/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] || 'https://jarvis-arena.kapps.dev';
const OUT = new URL('../shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/home/eyalev/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
const fails = [];
const fail = (where, what) => { fails.push(`${where}: ${what}`); };

const home = await (await b.newPage()).goto(BASE + '/').then((r) => r.text());
const run = /href="(\/runs\/[\w-]+)"/.exec(home)?.[1];
if (!run) fail('/', 'no run linked from home');
const PAGES = ['/', run, '/about', '/privacy', '/feedback', '/nope'].filter(Boolean);

for (const [w, h, label] of [[390, 844, '390'], [1440, 900, '1440']]) for (const scheme of ['light', 'dark']) {
  const ctx = await b.newContext({ ...(w === 390 ? devices['Pixel 7'] : {}), viewport: { width: w, height: h }, colorScheme: scheme });
  await ctx.addInitScript(() => { try { localStorage.setItem('k:self', '1'); } catch {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  for (const path of PAGES) {
    const where = `${label}/${scheme} ${path}`;
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
    if (path !== '/nope' && res.status() !== 200) fail(where, `HTTP ${res.status()}`);
    const r = await page.evaluate(() => ({
      over: document.documentElement.scrollWidth > innerWidth,
      og: !!document.querySelector('meta[property="og:image"]')?.content,
      canon: !!document.querySelector('link[rel=canonical]'),
      small: [...document.querySelectorAll('button, .speed button, footer nav a, a.card, select, input:not([type=hidden]):not([tabindex="-1"]), textarea')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.height < 44; }).map((e) => e.outerHTML.slice(0, 60)),
      zoomy: [...document.querySelectorAll('input:not([type=hidden]), textarea, select')].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16 && e.tabIndex !== -1).length,
      footer: !!document.querySelector('footer a[href="/privacy"]') && !!document.querySelector('footer a[href^="/feedback"]'),
    }));
    if (r.over) fail(where, 'scrolls sideways');
    if (!r.og || !r.canon) fail(where, 'missing og:image or canonical');
    if (r.small.length) fail(where, `targets under 44 px: ${r.small.join(' | ')}`);
    if (r.zoomy) fail(where, `${r.zoomy} inputs under 16 px (zoom on focus)`);
    if (!r.footer) fail(where, 'footer links missing');
    if (path === run) {
      // The speed buttons are reachable and work: tap 2x, the video plays at 2x.
      const btn = page.locator('.speed button[data-rate="2"]');
      await btn.scrollIntoViewIfNeeded();
      if (w === 390) await btn.tap(); else await btn.click();
      const rate = await page.evaluate(() => document.getElementById('vid')?.playbackRate);
      if (rate !== 2) fail(where, `speed 2x did not apply (rate ${rate})`);
    }
    if (['/', run, '/feedback'].includes(path)) await page.screenshot({ path: `${OUT}${label}-${scheme}${path.replace(/\//g, '_') || '_home'}.png` });
  }
  if (errs.length) fail(`${label}/${scheme}`, `page errors: ${errs.join('; ')}`);
  await ctx.close();
}
await b.close();
console.log(JSON.stringify({ base: BASE, pages: PAGES.length, fails }));
process.exit(fails.length ? 1 : 0);
