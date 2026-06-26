(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- footer year ---------- */
  const y = $("[data-year]"); if (y) y.textContent = new Date().getFullYear();

  /* ---------- placeholder labels for empty image slots (not the hero) ---------- */
  $$("[data-img]:not(.hero__bg):not(.local__media)").forEach((el) => el.classList.add("is-ph"));

  /* ---------- header scroll state + sticky dock ---------- */
  const header = $("[data-header]");
  const dock = $("[data-dock]");
  const onScroll = () => {
    const y = window.scrollY;
    if (header) header.classList.toggle("is-scrolled", y > 30);
    if (dock) dock.classList.toggle("is-visible", y > 620);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile drawer ---------- */
  const burger = $("[data-nav-toggle]");
  const drawer = $("[data-nav-drawer]");
  if (burger && drawer) {
    const setOpen = (open) => {
      burger.setAttribute("aria-expanded", String(open));
      drawer.hidden = !open;
    };
    burger.addEventListener("click", () => setOpen(burger.getAttribute("aria-expanded") !== "true"));
    drawer.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  }

  /* ---------- smooth-close: scroll-spy could go here; keep light ---------- */

  /* ---------- scroll reveals ---------- */
  const revealTargets = [
    ".value__head", ".checks--grid > li", ".svc", ".why__copy", ".why__card",
    ".local__copy", ".local__media", ".review", ".mission__inner",
    ".signs__copy", ".signs__list li", ".step", ".inspect__copy", ".inspect__form",
    ".qa", ".areas__chips", ".finalcta__inner", ".section-head",
  ];
  const els = $$(revealTargets.join(","));
  if (!reduceMotion && "IntersectionObserver" in window) {
    els.forEach((el, i) => { el.classList.add("reveal"); el.style.transitionDelay = `${(i % 4) * 60}ms`; });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- lead form ---------- */
  const form = $("[data-form]");
  if (form) {
    const status = $("[data-form-status]", form);
    const LOAD_TS = Date.now();
    const defaultMsg = status ? status.textContent : "";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (status) { status.textContent = "Sending…"; status.className = "inspect__fine"; }

      const name = (data.name || "").trim();
      const phone = (data.phone || "").trim();
      if (name.length < 2) return fail("Please enter your name.");
      if (phone.replace(/\D/g, "").length < 7) return fail("Please enter a valid phone number.");

      const payload = { ...data, _ts: LOAD_TS };
      try {
        const res = await fetch("/api/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          form.reset();
          if (status) { status.textContent = "✅ Got it! A Rooftop Hero will reach out shortly to schedule your free inspection."; status.className = "inspect__fine is-ok"; }
        } else {
          fail(json.error || "Something went wrong. Please call (501) 772-8243.");
        }
      } catch {
        // No backend yet (e.g. local static) — fall back gracefully
        if (status) { status.textContent = "✅ Thanks! Please call (501) 772-8243 to confirm your inspection time."; status.className = "inspect__fine is-ok"; }
        form.reset();
      }
    });
    function fail(msg) { if (status) { status.textContent = msg; status.className = "inspect__fine is-err"; } }
    form.addEventListener("input", () => { if (status && status.classList.contains("is-err")) { status.textContent = defaultMsg; status.className = "inspect__fine"; } });
  }
})();
