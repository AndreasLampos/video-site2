import test from "node:test";
import assert from "node:assert/strict";
import { verifyAccessToken } from "../src/auth.js";
import { esc, renderSite } from "../src/render.js";
import { cleanContent, toEmbedUrl, ValidationError } from "../src/validate.js";

/* ---------- Login tokens ---------- */

const b64url = (data) => Buffer.from(data).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
const opts = { teamDomain: "team.cloudflareaccess.com", aud: "aud-1", now: 1000, getKeys: async () => [jwk] };
const good = { aud: ["aud-1"], iss: "https://team.cloudflareaccess.com", exp: 2000, email: "a@b.c" };

async function sign(claims, { key = pair.privateKey, header = { alg: "RS256", kid: "k1" } } = {}) {
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

test("accepts a genuine login token", async () => {
  assert.equal((await verifyAccessToken(await sign(good), opts)).email, "a@b.c");
});
test("rejects forged, expired, misaddressed or malformed tokens", async () => {
  assert.equal(await verifyAccessToken(await sign(good, { key: other.privateKey }), opts), null, "wrong signature");
  assert.equal(await verifyAccessToken(await sign({ ...good, exp: 999 }), opts), null, "expired");
  assert.equal(await verifyAccessToken(await sign({ ...good, aud: ["x"] }), opts), null, "wrong audience");
  assert.equal(await verifyAccessToken(await sign({ ...good, iss: "https://evil.example" }), opts), null, "wrong issuer");
  assert.equal(await verifyAccessToken(await sign({ ...good, exp: undefined }), opts), null, "no expiry");
  assert.equal(await verifyAccessToken(await sign(good, { header: { alg: "none", kid: "k1" } }), opts), null, "alg none");
  assert.equal(await verifyAccessToken("garbage", opts), null, "garbage");
});

/* ---------- Film links ---------- */

test("turns normal video links into embed addresses", () => {
  assert.equal(toEmbedUrl("https://vimeo.com/123456"), "https://player.vimeo.com/video/123456?autoplay=1");
  assert.equal(toEmbedUrl("https://vimeo.com/123456/abcdef12"), "https://player.vimeo.com/video/123456?autoplay=1&h=abcdef12");
  assert.equal(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1");
  assert.equal(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1");
  assert.equal(toEmbedUrl(""), "");
  assert.throws(() => toEmbedUrl("https://evil.example/video"), ValidationError);
  assert.throws(() => toEmbedUrl("javascript:alert(1)"), ValidationError);
});

/* ---------- Content ---------- */

const baseContent = () => ({
  brand: "S", metaTitle: "T", metaDescription: "",
  categories: [{ id: "cafe", label: "Cafes" }, { id: "product", label: "Products" }],
  hero: { line1: "a", line2: "b", sub: "c", film: "v" },
  story: { films: ["v", "h"] },
  gallery: { title: "More", films: ["h", "v"] },
  services: { title: "S", items: [{ title: "x", text: "y" }], note: "n", noteLink: "l" },
  about: { heading: "A", paragraphs: ["p"], film: "v" },
  clients: { title: "C", quotes: [] },
  contact: { heading: "H", lead: "", email: "a@b.co", phone: "+30 1", instagram: "", vimeo: "", formAction: "" },
});
const filmRow = (id, width, height, extra = {}) => ({ id, title: id, short_name: "", meta: "", description: "", category: "cafe", video_key: `${id}.mp4`, poster_key: `${id}.jpg`, bg_key: `${id}-bg.jpg`, width, height, embed_url: "", ...extra });

test("content checks reject unsafe links and missing films", () => {
  assert.ok(cleanContent(baseContent(), ["v", "h"]));
  const bad = (edit) => { const c = baseContent(); edit(c); assert.throws(() => cleanContent(c, ["v", "h"]), ValidationError); };
  bad((c) => { c.contact.instagram = "javascript:alert(1)"; });
  bad((c) => { c.contact.formAction = "http://not-secure.example"; });
  bad((c) => { c.hero.film = "gone"; });
  bad((c) => { c.story.films = []; });
  bad((c) => { c.gallery.films = ["gone"]; });
  bad((c) => { c.categories = []; });
  bad((c) => { c.contact.email = 'a"@b.co><script>'; });
});

test("the page escapes everything an admin can type", () => {
  const nasty = `<script>alert("x")</script>`;
  const c = baseContent();
  c.brand = nasty; c.hero.line1 = nasty; c.about.paragraphs = [nasty]; c.gallery.title = nasty; c.metaTitle = nasty;
  c.clients.quotes = [{ quote: nasty, name: nasty }];
  const html = renderSite(c, [filmRow("v", 1080, 1920, { title: nasty, meta: nasty, description: nasty }), filmRow("h", 1920, 1080)]);
  assert.ok(!html.includes(nasty));
  assert.ok(html.includes(esc(nasty)));
});

test("the page gives horizontal and vertical films the right shape", () => {
  const html = renderSite(baseContent(), [filmRow("v", 1080, 1920), filmRow("h", 1920, 1080, { embed_url: "https://player.vimeo.com/video/1?autoplay=1" })]);
  assert.match(html, /class="tile" data-cat="cafe" data-shape="wide" data-embed="https:\/\/player\.vimeo\.com\/video\/1\?autoplay=1" data-ratio="wide"/);
  assert.match(html, /class="tile" data-cat="cafe" data-shape="tall" data-src="\/media\/v\.mp4" data-ratio="vertical"/);
  assert.match(html, /class="hero" data-shape="tall"/);
  assert.equal((html.match(/class="panel"/g) || []).length, 2);
});

test("every card's Play reel button opens that card's own film", () => {
  const html = renderSite(baseContent(), [filmRow("v", 1080, 1920), filmRow("h", 1920, 1080)]);
  const targets = [...html.matchAll(/class="reel-btn" type="button" data-src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(targets, ["/media/v.mp4", "/media/v.mp4", "/media/h.mp4"]); // the opening screen, then one per chapter
});

test("the film names beside the chapters are buttons pointing at their chapter", () => {
  const html = renderSite(baseContent(), [filmRow("v", 1080, 1920), filmRow("h", 1920, 1080)]);
  assert.match(html, /<button type="button" data-goto="0" aria-current="true">v<\/button>/);
  assert.match(html, /<button type="button" data-goto="1">h<\/button>/);
});

test("optional sections disappear when empty", () => {
  const c = baseContent();
  c.services.items = [];
  const html = renderSite(c, [filmRow("v", 1080, 1920), filmRow("h", 1920, 1080)]);
  assert.ok(!html.includes('id="services"'));
  assert.ok(!html.includes('id="clients"'));
  assert.ok(!html.includes('href="#services"'));
  assert.ok(!html.includes('class="form"'));
});
