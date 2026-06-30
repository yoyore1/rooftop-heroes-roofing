/* Rooftop Heroes — lead dashboard (kept deliberately simple for the owner).
   Talks to /api/login and /api/leads. No build step, no dependencies. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const STATUSES = ["new", "called", "won", "lost"];
  const LABELS = { new: "New", called: "Called", won: "Won", lost: "Lost" };
  const SEARCH_AFTER = 6; // only show the search box once there are this many leads

  const views = { login: $('[data-view="login"]'), dash: $('[data-view="dash"]') };
  const loginForm = $("[data-login]");
  const loginErr = $("[data-login-err]");
  const summaryEl = $("[data-summary]");
  const listEl = $("[data-list]");
  const searchEl = $("[data-search]");
  const toastEl = $("[data-toast]");

  let leads = [];
  let query = "";
  let knownIds = new Set();
  let pollTimer = null;
  let firstLoad = true;

  function show(view) {
    views.login.classList.toggle("hidden", view !== "login");
    views.dash.classList.toggle("hidden", view !== "dash");
  }

  /* ---------- auth ---------- */
  async function init() {
    try {
      const r = await fetch("/api/login");
      const j = await r.json();
      if (j.authed) startDash();
      else {
        show("login");
        if (!j.configured) loginErr.textContent = "Login isn't set up yet.";
      }
    } catch { show("login"); }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErr.textContent = "";
    const password = new FormData(loginForm).get("password");
    try {
      const r = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
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
  function startDash() { show("dash"); load(); startPoll(); }
  function startPoll() { stopPoll(); pollTimer = setInterval(() => load(true), 20000); }
  function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  document.addEventListener("visibilitychange", () => {
    if (!views.dash.classList.contains("hidden")) {
      if (document.hidden) stopPoll(); else { load(true); startPoll(); }
    }
  });

  async function load() {
    try {
      const r = await fetch("/api/leads");
      if (r.status === 401) { stopPoll(); show("login"); return; }
      const j = await r.json();
      if (!j.ok) return;

      const incomingIds = j.leads.map((l) => l.id);
      const fresh = firstLoad ? [] : incomingIds.filter((id) => !knownIds.has(id));
      leads = j.leads;
      knownIds = new Set(incomingIds);

      render(fresh);

      if (fresh.length && !firstLoad) {
        toast(`🔔 ${fresh.length} new lead${fresh.length > 1 ? "s" : ""}`);
        ping(); flashTitle(fresh.length);
      }
      firstLoad = false;
    } catch { /* keep last good render */ }
  }

  searchEl.addEventListener("input", () => { query = searchEl.value.trim().toLowerCase(); render([]); });

  function render(fresh) {
    const newCount = leads.filter((l) => l.status === "new").length;

    // friendly one-line summary
    if (!leads.length) { summaryEl.textContent = ""; summaryEl.className = "summary"; }
    else if (newCount) {
      summaryEl.className = "summary is-new";
      summaryEl.innerHTML = `🔔 ${newCount} new lead${newCount > 1 ? "s" : ""} to call`
        + `<small>${leads.length} total · tap the green button to call</small>`;
    } else {
      summaryEl.className = "summary";
      summaryEl.innerHTML = `✅ All caught up<small>${leads.length} total lead${leads.length > 1 ? "s" : ""}</small>`;
    }

    // search only appears once the list gets long
    searchEl.classList.toggle("hidden", leads.length <= SEARCH_AFTER);

    // newest + still-new leads float to the top
    let rows = leads.slice().sort((a, b) => {
      const an = a.status === "new" ? 0 : 1, bn = b.status === "new" ? 0 : 1;
      if (an !== bn) return an - bn;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    if (query) rows = rows.filter((l) =>
      [l.name, l.phone, l.address, l.service, l.message].filter(Boolean).join(" ").toLowerCase().includes(query));

    if (!rows.length) {
      listEl.innerHTML = leads.length
        ? `<div class="empty"><div class="empty__icon">🔍</div><p>No leads match that search.</p></div>`
        : `<div class="empty"><div class="empty__icon">📭</div>
             <div class="empty__big">No leads yet</div>
             <p>When someone fills out the website form, they'll show up here — and you'll get a text and email.</p></div>`;
      return;
    }

    listEl.innerHTML = rows.map((l) => card(l, fresh.includes(l.id))).join("");
    wire();
  }

  function card(l, isFresh) {
    const isNew = l.status === "new";
    const svc = l.service ? `<span class="lead__svc">${esc(l.service)}</span>` : "";
    const addr = l.address
      ? `<a class="lead__addr" href="https://maps.google.com/?q=${encodeURIComponent(l.address)}" target="_blank" rel="noopener">📍 ${esc(l.address)}</a>`
      : "";
    const msg = l.message ? `<div class="lead__msg">${esc(l.message)}</div>` : "";
    const pills = STATUSES.map((s) =>
      `<button class="pill ${l.status === s ? "is-on" : ""}" data-s="${s}" data-set>${LABELS[s]}</button>`).join("");
    return `<article class="lead ${isFresh ? "is-fresh" : ""}" data-id="${esc(l.id)}">
      <div class="lead__head">
        <span class="lead__name">${esc(l.name)}</span>
        ${isNew ? `<span class="badge-new">New</span>` : ""}
        ${svc}
      </div>
      <div class="lead__time">${timeAgo(l.created_at)}</div>
      <a class="lead__call" href="tel:${esc(telHref(l.phone))}">📞 Call ${esc(l.phone)}</a>
      ${addr}
      ${msg}
      <div class="status">
        <div class="status__label">Where's it at?</div>
        <div class="status__btns">${pills}</div>
      </div>
      <input class="notes" data-notes placeholder="Add a note (e.g. left a voicemail)" value="${esc(l.notes || "")}">
    </article>`;
  }

  function wire() {
    listEl.querySelectorAll(".lead").forEach((el) => {
      const id = el.dataset.id;
      el.querySelectorAll("[data-set]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const status = btn.dataset.s;
          el.querySelectorAll("[data-set]").forEach((b) => b.classList.toggle("is-on", b === btn));
          const l = leads.find((x) => x.id === id); if (l) l.status = status;
          await patch(id, { status });
          render([]); // re-sort + refresh the summary
        });
      });
      const notes = el.querySelector("[data-notes]");
      let last = notes.value;
      notes.addEventListener("blur", async () => {
        if (notes.value === last) return;
        last = notes.value;
        const l = leads.find((x) => x.id === id); if (l) l.notes = notes.value;
        await patch(id, { notes: notes.value });
      });
    });
  }

  async function patch(id, body) {
    try {
      const r = await fetch("/api/leads", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!r.ok) toast("Couldn't save — try again");
    } catch { toast("Network error"); }
  }

  /* ---------- helpers ---------- */
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
  function ping() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      const ac = new Ctx(); const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
      o.start(); o.stop(ac.currentTime + 0.36);
    } catch {}
  }
  let titleTimer = null;
  function flashTitle(n) {
    const base = "Leads · Rooftop Heroes"; let on = true;
    clearInterval(titleTimer);
    titleTimer = setInterval(() => { document.title = on ? `🔔 (${n}) New lead!` : base; on = !on; }, 1000);
    const stop = () => { clearInterval(titleTimer); document.title = base; window.removeEventListener("focus", stop); };
    window.addEventListener("focus", stop);
    setTimeout(stop, 15000);
  }

  init();
})();
