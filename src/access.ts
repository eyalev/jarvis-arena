/**
 * The admin gate: Cloudflare Access, re-verified here. A twin of weather/src/access.js
 * (itself a twin of vidq and ppll; copy, don't import, is the house convention).
 *
 * Access sits in front of /admin at the edge; this verifies the signed assertion it
 * attaches (`Cf-Access-Jwt-Assertion`) against the team's keys, checks it was minted
 * for THIS application (`aud`) and that the email is allowed, so a misconfigured edge
 * policy cannot quietly open the admin. Fails closed with a 404.
 *
 * Also accepted: `Authorization: Bearer <ADMIN_TOKEN>` / `x-arena-token` (scripts, a
 * deploy of your own without Access) and the `arena` cookie set by /login?token=.
 */
const b64u = (s: string) => {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64uJson = (s: string) => JSON.parse(new TextDecoder().decode(b64u(s)));

async function verify(jwt: string, teamDomain: string, aud: string) {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const [h, p, sig] = parts;
  const header = b64uJson(h);
  const payload = b64uJson(p);
  const iss = `https://${teamDomain}`;
  if (payload.iss !== iss) throw new Error('issuer');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new Error('audience');
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('expired');
  if (header.alg !== 'RS256' || !header.kid) throw new Error('alg');
  const res = await fetch(`${iss}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (!res.ok) throw new Error('certs');
  const { keys = [] } = (await res.json()) as { keys?: { kid: string; kty: string; n: string; e: string }[] };
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(sig), new TextEncoder().encode(`${h}.${p}`)))) throw new Error('signature');
  return payload;
}

export type AccessEnv = { ADMIN_TOKEN?: string; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; ACCESS_ALLOWED_EMAIL?: string };

/** Who is the operator here, or null. Every refusal is logged with its reason. */
export async function admin(request: Request, env: AccessEnv): Promise<string | null> {
  const deny = (reason: string) => { console.log(JSON.stringify({ module: 'access', event: 'admin_denied', reason, path: new URL(request.url).pathname })); return null; };
  const tok = env.ADMIN_TOKEN;
  const cookie = /(?:^|;\s*)arena=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1];
  const header = request.headers.get('x-arena-token') || (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (tok && (cookie === tok || header === tok)) return 'token';
  const jwt = request.headers.get('cf-access-jwt-assertion');
  if (!jwt) return deny('no_assertion');
  const allowed = String(env.ACCESS_ALLOWED_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !allowed.length) return deny('unconfigured');
  try {
    const claims = await verify(jwt, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    const email = String(claims.email || '').toLowerCase();
    return allowed.includes(email) ? email : deny('email');
  } catch (e) {
    return deny(`jwt_${(e as Error).message}`);
  }
}
