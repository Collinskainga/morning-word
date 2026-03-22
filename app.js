/* ═══════════════════════════════════════════════════════════
   MORNING WORD — app.js
   All application logic for the Morning Word PWA
═══════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════
   STATE
════════════════════════════════════════════ */
const state = {
  streak: 5,
  total: 12,
  themes: ["faith", "hope"],
  version: "NIV",
  todayVerse: null,
  history: [],
  notifOn: true,
};

const THEMES_ALL = [
  "faith",
  "hope",
  "strength",
  "peace",
  "wisdom",
  "love",
  "gratitude",
  "courage",
  "healing",
  "purpose",
];

const MILESTONES = [
  {
    emoji: "🌅",
    name: "First light",
    desc: "Read your first verse",
    check: (s) => s.total >= 1,
  },
  {
    emoji: "🌿",
    name: "Week of faith",
    desc: "7-day streak",
    check: (s) => s.streak >= 7,
  },
  {
    emoji: "🕊️",
    name: "A faithful month",
    desc: "30-day streak",
    check: (s) => s.streak >= 30,
  },
  {
    emoji: "✨",
    name: "Century strong",
    desc: "100 verses read",
    check: (s) => s.total >= 100,
  },
];

/* ════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════ */
function goTo(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById("screen-" + id).classList.add("active");

  document.querySelectorAll(".nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.screen === id);
  });

  if (id === "streak") renderStreak();
  if (id === "history") renderHistory();

  if (id === "devotional" && state.todayVerse) {
    renderDevotional(state.todayVerse);
  } else if (id === "devotional" && !state.todayVerse) {
    document.getElementById("dev-content").innerHTML = `
      <div class="dev-loading" style="padding-top:100px">
        <div style="font-family:var(--ff-serif);font-size:20px;font-style:italic;color:var(--ink4)">
          No verse loaded yet.
        </div>
        <button class="load-btn" style="margin:0;width:200px" onclick="loadTodayVerse()">
          Load today's verse
        </button>
      </div>`;
  }
}

/* ════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════ */

/**
 * Escape HTML special characters to prevent XSS
 * when inserting user/API content into innerHTML.
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ════════════════════════════════════════════
   HOME SCREEN
════════════════════════════════════════════ */
function initHome() {
  const now = new Date();
  document.getElementById("home-date-lbl").textContent = now.toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric" },
  );

  document.getElementById("home-streak").textContent = state.streak;
  document.getElementById("home-total").textContent = state.total;
}



/* ════════════════════════════════════════════
   AI VERSE FETCH
════════════════════════════════════════════ */
async function loadTodayVerse() {
  // If we already have today's verse, just navigate to it
  if (state.todayVerse) {
    goTo("devotional");
    return;
  }

  const btn = document.getElementById("load-btn");
  btn.disabled = true;
  btn.innerHTML = `
    <div class="spinner" style="width:18px;height:18px;border-width:2px;border-top-color:var(--paper)"></div>
    Receiving...`;

  const themes = state.themes.length ? state.themes : ["faith", "hope"];
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `You are a warm, thoughtful devotional writer. Generate an inspiring Bible verse with a short reflection.
Themes: ${themes.join(", ")}
Bible version: ${state.version}
Reply ONLY with a valid JSON object — no markdown, no backticks, no extra text:
{"verse":"full verse text","reference":"Book Chapter:Verse (${state.version})","reflection":"2-3 warm sentences reflecting on this verse","prayer":"one short closing prayer sentence"}`;`

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Bearer " +
          (process.env.DEEPSEEK_API_KEY ||
            localStorage.getItem("deepseek_api_key")),
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const raw = data.choices[0].message.content
      .replace(/```json|```/g, "")
      .trim();
    const d = JSON.parse(raw);

    state.todayVerse = d;

    // Save to history (avoid duplicates by reference)
    const dateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!state.history.find((x) => x.reference === d.reference)) {
      state.history.unshift({ ...d, date: dateLabel });
      state.total++;
    }

    // Update the home hero card
    const verseEl = document.getElementById("home-verse-text");
    verseEl.innerHTML = "";
    verseEl.style.cssText = "";
    verseEl.textContent = d.verse;
    document.getElementById("home-verse-ref").textContent = "— " + d.reference;
    document.getElementById("home-hero-cta").style.display = "flex";
    document.getElementById("home-streak").textContent = state.streak;
    document.getElementById("home-total").textContent = state.total;

    // Send verse to service worker for offline caching
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "CACHE_VERSE",
        verse: d,
      });
    }

    goTo("devotional");
  } catch (err) {
    console.error("[app] Verse fetch failed:", err);
    btn.innerHTML = "Try again";
    btn.disabled = false;
    return;
  }

  btn.disabled = false;
  btn.innerHTML = `
    <svg viewBox="0 0 16 16" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round">
      <path d="M8 1v7m0 0l-3-3m3 3l3-3M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"/>
    </svg>
    Get a verse`;
}

/* ════════════════════════════════════════════
   DEVOTIONAL SCREEN
════════════════════════════════════════════ */
function renderDevotional(d, dateOverride) {
  const dateStr =
    dateOverride ||
    new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  document.getElementById("dev-content").innerHTML = `
    <div class="dev-date-label">${dateStr}</div>

    <div class="dev-verse-block">
      <div class="dev-verse-text">${escHtml(d.verse)}</div>
      <div class="dev-verse-ref">${escHtml(d.reference)}</div>
    </div>

    <div class="dev-section">
      <div class="dev-section-label">Reflection</div>
      <div class="dev-reflection">${escHtml(d.reflection)}</div>
    </div>

    <div class="dev-section">
      <div class="dev-section-label">Prayer</div>
      <div class="dev-prayer">${escHtml(d.prayer)}</div>
    </div>

    <div class="dev-actions">
      <button class="dev-btn outline" onclick="copyVerse()">Copy verse</button>
      <button class="dev-btn solid"   onclick="goTo('home')">Done</button>
    </div>

    <div style="height:4px"></div>`;
}

function copyVerse() {
  if (!state.todayVerse) return;
  const v = state.todayVerse;
  const text = `"${v.verse}" — ${v.reference}\n\n${v.reflection}\n\nPrayer: ${v.prayer}`;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector(".dev-btn.outline");
    if (btn) {
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = "Copy verse";
      }, 1800);
    }
  });
}

/* ════════════════════════════════════════════
   HISTORY SCREEN
════════════════════════════════════════════ */
function renderHistory() {
  const list = document.getElementById("hist-list");
  const lbl = document.getElementById("hist-count-lbl");

  if (!state.history.length) {
    lbl.textContent = "No verses yet";
    list.innerHTML = `
      <div class="hist-empty">
        No verses yet.
        <small>Your past devotionals will appear here.</small>
      </div>`;
    return;
  }

  lbl.textContent =
    state.history.length + (state.history.length === 1 ? " verse" : " verses");
  list.innerHTML = state.history
    .map(
      (h, i) => `
    <div class="hist-item" onclick="openHistItem(${i})">
      <div class="hist-item-date">${h.date}</div>
      <div class="hist-item-verse">${escHtml(h.verse)}</div>
      <div class="hist-item-ref">— ${escHtml(h.reference)}</div>
    </div>`,
    )
    .join("");
}

function openHistItem(i) {
  const item = state.history[i];
  if (!item) return;
  state.todayVerse = item;
  renderDevotional(item, item.date);
  goTo("devotional");
}

/* ════════════════════════════════════════════
   STREAK SCREEN
════════════════════════════════════════════ */
function renderStreak() {
  document.getElementById("streak-big").innerHTML =
    state.streak + "<span> days</span>";
  document.getElementById("streak-total-badge").textContent = state.total;

  // ── Week row ──────────────────────────────────────────
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayIdx = new Date().getDay();

  document.getElementById("week-row").innerHTML = DAYS.map(
    (d, i) => `
    <div class="week-day">
      <div class="week-day-lbl">${d[0]}</div>
      <div class="week-dot ${i < todayIdx ? "done" : ""} ${i === todayIdx ? "today" : ""}">
        ${i < todayIdx ? `<svg viewBox="0 0 14 14"><path d="M2 7l4 4 6-6"/></svg>` : ""}
      </div>
    </div>`,
  ).join("");

  // ── Month heatmap ─────────────────────────────────────
  const now = new Date();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const todayDate = now.getDate();

  document.getElementById("month-label").textContent = now.toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );

  document.getElementById("month-grid").innerHTML = Array.from(
    { length: daysInMonth },
    (_, i) => {
      const day = i + 1;
      const cls = day === todayDate ? "today" : day < todayDate ? "done" : "";
      return `<div class="month-cell ${cls}"></div>`;
    },
  ).join("");

  // ── Milestones ────────────────────────────────────────
  document.getElementById("milestones").innerHTML = MILESTONES.map((m) => {
    const earned = m.check(state);
    return `
      <div class="milestone">
        <div class="ms-icon ${earned ? "earned" : ""}">${m.emoji}</div>
        <div>
          <div class="ms-name ${earned ? "earned" : ""}">${m.name}</div>
          <div class="ms-desc">${m.desc}</div>
        </div>
      </div>`;
  }).join("");
}

/* ════════════════════════════════════════════
   SETTINGS SCREEN
════════════════════════════════════════════ */
function buildSettings() {
  // ── Hour picker ───────────────────────────────────────
  const scroll = document.getElementById("hour-scroll");

  for (let h = 4; h <= 23; h++) {
    const period = h < 12 ? "AM" : "PM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;

    const chip = document.createElement("button");
    chip.className = "hour-chip" + (h === state.hour ? " selected" : "");
    chip.innerHTML = `<span>${display}</span><span class="period">${period}</span>`;

    chip.onclick = () => {
      document
        .querySelectorAll(".hour-chip")
        .forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      state.hour = h;
      document.getElementById("save-msg").textContent = "";
    };

    scroll.appendChild(chip);
  }

  // Scroll the pre-selected chip into view
  setTimeout(() => {
    const sel = scroll.querySelector(".selected");
    if (sel)
      sel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
  }, 200);

  // ── Theme pills ───────────────────────────────────────
  const wrap = document.getElementById("themes-wrap");

  THEMES_ALL.forEach((t) => {
    const pill = document.createElement("button");
    pill.className = "theme-pill" + (state.themes.includes(t) ? " on" : "");
    pill.textContent = t.charAt(0).toUpperCase() + t.slice(1);

    pill.onclick = () => {
      pill.classList.toggle("on");
      if (pill.classList.contains("on")) {
        state.themes.push(t);
      } else {
        state.themes = state.themes.filter((x) => x !== t);
      }
    };

    wrap.appendChild(pill);
  });

  // ── Version select ────────────────────────────────────
  document.getElementById("version-sel").value = state.version;
}

function saveSettings() {
  state.version = document.getElementById("version-sel").value;
  state.notifOn = document.getElementById("notif-toggle").checked;

  const msg = document.getElementById("save-msg");
  msg.textContent = "Settings saved!";
  setTimeout(() => {
    msg.textContent = "";
  }, 3000);
}

/* ════════════════════════════════════════════
   SERVICE WORKER — MESSAGES FROM SW
   Handle notification taps that deep-link
   into the devotional screen.
════════════════════════════════════════════ */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (!event.data) return;

    if (event.data.type === "NOTIFICATION_CLICK") {
      // SW passed the verse payload from the push notification
      const data = event.data.data;
      if (data && data.verse) {
        state.todayVerse = {
          verse: data.verse,
          reference: data.reference,
          reflection: data.reflection,
          prayer: data.prayer,
        };
      }
      goTo("devotional");
    }

    if (event.data.type === "RETRY_VERSE_FETCH") {
      // Background sync asking us to retry after connectivity restored
      if (!state.todayVerse) loadTodayVerse();
    }
  });
}

/* ════════════════════════════════════════════
   DEEP LINK SUPPORT
   Allow ?screen=devotional from push tap
   to open the right screen on cold start.
════════════════════════════════════════════ */
function handleDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const screen = params.get("screen");
  if (screen && document.getElementById("screen-" + screen)) {
    goTo(screen);
  }
}

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
initHome();
buildSettings();
handleDeepLink();

// Register the service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[app] Service worker registration failed:", err);
    });
  });
}
