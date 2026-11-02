// Admin login is handled by Cloudflare Access (a one-time code sent by email).
// Access passes a signed token with each request. It is verified here too, so the admin
// area stays closed on any address Access doesn't sit in front of, such as *.workers.dev.

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

let certCache = { url: "", keys: null, at: 0 };

async function fetchKeys(url, force) {
  if (!force && certCache.url === url && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load Access keys (${res.status})`);
  const { keys } = await res.json();
  certCache = { url, keys, at: Date.now() };
  return keys;
}

/** Returns the token's claims if it is genuine, otherwise null. getKeys can be replaced in tests. */
export async function verifyAccessToken(token, { teamDomain, aud, now = Date.now() / 1000, getKeys = fetchKeys }) {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const header = b64urlJson(h);
    if (header.alg !== "RS256" || !header.kid) return null;

    const url = `https://${teamDomain}/cdn-cgi/access/certs`;
    let jwk = (await getKeys(url, false)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await getKeys(url, true)).find((k) => k.kid === header.kid); // keys were rotated
    if (!jwk) return null;

    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;

    const claims = b64urlJson(p);
    const audOk = Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud;
    if (!audOk || claims.iss !== `https://${teamDomain}`) return null;
    if (typeof claims.exp !== "number" || claims.exp < now) return null;
    if (typeof claims.nbf === "number" && claims.nbf > now + 60) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function isAdmin(request, env) {
  const { hostname } = new URL(request.url);
  // Only for "npm run dev" on this computer. It has no effect on any other address.
  if (env.DEV_AUTH_BYPASS === "true" && (hostname === "localhost" || hostname === "127.0.0.1")) return true;

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return false;
  return !!(await verifyAccessToken(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD }));
}
