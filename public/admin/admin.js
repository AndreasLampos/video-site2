import { compressVideo, makeCovers, loadPreview } from "./video.js";

const $ = (s, c = document) => c.querySelector(s);
const FREE_STORAGE = 10 * 1024 ** 3; // Cloudflare R2's free allowance
const PART_SIZE = 25 * 1024 * 1024;

let content, films = [];
let busy = false;

/* ---------- Helpers ---------- */

async function api(path, options = {}) {
  const res = await fetch(`/api/admin/${path}`, {
    credentials: "same-origin",
    ...options,
    headers: options.body instanceof Blob || options.body instanceof ArrayBuffer ? options.headers : { "Content-Type": "application/json", ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 401 ? "Please log in again." : "Something went wrong. Please try again."));
  return data;
}
const send = (path, method, body) => api(path, { method, body: JSON.stringify(body) });

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children);
  return node;
}

let toastTimer;
function toast(message, isError) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.toggle("is-error", !!isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 7000 : 3000);
}

const media = (key) => `/media/${encodeURIComponent(key)}`;
const formatBytes = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);
const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const filmById = (id) => films.find((f) => f.id === id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const getPath = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
const setPath = (o, p, v) => { const ks = p.split("."); ks.slice(0, -1).reduce((a, k) => a[k], o)[ks.at(-1)] = v; };

/* ---------- Tabs ---------- */

const TABS = ["films", "layout", "text"];
function showTab(name) {
  for (const t of TABS) {
    $(`#tab-${t}`).setAttribute("aria-selected", String(t === name));
    $(`#view-${t}`).hidden = t !== name;
  }
}
TABS.forEach((t) => $(`#tab-${t}`).addEventListener("click", () => showTab(t)));

/* ---------- Load and draw everything ---------- */

async function refresh() {
  ({ content, films } = await api("state"));
  draft = clone(content);
  $("#brand").textContent = content.brand;
  drawFilms();
  drawLayout();
  fillText();
}

/* ---------- Films tab ---------- */

function placesOf(id) {
  const out = [];
  if (content.hero.film === id) out.push("Opening clip");
  if (content.story.films.includes(id)) out.push("Selected work");
  if (content.gallery.films.includes(id)) out.push("Gallery");
  if (content.about.film === id) out.push("About");
  return out;
}

function drawFilms() {
  const total = films.reduce((sum, f) => sum + f.size_bytes, 0);
  $("#storage").textContent = `${films.length} ${films.length === 1 ? "film" : "films"}, ${formatBytes(total)} of ${formatBytes(FREE_STORAGE)} free storage used`;
  const labels = new Map(content.categories.map((c) => [c.id, c.label]));
  $("#films").replaceChildren(...films.map((f) => {
    const places = placesOf(f.id);
    return el("article", { class: "a-card" },
      el("div", { class: "tile", "data-shape": "tall" }, el("img", { src: media(f.poster_key), alt: "", loading: "lazy" })),
      el("h3", {}, f.title),
      el("p", { class: "a-card__meta" }, [labels.get(f.category), f.width > f.height ? "Horizontal" : "Vertical", f.duration ? formatTime(f.duration) : ""].filter(Boolean).join(" · ")),
      el("div", { class: "a-card__tags" }, ...(places.length ? places.map((p) => el("span", { class: "a-tag" }, p)) : [el("span", { class: "a-card__meta" }, "Not on the site yet")])),
      el("div", { class: "a-card__actions" },
        el("button", { class: "a-btn a-btn--small", type: "button", onclick: () => openFilm(f) }, "Edit"),
        el("button", { class: "a-btn a-btn--small a-btn--danger", type: "button", onclick: () => deleteFilm(f) }, "Delete")));
  }));
}

async function deleteFilm(f) {
  if (!confirm(`Delete "${f.title}"? This removes it from the site and can't be undone.`)) return;
  try {
    await api(`films/${f.id}`, { method: "DELETE" });
    await refresh();
    toast("Film deleted");
  } catch (e) { toast(e.message, true); }
}

/* ---------- Layout tab ---------- */

let draft;

function drawLayout() {
  const options = (selected) => films.map((f) => el("option", { value: f.id, selected: f.id === selected }, f.title));
  $("#pickHero").replaceChildren(...options(draft.hero.film));
  $("#pickAbout").replaceChildren(...options(draft.about.film));
  drawOrder("storyList", "storyAdd", draft.story.films, "Choose a film…");
  drawOrder("galleryList", "galleryAdd", draft.gallery.films, "Choose a film…");
}

function drawOrder(listId, addId, ids, placeholder) {
  const move = (i, d) => { [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; drawLayout(); };
  $(`#${listId}`).replaceChildren(...ids.map((id, i) => {
    const f = filmById(id);
    if (!f) return "";
    return el("li", {},
      el("img", { src: media(f.poster_key), alt: "" }),
      el("span", { class: "a-order__name" }, f.title),
      el("span", { class: "a-order__btns" },
        el("button", { class: "a-btn a-btn--small", type: "button", disabled: i === 0, "aria-label": `Move ${f.title} up`, onclick: () => move(i, -1) }, "Up"),
        el("button", { class: "a-btn a-btn--small", type: "button", disabled: i === ids.length - 1, "aria-label": `Move ${f.title} down`, onclick: () => move(i, 1) }, "Down"),
        el("button", { class: "a-btn a-btn--small a-btn--danger", type: "button", disabled: ids.length === 1, "aria-label": `Remove ${f.title}`, onclick: () => { ids.splice(i, 1); drawLayout(); } }, "Remove")));
  }));
  const add = $(`#${addId}`);
  const rest = films.filter((f) => !ids.includes(f.id));
  add.replaceChildren(el("option", { value: "" }, rest.length ? placeholder : "All films are already here"), ...rest.map((f) => el("option", { value: f.id }, f.title)));
  add.disabled = !rest.length;
  add.onchange = () => { if (add.value) { ids.push(add.value); drawLayout(); } };
}

async function saveContent(next, button) {
  button.disabled = true;
  try {
    ({ content } = await send("content", "PUT", next));
    draft = clone(content);
    $("#brand").textContent = content.brand;
    drawFilms();
    drawLayout();
    fillText();
    toast("Saved. Your site is updated.");
  } catch (e) {
    toast(e.message, true);
  } finally {
    button.disabled = false;
  }
}

$("#layoutForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const next = clone(content);
  next.hero.film = $("#pickHero").value;
  next.about.film = $("#pickAbout").value;
  next.story.films = draft.story.films;
  next.gallery.films = draft.gallery.films;
  saveContent(next, e.submitter);
});

/* ---------- Text tab ---------- */

function textField(label, value, cls, opts = {}) {
  const input = opts.multiline ? el("textarea", { rows: 3, maxlength: opts.max, class: cls, required: opts.required }) : el("input", { maxlength: opts.max, class: cls, required: opts.required });
  input.value = value || "";
  return el("label", {}, label, input);
}
const removeBtn = (label) => el("button", { class: "a-btn a-btn--small a-btn--danger", type: "button", onclick: (e) => e.currentTarget.closest(".a-item").remove() }, label);

const addCategory = (c = {}) => {
  const item = el("div", { class: "a-item a-item--row", "data-id": c.id || "" }, textField("Category name", c.label, "x-cat", { max: 40, required: true }), removeBtn("Remove"));
  $("#catList").append(item);
};
const addService = (s = {}) => $("#serviceList").append(el("div", { class: "a-item" },
  textField("Service name", s.title, "x-title", { max: 100, required: true }),
  textField("Description", s.text, "x-text", { max: 600, multiline: true }),
  removeBtn("Remove service")));
const addQuote = (q = {}) => $("#quoteList").append(el("div", { class: "a-item" },
  textField("Quote", q.quote, "x-quote", { max: 500, multiline: true, required: true }),
  textField("Client name, role and company", q.name, "x-name", { max: 120 }),
  removeBtn("Remove quote")));

$("#addCat").addEventListener("click", () => addCategory());
$("#addService").addEventListener("click", () => addService());
$("#addQuote").addEventListener("click", () => addQuote());

function fillText() {
  document.querySelectorAll("[data-path]").forEach((i) => { i.value = getPath(content, i.dataset.path) ?? ""; });
  $("#aboutText").value = content.about.paragraphs.join("\n\n");
  $("#catList").replaceChildren(); content.categories.forEach(addCategory);
  $("#serviceList").replaceChildren(); content.services.items.forEach(addService);
  $("#quoteList").replaceChildren(); content.clients.quotes.forEach(addQuote);
}

$("#textForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const next = clone(content);
  document.querySelectorAll("[data-path]").forEach((i) => setPath(next, i.dataset.path, i.value));
  next.about.paragraphs = $("#aboutText").value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  next.categories = [...$("#catList").children].map((n) => ({ id: n.dataset.id, label: $(".x-cat", n).value }));
  next.services.items = [...$("#serviceList").children].map((n) => ({ title: $(".x-title", n).value, text: $(".x-text", n).value }));
  next.clients.quotes = [...$("#quoteList").children].map((n) => ({ quote: $(".x-quote", n).value, name: $(".x-name", n).value }));
  saveContent(next, e.submitter);
});

/* ---------- Add or edit a film ---------- */

const dialog = $("#filmDialog");
const video = $("#previewVideo");
let editing = null, picked = null, previewUrl = null, coverTouched = false, cancelJob = null;

function setProgress(label, fraction) {
  $("#progress").hidden = false;
  $("#progressLabel").textContent = label;
  $("#progressBar").style.transform = `scaleX(${fraction})`;
}
function showFilmError(message) {
  const box = $("#filmError");
  box.textContent = message || "";
  box.hidden = !message;
}
function setBusy(on) {
  busy = on;
  $("#filmSubmit").disabled = on;
  [...$("#filmForm").querySelectorAll("input, select, textarea")].forEach((i) => { i.disabled = on; });
  $("#filmCancel").textContent = on ? "Stop" : "Cancel";
}
const clearPreview = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; video.removeAttribute("src"); video.load(); };

function openFilm(film) {
  editing = film;
  picked = null;
  coverTouched = false;
  clearPreview();
  showFilmError("");
  $("#progress").hidden = true;
  $("#filmDialogTitle").textContent = film ? "Edit film" : "Add a film";
  $("#filmSubmit").textContent = film ? "Save changes" : "Publish film";
  $("#dropTitle").textContent = film ? "Replace the video" : "Choose a video";
  $("#dropHint").textContent = film ? "Optional. Leave it to keep the current video." : "or drag it here. MP4, MOV, WebM or MKV, compressed for the web automatically.";
  $("#fileInput").value = "";
  $("#fCategory").replaceChildren(...content.categories.map((c) => el("option", { value: c.id }, c.label)));
  $("#fTitle").value = film?.title || "";
  $("#fCategory").value = film?.category || content.categories[0].id;
  $("#fShort").value = film?.short_name || "";
  $("#fMeta").value = film?.meta || "";
  $("#fDesc").value = film?.description || "";
  $("#fEmbed").value = film?.embed_url || "";
  $("#fGallery").checked = true;
  $("#fStory").checked = false;
  $("#placement").hidden = !!film;
  $("#fileControls").hidden = true;
  $("#trimStart").value = ""; $("#trimEnd").value = "";
  $("#keepSound").checked = true;
  $("#previewTitle").textContent = film?.title || "";
  if (film) {
    video.poster = media(film.poster_key);
    video.src = media(film.video_key);
    video.muted = true;
    $("#previewTile").dataset.shape = film.width > film.height ? "wide" : "tall";
    $("#previewBox").hidden = false;
    $("#fileControls").hidden = false;
    // Sound and trimming only apply to a newly chosen file
    $("#keepSound").closest("label").hidden = true;
    $("#trimStart").closest(".a-cols").hidden = true;
    $("#scrub").value = 0;
    updateFileInfo(film);
  } else {
    video.removeAttribute("poster");
    $("#previewBox").hidden = true;
  }
  dialog.showModal();
}

function updateFileInfo(film) {
  $("#fileInfo").textContent = `${film.width > film.height ? "Horizontal" : "Vertical"} · ${film.width} × ${film.height}${film.duration ? ` · ${formatTime(film.duration)}` : ""}`;
}

async function pickFile(file) {
  if (!file) return;
  showFilmError("");
  try {
    clearPreview();
    previewUrl = URL.createObjectURL(file);
    video.removeAttribute("poster");
    const info = await loadPreview(video, previewUrl);
    picked = { file, ...info };
    coverTouched = false;
    $("#dropTitle").textContent = file.name;
    $("#dropHint").textContent = "Choose a different video";
    $("#previewTile").dataset.shape = info.width > info.height ? "wide" : "tall";
    $("#previewBox").hidden = false;
    $("#fileControls").hidden = false;
    $("#keepSound").closest("label").hidden = false;
    $("#trimStart").closest(".a-cols").hidden = false;
    $("#fileInfo").textContent = `${info.width > info.height ? "Horizontal" : "Vertical"} · ${info.width} × ${info.height} · ${formatTime(info.duration)} · ${formatBytes(file.size)}`;
    const coverAt = Math.min(2, info.duration / 2); // same default cover moment as the existing clips
    $("#scrub").value = Math.round((coverAt / info.duration) * 1000);
    video.currentTime = coverAt;
    if (!$("#fTitle").value && !editing) {
      $("#fTitle").value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      $("#previewTitle").textContent = $("#fTitle").value;
    }
  } catch (e) {
    picked = null;
    clearPreview();
    $("#fileInput").value = "";
    $("#previewBox").hidden = !editing;
    showFilmError(e.message);
  }
}

$("#fileInput").addEventListener("change", (e) => pickFile(e.target.files[0]));
const drop = $("#drop");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("is-over")));
drop.addEventListener("drop", (e) => { e.preventDefault(); if (!busy) pickFile(e.dataTransfer.files[0]); });
$("#fTitle").addEventListener("input", (e) => { $("#previewTitle").textContent = e.target.value; });
$("#scrub").addEventListener("input", (e) => {
  if (!Number.isFinite(video.duration)) return;
  coverTouched = true;
  video.pause();
  video.currentTime = video.duration * (e.target.value / 1000);
});

/** Sends a file to storage in parts and returns its key. */
async function uploadFile(blob, kind, base, onProgress) {
  const { key, uploadId, base: name } = await send("uploads", "POST", { kind, base });
  const parts = [];
  const total = Math.max(1, Math.ceil(blob.size / PART_SIZE));
  for (let i = 0; i < total; i++) {
    if (cancelJob?.cancelled) throw new DOMException("Stopped", "AbortError");
    const chunk = blob.slice(i * PART_SIZE, (i + 1) * PART_SIZE);
    const qs = new URLSearchParams({ key, uploadId, n: i + 1 });
    let attempt = 0;
    while (true) { // one bad connection moment shouldn't lose a long upload
      try {
        parts.push(await api(`uploads/part?${qs}`, { method: "PUT", body: chunk }));
        break;
      } catch (e) {
        if (++attempt >= 3 || cancelJob?.cancelled) throw e;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    onProgress?.((i + 1) / total);
  }
  await send("uploads/complete", "POST", { key, uploadId, parts });
  return { key, base: name };
}

$("#filmCancel").addEventListener("click", () => {
  if (busy) { if (cancelJob) { cancelJob.cancelled = true; cancelJob.stop?.(); } return; }
  video.pause();
  clearPreview();
  dialog.close();
});
dialog.addEventListener("cancel", (e) => { if (busy) e.preventDefault(); else { video.pause(); clearPreview(); } });

function filmFields() {
  return {
    title: $("#fTitle").value,
    category: $("#fCategory").value,
    short_name: $("#fShort").value,
    meta: $("#fMeta").value,
    description: $("#fDesc").value,
    embed_url: $("#fEmbed").value,
  };
}

function trimValues() {
  const start = parseFloat($("#trimStart").value), end = parseFloat($("#trimEnd").value);
  const s = Number.isFinite(start) && start > 0 ? start : 0;
  const e = Number.isFinite(end) && end > 0 ? Math.min(end, picked.duration) : picked.duration;
  if (e - s < 0.5) throw new Error("The end time must be after the start time.");
  return { start: s, end: e, trimmed: s > 0 || e < picked.duration };
}

$("#filmForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  showFilmError("");
  const fields = filmFields();
  if (!fields.title.trim()) { showFilmError("Add a title first."); $("#fTitle").focus(); return; }
  if (!editing && !picked) { showFilmError("Choose a video first."); return; }

  const keep = { keepSound: $("#keepSound").checked };
  const replacingCover = editing && !picked && coverTouched;
  let uploaded = [];
  cancelJob = { cancelled: false };
  let trim;
  try { if (picked) trim = trimValues(); } catch (err) { showFilmError(err.message); return; }

  // The form is locked from here on, so grab the cover frame first
  video.pause();
  setBusy(true);
  try {
    const payload = { ...fields };
    let base;
    if (picked || replacingCover) {
      setProgress("Preparing the cover image…", 0);
      if (picked && !coverTouched && trim.start > 0) { video.currentTime = Math.min(trim.start + 1, trim.end); }
      const covers = await makeCovers(video);
      const poster = await uploadFile(covers.poster, "poster");
      base = poster.base;
      uploaded.push(poster.key);
      const bg = await uploadFile(covers.bg, "bg", base);
      uploaded.push(bg.key);
      payload.poster_key = poster.key;
      payload.bg_key = bg.key;
    }
    if (picked) {
      const result = await compressVideo(picked.file, {
        ...trim,
        keepSound: keep.keepSound,
        job: cancelJob,
        onProgress: (p) => setProgress(`Compressing the video… ${Math.round(p * 100)}%. Keep this tab open.`, p),
      });
      setProgress("Uploading… 0%", 0);
      const up = await uploadFile(result.blob, "video", base, (p) => setProgress(`Uploading… ${Math.round(p * 100)}%`, p));
      uploaded.push(up.key);
      Object.assign(payload, { video_key: up.key, width: result.width, height: result.height, duration: result.duration });
      if (result.soundDropped) toast("The sound couldn't be kept in this browser, so the film is silent.", true);
    }
    setProgress("Publishing…", 1);
    if (editing) {
      await send(`films/${editing.id}`, "PATCH", payload);
    } else {
      await send("films", "POST", { ...payload, placeInGallery: $("#fGallery").checked, placeInStory: $("#fStory").checked });
    }
    uploaded = [];
    setBusy(false);
    clearPreview();
    dialog.close();
    await refresh();
    toast(editing ? "Changes saved. Your site is updated." : "Film published. Your site is updated.");
  } catch (err) {
    setBusy(false);
    $("#progress").hidden = true;
    if (err.name !== "AbortError" && err.name !== "ConversionCanceledError") showFilmError(err.message);
    if (uploaded.length) send("uploads/discard", "POST", { keys: uploaded }).catch(() => {});
  } finally {
    cancelJob = null;
  }
});

addEventListener("beforeunload", (e) => { if (busy) e.preventDefault(); });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => e.preventDefault());

/* ---------- Start ---------- */

$("#addFilm").addEventListener("click", () => openFilm(null));
refresh().then(() => {
  $("#loading").hidden = true;
  showTab("films");
}).catch((e) => { $("#loading").textContent = e.message; });
