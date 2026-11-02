(() => {
  const root = document.documentElement;
  const full = root.dataset.motion === "full"; // from the system setting or the visitor's own choice (see <head>)
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches; // used for hover previews
  const wide = matchMedia("(min-width: 801px)").matches;
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const play = (v) => { if (!v) return; const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  const pad = (n) => String(n).padStart(2, "0");
  const tc = (f) => `${pad(Math.floor(f / 86400))}:${pad(Math.floor(f / 1440) % 60)}:${pad(Math.floor(f / 24) % 60)}:${pad(f % 24)}`; // 24 fps timecode

  $("#year").textContent = new Date().getFullYear();

  /* ---------- Motion toggle ---------- */
  const setMotion = (v) => { try { localStorage.setItem("motion", v); } catch (e) {} location.reload(); };
  const toggle = $("#motionToggle");
  toggle.textContent = full ? "Reduce animations" : "Turn on animations";
  toggle.addEventListener("click", () => setMotion(full ? "off" : "on"));
  if (!full && root.dataset.os === "reduced" && root.dataset.saved === "no") $("#motionNote").hidden = false;
  $("#motionOn").addEventListener("click", () => setMotion("on"));

  /* ---------- Intro: hero clip starts, timecode counts, then the page is revealed ---------- */
  const hero = $(".hero__media");
  if (full) {
    play(hero);
    const loaderTC = $("#loaderTC");
    const t0 = performance.now(), dur = 1300;
    const heroReady = new Promise((res) => {
      if (hero.readyState >= 2) res();
      else { hero.addEventListener("loadeddata", res, { once: true }); setTimeout(res, 2500); }
    });
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      loaderTC.textContent = tc(Math.round(p * 96));
      if (p < 1) requestAnimationFrame(tick);
      else heroReady.then(() => root.classList.add("is-ready"));
    };
    requestAnimationFrame(tick);
  } else {
    root.classList.add("is-ready");
  }

  /* ---------- Smooth scrolling (Lenis) wired to GSAP ---------- */
  if (full && hasGSAP && window.Lenis) {
    const lenis = new Lenis({ lerp: 0.1 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        const target = id.length > 1 && $(id);
        if (target) { e.preventDefault(); lenis.scrollTo(target); }
      });
    });
  }

  /* ---------- Nav background after the hero ---------- */
  const nav = $("#nav");
  const navState = () => nav.classList.toggle("is-solid", scrollY > innerHeight * 0.6);
  addEventListener("scroll", navState, { passive: true });
  navState();

  /* ---------- Hero clip only plays while it is on screen ---------- */
  if (full) {
    new IntersectionObserver(([e]) => { e.isIntersecting ? play(hero) : hero.pause(); }, { threshold: 0.05 }).observe($(".hero"));
  }

  /* ---------- Chapters: swap the clip as each panel crosses the middle of the screen ---------- */
  const vids = $$(".story__vid");
  const index = $$(".story__index li");
  const bgs = $$(".story__bg i");
  const panels = $$(".panel");
  const media = $(".story__media");
  let current = 0, storyVisible = false;

  function preloadNext(i) {
    const n = vids[i + 1];
    if (n && n.readyState === 0 && n.preload !== "auto") { n.preload = "auto"; n.load(); }
  }

  function show(i) {
    if (i === current) return;
    const prev = vids[current];
    vids.forEach((v, n) => {
      v.classList.toggle("is-prev", n === current);
      v.classList.toggle("is-active", n === i);
    });
    index.forEach((li, n) => li.classList.toggle("is-active", n === i));
    bgs.forEach((b, n) => b.classList.toggle("is-active", n === i));
    current = i;
    if (full && storyVisible) play(vids[i]); // starts while it fades in, no seeking, so nothing stalls
    preloadNext(i);
    // once the cross-fade is finished, stop the old clip and rewind it while nobody can see it
    setTimeout(() => {
      prev.classList.remove("is-prev");
      if (vids[current] !== prev) { prev.pause(); try { prev.currentTime = 0; } catch (e) {} }
    }, 1000);
  }

  const panelIO = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) show(Number(e.target.dataset.i)); }),
    { rootMargin: "-50% 0px -50% 0px" }
  );
  panels.forEach((p) => panelIO.observe(p));

  // only the visible chapter's clip plays, and only while the section is on screen
  if (full) {
    new IntersectionObserver(([e]) => {
      storyVisible = e.isIntersecting;
      if (storyVisible) { play(vids[current]); vids.forEach((v) => { if (v.preload !== "auto") { v.preload = "auto"; v.load(); } }); }
      else vids.forEach((v) => v.pause());
    }, { threshold: 0, rootMargin: "-1px 0px" }).observe($(".story"));
  }

  /* ---------- Scroll-linked effects (full motion only) ---------- */
  if (full && hasGSAP) {
    gsap.to(".progress", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

    gsap.to(".hero__mediawrap", {
      scale: wide ? 1.06 : 1.18, yPercent: wide ? 3 : 8, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
    gsap.to(".hero__copy", {
      y: -140, opacity: 0, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "70% top", scrub: true },
    });

    gsap.fromTo(".story__media", { scale: 1 }, {
      scale: wide ? 1.05 : 1.16, ease: "none",
      scrollTrigger: { trigger: ".story", start: "top top", end: "bottom bottom", scrub: true },
    });

    panels.forEach((panel) => {
      const inner = $(".panel__inner", panel);
      gsap.timeline({ scrollTrigger: { trigger: panel, start: "top 85%", end: "bottom 15%", scrub: 0.6 } })
        .fromTo(inner, { opacity: 0, y: 90 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" })
        .to(inner, { opacity: 1, duration: 0.4 })
        .to(inner, { opacity: 0, y: -90, duration: 0.3, ease: "power2.in" });
    });

    ScrollTrigger.batch(".tile", {
      start: "top 92%", once: true,
      onEnter: (els) => gsap.fromTo(els, { clipPath: "inset(0 0 100% 0)", y: 40 }, {
        clipPath: "inset(0 0 0% 0)", y: 0, duration: 1, ease: "power3.out", stagger: 0.1, clearProps: "clipPath,transform",
      }),
    });
  }

  /* ---------- Viewfinder: timecode follows the scroll, chapter name follows the section ---------- */
  const hudTC = $("#hudTC"), hudCh = $("#hudChapter");
  const marked = $$("[data-chapter-name]");
  let queued = false;
  function hud() {
    queued = false;
    const max = root.scrollHeight - innerHeight;
    const p = max > 0 ? scrollY / max : 0;
    hudTC.textContent = tc(Math.round(p * 24 * 180)); // the whole page = 3 minutes of "footage"
    const mid = innerHeight / 2;
    let name = "";
    for (const s of marked) {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) { name = s.dataset.chapterName; break; }
    }
    if (name === "story") name = panels[current].dataset.chapter;
    if (name && hudCh.textContent !== name) hudCh.textContent = name;
  }
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(hud); } }, { passive: true });
  hud();

  /* ---------- About clip plays only while visible ---------- */
  const aboutVid = $(".about__video");
  if (full && aboutVid) {
    new IntersectionObserver(([e]) => { e.isIntersecting ? play(aboutVid) : aboutVid.pause(); }, { threshold: 0.2 }).observe(aboutVid);
  }

  /* ---------- Film filters ---------- */
  const buttons = $$(".filters button");
  const tiles = $$(".tile");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("is-on");
      btn.setAttribute("aria-pressed", "true");
      const f = btn.dataset.filter;
      tiles.forEach((t) => t.classList.toggle("is-hidden", f !== "all" && t.dataset.cat !== f));
      if (hasGSAP) ScrollTrigger.refresh();
    });
  });

  /* ---------- Player: local file or Vimeo/YouTube embed ---------- */
  const player = $("#player"), frame = $("#playerFrame"), playerTitle = $("#playerTitle");
  const embedOK = /^https:\/\/(player\.vimeo\.com|www\.youtube(-nocookie)?\.com)\//;
  function openPlayer({ src, embed, title, ratio }) {
    frame.textContent = "";
    player.dataset.ratio = ratio === "vertical" ? "vertical" : "wide";
    if (embed && embedOK.test(embed)) {
      const f = document.createElement("iframe");
      f.src = embed; f.title = title || "Video"; f.allowFullscreen = true;
      f.allow = "autoplay; fullscreen; picture-in-picture";
      frame.append(f);
    } else if (src) {
      const v = document.createElement("video");
      v.src = src; v.controls = true; v.autoplay = true; v.playsInline = true;
      frame.append(v);
    } else return;
    playerTitle.textContent = title || "";
    root.classList.add("is-modal");
    player.showModal();
  }
  player.addEventListener("close", () => { frame.textContent = ""; root.classList.remove("is-modal"); });
  $("#playerClose").addEventListener("click", () => player.close());
  player.addEventListener("click", (e) => { if (e.target === player) player.close(); });

  $("#playReel").addEventListener("click", (e) => {
    const b = e.currentTarget;
    openPlayer({ src: b.dataset.src, embed: b.dataset.embed, title: "Showreel", ratio: b.dataset.ratio });
  });

  tiles.forEach((t) => {
    const v = $("video", t);
    if (full && finePointer) {
      const on = () => { v.preload = "auto"; play(v); };
      const off = () => { v.pause(); v.currentTime = 0; };
      t.addEventListener("pointerenter", on);
      t.addEventListener("pointerleave", off);
      t.addEventListener("focus", on);
      t.addEventListener("blur", off);
    }
    t.addEventListener("click", () => openPlayer({ src: t.dataset.src, embed: t.dataset.embed, title: t.dataset.title, ratio: t.dataset.ratio }));
  });
})();
