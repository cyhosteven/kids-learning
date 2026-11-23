// 進度、貼紙、設定：只存在這台裝置的 localStorage。
const KEY = "kids-learning.v1";

export const DEFAULT_SETTINGS = { dailyLimitMin: 15, slowSpeech: true, showWords: false };

function blank() {
  return {
    version: 1,
    items: {},          // id -> { box, right, wrong, last (YYYY-MM-DD), priority }
    stickers: [],       // 已得到的 id
    streak: 0,          // 連續第一次就答對的題數（決定選項數）
    choices: 2,         // 目前每題幾個選項
    play: {},           // 日期 -> 秒
    extraMin: {},       // 日期 -> 家長加的分鐘
    settings: { ...DEFAULT_SETTINGS },
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return normalize(JSON.parse(raw));
  } catch (e) {
    return blank();
  }
}

function normalize(s) {
  const b = blank();
  if (!s || typeof s !== "object") return b;
  return {
    ...b, ...s,
    items: s.items && typeof s.items === "object" ? s.items : {},
    stickers: Array.isArray(s.stickers) ? s.stickers : [],
    play: s.play && typeof s.play === "object" ? s.play : {},
    extraMin: s.extraMin && typeof s.extraMin === "object" ? s.extraMin : {},
    settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
    choices: s.choices === 3 ? 3 : 2,
  };
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 無痕或空間滿：這次不存 */ }
}

export const store = () => state;

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function itemState(id) {
  if (!state.items[id]) state.items[id] = { box: 0, right: 0, wrong: 0, last: "", priority: false };
  return state.items[id];
}

export function addPlaySeconds(sec) {
  const d = today();
  state.play[d] = (state.play[d] || 0) + sec;
}

export function playedMinutesToday() {
  return Math.floor((state.play[today()] || 0) / 60);
}

export function limitReached() {
  const lim = state.settings.dailyLimitMin;
  if (!lim) return false;
  return playedMinutesToday() >= lim + (state.extraMin[today()] || 0);
}

export function addExtraMinutes(min) {
  const d = today();
  state.extraMin[d] = (state.extraMin[d] || 0) + min;
  save();
}

export function exportJson() {
  return JSON.stringify({ app: "kids-learning", exported: new Date().toISOString(), data: state }, null, 1);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.app !== "kids-learning" || !parsed.data) throw new Error("這不是本遊戲匯出的進度檔");
  state = normalize(parsed.data);
  save();
}

export function resetAll() {
  const settings = state.settings;
  state = blank();
  state.settings = settings;
  save();
}
