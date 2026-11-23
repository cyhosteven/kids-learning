// 畫面切換與互動。規格：docs/10_共用遊戲規格.md、20_科目_英文單字.md、30_單元與詞彙.md、40_安全與家長.md
import { loadContent, renderPicture, pictureText } from "./content.js";
import {
  store, save, addPlaySeconds, playedMinutesToday, limitReached, addExtraMinutes,
  exportJson, importJson, resetAll, today,
} from "./storage.js";
import {
  buildRound, optionsFor, recordAnswer, finishRound, mastery, unitStars, recommendedUnit, questionKind, ROUND_SIZE,
} from "./engine.js";
import {
  say, playEn, preload, stopSpeech, unlock, setSlow, hasVoice, chimeRight, chimeSoft, chimePop, chimeReward,
} from "./speech.js";
import { mascotSvg } from "./mascot.js";

const PRAISE = ["praise_1", "praise_2", "praise_3", "praise_4", "praise_5", "praise_6"];
const PRAISE_TEXT = ["Great job!", "Good job!", "Yay!", "Well done!", "You got it!", "Awesome!"];
const BALLOON_COLORS = ["#ff6f61", "#4fc3f7", "#ffd54f", "#81c784", "#ba68c8"];
const $ = (id) => document.getElementById(id);

let content = { units: [], items: [] };
let round = null;      // { unit, questions, kinds, index, wrongs, firstTry, target, busy }
let current = "start";
let bookUnit = null;
let mapGreeted = false;

// ---------------------------------------------------------------- 共用
function show(name) {
  stopSpeech();
  current = name;
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("active", s.id === `screen-${name}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const showWordsNow = () => store().settings.showWords;
const zhOrEn = (zh, enClip, enText) => (hasVoice("zh") ? say(zh, "zh") : playEn(enClip, enText));

function setMascot(el, mood = "happy") { el.innerHTML = mascotSvg(mood); }

function hop(el) {
  el.classList.remove("hop");
  void el.offsetWidth;
  el.classList.add("hop");
}

function confetti(x, y, n = 26) {
  const fx = $("fx");
  const colors = ["#ff6f61", "#ffd54f", "#4fc3f7", "#81c784", "#ba68c8", "#ff8a3d"];
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span");
    p.className = "confetti-bit";
    const ang = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 160;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(ang) * dist - 60}px`);
    p.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    fx.appendChild(p);
    setTimeout(() => p.remove(), 1100);
  }
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

// ---------------------------------------------------------------- 地圖
function goMap() {
  show("map");
  const grid = $("unitGrid");
  grid.innerHTML = "";
  const rec = recommendedUnit(content.units);
  for (const u of content.units) {
    const stars = unitStars(u);
    const tile = document.createElement("button");
    tile.className = "unit" + (rec && rec.id === u.id ? " recommended" : "");
    tile.style.setProperty("--unit-color", u.color || "#fff");
    tile.setAttribute("aria-label", `${u.華語} ${u.英文}`);
    tile.innerHTML = `<span class="unit-icon">${u.icon}</span><span class="unit-name">${u.華語}</span>` +
      `<span class="unit-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>`;
    tile.addEventListener("click", () => startUnit(u, tile));
    grid.appendChild(tile);
  }
  setMascot($("mapMascot"));
  if (!mapGreeted) {
    mapGreeted = true;
    zhOrEn("點一個你喜歡的地方", "lets_play", "Let's play!");
  }
}

async function startUnit(u, tile) {
  unlock();
  if (limitReached()) return goRest();
  tile.classList.add("chosen");
  preload(u.items.flatMap((it) => [it.id, it.id + "_s"]).concat(PRAISE, ["sticker", "again"]));
  stopSpeech();
  if (hasVoice("zh")) await say(u.華語, "zh");
  await playEn("u_" + u.id, u.英文);
  startRound(u);
}

// ---------------------------------------------------------------- 一回合
function startRound(u) {
  if (limitReached()) return goRest();
  const questions = buildRound(u.items);
  round = {
    unit: u, questions, kinds: questions.map((it, i) => questionKind(it, i)),
    index: 0, wrongs: 0, firstTry: true, target: null, busy: false,
  };
  show("game");
  setMascot($("gameMascot"));
  document.body.style.setProperty("--unit-color", u.color || "#fff");
  nextQuestion(true);
}

function renderDots() {
  $("dots").innerHTML = "";
  for (let i = 0; i < ROUND_SIZE; i++) {
    const d = document.createElement("span");
    d.className = "dot" + (i < round.index ? " done" : i === round.index ? " now" : "");
    $("dots").appendChild(d);
  }
}

async function nextQuestion(first = false) {
  if (round.index >= round.questions.length) return endRound();
  const target = round.questions[round.index];
  const kind = round.kinds[round.index];
  round.target = target;
  round.kind = kind;
  round.firstTry = true;
  round.busy = false;
  renderDots();
  const opts = optionsFor(target, round.unit.items);
  const box = $("options");
  box.className = "options" + (opts.length >= 3 ? " three" : "") + (kind === "balloon" ? " balloons" : "");
  box.innerHTML = "";
  opts.forEach((it, i) => {
    const card = document.createElement("button");
    card.className = "card";
    card.setAttribute("aria-label", it.英文);
    if (kind === "balloon") {
      card.style.setProperty("--balloon", BALLOON_COLORS[(i + round.index) % BALLOON_COLORS.length]);
      card.style.setProperty("--float-delay", `${-i * 0.9}s`);
      card.style.setProperty("--float-dur", `${2.6 + i * 0.4}s`);
    }
    const pic = document.createElement("div");
    pic.className = "pic";
    renderPicture(it, pic);
    card.appendChild(pic);
    if (showWordsNow()) {
      const w = document.createElement("div");
      w.className = "word";
      w.textContent = it.英文;
      card.appendChild(w);
    }
    card.addEventListener("click", () => onPick(card, it));
    box.appendChild(card);
  });
  if (first) await speak(() => zhOrEn("聽聽看，哪一個是", "lets_play", "Let's play!"));
  if (round && round.target === target) speakTarget();
}

async function speak(fn) {
  $("btnReplay").classList.add("speaking");
  try { await fn(); } finally { $("btnReplay").classList.remove("speaking"); }
}

function speakTarget() {
  if (!round || !round.target) return;
  const t = round.target;
  return round.kind === "sentence"
    ? speak(() => playEn(t.id + "_s", t.sentence))
    : speak(() => playEn(t.id, t.英文));
}

async function onPick(card, it) {
  if (!round || round.busy) return;
  const target = round.target;
  if (it.id === target.id) {
    round.busy = true;
    stopSpeech();
    card.classList.add(round.kind === "balloon" ? "popped" : "right");
    const [x, y] = centerOf(card);
    confetti(x, y);
    if (round.kind === "balloon") chimePop();
    chimeRight();
    hop($("gameMascot"));
    setMascot($("gameMascot"), "cheer");
    recordAnswer(target, round.firstTry, round);
    const k = Math.floor(Math.random() * PRAISE.length);
    await playEn(PRAISE[k], PRAISE_TEXT[k]);
    await wait(350);
    if (!round || current !== "game") return;
    setMascot($("gameMascot"));
    round.index += 1;
    nextQuestion();
  } else {
    round.firstTry = false;
    card.classList.add("wrong");
    chimeSoft();
    stopSpeech();
    await speak(() => zhOrEn("再聽一次喔", "again", "Let's listen again."));
    if (round && round.target === target && current === "game") speakTarget();
  }
}

async function endRound() {
  const r = round;
  round = null;
  const { sticker, isNewSticker } = finishRound(r);
  show("reward");
  setMascot($("rewardMascot"), "cheer");
  const box = $("rewardSticker");
  if (sticker) renderPicture(sticker, box); else box.textContent = "⭐";
  $("rewardWord").textContent = sticker && showWordsNow() ? sticker.英文 : "";
  $("btnAgain").onclick = () => startRound(r.unit);
  chimeReward();
  setTimeout(() => { if (current === "reward") { const [x, y] = centerOf(box); confetti(x, y, 40); } }, 150);
  await wait(800);
  if (current !== "reward") return;
  await playEn(isNewSticker ? "sticker" : "praise_1", isNewSticker ? "You got a sticker!" : "Great job!");
  if (sticker && current === "reward") await playEn(sticker.id, sticker.英文);
}

// ---------------------------------------------------------------- 貼紙本
function goBook(unitId) {
  show("book");
  const got = new Set(store().stickers);
  bookUnit = unitId || bookUnit || content.units[0].id;
  const tabs = $("bookTabs");
  tabs.innerHTML = "";
  for (const u of content.units) {
    const n = u.items.filter((it) => got.has(it.id)).length;
    const t = document.createElement("button");
    t.className = "tab" + (u.id === bookUnit ? " active" : "");
    t.innerHTML = `${u.icon}${n ? `<span class="tab-n">${n}</span>` : ""}`;
    t.setAttribute("aria-label", u.華語);
    t.addEventListener("click", () => goBook(u.id));
    tabs.appendChild(t);
  }
  const unit = content.units.find((u) => u.id === bookUnit);
  const total = got.size;
  $("bookCount").textContent = `${total} / ${content.items.length}`;
  const grid = $("bookGrid");
  grid.innerHTML = "";
  for (const it of [...unit.items].sort((a, b) => a.level - b.level || a.order - b.order)) {
    const slot = document.createElement("button");
    const has = got.has(it.id);
    slot.className = "slot " + (has ? "got" : "locked");
    slot.setAttribute("aria-label", has ? it.英文 : "還沒拿到");
    renderPicture(it, slot);
    slot.addEventListener("click", () => {
      if (has) { hop(slot); playEn(it.id, it.英文); } else chimeSoft();
    });
    grid.appendChild(slot);
  }
}

// ---------------------------------------------------------------- 休息
function goRest() {
  show("rest");
  say("今天玩夠囉，休息一下，讓眼睛看看遠方", "zh");
}

// ---------------------------------------------------------------- 家長鎖
function goGate() {
  show("gate");
  const a = 6 + Math.floor(Math.random() * 4);
  const b = 5 + Math.floor(Math.random() * 5);
  const answer = a + b;
  $("gateQuestion").textContent = `${a} + ${b} = ?`;
  const choices = new Set([answer]);
  while (choices.size < 4) choices.add(answer + Math.floor(Math.random() * 9) - 4);
  $("gateAnswers").innerHTML = "";
  for (const v of [...choices].sort(() => Math.random() - 0.5)) {
    const btn = document.createElement("button");
    btn.textContent = v;
    btn.addEventListener("click", () => (v === answer ? goParent() : goMap()));
    $("gateAnswers").appendChild(btn);
  }
}

// ---------------------------------------------------------------- 家長頁
function goParent() {
  show("parent");
  const s = store().settings;
  $("setLimit").value = String(s.dailyLimitMin);
  $("setSpeed").value = s.slowSpeech ? "slow" : "normal";
  $("setWords").checked = !!s.showWords;
  $("appVersion").textContent = self.APP_VERSION;
  $("curChoices").textContent = store().choices;
  const lim = s.dailyLimitMin;
  const extra = store().extraMin[today()] || 0;
  $("todayPlay").textContent = `今天已玩 ${playedMinutesToday()} 分鐘` +
    (lim ? `（上限 ${lim} 分鐘${extra ? `，今天另加 ${extra} 分鐘` : ""}）` : "（不限時間）");
  $("voiceWarn").hidden = hasVoice("zh");
  $("voiceWarn").textContent = "這台裝置找不到華語語音，華語提示會改用英文。";
  const sum = $("unitSummary");
  sum.innerHTML = "";
  for (const u of content.units) {
    const learned = u.items.filter((it) => mastery(it).last).length;
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = `${u.icon} ${u.華語} ${learned}/${u.items.length}`;
    sum.appendChild(chip);
  }
  const sel = $("progressUnit");
  if (!sel.options.length) {
    for (const u of content.units) sel.add(new Option(`${u.icon} ${u.華語}`, u.id));
  }
  renderProgress();
}

function renderProgress() {
  const unit = content.units.find((u) => u.id === $("progressUnit").value) || content.units[0];
  const t = $("progressTable");
  t.innerHTML = "<thead><tr><th>圖</th><th>英文</th><th>華語</th><th>熟練度</th><th>答對</th><th>答錯</th><th>最後練習</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const it of [...unit.items].sort((a, b) => a.level - b.level || a.order - b.order)) {
    const m = mastery(it);
    const tr = body.insertRow();
    tr.insertCell().textContent = pictureText(it);
    const en = tr.insertCell();
    const b = document.createElement("button");
    b.className = "link-btn";
    b.textContent = `🔈 ${it.英文}`;
    b.addEventListener("click", () => { unlock(); playEn(it.id, it.英文); });
    en.appendChild(b);
    tr.insertCell().textContent = it.華語;
    const stars = tr.insertCell();
    stars.className = m.last ? "stars" : "none";
    stars.textContent = m.last ? "★".repeat(m.box) + "☆".repeat(5 - m.box) : "還沒學";
    tr.insertCell().textContent = m.right;
    tr.insertCell().textContent = m.wrong;
    tr.insertCell().textContent = m.last || "—";
  }
  t.appendChild(body);
}

function bindParent() {
  $("setLimit").addEventListener("change", () => { store().settings.dailyLimitMin = Number($("setLimit").value); save(); goParent(); });
  $("setSpeed").addEventListener("change", () => {
    store().settings.slowSpeech = $("setSpeed").value === "slow"; save(); setSlow(store().settings.slowSpeech);
  });
  $("setWords").addEventListener("change", () => { store().settings.showWords = $("setWords").checked; save(); });
  $("progressUnit").addEventListener("change", renderProgress);
  $("btnExtra").addEventListener("click", () => { addExtraMinutes(10); goParent(); msg("今天多了 10 分鐘。"); });
  $("btnExport").addEventListener("click", () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kids-learning-進度-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    msg("已匯出。請把檔案存在安全的地方。");
  });
  $("fileImport").addEventListener("change", async () => {
    const f = $("fileImport").files[0];
    if (!f) return;
    try {
      importJson(await f.text());
      setSlow(store().settings.slowSpeech);
      goParent();
      msg("已匯入進度。");
    } catch (e) {
      msg(`匯入失敗：${e.message}`);
    }
    $("fileImport").value = "";
  });
  $("btnReset").addEventListener("click", () => {
    if (!confirm("確定要清除所有進度和貼紙嗎？（設定會保留）")) return;
    resetAll();
    goParent();
    msg("已全部重設。");
  });
  $("btnParentBack").addEventListener("click", goMap);
}

function msg(text) { $("parentMsg").textContent = text; }

// ---------------------------------------------------------------- 遊玩時間
setInterval(() => {
  if (document.visibilityState === "visible" && ["game", "reward", "book"].includes(current)) {
    addPlaySeconds(5);
    save();
  }
}, 5000);

// ---------------------------------------------------------------- 更新（service worker）
function registerSw() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  // 只有按了「更新」才重新整理；第一次安裝時 service worker 接管頁面也會觸發 controllerchange，不能因此重整
  let updating = false;
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    const offer = (worker) => {
      $("btnUpdate").hidden = false;
      $("btnUpdate").onclick = () => { updating = true; worker.postMessage("skipWaiting"); };
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w && w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) offer(w);
      });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => { /* 沒有離線功能也能玩 */ });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updating) return;
    updating = false;
    location.reload();
  });
}

// ---------------------------------------------------------------- 啟動
async function init() {
  setSlow(store().settings.slowSpeech);
  setMascot($("startMascot"));
  try {
    content = await loadContent();
    if (!content.units.length) throw new Error("內容是空的");
  } catch (e) {
    $("loadError").hidden = false;
    $("loadError").textContent = `載入失敗：${e.message}。請檢查網路後重新整理。`;
    $("btnStart").disabled = true;
    return;
  }
  preload(["lets_play", "again", ...PRAISE]);
  $("btnStart").addEventListener("click", () => {
    unlock();
    hop($("startMascot"));
    goMap();
  });
  $("btnBook").addEventListener("click", () => goBook());
  $("btnBookBack").addEventListener("click", goMap);
  $("btnQuit").addEventListener("click", () => { round = null; goMap(); });
  $("btnReplay").addEventListener("click", () => { stopSpeech(); speakTarget(); });
  $("btnRewardHome").addEventListener("click", goMap);
  $("btnRestHome").addEventListener("click", goMap);
  $("btnParent").addEventListener("click", goGate);
  $("btnGateCancel").addEventListener("click", goMap);
  bindParent();
  // 長按圖片、雙指縮放
  document.addEventListener("contextmenu", (e) => { if (current !== "parent") e.preventDefault(); });
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  registerSw();
}

init();
