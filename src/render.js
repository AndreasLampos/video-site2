// Builds the public homepage from the database. The markup matches the original
// index.html, so styles.css and main.js work on it unchanged.

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const media = (key) => `/media/${encodeURIComponent(key)}`;
export const shapeOf = (f) => (f.width > f.height ? "wide" : "tall");
const ratioOf = (f) => (shapeOf(f) === "wide" ? "wide" : "vertical");

const openAttrs = (f) => (f.embed_url ? `data-embed="${esc(f.embed_url)}"` : `data-src="${media(f.video_key)}"`);

/** Plays the film on the same card, with sound. */
const playButton = (f) => `<button class="reel-btn" type="button" ${openAttrs(f)} data-ratio="${ratioOf(f)}" data-title="${esc(f.title)}">
          <svg viewBox="0 0 12 14" width="12" height="14" aria-hidden="true"><path d="M0 0l12 7-12 7z" fill="currentColor"/></svg>
          Play reel
        </button>`;

function storySection(films, categoryLabel) {
  const bgs = films.map((f, i) => `<i${i ? "" : ' class="is-active"'} style="background-image:url(${media(f.bg_key)})"></i>`).join("\n          ");
  const vids = films.map((f, i) => `<video class="story__vid${i ? "" : " is-active"}" data-shape="${shapeOf(f)}" src="${media(f.video_key)}" poster="${media(f.poster_key)}" muted loop playsinline preload="${i ? "none" : "metadata"}"></video>`).join("\n          ");
  const index = films.map((f, i) => `<li${i ? "" : ' class="is-active"'}><button type="button" data-goto="${i}"${i ? "" : ' aria-current="true"'}>${esc(f.short_name || f.title)}</button></li>`).join("\n          ");
  const panels = films.map((f, i) => `<article class="panel" data-i="${i}" data-chapter="${esc(categoryLabel(f))}">
          <div class="panel__inner">
            ${f.meta ? `<p class="panel__meta">${esc(f.meta)}</p>` : ""}
            <h2>${esc(f.title)}</h2>
            ${f.description ? `<p>${esc(f.description)}</p>` : ""}
            ${playButton(f)}
          </div>
        </article>`).join("\n        ");

  return `<section class="story" id="story" data-chapter-name="story" aria-label="Selected work">
      <div class="story__stage" data-shape="${shapeOf(films[0])}">
        <div class="story__bg" aria-hidden="true">
          ${bgs}
        </div>
        <div class="story__media" aria-hidden="true">
          ${vids}
        </div>
        <div class="story__shade" aria-hidden="true"></div>
        <ol class="story__index" aria-label="Jump to a film">
          ${index}
        </ol>
      </div>

      <div class="story__panels">
        ${panels}
      </div>
    </section>`;
}

const tile = (f) => `<button class="tile" data-cat="${esc(f.category)}" data-shape="${shapeOf(f)}" ${openAttrs(f)} data-ratio="${ratioOf(f)}" data-title="${esc(f.title)}">
            <video src="${media(f.video_key)}" poster="${media(f.poster_key)}" muted loop playsinline preload="none" aria-hidden="true"></video><span>${esc(f.title)}</span>
          </button>`;

export function renderSite(c, filmRows) {
  const byId = new Map(filmRows.map((f) => [f.id, f]));
  const pick = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  const labels = new Map(c.categories.map((x) => [x.id, x.label]));
  const categoryLabel = (f) => labels.get(f.category) || "";

  const hero = byId.get(c.hero.film);
  const about = byId.get(c.about.film);
  const story = pick(c.story.films);
  const gallery = pick(c.gallery.films);
  const usedCats = c.categories.filter((x) => gallery.some((f) => f.category === x.id));
  const brand = esc(c.brand);
  const tel = c.contact.phone.replace(/[^+\d]/g, "");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(c.metaTitle)}</title>
  <meta name="description" content="${esc(c.metaDescription)}">
  <meta property="og:title" content="${esc(c.metaTitle)}">
  <meta property="og:description" content="${esc(c.metaDescription)}">
  <meta property="og:image" content="${media(hero.poster_key)}">
  <meta name="theme-color" content="#0b0d11">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Hanken+Grotesk:wght@300;400;500&display=swap" rel="stylesheet">

  <script>
    /* Runs before first paint: picks the motion mode and accent colour. */
    (function () {
      var r = document.documentElement;
      var os = matchMedia("(prefers-reduced-motion: reduce)").matches, saved = null;
      try { saved = localStorage.getItem("motion"); } catch (e) {}
      r.dataset.os = os ? "reduced" : "full";
      r.dataset.saved = saved ? "yes" : "no";
      r.dataset.motion = saved === "on" ? "full" : saved === "off" ? "reduced" : (os ? "reduced" : "full");
      if (/[?&]accent=brass/.test(location.search)) r.dataset.accent = "brass";
      setTimeout(function () { r.classList.add("is-ready"); }, 4500); /* safety net if the script below fails */
    })();
  </script>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>

  <a class="skip" href="#work">Skip to work</a>
  <div class="progress" aria-hidden="true"></div>
  <div class="grain" aria-hidden="true"></div>

  <!-- Intro counter (full motion only) -->
  <div class="loader" id="loader" aria-hidden="true">
    <span class="loader__tc" id="loaderTC">00:00:00:00</span>
    <span class="loader__bar"></span>
  </div>

  <!-- Camera viewfinder frame -->
  <div class="hud" aria-hidden="true">
    <i class="hud__corner hud__corner--tl"></i><i class="hud__corner hud__corner--tr"></i>
    <i class="hud__corner hud__corner--bl"></i><i class="hud__corner hud__corner--br"></i>
    <div class="hud__rec"><b></b>REC <span id="hudTC">00:00:00:00</span></div>
    <div class="hud__chapter" id="hudChapter">Reel</div>
  </div>


  <header class="nav" id="nav">
    <a class="nav__brand" href="#top">${brand}</a>
    <nav class="nav__links" aria-label="Main">
      <a href="#story">Selected work</a>
      <a href="#work">${esc(c.gallery.title)}</a>
      ${c.services.items.length ? '<a href="#services">Services</a>' : ""}
      <a href="#about">About</a>
      <a href="#contact" class="nav__cta">Get in touch</a>
    </nav>
  </header>

  <main id="top">

    <!-- HERO: looping clip, no sound -->
    <section class="hero" data-shape="${shapeOf(hero)}" data-chapter-name="Reel" aria-label="Introduction">
      <div class="hero__bg" style="background-image:url(${media(hero.bg_key)})"></div>
      <div class="hero__shade"></div>
      <div class="hero__mediawrap">
        <video class="hero__media" muted loop playsinline preload="auto" poster="${media(hero.poster_key)}" aria-hidden="true">
          <source src="${media(hero.video_key)}" type="video/mp4">
        </video>
      </div>
      <div class="hero__copy">
        <h1 class="hero__title">
          <span class="line"><span>${esc(c.hero.line1)}</span></span>
          ${c.hero.line2 ? `<span class="line"><span>${esc(c.hero.line2)}</span></span>` : ""}
        </h1>
        ${c.hero.sub ? `<p class="hero__sub">${esc(c.hero.sub)}</p>` : ""}
        ${playButton(hero)}
      </div>
      <a class="hero__cue" href="#story" aria-label="Scroll to selected work"><span></span>Scroll</a>
    </section>

    <!-- CHAPTERS: one clip per project, switched by scrolling -->
    ${storySection(story, categoryLabel)}

    <!-- MORE FILMS -->
    <section class="gallery" id="work" data-chapter-name="${esc(c.gallery.title)}" aria-labelledby="work-title">
      <div class="wrap">
        <div class="gallery__head">
          <h2 id="work-title">${esc(c.gallery.title)}</h2>
          ${usedCats.length > 1 ? `<div class="filters" role="group" aria-label="Filter films">
            <button class="is-on" data-filter="all" aria-pressed="true">All</button>
            ${usedCats.map((x) => `<button data-filter="${esc(x.id)}" aria-pressed="false">${esc(x.label)}</button>`).join("\n            ")}
          </div>` : ""}
        </div>

        <div class="grid" id="grid">
          ${gallery.map(tile).join("\n          ")}
        </div>
      </div>
    </section>

    ${c.services.items.length ? `<!-- SERVICES -->
    <section class="offer" id="services" data-chapter-name="Services" aria-labelledby="services-title">
      <div class="wrap">
        <h2 id="services-title">${esc(c.services.title)}</h2>
        <ul class="offer__list">
          ${c.services.items.map((i) => `<li>
            <h3>${esc(i.title)}</h3>
            <p>${esc(i.text)}</p>
          </li>`).join("\n          ")}
        </ul>
        ${c.services.note || c.services.noteLink ? `<p class="offer__note">${esc(c.services.note)}${c.services.noteLink ? ` <a href="#contact">${esc(c.services.noteLink)}</a>.` : ""}</p>` : ""}
      </div>
    </section>` : ""}

    <!-- ABOUT -->
    <section class="about" id="about" data-chapter-name="About" aria-labelledby="about-title">
      <div class="wrap about__grid">
        <video class="about__video" data-shape="${shapeOf(about)}" src="${media(about.video_key)}" poster="${media(about.poster_key)}" muted loop playsinline preload="none" aria-hidden="true"></video>
        <div class="about__text">
          <h2 id="about-title">${esc(c.about.heading)}</h2>
          ${c.about.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("\n          ")}
        </div>
      </div>
    </section>

    ${c.clients.quotes.length ? `<!-- CLIENT WORDS -->
    <section class="proof" id="clients" data-chapter-name="Clients" aria-labelledby="clients-title">
      <div class="wrap">
        <h2 id="clients-title">${esc(c.clients.title)}</h2>
        <div class="proof__grid">
          ${c.clients.quotes.map((q) => `<figure>
            <blockquote><p>${esc(q.quote)}</p></blockquote>
            ${q.name ? `<figcaption>${esc(q.name)}</figcaption>` : ""}
          </figure>`).join("\n          ")}
        </div>
      </div>
    </section>` : ""}

    <!-- CONTACT -->
    <section class="contact" id="contact" data-chapter-name="Contact" aria-labelledby="contact-title">
      <div class="wrap contact__grid">
        <div>
          <h2 id="contact-title">${esc(c.contact.heading)}</h2>
          ${c.contact.lead ? `<p class="contact__lead">${esc(c.contact.lead)}</p>` : ""}
          <ul class="contact__list">
            ${c.contact.email ? `<li><a href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a></li>` : ""}
            ${c.contact.phone ? `<li><a href="tel:${esc(tel)}">${esc(c.contact.phone)}</a></li>` : ""}
            ${c.contact.instagram ? `<li><a href="${esc(c.contact.instagram)}" rel="noopener">Instagram</a></li>` : ""}
            ${c.contact.vimeo ? `<li><a href="${esc(c.contact.vimeo)}" rel="noopener">Vimeo</a></li>` : ""}
          </ul>
        </div>

        ${c.contact.formAction ? `<form class="form" action="${esc(c.contact.formAction)}" method="POST">
          <label>Name <input type="text" name="name" autocomplete="name" required></label>
          <label>Email <input type="email" name="email" autocomplete="email" required></label>
          <label>What do you need? <textarea name="message" rows="5" required></textarea></label>
          <button type="submit">Send message</button>
        </form>` : ""}
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="wrap">
      <span>&copy; <span id="year">2026</span> ${brand}</span>
      <button class="motion-toggle" id="motionToggle" type="button">Reduce animations</button>
      <a href="#top">Back to top</a>
    </div>
  </footer>

  <div class="motion-note" id="motionNote" role="status" hidden>
    <p>Your device asks for reduced motion, so videos and animations are paused on this page.</p>
    <button type="button" id="motionOn">Turn on animations</button>
  </div>

  <dialog class="player" id="player" aria-label="Video player">
    <div class="player__frame" id="playerFrame"></div>
    <div class="player__bar">
      <span id="playerTitle"></span>
      <button class="player__close" id="playerClose" type="button">Close</button>
    </div>
  </dialog>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js"></script>
  <script src="/main.js"></script>
</body>
</html>
`;
}
