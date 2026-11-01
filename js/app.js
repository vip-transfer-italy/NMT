(function () {
  "use strict";

  /* ================= DATA REGISTRY ================= */
  const ORDER = ["ukr", "math", "history", "geo"];
  const SUBJ = NMT.subjects;
  const INT = [0, 1, 3, 7, 14, 30]; // Leitner intervals, days
  const L = ["А", "Б", "В", "Г", "Д", "Е"];
  const KEY = "nmt-prep-v1";
  const Q = {};
  const TOPIC = {};

  ORDER.forEach((s) =>
    SUBJ[s].topics.forEach((t) => {
      TOPIC[s + "/" + t.id] = t;
      t.subj = s;
      t.qids = t.questions.map((q, i) => {
        const id = s + "." + t.id + "." + i;
        Q[id] = Object.assign({ id, subj: s, topic: t.id }, q, { t: q.t || "single" });
        return id;
      });
    })
  );
  const subjQids = (s) => SUBJ[s].topics.flatMap((t) => t.qids);

  /* ================= UTILS ================= */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ymd = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const dnum = (s) => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const today = () => ymd();
  const tnum = () => dnum(today());
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };

  /* ================= STATE ================= */
  function defaults() {
    return { v: 1, profile: { name: "", examDate: "2027-05-20", minutes: 90, onboarded: false, theme: "auto" }, q: {}, theory: {}, days: {}, xp: 0, ach: {}, tests: [] };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) { const d = defaults(); return Object.assign(d, s, { profile: Object.assign(d.profile, s.profile) }); } } catch (e) {}
    return defaults();
  }
  let st = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const day = (d = today()) => st.days[d] || (st.days[d] = { answered: 0, correct: 0, xp: 0, done: {} });

  /* ================= LEARNING MODEL ================= */
  function mastery(id) {
    const r = st.q[id];
    if (!r || !r.last) return 0;
    return 0.6 + 0.4 * Math.min(1, (r.b - 1) / 2);
  }
  function topicStats(s, tid) {
    const t = TOPIC[s + "/" + tid];
    let seen = 0, ok = 0, m = 0;
    t.qids.forEach((id) => { const r = st.q[id]; if (r) { seen++; if (r.last) ok++; } m += mastery(id); });
    return { seen, ok, total: t.qids.length, m: m / t.qids.length, read: !!st.theory[s + "/" + tid] };
  }
  function topicDone(s, tid) { const x = topicStats(s, tid); return x.read && x.seen === x.total && x.ok / x.total >= 0.7; }
  function subjStats(s) {
    const ids = subjQids(s);
    let seen = 0, m = 0;
    ids.forEach((id) => { if (st.q[id]) seen++; m += mastery(id); });
    const done = SUBJ[s].topics.filter((t) => topicDone(s, t.id)).length;
    return { seen, total: ids.length, m: m / ids.length, done, topics: SUBJ[s].topics.length, score: Math.round(100 + 100 * (m / ids.length)) };
  }
  function dueIds() {
    const n = tnum();
    return Object.keys(st.q).filter((id) => Q[id] && st.q[id].d <= n).sort((a, b) => st.q[a].b - st.q[b].b);
  }
  const wrongIds = () => Object.keys(st.q).filter((id) => Q[id] && st.q[id].last === false);

  function recordAnswer(id, ok) {
    const r = st.q[id] || { b: 0, n: 0, c: 0 };
    r.n++;
    if (ok) { r.c++; r.b = Math.min(r.b + 1, 5); r.d = tnum() + INT[r.b]; } else { r.b = 0; r.d = tnum(); }
    r.last = ok;
    st.q[id] = r;
    const D = day(); D.answered++; if (ok) D.correct++;
  }

  function level(xp = st.xp) {
    let lv = 1, need = 100, acc = 0;
    while (xp >= acc + need) { acc += need; lv++; need = 100 + (lv - 1) * 50; }
    return { lv, cur: xp - acc, need };
  }
  function addXP(n) {
    const before = level().lv;
    st.xp += n; day().xp += n;
    const after = level().lv;
    if (after > before) setTimeout(() => toast(`🎉 Новий рівень ${after}!`), 300);
  }
  function streak() {
    let n = tnum(), c = 0;
    const has = (k) => { const d = st.days[ymdFromNum(k)]; return d && d.answered > 0; };
    if (!has(n)) n--;
    while (has(n)) { c++; n--; }
    return c;
  }
  function ymdFromNum(n) { const d = new Date(n * 864e5); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
  const totalAnswered = () => Object.values(st.days).reduce((a, d) => a + d.answered, 0);
  const totalCorrect = () => Object.values(st.days).reduce((a, d) => a + d.correct, 0);
  const daysToExam = () => Math.max(0, dnum(st.profile.examDate) - tnum());

  /* ================= ACHIEVEMENTS ================= */
  const ACH = [
    { id: "first", icon: "👣", title: "Перший крок", desc: "Дай першу відповідь", test: () => totalAnswered() >= 1 },
    { id: "diag", icon: "🩺", title: "Знаю свій рівень", desc: "Пройди діагностику", test: () => !!st.diagDone },
    { id: "s3", icon: "🔥", title: "Розігрів", desc: "3 дні поспіль", test: () => streak() >= 3 },
    { id: "s7", icon: "⚡", title: "Тиждень у ділі", desc: "7 днів поспіль", test: () => streak() >= 7 },
    { id: "s30", icon: "🏆", title: "Машина", desc: "30 днів поспіль", test: () => streak() >= 30 },
    { id: "c50", icon: "✅", title: "50 правильних", desc: "50 правильних відповідей", test: () => totalCorrect() >= 50 },
    { id: "c300", icon: "💯", title: "300 правильних", desc: "300 правильних відповідей", test: () => totalCorrect() >= 300 },
    { id: "topic", icon: "📗", title: "Тему закрито", desc: "Повністю пройди першу тему", test: () => ORDER.some((s) => SUBJ[s].topics.some((t) => topicDone(s, t.id))) },
    { id: "mock", icon: "⏱️", title: "Як на іспиті", desc: "Пройди пробний тест", test: () => st.tests.length >= 1 },
    { id: "full", icon: "🎓", title: "Повний НМТ", desc: "Пройди повний пробний НМТ", test: () => st.tests.some((t) => t.subj === "all") },
    { id: "s170", icon: "🎯", title: "170+", desc: "Прогноз 170+ з будь-якого предмета", test: () => ORDER.some((s) => subjStats(s).score >= 170) },
    { id: "lv5", icon: "⭐", title: "Рівень 5", desc: "Набери 5 рівень", test: () => level().lv >= 5 },
  ];
  function checkAch() {
    ACH.forEach((a) => { if (!st.ach[a.id] && a.test()) { st.ach[a.id] = today(); setTimeout(() => toast(`${a.icon} Досягнення: ${a.title}`), 900); } });
  }

  /* ================= DAILY PLAN ================= */
  function nextTopic(s) { return SUBJ[s].topics.find((t) => !topicDone(s, t.id)); }
  function buildPlan() {
    const D = day();
    if (D.plan) return D.plan;
    const n = tnum();
    const slots = { 60: 2, 90: 3, 120: 4 }[st.profile.minutes] || 3;
    const tasks = [];
    const due = dueIds().length;
    if (due > 0) tasks.push({ id: "review", kind: "review", title: "Повторення", sub: `${Math.min(due, 15)} ${plural(Math.min(due, 15), "завдання", "завдання", "завдань")}, які пора освіжити`, min: Math.min(due, 15) });
    // weaker subjects first, rotated by day so all get attention
    const rot = ORDER.map((_, i) => ORDER[(i + n) % 4]);
    const sorted = rot.slice().sort((a, b) => subjStats(a).m - subjStats(b).m);
    const picks = [];
    rot.concat(sorted).forEach((s) => { if (picks.length < slots && !picks.includes(s)) picks.push(s); });
    picks.forEach((s) => {
      const t = nextTopic(s);
      if (t) {
        if (!st.theory[s + "/" + t.id]) tasks.push({ id: `theory:${s}:${t.id}`, kind: "theory", subj: s, topic: t.id, title: t.title, sub: "Теорія простими словами", min: Math.round(t.minutes / 2) });
        tasks.push({ id: `practice:${s}:${t.id}`, kind: "practice", subj: s, topic: t.id, title: t.title, sub: "Практика: завдання як на НМТ", min: 10 });
      } else tasks.push({ id: `mixed:${s}`, kind: "mixed", subj: s, title: SUBJ[s].name, sub: "Змішане тренування з усіх тем", min: 15 });
    });
    if (new Date().getDay() === 0) tasks.push({ id: "mock", kind: "mock", title: "Тижневий пробний НМТ", sub: "Перевір себе в умовах іспиту", min: 40 });
    D.plan = tasks;
    save();
    return tasks;
  }
  function completeTask(id) {
    if (!id) return;
    const D = day();
    if (D.plan && D.plan.some((t) => t.id === id) && !D.done[id]) { D.done[id] = true; addXP(20); }
  }

  /* ================= SESSIONS ================= */
  let S = null;
  let timerId = null;

  function prepItem(id) {
    const q = Q[id];
    const it = { id, q, user: null, checked: false, ok: null, hint: false };
    if (q.t === "single") it.perm = shuffle(q.o.map((_, i) => i));
    if (q.t === "order") { let p; do { p = shuffle(q.items.map((_, i) => i)); } while (p.every((v, i) => v === i) && q.items.length > 1); it.perm = p; it.user = []; }
    if (q.t === "match") it.user = q.l.map(() => null);
    if (q.t === "open") it.user = "";
    return it;
  }
  function startSession(o) {
    if (!o.ids.length) { toast("Немає завдань для цього режиму"); return; }
    S = Object.assign({ mode: "learn" }, o, { items: o.ids.map(prepItem), i: 0, startedAt: Date.now(), xp: 0, finished: false });
    if (S.limit) S.endsAt = Date.now() + S.limit * 1000;
    go("#session");
  }
  function sessionFromTask(t) {
    if (t.kind === "review") return startSession({ kind: "review", title: "Повторення", ids: dueIds().slice(0, 15), taskId: t.id });
    if (t.kind === "theory") return go(`#t-${t.subj}-${t.topic}`);
    if (t.kind === "practice") return startSession({ kind: "practice", title: TOPIC[t.subj + "/" + t.topic].title, ids: shuffle(TOPIC[t.subj + "/" + t.topic].qids), taskId: t.id, subj: t.subj });
    if (t.kind === "mixed") return startSession({ kind: "mixed", title: SUBJ[t.subj].name + ": мікс", ids: mixedIds(t.subj, 10), taskId: t.id, subj: t.subj });
    if (t.kind === "mock") return go("#exam");
  }
  function mixedIds(s, n) {
    const ids = s ? subjQids(s) : ORDER.flatMap(subjQids);
    // weaker questions first, with randomness
    return shuffle(ids).sort((a, b) => mastery(a) - mastery(b) + (Math.random() - 0.5) * 0.4).slice(0, n);
  }
  function diagnosticIds() { return ORDER.flatMap((s) => shuffle(SUBJ[s].topics).slice(0, 6).map((t) => t.qids[Math.floor(Math.random() * t.qids.length)])); }
  function examIds(s, n) {
    const subs = s === "all" ? ORDER : [s];
    return subs.flatMap((x) => {
      const topics = shuffle(SUBJ[x].topics);
      const out = [];
      let k = 0;
      while (out.length < n && k < 50) { const t = topics[k % topics.length]; const cand = shuffle(t.qids).find((id) => !out.includes(id)); if (cand) out.push(cand); k++; }
      return out;
    });
  }

  function normNum(s) {
    s = String(s).trim().replace(/\s+/g, "").replace(",", ".").replace("−", "-");
    if (/^-?\d+(\.\d+)?\/\d+(\.\d+)?$/.test(s)) { const [a, b] = s.split("/").map(Number); return b ? a / b : NaN; }
    return s === "" ? NaN : Number(s);
  }
  function grade(it) {
    const q = it.q;
    if (q.t === "single") return it.user === q.a;
    if (q.t === "open") { const v = normNum(it.user); return q.a.some((x) => { const n = normNum(x); return !isNaN(v) && !isNaN(n) ? Math.abs(v - n) < 1e-9 : String(it.user).trim().toLowerCase() === String(x).toLowerCase(); }); }
    if (q.t === "match") return it.user.every((v, i) => v === q.a[i]);
    if (q.t === "order") return it.user.length === q.items.length && it.user.every((v, i) => v === i);
    return false;
  }
  const answered = (it) => it.q.t === "single" ? it.user !== null : it.q.t === "open" ? String(it.user).trim() !== "" : it.q.t === "match" ? it.user.every((v) => v !== null) : it.user.length === it.q.items.length;

  function checkCurrent() {
    const it = S.items[S.i];
    if (!answered(it) || it.checked) return;
    it.checked = true;
    it.ok = grade(it);
    if (S.mode === "learn") {
      recordAnswer(it.id, it.ok);
      const xp = it.ok ? (it.hint ? 5 : 10) : 2;
      S.xp += xp; addXP(xp);
      save();
      if (navigator.vibrate) navigator.vibrate(it.ok ? 15 : [30, 40, 30]);
    }
    render();
  }
  function nextItem() {
    if (S.i < S.items.length - 1) { S.i++; render(); window.scrollTo(0, 0); } else finishSession();
  }
  function finishSession() {
    if (!S || S.finished) return;
    clearInterval(timerId);
    S.finished = true;
    if (S.mode === "exam") {
      S.items.forEach((it) => { it.checked = true; it.ok = answered(it) && grade(it); recordAnswer(it.id, it.ok); });
      const ok = S.items.filter((i) => i.ok).length;
      const xp = ok * 10 + (ok ? 30 : 0); S.xp = xp; addXP(xp);
      const pct = ok / S.items.length;
      st.tests.unshift({ date: today(), subj: S.subj, ok, total: S.items.length, score: Math.round(100 + 100 * pct), mins: Math.round((Date.now() - S.startedAt) / 60000) });
      st.tests = st.tests.slice(0, 50);
      completeTask("mock");
    }
    if (S.kind === "diagnostic") st.diagDone = true;
    completeTask(S.taskId);
    checkAch();
    save();
    const pct = S.items.filter((i) => i.ok).length / S.items.length;
    if (pct >= 0.8) confetti();
    render();
  }

  /* ================= ROUTER ================= */
  function go(h) { if (location.hash === h) render(); else location.hash = h; }
  window.addEventListener("hashchange", render);

  function render() {
    applyTheme();
    const h = (location.hash || "#home").slice(1).replace(/^\//, "").replace(/\//g, "-");
    const parts = h.split("-");
    if (!st.profile.onboarded && parts[0] !== "welcome") return go("#welcome");
    if (parts[0] !== "session") { clearInterval(timerId); if (S && !S.finished && S.mode === "learn") S = null; }
    let html, tab = parts[0] || "home";
    switch (parts[0]) {
      case "": case "home": html = vHome(); tab = "home"; break;
      case "subjects": html = vSubjects(); break;
      case "s": html = vSubject(parts[1]); tab = "subjects"; break;
      case "t": html = vTopic(parts[1], parts[2]); tab = "subjects"; break;
      case "session": html = S ? vSession() : vHome(); tab = S ? "session" : "home"; break;
      case "review": html = vReview(); break;
      case "exam": html = vExam(); break;
      case "stats": html = vStats(); break;
      case "tips": html = vTips(); tab = "home"; break;
      case "prefs": html = vSettings(); tab = "settings"; break;
      case "welcome": html = vWelcome(); tab = "welcome"; break;
      default: html = vHome(); tab = "home";
    }
    const bare = tab === "session" || tab === "welcome";
    document.body.classList.toggle("bare", bare);
    $("#view").innerHTML = html;
    document.querySelectorAll("[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    if (tab === "session" && S && S.mode === "exam" && !S.finished) startTimer();
    const inp = $("#open-input"); if (inp && !S.items[S.i].checked) inp.focus({ preventScroll: true });
  }

  /* ================= VIEWS ================= */
  const bar = (v, color) => `<div class="bar"><span style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;${color ? "background:" + color : ""}"></span></div>`;
  const chip = (s) => `<span class="chip" style="--c:${SUBJ[s].color}">${SUBJ[s].icon} ${SUBJ[s].short}</span>`;

  function vHome() {
    const plan = buildPlan();
    const D = day();
    const done = plan.filter((t) => D.done[t.id]).length;
    const mins = plan.reduce((a, t) => a + t.min, 0);
    const lv = level();
    const name = st.profile.name ? ", " + esc(st.profile.name) : "";
    const dte = daysToExam();
    const fresh = totalAnswered() === 0 && !st.diagDone;
    const avg = Math.round(ORDER.reduce((a, s) => a + subjStats(s).score, 0) / 4);
    return `
<section class="hero">
  <div>
    <h1>Привіт${name}! 👋</h1>
    <p class="muted">До НМТ залишилось <b>${dte} ${plural(dte, "день", "дні", "днів")}</b>. Ти встигнеш, якщо займатимешся щодня.</p>
  </div>
  <div class="stat-row">
    <div class="stat"><div class="stat-v">🔥 ${streak()}</div><div class="stat-l">${plural(streak(), "день", "дні", "днів")} поспіль</div></div>
    <div class="stat"><div class="stat-v">⭐ ${lv.lv}</div><div class="stat-l">рівень</div>${bar(lv.cur / lv.need)}</div>
    <div class="stat"><div class="stat-v">🎯 ${avg}</div><div class="stat-l">середній прогноз</div></div>
  </div>
</section>
${fresh ? `
<section class="card cta">
  <div class="cta-ico">🩺</div>
  <div class="grow"><h2>Почни з діагностики</h2><p class="muted">${diagnosticIds().length} коротких завдань з усіх 4 предметів, ~20 хвилин. Покаже, що ти вже знаєш, а що треба підтягнути. Не хвилюйся, оцінок тут немає.</p></div>
  <button class="btn primary" data-act="diag">Почати</button>
</section>` : ""}
<section class="card">
  <div class="card-h"><h2>План на сьогодні</h2><span class="muted">${done}/${plan.length} · ~${mins} хв</span></div>
  ${bar(plan.length ? done / plan.length : 0, "var(--ok)")}
  <ul class="tasks">
  ${plan.map((t) => `
    <li class="task ${D.done[t.id] ? "done" : ""}" data-act="task" data-id="${t.id}">
      <span class="tick">${D.done[t.id] ? "✓" : taskIcon(t)}</span>
      <span class="grow"><b>${t.title}</b><small>${t.subj ? SUBJ[t.subj].short + " · " : ""}${t.sub} · ~${t.min} хв</small></span>
      <span class="arrow">›</span>
    </li>`).join("")}
  </ul>
  ${done === plan.length && plan.length ? `<div class="done-box">🎉 План на сьогодні виконано! Можеш відпочити або взяти бонус. <button class="btn small" data-act="bonus">+ Бонусне тренування</button></div>` : ""}
</section>
<section class="card">
  <div class="card-h"><h2>Прогноз балів НМТ</h2><a href="#stats" class="muted">детальніше ›</a></div>
  <div class="score-grid">
  ${ORDER.map((s) => { const x = subjStats(s); return `
    <a class="score" href="#s-${s}" style="--c:${SUBJ[s].color}">
      <div class="score-top"><span>${SUBJ[s].icon} ${SUBJ[s].short}</span><b>${x.seen >= 3 ? x.score : "—"}</b></div>
      <div class="bar goal"><span style="width:${x.m * 100}%;background:${SUBJ[s].color}"></span><i style="left:70%"></i></div>
      <small class="muted">${x.done}/${x.topics} тем · ціль 170+</small>
    </a>`; }).join("")}
  </div>
  <p class="tiny muted">Прогноз рахується за твоїми відповідями в нашому банку завдань і за тим, наскільки міцно ти їх запам'ятав. Позначка на шкалі = 170 балів.</p>
</section>
<a class="card link-card" href="#tips"><span class="cta-ico">🧠</span><span class="grow"><b>Як скласти НМТ: стратегія і лайфхаки</b><small class="muted">Що робити на самому тесті, щоб не втратити жодного бала</small></span><span class="arrow">›</span></a>
`;
  }
  const taskIcon = (t) => ({ review: "🔁", theory: "📖", practice: "✏️", mixed: "🎲", mock: "⏱️" }[t.kind]);

  function vSubjects() {
    return `<h1 class="page-h">Предмети</h1>
<div class="subj-grid">${ORDER.map((s) => { const x = subjStats(s); return `
  <a class="card subj" href="#s-${s}" style="--c:${SUBJ[s].color}">
    <div class="subj-ico">${SUBJ[s].icon}</div>
    <div class="grow"><h2>${SUBJ[s].name}</h2><small class="muted">${SUBJ[s].required ? "обов'язковий" : "предмет на вибір"} · ${x.done}/${x.topics} тем пройдено</small>${bar(x.m, SUBJ[s].color)}</div>
    <div class="subj-score"><b>${x.seen >= 3 ? x.score : "—"}</b><small>прогноз</small></div>
  </a>`; }).join("")}</div>`;
  }

  function vSubject(s) {
    const sub = SUBJ[s]; if (!sub) return vSubjects();
    const x = subjStats(s);
    return `<a href="#subjects" class="back">‹ Предмети</a>
<h1 class="page-h">${sub.icon} ${sub.name}</h1>
<div class="card row-actions">
  <div class="grow"><b>Прогноз: ${x.seen >= 3 ? x.score : "—"}</b><small class="muted">${x.done}/${x.topics} тем · ${x.seen}/${x.total} завдань спробовано</small>${bar(x.m, sub.color)}</div>
  <button class="btn" data-act="mixed" data-s="${s}">🎲 Мікс</button>
  <button class="btn primary" data-act="exam" data-s="${s}">⏱️ Тест</button>
</div>
<ul class="topic-list">${sub.topics.map((t, i) => { const ts = topicStats(s, t.id); const dn = topicDone(s, t.id); return `
  <li><a class="card topic" href="#t-${s}-${t.id}">
    <span class="num ${dn ? "ok" : ts.read ? "half" : ""}">${dn ? "✓" : i + 1}</span>
    <span class="grow"><b>${t.title}</b><small class="muted">${dn ? "пройдено" : ts.read ? "теорію прочитано" : "нова тема"} · ${t.qids.length} завдань · ~${t.minutes} хв</small>${bar(ts.m, sub.color)}</span>
    <span class="arrow">›</span>
  </a></li>`; }).join("")}</ul>`;
  }

  function vTopic(s, tid) {
    const t = TOPIC[s + "/" + tid]; if (!t) return vSubjects();
    return `<a href="#s-${s}" class="back">‹ ${SUBJ[s].name}</a>
<article class="card theory">
  ${chip(s)}
  <h1>${t.title}</h1>
  ${t.theory}
</article>
<div class="sticky-cta">
  <button class="btn primary big" data-act="learned" data-s="${s}" data-t="${tid}">Зрозуміло → до завдань (${t.qids.length})</button>
</div>`;
  }

  function vSession() {
    if (S.finished) return vResult();
    const it = S.items[S.i];
    const q = it.q;
    const exam = S.mode === "exam";
    const prog = (S.i + (it.checked ? 1 : 0)) / S.items.length;
    let body = "";
    if (q.t === "single") {
      body = `<div class="opts">${it.perm.map((oi, k) => {
        let cls = "";
        if (it.checked && !exam) { if (oi === q.a) cls = "right"; else if (oi === it.user) cls = "wrong"; else cls = "dim"; }
        else if (it.user === oi) cls = "sel";
        if (it.hidden && it.hidden.includes(oi)) cls += " gone";
        return `<button class="opt ${cls}" data-act="pick" data-v="${oi}" ${it.checked && !exam ? "disabled" : ""}><span class="let">${L[k]}</span><span>${q.o[oi]}</span></button>`;
      }).join("")}</div>`;
    } else if (q.t === "open") {
      const cls = it.checked && !exam ? (it.ok ? "right" : "wrong") : "";
      body = `<div class="open"><input id="open-input" class="${cls}" inputmode="decimal" autocomplete="off" placeholder="Твоя відповідь" value="${esc(it.user)}" ${it.checked && !exam ? "disabled" : ""}>
      ${it.checked && !exam && !it.ok ? `<div class="answer">Правильна відповідь: <b>${q.a[0].replace(".", ",")}</b></div>` : ""}
      <small class="muted">Десятковий дріб пиши через кому: 1,5</small></div>`;
    } else if (q.t === "match") {
      body = `<div class="match">
        <div class="match-cols">
          <ol class="m-left">${q.l.map((x, i) => `<li><b>${i + 1}</b> ${x}</li>`).join("")}</ol>
          <ol class="m-right">${q.r.map((x, i) => `<li><b>${L[i]}</b> ${x}</li>`).join("")}</ol>
        </div>
        <div class="m-grid" style="--n:${q.r.length}">
          <span></span>${q.r.map((_, j) => `<span class="m-h">${L[j]}</span>`).join("")}
          ${q.l.map((_, i) => `<span class="m-h">${i + 1}</span>${q.r.map((_, j) => {
            let cls = it.user[i] === j ? "sel" : "";
            if (it.checked && !exam) { if (q.a[i] === j) cls = "right"; else if (it.user[i] === j) cls = "wrong"; }
            return `<button class="m-cell ${cls}" data-act="mpick" data-i="${i}" data-j="${j}" ${it.checked && !exam ? "disabled" : ""}></button>`;
          }).join("")}`).join("")}
        </div></div>`;
    } else if (q.t === "order") {
      body = `<div class="order">
        <p class="muted small">Натискай події по черзі: від найдавнішої до найпізнішої.</p>
        <div class="ord-items">${it.perm.map((oi) => {
          const pos = it.user.indexOf(oi);
          let cls = pos >= 0 ? "sel" : "";
          if (it.checked && !exam) cls = pos === oi ? "right" : "wrong";
          return `<button class="ord ${cls}" data-act="opick" data-v="${oi}" ${it.checked && !exam ? "disabled" : ""}><span class="let">${pos >= 0 ? pos + 1 : ""}</span><span>${q.items[oi]}</span></button>`;
        }).join("")}</div>
        ${it.user.length && !it.checked ? `<button class="btn small ghost" data-act="oreset">↺ Почати спочатку</button>` : ""}
        ${it.checked && !exam && !it.ok ? `<div class="answer">Правильно: ${q.items.map((x, i) => `<b>${i + 1}.</b> ${x}`).join(" → ")}</div>` : ""}
      </div>`;
    }
    const fb = it.checked && !exam ? `
      <div class="feedback ${it.ok ? "ok" : "bad"}">
        <div class="fb-h">${it.ok ? pick(["Супер! 💪", "Правильно! ✨", "Так тримати! 🔥", "Влучно! 🎯", "Красава! 👏"]) : pick(["Не біда, запам'ятаймо 👇", "Майже! Ось як правильно 👇", "Помилка теж корисна 👇"])}</div>
        <p>${q.e || ""}</p>
        ${!it.ok ? `<small class="muted">Це завдання повернеться в «Повторення», щоб ти точно його запам'ятав.</small>` : ""}
      </div>` : "";
    const canCheck = answered(it);
    const footer = exam
      ? `<button class="btn ghost" data-act="prev" ${S.i === 0 ? "disabled" : ""}>‹ Назад</button>
         <button class="btn primary" data-act="enext">${S.i === S.items.length - 1 ? "Завершити тест" : "Далі ›"}</button>`
      : it.checked
        ? `<button class="btn primary big" data-act="next">${S.i === S.items.length - 1 ? "Завершити" : "Далі ›"}</button>`
        : `${q.t === "single" && !it.hint ? `<button class="btn ghost" data-act="hint" title="Прибрати 2 неправильні варіанти">💡 50/50</button>` : ""}
           <button class="btn primary big" data-act="check" ${canCheck ? "" : "disabled"}>Перевірити</button>`;
    return `
<div class="session">
  <div class="s-top">
    <button class="icon-btn" data-act="quit" aria-label="Вийти">✕</button>
    <div class="grow">${bar(prog, "var(--ok)")}</div>
    ${exam ? `<span id="timer" class="timer">--:--</span>` : `<span class="muted small">${S.i + 1}/${S.items.length}</span>`}
  </div>
  ${exam ? `<div class="qmap">${S.items.map((x, k) => `<button class="qdot ${k === S.i ? "cur" : ""} ${answered(x) ? "ans" : ""}" data-act="jump" data-v="${k}">${k + 1}</button>`).join("")}</div>` : ""}
  <div class="q-card">
    <div class="q-meta">${chip(q.subj)} <span class="muted small">${TOPIC[q.subj + "/" + q.topic].title}</span></div>
    <h2 class="q-text">${q.q}</h2>
    ${body}
    ${fb}
  </div>
  <div class="s-foot">${footer}</div>
</div>`;
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function vResult() {
    const ok = S.items.filter((i) => i.ok).length;
    const n = S.items.length;
    const pct = ok / n;
    const wrong = S.items.filter((i) => !i.ok);
    const msg = pct >= 0.9 ? "Неймовірно! Ти готовий рвати НМТ 🚀" : pct >= 0.7 ? "Дуже добре! Ще трохи, і буде 170+ 💪" : pct >= 0.4 ? "Непогано! Помилки вже в повторенні, далі буде краще 📈" : "Головне, що ти почав. Кожна помилка зараз = бал на іспиті 🌱";
    return `
<div class="result">
  <div class="ring" style="--p:${pct * 100}"><span>${Math.round(pct * 100)}%</span></div>
  <h1>${ok} з ${n} правильно</h1>
  <p class="muted">${msg}</p>
  ${S.mode === "exam" ? `<div class="card big-score"><small class="muted">Орієнтовний бал за шкалою НМТ</small><b>${Math.round(100 + 100 * pct)}</b></div>` : ""}
  <div class="pill">+${S.xp} XP</div>
  ${wrong.length ? `<div class="card"><h2>Розбір помилок</h2>${wrong.map((it) => `
    <div class="mistake">${chip(it.q.subj)}<p><b>${it.q.q}</b></p><p class="ok-txt">✓ ${correctText(it.q)}</p>${it.q.e ? `<p class="muted small">${it.q.e}</p>` : ""}</div>`).join("")}</div>` : ""}
  <div class="row-btns">
    <button class="btn primary big" data-act="home">На головну</button>
    ${wrong.length ? `<button class="btn big" data-act="retry">🔁 Повторити помилки</button>` : ""}
  </div>
</div>`;
  }
  function correctText(q) {
    if (q.t === "single") return q.o[q.a];
    if (q.t === "open") return q.a[0].replace(".", ",");
    if (q.t === "match") return q.l.map((x, i) => `${i + 1}–${L[q.a[i]]} (${q.r[q.a[i]]})`).join("; ");
    if (q.t === "order") return q.items.join(" → ");
  }

  function vReview() {
    const due = dueIds();
    const wrong = wrongIds();
    return `<h1 class="page-h">Помилки й повторення</h1>
<div class="card explain"><p>🧠 Завдання, у яких ти помилився, повертаються <b>сьогодні</b>. Ті, що вже знаєш, повертаються через 1, 3, 7, 14 і 30 днів. Так знання переходять у довготривалу пам'ять і не вилітають на іспиті.</p></div>
<div class="two">
  <div class="card center">
    <div class="big-num">${due.length}</div><p class="muted">пора повторити сьогодні</p>
    <button class="btn primary" data-act="review" ${due.length ? "" : "disabled"}>🔁 Повторити</button>
  </div>
  <div class="card center">
    <div class="big-num">${wrong.length}</div><p class="muted">усіх незакритих помилок</p>
    <button class="btn" data-act="wrong" ${wrong.length ? "" : "disabled"}>Пропрацювати всі</button>
  </div>
</div>
${wrong.length ? `<div class="card"><h2>Де найбільше помилок</h2>${ORDER.map((s) => { const c = wrong.filter((id) => Q[id].subj === s).length; return c ? `<div class="kv">${chip(s)}<b>${c}</b></div>` : ""; }).join("")}</div>` : `<div class="card center muted">Поки помилок немає. Розв'язуй завдання з плану на сьогодні ✨</div>`}`;
  }

  function vExam() {
    return `<h1 class="page-h">Пробний НМТ</h1>
<div class="card explain"><p>Тут усе як на справжньому іспиті: таймер, жодних підказок і правильних відповідей до кінця. Між питаннями можна переходити й змінювати відповіді. Наприкінці отримаєш орієнтовний бал і розбір помилок.</p></div>
<div class="card exam-opt full" data-act="exam" data-s="all">
  <span class="cta-ico">🎓</span><span class="grow"><b>Повний пробний НМТ</b><small class="muted">4 предмети × 8 завдань · 60 хвилин</small></span><span class="arrow">›</span>
</div>
<div class="subj-grid">${ORDER.map((s) => `
  <div class="card exam-opt" data-act="exam" data-s="${s}" style="--c:${SUBJ[s].color}">
    <span class="subj-ico">${SUBJ[s].icon}</span><span class="grow"><b>${SUBJ[s].name}</b><small class="muted">10 завдань · 20 хвилин</small></span><span class="arrow">›</span>
  </div>`).join("")}</div>
${st.tests.length ? `<div class="card"><h2>Історія тестів</h2><table class="hist"><tr><th>Дата</th><th>Предмет</th><th>Результат</th><th>Бал</th></tr>
${st.tests.slice(0, 15).map((t) => `<tr><td>${t.date.slice(5).split("-").reverse().join(".")}</td><td>${t.subj === "all" ? "Повний НМТ" : SUBJ[t.subj].short}</td><td>${t.ok}/${t.total}</td><td><b>${t.score}</b></td></tr>`).join("")}</table></div>` : ""}`;
  }

  function vStats() {
    const lv = level();
    const last = [];
    for (let k = 13; k >= 0; k--) { const d = ymdFromNum(tnum() - k); last.push({ d, n: (st.days[d] || {}).answered || 0 }); }
    const mx = Math.max(10, ...last.map((x) => x.n));
    const ta = totalAnswered(), tc = totalCorrect();
    return `<h1 class="page-h">Мій прогрес</h1>
<div class="stat-row wide">
  <div class="stat card"><div class="stat-v">⭐ ${lv.lv}</div><div class="stat-l">рівень · ${st.xp} XP</div>${bar(lv.cur / lv.need)}</div>
  <div class="stat card"><div class="stat-v">🔥 ${streak()}</div><div class="stat-l">днів поспіль</div></div>
  <div class="stat card"><div class="stat-v">✏️ ${ta}</div><div class="stat-l">відповідей</div></div>
  <div class="stat card"><div class="stat-v">🎯 ${ta ? Math.round((tc / ta) * 100) : 0}%</div><div class="stat-l">точність</div></div>
</div>
<div class="card"><h2>Активність за 2 тижні</h2>
  <div class="chart">${last.map((x) => `<div class="col" title="${x.d}: ${x.n}"><span style="height:${(x.n / mx) * 100}%"></span><small>${x.d.slice(8)}</small></div>`).join("")}</div>
</div>
<div class="card"><h2>Предмети</h2>${ORDER.map((s) => { const x = subjStats(s); return `
  <div class="srow"><div class="kv"><span>${SUBJ[s].icon} ${SUBJ[s].name}</span><b>${x.seen >= 3 ? x.score : "—"}</b></div>${bar(x.m, SUBJ[s].color)}<small class="muted">${x.done}/${x.topics} тем · ${x.seen}/${x.total} завдань</small></div>`; }).join("")}
</div>
<div class="card"><h2>Досягнення</h2><div class="ach-grid">${ACH.map((a) => `
  <div class="ach ${st.ach[a.id] ? "got" : ""}"><span>${a.icon}</span><b>${a.title}</b><small>${a.desc}</small></div>`).join("")}</div></div>`;
  }

  function vTips() {
    return `<a href="#home" class="back">‹ Головна</a>
<h1 class="page-h">🧠 Як скласти НМТ на максимум</h1>
<div class="card theory">
<h3>На самому тесті</h3>
<ol class="tips">
<li><b>Ніколи не залишай питання без відповіді.</b> За неправильну відповідь бали не знімають, тож навіть навмання маєш шанс 20–25%.</li>
<li><b>Спочатку пройди легкі питання.</b> Важке пропусти й повернись до нього в кінці. Не застрягай на одному питанні довше ніж на 2–3 хвилини.</li>
<li><b>Відкидай явно неправильні варіанти.</b> Прибрав 2 із 5, і шанс угадати вже 33%.</li>
<li><b>У завданнях на відповідність</b> починай з пар, у яких певен. Решта часто «складається» сама.</li>
<li><b>У хронології</b> спочатку знайди найдавнішу й найпізнішу події, потім розстав середні.</li>
<li><b>У математиці перевіряй відповідь підстановкою</b>, якщо є час. Відкриту відповідь пиши десятковим дробом через кому.</li>
<li><b>Читай питання до кінця.</b> Слова «НЕ», «помилково», «усі» змінюють усе.</li>
<li><b>Стеж за часом.</b> Залиш 5 хвилин наприкінці, щоб проставити відповіді на пропущені питання.</li>
</ol>
<h3>Підготовка</h3>
<ol class="tips">
<li><b>Щодня, а не багато.</b> 1–1,5 години щодня дають більше, ніж 7 годин у неділю.</li>
<li><b>Не пропускай «Повторення».</b> Саме воно переносить знання в довготривалу пам'ять.</li>
<li><b>Щонеділі роби пробний тест</b>, щоб звикнути до таймера й стресу.</li>
<li><b>За 2 дні до НМТ</b> нічого нового не вчи: тільки повторення й сон.</li>
</ol>
<div class="note">Формат НМТ (кількість завдань, тривалість, перелік предметів) щороку уточнює Український центр оцінювання якості освіти. Перевір актуальні правила на <b>testportal.gov.ua</b>.</div>
</div>`;
  }

  function vSettings() {
    const p = st.profile;
    return `<h1 class="page-h">Налаштування</h1>
<div class="card form">
  <label>Ім'я<input id="f-name" value="${esc(p.name)}" placeholder="Як до тебе звертатись?"></label>
  <label>Дата НМТ<input id="f-date" type="date" value="${p.examDate}"></label>
  <label>Скільки часу на день
    <select id="f-min">${[60, 90, 120].map((m) => `<option value="${m}" ${p.minutes === m ? "selected" : ""}>${m === 60 ? "1 година" : m === 90 ? "1,5 години" : "2 години"}</option>`).join("")}</select></label>
  <label>Тема оформлення
    <select id="f-theme">${[["auto", "Як у системі"], ["light", "Світла"], ["dark", "Темна"]].map(([v, t]) => `<option value="${v}" ${p.theme === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
  <button class="btn primary" data-act="saveSettings">Зберегти</button>
</div>
<div class="card form">
  <h2>Резервна копія прогресу</h2>
  <p class="muted small">Прогрес зберігається лише на цьому пристрої. Щоб перенести його на інший пристрій, експортуй файл і завантаж його там.</p>
  <div class="row-btns"><button class="btn" data-act="export">⬇️ Експорт</button><label class="btn">⬆️ Імпорт<input type="file" id="f-import" accept=".json" hidden></label></div>
</div>
<div class="card form"><button class="btn danger" data-act="reset">Скинути весь прогрес</button></div>`;
  }

  let wStep = 0;
  function vWelcome() {
    const p = st.profile;
    const steps = [
      `<div class="w-ico">🎓</div><h1>Підготовка до НМТ<br>без стресу</h1>
       <p class="muted">Українська мова · Математика · Історія України · Географія</p>
       <ul class="w-list"><li>📅 Готовий план на кожен день: 1–2 години</li><li>📖 Теорія простими словами, лише те, що є на НМТ</li><li>✏️ Завдання точно як на іспиті</li><li>🔁 Розумне повторення помилок</li><li>⏱️ Пробні тести з таймером і прогнозом балу</li></ul>
       <button class="btn primary big" data-act="wnext">Почати ›</button>`,
      `<div class="w-ico">👋</div><h1>Як тебе звати?</h1>
       <input id="w-name" class="big-input" value="${esc(p.name)}" placeholder="Ім'я (необов'язково)">
       <button class="btn primary big" data-act="wnext">Далі ›</button>`,
      `<div class="w-ico">📅</div><h1>Коли твій НМТ?</h1>
       <p class="muted">Основна сесія зазвичай травень–червень. Точну дату можна змінити пізніше.</p>
       <input id="w-date" class="big-input" type="date" value="${p.examDate}">
       <button class="btn primary big" data-act="wnext">Далі ›</button>`,
      `<div class="w-ico">⏰</div><h1>Скільки часу на день?</h1>
       <div class="w-opts">${[[60, "1 година", "спокійний темп"], [90, "1,5 години", "оптимально"], [120, "2 години", "максимальний результат"]].map(([m, t, d]) => `
         <button class="opt ${p.minutes === m ? "sel" : ""}" data-act="wmin" data-v="${m}"><span class="let">${m === 60 ? "🙂" : m === 90 ? "💪" : "🚀"}</span><span><b>${t}</b><br><small class="muted">${d}</small></span></button>`).join("")}</div>
       <button class="btn primary big" data-act="wdone">Створити мій план ›</button>`,
    ];
    return `<div class="welcome"><div class="dots">${steps.map((_, i) => `<i class="${i === wStep ? "on" : ""}"></i>`).join("")}</div>${steps[wStep]}</div>`;
  }

  /* ================= ACTIONS ================= */
  const ACT = {
    task: (d) => { const t = buildPlan().find((x) => x.id === d.id); if (t) sessionFromTask(t); },
    diag: () => startSession({ kind: "diagnostic", title: "Діагностика", ids: diagnosticIds() }),
    bonus: () => startSession({ kind: "mixed", title: "Бонус", ids: mixedIds(null, 10) }),
    mixed: (d) => startSession({ kind: "mixed", title: SUBJ[d.s].name, ids: mixedIds(d.s, 10), subj: d.s }),
    review: () => startSession({ kind: "review", title: "Повторення", ids: dueIds().slice(0, 15), taskId: "review" }),
    wrong: () => startSession({ kind: "review", title: "Помилки", ids: shuffle(wrongIds()).slice(0, 20) }),
    exam: (d) => {
      const all = d.s === "all";
      const ids = examIds(d.s, all ? 8 : 10);
      startSession({ kind: "exam", mode: "exam", subj: d.s, title: all ? "Пробний НМТ" : SUBJ[d.s].name, ids, limit: all ? 3600 : 1200 });
    },
    learned: (d) => {
      const k = d.s + "/" + d.t;
      if (!st.theory[k]) { st.theory[k] = today(); addXP(15); }
      completeTask(`theory:${d.s}:${d.t}`);
      save();
      startSession({ kind: "practice", title: TOPIC[k].title, ids: shuffle(TOPIC[k].qids), taskId: `practice:${d.s}:${d.t}`, subj: d.s });
    },
    pick: (d) => { const it = S.items[S.i]; if (it.checked && S.mode === "learn") return; it.user = +d.v; if (S.mode === "learn") checkCurrent(); else render(); },
    mpick: (d) => { const it = S.items[S.i]; if (it.checked && S.mode === "learn") return; const i = +d.i, j = +d.j; it.user = it.user.map((v, k) => (k !== i && v === j ? null : v)); it.user[i] = it.user[i] === j ? null : j; render(); },
    opick: (d) => { const it = S.items[S.i]; if (it.checked && S.mode === "learn") return; const v = +d.v; const p = it.user.indexOf(v); if (p >= 0) it.user = it.user.slice(0, p); else it.user.push(v); render(); },
    oreset: () => { S.items[S.i].user = []; render(); },
    hint: () => { const it = S.items[S.i]; const wrong = shuffle(it.perm.filter((i) => i !== it.q.a)).slice(0, 2); it.hidden = wrong; it.hint = true; render(); },
    check: () => checkCurrent(),
    next: () => nextItem(),
    prev: () => { if (S.i > 0) { S.i--; render(); } },
    enext: () => { if (S.i < S.items.length - 1) { S.i++; render(); } else confirmFinish(); },
    jump: (d) => { S.i = +d.v; render(); },
    quit: () => {
      if (S.mode === "exam" && !S.finished) { ask("Вийти з тесту?", "Результат цієї спроби не збережеться.", "Вийти").then((y) => { if (y) { clearInterval(timerId); S = null; go("#exam"); } }); return; }
      const n = S.items.filter((i) => i.checked).length;
      const leave = () => { S = null; go("#home"); };
      if (n > 0 && n < S.items.length) ask("Вийти з тренування?", "Відповіді, які ти вже дав, збережено.", "Вийти").then((y) => y && leave());
      else leave();
    },
    home: () => { S = null; go("#home"); },
    retry: () => { const ids = S.items.filter((i) => !i.ok).map((i) => i.id); S = null; startSession({ kind: "review", title: "Робота над помилками", ids: shuffle(ids) }); },
    wnext: () => { const n = $("#w-name"), dt = $("#w-date"); if (n) st.profile.name = n.value.trim().slice(0, 30); if (dt && dt.value) st.profile.examDate = dt.value; wStep++; save(); render(); },
    wmin: (d) => { st.profile.minutes = +d.v; save(); render(); },
    wdone: () => { st.profile.onboarded = true; save(); go("#home"); },
    saveSettings: () => {
      const p = st.profile;
      p.name = $("#f-name").value.trim().slice(0, 30);
      if ($("#f-date").value) p.examDate = $("#f-date").value;
      const m = +$("#f-min").value;
      if (m !== p.minutes) { p.minutes = m; delete day().plan; }
      p.theme = $("#f-theme").value;
      save(); toast("Збережено ✓"); render();
    },
    export: () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(st)], { type: "application/json" }));
      a.download = `nmt-progress-${today()}.json`;
      a.click();
    },
    reset: () => ask("Видалити весь прогрес?", "Це не можна скасувати.", "Видалити").then((y) => { if (y) { st = defaults(); save(); wStep = 0; go("#welcome"); } }),
  };
  function confirmFinish() {
    const left = S.items.filter((i) => !answered(i)).length;
    if (!left) return finishSession();
    ask(`Без відповіді ${left} ${plural(left, "питання", "питання", "питань")}`, "Порада: на НМТ краще відповісти навмання, ніж залишити порожнім, бо за помилку бали не знімають.", "Все одно завершити", "Повернутись").then((y) => y && finishSession());
  }
  function startTimer() {
    clearInterval(timerId);
    const tick = () => {
      const el = $("#timer"); if (!S || S.finished) return clearInterval(timerId);
      const left = Math.max(0, Math.round((S.endsAt - Date.now()) / 1000));
      if (el) { el.textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0"); el.classList.toggle("low", left < 120); }
      if (left <= 0) { toast("⏰ Час вийшов"); finishSession(); }
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const f = ACT[el.dataset.act];
    if (f) { e.preventDefault(); f(el.dataset, el, e); }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "open-input" && S) {
      S.items[S.i].user = e.target.value;
      const b = document.querySelector('[data-act="check"]'); if (b) b.disabled = !answered(S.items[S.i]);
      if (S.mode === "exam") { const dot = document.querySelectorAll(".qdot")[S.i]; if (dot) dot.classList.toggle("ans", answered(S.items[S.i])); }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!S || S.finished || location.hash !== "#session") return;
    const it = S.items[S.i];
    if (e.key === "Enter") { e.preventDefault(); if (S.mode === "exam") ACT.enext(); else if (it.checked) nextItem(); else checkCurrent(); return; }
    if (it.q.t === "single" && !(it.checked && S.mode === "learn") && document.activeElement.tagName !== "INPUT") {
      const k = "12345".indexOf(e.key); const k2 = "абвгд".indexOf(e.key.toLowerCase());
      const idx = k >= 0 ? k : k2;
      if (idx >= 0 && idx < it.perm.length && !(it.hidden && it.hidden.includes(it.perm[idx]))) ACT.pick({ v: it.perm[idx] });
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "f-import" && e.target.files[0]) {
      const r = new FileReader();
      r.onload = () => { try { const s = JSON.parse(r.result); if (s.v !== 1) throw 0; st = Object.assign(defaults(), s); save(); toast("Прогрес завантажено ✓"); render(); } catch (err) { toast("Не вдалося прочитати файл"); } };
      r.readAsText(e.target.files[0]);
    }
  });

  /* ================= FX ================= */
  function ask(title, text, okLabel, cancelLabel = "Скасувати") {
    return new Promise((res) => {
      const m = document.createElement("div");
      m.className = "modal";
      m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="row-btns"><button class="btn" data-m="0">${esc(cancelLabel)}</button><button class="btn primary" data-m="1">${esc(okLabel)}</button></div></div>`;
      m.addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b || e.target === m) { e.stopPropagation(); m.remove(); res(!!(b && b.dataset.m === "1")); } });
      document.body.appendChild(m);
    });
  }
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
  }
  function confetti() {
    const box = document.createElement("div"); box.className = "confetti";
    const em = ["🎉", "⭐", "✨", "💪", "🔥", "🎯"];
    for (let i = 0; i < 28; i++) { const s = document.createElement("span"); s.textContent = pick(em); s.style.left = Math.random() * 100 + "%"; s.style.animationDelay = Math.random() * 0.6 + "s"; s.style.fontSize = 16 + Math.random() * 18 + "px"; box.appendChild(s); }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3200);
  }
  function applyTheme() {
    const t = st.profile.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
  }

  /* ================= BOOT ================= */
  checkAch();
  render();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
