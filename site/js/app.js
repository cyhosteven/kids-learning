// 畫面切換與互動。規格：docs/10_共用遊戲規格.md、20_科目_英文單字.md、40_安全與家長.md
import { loadItems, renderPicture } from "./content.js";
import {
  store, save, addPlaySeconds, playedMinutesToday, limitReached, addExtraMinutes,
  exportJson, importJson, resetAll, today,
} from "./storage.js";
import { buildRound, optionsFor, recordAnswer, finishRound, mastery, ROUND_SIZE } from "./engine.js";
import { say, stopSpeech, unlock, setSlow, hasVoice, chimeRight, chimeSoft, chimeReward } from "./speech.js";

const THEME = "zoo";
const PRAISE = ["Great job!", "Good job!", "Yay!", "Well done!", "You got it!"];
const $ = (id) => document.getElementById(id);

let items = [];
let round = null;      // { questions, index, wrongs, firstTry, target, busy }
let current = "start";

// ---------------------------------------------------------------- 畫面
function show(name) {
  stopSpeech();
  current = name;
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("active", s.id === `screen-${name}`);
}

function showWordsNow() {
  return store().settings.showWords || !hasVoice("en");
}

// ---------------------------------------------------------------- 首頁
function goHome() {
  show("home");
  const got = store().stickers.map((id) => items.find((it) => it.id === id)).filter(Boolean);
  $("homeStickers").textContent = got.map((it) => it.image.replace(/^emoji:/, "")).join(" ");
}

// ---------------------------------------------------------------- 一回合
function startRound() {
  if (limitReached()) return goRest();
  round = { questions: buildRound(items), index: 0, wrongs: 0, firstTry: true, target: null, busy: false };
  show("game");
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
  round.target = target;
  round.firstTry = true;
  round.busy = false;
  renderDots();
  const opts = optionsFor(target, items);
  const box = $("options");
  box.className = "options" + (opts.length >= 3 ? " three" : "");
  box.innerHTML = "";
  const words = showWordsNow();
  for (const it of opts) {
    const card = document.createElement("button");
    card.className = "card";
    card.setAttribute("aria-label", it.英文);
    const pic = document.createElement("div");
    pic.className = "pic";
    renderPicture(it, pic);
    card.appendChild(pic);
    if (words) {
      const w = document.createElement("div");
      w.className = "word";
      w.textContent = it.英文;
      card.appendChild(w);
    }
    card.addEventListener("click", () => onPick(card, it));
    box.appendChild(card);
  }
  if (first) await speak(() => say("聽聽看，哪一個是", "zh"));
  if (round && round.target === target) speakTarget();
}

async function speak(fn) {
  $("btnReplay").classList.add("speaking");
  try { await fn(); } finally { $("btnReplay").classList.remove("speaking"); }
}

function speakTarget() {
  if (!round || !round.target) return;
  stopSpeech();
  return speak(() => say(round.target.英文, "en"));
}

async function onPick(card, it) {
  if (!round || round.busy) return;
  const target = round.target;
  if (it.id === target.id) {
    round.busy = true;
    stopSpeech();
    card.classList.add("right");
    chimeRight();
    recordAnswer(target, round.firstTry, round);
    await say(PRAISE[Math.floor(Math.random() * PRAISE.length)], "en");
    await wait(500);
    if (!round || current !== "game") return;
    round.index += 1;
    nextQuestion();
  } else {
    round.firstTry = false;
    card.classList.add("wrong");
    chimeSoft();
    stopSpeech();
    await speak(() => say("再聽一次喔", "zh"));
    if (round && round.target === target && current === "game") speakTarget();
  }
}

async function endRound() {
  const r = round;
  round = null;
  const { sticker, isNewSticker } = finishRound(r, items);
  show("reward");
  const box = $("rewardSticker");
  if (sticker) renderPicture(sticker, box); else box.textContent = "⭐";
  $("rewardWord").textContent = sticker && showWordsNow() ? sticker.英文 : "";
  chimeReward();
  await wait(700);
  if (current !== "reward") return;
  await say(isNewSticker ? "You got a sticker!" : "Great job!", "en");
  if (sticker && current === "reward") await say(sticker.英文, "en");
}

// ---------------------------------------------------------------- 貼紙本
function goBook() {
  show("book");
  const grid = $("bookGrid");
  grid.innerHTML = "";
  const got = new Set(store().stickers);
  for (const it of [...items].sort((a, b) => a.level - b.level)) {
    const slot = document.createElement("button");
    const has = got.has(it.id);
    slot.className = "slot " + (has ? "got" : "locked");
    slot.setAttribute("aria-label", has ? it.英文 : "還沒拿到");
    renderPicture(it, slot);
    slot.addEventListener("click", () => {
      if (has) { stopSpeech(); say(it.英文, "en"); } else chimeSoft();
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
    btn.addEventListener("click", () => (v === answer ? goParent() : goHome()));
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
  const warn = [];
  if (!hasVoice("en")) warn.push("這台裝置找不到英文語音，圖卡下會改顯示英文字。");
  if (!hasVoice("zh")) warn.push("這台裝置找不到華語語音，華語提示會沒有聲音。");
  $("voiceWarn").hidden = !warn.length;
  $("voiceWarn").textContent = warn.join(" ");
  renderProgress();
}

function renderProgress() {
  const t = $("progressTable");
  t.innerHTML = "<thead><tr><th>動物</th><th>英文</th><th>華語</th><th>熟練度</th><th>答對</th><th>答錯</th><th>最後練習</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const it of [...items].sort((a, b) => a.level - b.level)) {
    const m = mastery(it);
    const tr = body.insertRow();
    tr.insertCell().textContent = it.image.replace(/^emoji:/, "");
    tr.insertCell().textContent = it.英文;
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
  $("btnParentBack").addEventListener("click", goHome);
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
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    const offer = (worker) => {
      $("btnUpdate").hidden = false;
      $("btnUpdate").onclick = () => worker.postMessage("skipWaiting");
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
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

// ---------------------------------------------------------------- 啟動
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function init() {
  setSlow(store().settings.slowSpeech);
  try {
    items = await loadItems(THEME);
    if (!items.length) throw new Error("內容是空的");
  } catch (e) {
    $("loadError").hidden = false;
    $("loadError").textContent = `載入失敗：${e.message}。請檢查網路後重新整理。`;
    $("btnStart").disabled = true;
    return;
  }
  $("btnStart").addEventListener("click", () => {
    unlock();
    say("我們去動物園吧", "zh");    // 第一次出聲要在點擊裡，iPad 才會解鎖語音
    goHome();
  });
  $("btnPlay").addEventListener("click", () => { unlock(); startRound(); });
  $("btnBook").addEventListener("click", goBook);
  $("btnBookBack").addEventListener("click", goHome);
  $("btnQuit").addEventListener("click", () => { round = null; goHome(); });
  $("btnReplay").addEventListener("click", () => speakTarget());
  $("btnAgain").addEventListener("click", startRound);
  $("btnRewardHome").addEventListener("click", goHome);
  $("btnRestHome").addEventListener("click", goHome);
  $("btnParent").addEventListener("click", goGate);
  $("btnGateCancel").addEventListener("click", goHome);
  bindParent();
  // 長按圖片、雙指縮放
  document.addEventListener("contextmenu", (e) => { if (current !== "parent") e.preventDefault(); });
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  registerSw();
}

init();
