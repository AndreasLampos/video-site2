import { isAdmin } from "./auth.js";
import { renderSite } from "./render.js";
import { cleanContent, cleanFilmFields, MEDIA_KEY, ValidationError } from "./validate.js";

const SECURITY_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" };
const MAX_PART_BYTES = 95 * 1024 * 1024; // Cloudflare accepts request bodies up to 100 MB on the free plan

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...SECURITY_HEADERS } });
const fail = (message, status = 400) => json({ error: message }, status);

const getContent = async (env) => {
  const row = await env.DB.prepare("SELECT content FROM site WHERE id = 1").first();
  if (!row) throw new Error("The database has no site content. Run the setup step in README.md.");
  return JSON.parse(row.content);
};
const getFilms = async (env) => (await env.DB.prepare("SELECT * FROM films ORDER BY created_at DESC, id").all()).results;

/* ---------- Public pages and media ---------- */

async function homepage(request, env) {
  const [content, films] = await Promise.all([getContent(env), getFilms(env)]);
  const body = request.method === "HEAD" ? null : renderSite(content, films);
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...SECURITY_HEADERS } });
}

/** Serves files from R2. Videos need range requests: Safari won't play them without. */
async function serveMedia(request, env, key) {
  if (!MEDIA_KEY.test(key)) return new Response("Not found", { status: 404 });
  if (request.method === "HEAD") {
    const head = await env.MEDIA.head(key);
    if (!head) return new Response(null, { status: 404 });
    return new Response(null, { headers: mediaHeaders(head) });
  }

  const object = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  const headers = mediaHeaders(object);
  if (!("body" in object)) return new Response(null, { status: request.headers.has("range") ? 412 : 304, headers });

  if (object.range && request.headers.has("range")) {
    const offset = object.range.offset ?? (object.range.suffix != null ? object.size - object.range.suffix : 0);
    const length = object.range.length ?? object.size - offset;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}

function mediaHeaders(object) {
  const headers = new Headers(SECURITY_HEADERS);
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000, immutable"); // every upload gets a new file name
  return headers;
}

/* ---------- Admin API ---------- */

const UPLOAD_KINDS = { video: { suffix: ".mp4", type: "video/mp4" }, poster: { suffix: ".jpg", type: "image/jpeg" }, bg: { suffix: "-bg.jpg", type: "image/jpeg" } };

async function adminApi(request, env, path) {
  const { method } = request;
  const url = new URL(request.url);
  const body = () => request.json();

  if (path === "state" && method === "GET") {
    const [content, films] = await Promise.all([getContent(env), getFilms(env)]);
    return json({ content, films });
  }

  if (path === "content" && method === "PUT") {
    const films = await getFilms(env);
    const content = cleanContent(await body(), films.map((f) => f.id));
    const missing = films.find((f) => !content.categories.some((c) => c.id === f.category));
    if (missing) throw new ValidationError(`"${missing.title}" uses a category you removed. Change that film's category first.`);
    await saveContent(env, content).run();
    return json({ content });
  }

  /* Uploads go in parts, so film length isn't limited by the request size limit. */
  if (path === "uploads" && method === "POST") {
    const { kind, base } = await body();
    const spec = UPLOAD_KINDS[kind];
    const name = /^[0-9a-f-]{36}$/.test(base || "") ? base : crypto.randomUUID();
    if (!spec) return fail("Unknown upload type.");
    const key = name + spec.suffix;
    const upload = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: spec.type } });
    return json({ key, uploadId: upload.uploadId, base: name });
  }
  const part = path.match(/^uploads\/part$/);
  if (part && method === "PUT") {
    const key = url.searchParams.get("key"), uploadId = url.searchParams.get("uploadId"), n = Number(url.searchParams.get("n"));
    if (!MEDIA_KEY.test(key || "") || !uploadId || !(n >= 1 && n <= 10000)) return fail("Bad upload request.");
    if (Number(request.headers.get("content-length") || 0) > MAX_PART_BYTES) return fail("Upload part is too large.", 413);
    const uploaded = await env.MEDIA.resumeMultipartUpload(key, uploadId).uploadPart(n, request.body);
    return json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
  }
  if (path === "uploads/complete" && method === "POST") {
    const { key, uploadId, parts } = await body();
    if (!MEDIA_KEY.test(key || "") || !uploadId || !Array.isArray(parts)) return fail("Bad upload request.");
    await env.MEDIA.resumeMultipartUpload(key, uploadId).complete(parts);
    return json({ ok: true });
  }
  if (path === "uploads/discard" && method === "POST") {
    const { keys } = await body();
    await env.MEDIA.delete((keys || []).filter((k) => MEDIA_KEY.test(k)));
    return json({ ok: true });
  }

  if (path === "films" && method === "POST") {
    const input = await body();
    const content = await getContent(env);
    const fields = cleanFilmFields(input, content.categories);
    const files = await checkFiles(env, input);
    const id = crypto.randomUUID();
    const place = { story: !!input.placeInStory, gallery: input.placeInGallery !== false };
    if (place.story) content.story.films.push(id);
    if (place.gallery) content.gallery.films.unshift(id); // newest first
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO films (id, title, short_name, meta, description, category, video_key, poster_key, bg_key, width, height, duration, size_bytes, embed_url)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, fields.title, fields.short_name, fields.meta, fields.description, fields.category, files.video_key, files.poster_key, files.bg_key, files.width, files.height, files.duration, files.size_bytes, fields.embed_url),
      saveContent(env, content),
    ]);
    return json({ id }, 201);
  }

  const filmMatch = path.match(/^films\/([\w-]+)$/);
  if (filmMatch) {
    const id = filmMatch[1];
    const film = await env.DB.prepare("SELECT * FROM films WHERE id = ?").bind(id).first();
    if (!film) return fail("That film no longer exists.", 404);
    const content = await getContent(env);

    if (method === "PATCH") {
      const input = await body();
      const fields = cleanFilmFields(input, content.categories);
      const statements = [];
      let files = film, stale = [];
      if (input.video_key) { // the video was replaced
        files = await checkFiles(env, input);
        stale = [film.video_key, film.poster_key, film.bg_key];
      } else if (input.poster_key) { // only the cover image was replaced
        const covers = await checkImages(env, input);
        files = { ...film, ...covers };
        stale = [film.poster_key, film.bg_key];
      }
      statements.push(env.DB.prepare(`UPDATE films SET title=?, short_name=?, meta=?, description=?, category=?, embed_url=?, video_key=?, poster_key=?, bg_key=?, width=?, height=?, duration=?, size_bytes=? WHERE id=?`)
        .bind(fields.title, fields.short_name, fields.meta, fields.description, fields.category, fields.embed_url, files.video_key, files.poster_key, files.bg_key, files.width, files.height, files.duration, files.size_bytes, id));
      await env.DB.batch(statements);
      if (stale.length) await env.MEDIA.delete(stale);
      return json({ ok: true });
    }

    if (method === "DELETE") {
      const blockers = [];
      if (content.hero.film === id) blockers.push("the opening clip");
      if (content.about.film === id) blockers.push("the About clip");
      if (content.story.films.length === 1 && content.story.films[0] === id) blockers.push("the only Selected work chapter");
      if (content.gallery.films.length === 1 && content.gallery.films[0] === id) blockers.push("the only film in the gallery");
      if (blockers.length) return fail(`This film is ${blockers.join(" and ")}. Choose a different film for that first, in the Layout tab.`, 409);
      content.story.films = content.story.films.filter((x) => x !== id);
      content.gallery.films = content.gallery.films.filter((x) => x !== id);
      await env.DB.batch([env.DB.prepare("DELETE FROM films WHERE id = ?").bind(id), saveContent(env, content)]);
      await env.MEDIA.delete([film.video_key, film.poster_key, film.bg_key]);
      return json({ ok: true });
    }
  }

  return fail("Not found.", 404);
}

const saveContent = (env, content) => env.DB.prepare("UPDATE site SET content = ?, updated_at = datetime('now') WHERE id = 1").bind(JSON.stringify(content));

async function checkImages(env, input) {
  const { poster_key, bg_key } = input;
  if (!MEDIA_KEY.test(poster_key || "") || !MEDIA_KEY.test(bg_key || "")) throw new ValidationError("The cover image didn't upload correctly. Please try again.");
  const [poster, bg] = await Promise.all([env.MEDIA.head(poster_key), env.MEDIA.head(bg_key)]);
  if (!poster || !bg) throw new ValidationError("The cover image didn't upload correctly. Please try again.");
  return { poster_key, bg_key };
}

/** Confirms the uploaded files really exist, and takes their sizes from storage rather than the browser. */
async function checkFiles(env, input) {
  const { video_key, width, height, duration } = input;
  if (!MEDIA_KEY.test(video_key || "") || !video_key.endsWith(".mp4")) throw new ValidationError("The video didn't upload correctly. Please try again.");
  const covers = await checkImages(env, input);
  const [video, poster, bg] = await Promise.all([env.MEDIA.head(video_key), env.MEDIA.head(covers.poster_key), env.MEDIA.head(covers.bg_key)]);
  if (!video) throw new ValidationError("The video didn't upload correctly. Please try again.");
  const w = Math.round(Number(width)), h = Math.round(Number(height));
  if (!(w > 0 && h > 0 && w <= 8192 && h <= 8192)) throw new ValidationError("Couldn't read the size of this video.");
  return { video_key, ...covers, width: w, height: h, duration: Number(duration) || 0, size_bytes: video.size + (poster?.size || 0) + (bg?.size || 0) };
}

/* ---------- Routing ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    try {
      if (pathname === "/" || pathname === "/index.html") {
        if (method !== "GET" && method !== "HEAD") return new Response("Method not allowed", { status: 405 });
        return await homepage(request, env);
      }
      if (pathname.startsWith("/media/")) {
        if (method !== "GET" && method !== "HEAD") return new Response("Method not allowed", { status: 405 });
        return await serveMedia(request, env, decodeURIComponent(pathname.slice(7)));
      }

      const isApi = pathname.startsWith("/api/admin/");
      if (isApi || pathname === "/admin" || pathname.startsWith("/admin/")) {
        if (!(await isAdmin(request, env))) {
          return isApi ? fail("Please log in again.", 401) : new Response("The admin area is locked. See \"Going live\" in README.md.", { status: 403, headers: SECURITY_HEADERS });
        }
        if (!isApi) {
          const res = await env.ASSETS.fetch(request);
          const headers = new Headers(res.headers);
          headers.set("Cache-Control", "no-cache");
          headers.set("X-Frame-Options", "DENY");
          headers.set("X-Robots-Tag", "noindex");
          return new Response(res.body, { status: res.status, headers });
        }
        // A login cookie alone can't be used from another website to change anything.
        if (method !== "GET" && request.headers.get("Origin") !== url.origin) return fail("Request blocked.", 403);
        return await adminApi(request, env, pathname.slice("/api/admin/".length));
      }

      if (pathname.startsWith("/api/")) return fail("Not found.", 404);
      return env.ASSETS.fetch(request);
    } catch (e) {
      if (e instanceof ValidationError) return fail(e.message, 422);
      if (e instanceof SyntaxError) return fail("Bad request.");
      console.error(e);
      return pathname.startsWith("/api/") ? fail("Something went wrong on the server. Please try again.", 500) : new Response("Something went wrong. Please try again in a moment.", { status: 500 });
    }
  },
};
