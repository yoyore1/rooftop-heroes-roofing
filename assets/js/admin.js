/* Rooftop Heroes — lead dashboard (kept deliberately simple for the owner).
   Talks to /api/login and /api/leads. No build step, no dependencies. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const STATUSES = ["new", "called", "won", "lost"];
  const LABELS = { new: "New", called: "Called", won: "Won", lost: "Lost" };
  const SEARCH_AFTER = 6;

  const views = { login: $('[data-view="login"]'), dash: $('[data-view="dash"]') };
  const loginForm = $("[data-login]");
  const loginErr = $("[data-login-err]");
  const summaryEl = $("[data-summary]");
  const listEl = $("[data-list]");
  const searchEl = $("[data-search]");
  const toastEl = $("[data-toast]");
  const trashToggleBtn = $("[data-trash-toggle]");
  const trashListEl = $("[data-trash-list]");
  const trashCountEl = $("[data-trash-count]");

  // Lightbox for full-size roof photos
  const lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.innerHTML = `<img alt="Roof photo">`;
  document.body.appendChild(lightbox);
  lightbox.addEventListener("click", () => lightbox.classList.remove("open"));

  let leads = [];
  let query = "";
  let knownIds = new Set();
  let pollTimer = null;
  let firstLoad = true;
  let trashOpen = false;
  let trashLeads = [];

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
    leads = []; knownIds = new Set(); firstLoad = true; trashLeads = [];
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

  async function loadTrash() {
    try {
      const r = await fetch("/api/leads?trash=1");
      if (!r.ok) return;
      const j = await r.json();
      if (j.ok) { trashLeads = j.leads; renderTrash(); }
    } catch {}
  }

  /* ---------- trash toggle ---------- */
  trashToggleBtn.addEventListener("click", () => {
    trashOpen = !trashOpen;
    trashListEl.classList.toggle("hidden", !trashOpen);
    if (trashOpen && !trashLeads.length) loadTrash();
    else renderTrash();
  });

  function renderTrash() {
    trashCountEl.textContent = trashLeads.length || "";
    if (!trashOpen) return;
    if (!trashLeads.length) {
      trashListEl.innerHTML = `<p style="color:var(--muted);font-size:14px;padding:6px 0">No deleted leads.</p>`;
      return;
    }
    trashListEl.innerHTML = trashLeads.map((l) => `
      <div class="trash-card" data-trash-id="${esc(l.id)}">
        <div class="trash-card__info">
          <div class="trash-card__name">${esc(l.name)}</div>
          <div class="trash-card__sub">${esc(l.phone)}${l.service ? " · " + esc(l.service) : ""} · ${timeAgo(l.created_at)}</div>
        </div>
        <button class="trash-restore" data-restore>↩ Restore</button>
      </div>`).join("");

    trashListEl.querySelectorAll("[data-restore]").forEach((btn) => {
      const card = btn.closest("[data-trash-id]");
      btn.addEventListener("click", async () => {
        const id = card.dataset.trashId;
        const r = await fetch("/api/leads", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, restore: true }),
        });
        if (!r.ok) { toast("Couldn't restore — try again"); return; }
        const restored = trashLeads.find((l) => l.id === id);
        trashLeads = trashLeads.filter((l) => l.id !== id);
        if (restored) {
          restored.is_deleted = false;
          leads.unshift(restored);
          knownIds.add(restored.id);
        }
        renderTrash();
        render([]);
        toast("Lead restored ✓");
      });
    });
  }

  searchEl.addEventListener("input", () => { query = searchEl.value.trim().toLowerCase(); render([]); });

  function render(fresh) {
    const newCount = leads.filter((l) => l.status === "new").length;
    const today = new Date().toISOString().slice(0, 10);
    const overdueCount = leads.filter((l) => l.followup_date && l.followup_date < today).length;

    if (!leads.length) { summaryEl.textContent = ""; summaryEl.className = "summary"; }
    else if (newCount) {
      summaryEl.className = "summary is-new";
      summaryEl.innerHTML = `🔔 ${newCount} new lead${newCount > 1 ? "s" : ""} to call`
        + `<small>${leads.length} total · tap the green button to call</small>`;
    } else if (overdueCount) {
      summaryEl.className = "summary is-new";
      summaryEl.innerHTML = `⚠️ ${overdueCount} overdue follow-up${overdueCount > 1 ? "s" : ""}`
        + `<small>${leads.length} total lead${leads.length > 1 ? "s" : ""}</small>`;
    } else {
      summaryEl.className = "summary";
      summaryEl.innerHTML = `✅ All caught up<small>${leads.length} total lead${leads.length > 1 ? "s" : ""}</small>`;
    }

    searchEl.classList.toggle("hidden", leads.length <= SEARCH_AFTER);

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
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = l.followup_date && l.followup_date < today;
    const isDueToday = l.followup_date && l.followup_date === today;
    const isNew = l.status === "new";

    const svc = l.service ? `<span class="lead__svc">${esc(l.service)}</span>` : "";
    const addr = l.address
      ? `<a class="lead__addr" href="https://maps.google.com/?q=${encodeURIComponent(l.address)}" target="_blank" rel="noopener">📍 ${esc(l.address)}</a>`
      : "";
    const msg = l.message ? `<div class="lead__msg">${esc(l.message)}</div>` : "";
    const photos = [...new Set([l.photo_url, ...(l.photo_urls || [])].filter(Boolean))];
    const gridClass = photos.length === 1 ? "lead__photos--1" : photos.length === 2 ? "lead__photos--2" : "lead__photos--many";
    const photo = photos.length
      ? `<div class="lead__photos ${gridClass}">${photos.map(u => `<img class="lead__photo-thumb" src="${esc(u)}" alt="Roof photo" loading="lazy" data-photo="${esc(u)}">`).join("")}</div>`
      : "";
    const bestTime = l.best_time && l.best_time !== "Anytime"
      ? `<div class="lead__besttime">🕐 Best time: ${esc(l.best_time)}</div>` : "";

    const followupTag = l.followup_date
      ? (isOverdue
          ? `<span class="tag-overdue">⚠️ Follow up: ${fmtDate(l.followup_date)}</span>`
          : isDueToday
            ? `<span class="tag-today">🔔 Follow up: Today</span>`
            : `<span style="font-size:13px;color:var(--muted)">📅 Follow up: ${fmtDate(l.followup_date)}</span>`)
      : "";

    const pills = STATUSES.map((s) =>
      `<button class="pill ${l.status === s ? "is-on" : ""}" data-s="${s}" data-set>${LABELS[s]}</button>`).join("");

    return `<article class="lead ${isFresh ? "is-fresh" : ""} ${isOverdue ? "is-overdue" : ""}" data-id="${esc(l.id)}">
      <div class="lead__head">
        <span class="lead__name">${esc(l.name)}</span>
        ${isNew ? `<span class="badge-new">New</span>` : ""}
        ${svc}
        <button class="lead__del" data-delete title="Delete lead">🗑</button>
      </div>
      <div class="lead__time">${timeAgo(l.created_at)}${followupTag ? " · " + followupTag : ""}</div>
      <a class="lead__call" href="tel:${esc(telHref(l.phone))}">📞 Call ${esc(l.phone)}</a>
      ${bestTime}
      ${addr}
      ${msg}
      ${photo}
      <div class="status">
        <div class="status__label">Where's it at?</div>
        <div class="status__btns">${pills}</div>
      </div>
      <div class="followup">
        <span class="followup__label">Follow-up date</span>
        <input type="date" class="followup__input" data-followup value="${esc(l.followup_date || "")}">
        ${l.followup_date ? `<button class="followup__clear" data-clear-followup>Clear</button>` : ""}
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
          render([]);
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

      const followupInput = el.querySelector("[data-followup]");
      if (followupInput) {
        followupInput.addEventListener("change", async () => {
          const val = followupInput.value || null;
          const l = leads.find((x) => x.id === id); if (l) l.followup_date = val;
          await patch(id, { followup_date: val });
          render([]);
        });
      }

      const clearBtn = el.querySelector("[data-clear-followup]");
      if (clearBtn) {
        clearBtn.addEventListener("click", async () => {
          const l = leads.find((x) => x.id === id); if (l) l.followup_date = null;
          await patch(id, { followup_date: null });
          render([]);
        });
      }

      const delBtn = el.querySelector("[data-delete]");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!confirm("Move this lead to trash? You can restore it any time.")) return;
          const r = await fetch("/api/leads", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          if (!r.ok) { toast("Couldn't delete — try again"); return; }
          const deleted = leads.find((l) => l.id === id);
          leads = leads.filter((l) => l.id !== id);
          knownIds.delete(id);
          if (deleted) trashLeads.unshift({ ...deleted, is_deleted: true });
          trashCountEl.textContent = trashLeads.length || "";
          if (trashOpen) renderTrash();
          render([]);
          toast("Moved to trash · see below to restore");
        });
      }

      el.querySelectorAll("[data-photo]").forEach(img => {
        img.addEventListener("click", () => {
          lightbox.querySelector("img").src = img.dataset.photo;
          lightbox.classList.add("open");
        });
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
  function fmtDate(iso) {
    if (!iso) return "";
    const [, m, d] = iso.split("-");
    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m) - 1] + " " + parseInt(d);
  }
  function timeAgo(iso) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
    const dd = Math.floor(h / 24); if (dd < 7) return `${dd} day${dd > 1 ? "s" : ""} ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3800);
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
