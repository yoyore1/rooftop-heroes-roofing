/* Rooftop Heroes — lead dashboard.
   Talks to /api/login and /api/leads. No build step, no dependencies. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const STATUSES = ["new", "called", "quoted", "won", "lost"];
  const LABELS = { new: "New", called: "Called", quoted: "Quoted", won: "Won", lost: "Lost" };

  const views = { login: $('[data-view="login"]'), dash: $('[data-view="dash"]') };
  const loginForm = $("[data-login]");
  const loginErr = $("[data-login-err]");
  const statsEl = $("[data-stats]");
  const listEl = $("[data-list]");
  const searchEl = $("[data-search]");
  const toastEl = $("[data-toast]");

  let leads = [];
  let filter = "all";
  let query = "";
  let knownIds = new Set();
  let pollTimer = null;
  let firstLoad = true;

  /* ---------- view switching ---------- */
  function show(view) {
    views.login.classList.toggle("hidden", view !== "login");
    views.dash.classList.toggle("hidden", view !== "dash");
  }

  /* ---------- auth ---------- */
  async function init() {
    try {
      const r = await fetch("/api/login");
      const j = await r.json();
      if (j.authed) { startDash(); }
      else {
        show("login");
        if (!j.configured) {
          loginErr.textContent = "Login isn't configured yet (set ADMIN_PASSWORD + SESSION_SECRET).";
        }
      }
    } catch { show("login"); }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErr.textContent = "";
    const password = new FormData(loginForm).get("password");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await r.json();
      if (r.ok && j.ok) { loginForm.reset(); startDash(); }
      else loginErr.textContent = j.error || "Sign in failed.";
    } catch { loginErr.textContent = "Network error — try again."; }
  });

  $("[data-logout]").addEventListener("click", async () => {
    try { await fetch("/api/login", { method: "DELETE" }); } catch {}
    stopPoll();
    leads = []; knownIds = new Set(); firstLoad = true;
    show("login");
  });

  /* ---------- dashboard ---------- */
  function startDash() {
    show("dash");
    load();
    startPoll();
  }
  function startPoll() { stopPoll(); pollTimer = setInterval(() => load(true), 20000); }
  function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  document.addEventListener("visibilitychange", () => {
    if (!views.dash.classList.contains("hidden")) {
      if (document.hidden) stopPoll(); else { load(true); startPoll(); }
    }
  });

  $("[data-refresh]").addEventListener("click", () => load());

  async function load(silent) {
    try {
      const r = await fetch("/api/leads");
      if (r.status === 401) { stopPoll(); show("login"); return; }
      const j = await r.json();
      if (!j.ok) return;

      // detect newly-arrived leads (skip the very first load)
      const incomingIds = j.leads.map((l) => l.id);
      const fresh = firstLoad ? [] : incomingIds.filter((id) => !knownIds.has(id));
      leads = j.leads;
      knownIds = new Set(incomingIds);

      render(fresh);

      if (fresh.length && !firstLoad) {
        toast(`🔔 ${fresh.length} new lead${fresh.length > 1 ? "s" : ""}`);
        ping();
        flashTitle(fresh.length);
      }
      firstLoad = false;
    } catch { /* keep last good render */ }
  }

  /* ---------- rendering ---------- */
  searchEl.addEventListener("input", () => { query = searchEl.value.trim().toLowerCase(); render([]); });

  function counts() {
    const c = { all: leads.length };
    STATUSES.forEach((s) => (c[s] = 0));
    leads.forEach((l) => { c[l.status] = (c[l.status] || 0) + 1; });
    return c;
  }

  function render(fresh) {
    const c = counts();
    const chips = [["all", "All"], ...STATUSES.map((s) => [s, LABELS[s]])];
    statsEl.innerHTML = chips.map(([key, label]) =>
      `<button class="chip ${filter === key ? "is-active" : ""}" data-filter="${key}">
        ${label} <span class="n">${c[key] || 0}</span></button>`).join("");
    statsEl.querySelectorAll("[data-filter]").forEach((b) =>
      b.addEventListener("click", () => { filter = b.dataset.filter; render([]); }));

    let rows = leads;
    if (filter !== "all") rows = rows.filter((l) => l.status === filter);
    if (query) rows = rows.filter((l) =>
      [l.name, l.phone, l.address, l.service, l.message].filter(Boolean).join(" ").toLowerCase().includes(query));

    if (!rows.length) {
      listEl.innerHTML = `<div class="empty"><div class="empty__icon">📭</div>
        <p>${leads.length ? "No leads match this filter." : "No leads yet — they'll appear here the moment one comes in."}</p></div>`;
      return;
    }

    listEl.innerHTML = rows.map((l) => card(l, fresh.includes(l.id))).join("");
    wire();
  }

  function card(l, isFresh) {
    const svc = l.service ? `<span class="lead__svc">${esc(l.service)}</span>` : "";
    const addr = l.address ? `<span class="lead__addr">📍 ${esc(l.address)}</span>` : "";
    const msg = l.message ? `<div class="lead__msg">${esc(l.message)}</div>` : "";
    const opts = STATUSES.map((s) =>
      `<option value="${s}" ${l.status === s ? "selected" : ""}>${LABELS[s]}</option>`).join("");
    return `<article class="lead ${isFresh ? "is-fresh" : ""}" data-id="${esc(l.id)}">
      <div class="lead__head">
        <div>
          <div class="lead__name">${esc(l.name)}</div>
          <div class="lead__time">${timeAgo(l.created_at)}</div>
        </div>
        ${svc}
      </div>
      <div class="lead__row">
        <a href="tel:${esc(telHref(l.phone))}">📞 ${esc(l.phone)}</a>
        ${addr}
      </div>
      ${msg}
      <div class="lead__foot">
        <select class="status" data-s="${esc(l.status)}" data-status>${opts}</select>
        <input class="notes" data-notes placeholder="Add a note…" value="${esc(l.notes || "")}">
      </div>
    </article>`;
  }

  function wire() {
    listEl.querySelectorAll(".lead").forEach((el) => {
      const id = el.dataset.id;
      const sel = el.querySelector("[data-status]");
      sel.addEventListener("change", async () => {
        sel.dataset.s = sel.value;
        await patch(id, { status: sel.value });
        const l = leads.find((x) => x.id === id); if (l) l.status = sel.value;
        render([]); // refresh counts
      });
      const notes = el.querySelector("[data-notes]");
      let last = notes.value;
      notes.addEventListener("blur", async () => {
        if (notes.value === last) return;
        last = notes.value;
        await patch(id, { notes: notes.value });
        const l = leads.find((x) => x.id === id); if (l) l.notes = notes.value;
      });
    });
  }

  async function patch(id, body) {
    try {
      const r = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!r.ok) toast("Couldn't save — try again");
    } catch { toast("Network error"); }
  }

  /* ---------- little helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function telHref(phone) {
    const c = String(phone).replace(/[^\d+]/g, "");
    if (c.startsWith("+")) return c;
    const d = c.replace(/\D/g, "");
    return d.length === 10 ? "+1" + d : "+" + d;
  }
  function timeAgo(iso) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
    const d = Math.floor(h / 24); if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  // short notification beep (WebAudio — no asset needed)
  function ping() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ac = new Ctx();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = 880;
      o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
      o.start(); o.stop(ac.currentTime + 0.36);
    } catch {}
  }

  let titleTimer = null;
  function flashTitle(n) {
    const base = "Leads · Rooftop Heroes";
    let on = true;
    clearInterval(titleTimer);
    titleTimer = setInterval(() => {
      document.title = on ? `🔔 (${n}) New lead!` : base; on = !on;
    }, 1000);
    const stop = () => { clearInterval(titleTimer); document.title = base; window.removeEventListener("focus", stop); };
    window.addEventListener("focus", stop);
    setTimeout(stop, 15000);
  }

  init();
})();
