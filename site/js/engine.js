// 選題（間隔重複）、選項、答題紀錄。規格：docs/10_共用遊戲規格.md
import { itemState, store, today, save } from "./storage.js";

export const ROUND_SIZE = 6;
const MAX_NEW = 2;
const MAX_REVIEW_WHEN_NEW = ROUND_SIZE - MAX_NEW;
const DUE_DAYS = [0, 0, 1, 2, 4, 7];       // 熟練度 n 的東西，隔幾天才算該複習
const LEVEL_UP_STREAK = 6;                   // 連續第一次就答對幾題 → 3 個選項
const LEVEL_DOWN_WRONGS = 2;                 // 3 個選項時一回合錯幾題 → 下回合回到 2 個

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [ty, tm, td] = today().split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isNew = (it) => { const s = itemState(it.id); return s.box === 0 && !s.last; };

/** 一回合的題目（item 陣列，可重複，同一個不連續出現）。items＝同一個單元的字。 */
export function buildRound(items) {
  const st = (it) => itemState(it.id);
  const learned = items.filter((it) => !isNew(it));
  const fresh = items.filter(isNew).sort((a, b) => a.level - b.level);

  const priority = learned.filter((it) => st(it).priority).sort((a, b) => st(a).box - st(b).box);
  const due = learned
    .filter((it) => !st(it).priority && daysSince(st(it).last) >= DUE_DAYS[Math.min(st(it).box, 5)])
    .sort((a, b) => st(a).box - st(b).box || (st(a).last < st(b).last ? -1 : 1));
  const notDue = learned
    .filter((it) => !priority.includes(it) && !due.includes(it))
    .sort((a, b) => st(a).box - st(b).box);

  const newOnes = fresh.slice(0, MAX_NEW);
  const reviewCap = newOnes.length ? MAX_REVIEW_WHEN_NEW : ROUND_SIZE;
  const picks = [...priority, ...due].slice(0, reviewCap);
  picks.push(...newOnes);
  for (const it of notDue) if (picks.length < ROUND_SIZE) picks.push(it);

  // 不夠 6 題：重複新的東西（新東西本來就該多聽幾次），再不夠就重複全部
  const pool = newOnes.length ? newOnes : picks.slice();
  let k = 0;
  while (picks.length < ROUND_SIZE && pool.length) picks.push(pool[k++ % pool.length]);

  return spread(shuffle(picks));
}

/** 重排成同一個東西不連續出現（做不到就盡量）。 */
function spread(list) {
  const out = [];
  const rest = list.slice();
  while (rest.length) {
    const i = rest.findIndex((it) => !out.length || it.id !== out[out.length - 1].id);
    out.push(rest.splice(i === -1 ? 0 : i, 1)[0]);
  }
  return out;
}

/** 題目的選項（含正解，已打亂）。 */
export function optionsFor(target, items) {
  const n = store().choices;
  const others = shuffle(items.filter((it) => it.id !== target.id)).slice(0, n - 1);
  return shuffle([target, ...others]);
}

/** 記錄一題的結果。firstTry：第一次就點對。 */
export function recordAnswer(item, firstTry, round) {
  const s = itemState(item.id);
  const data = store();
  if (firstTry) {
    s.box = Math.min(5, s.box + 1);
    s.right += 1;
    s.priority = false;
    data.streak += 1;
    if (data.choices === 2 && data.streak >= LEVEL_UP_STREAK) { data.choices = 3; data.streak = 0; }
  } else {
    s.box = 1;
    s.wrong += 1;
    s.priority = true;
    data.streak = 0;
    round.wrongs += 1;
  }
  s.last = today();
  save();
}

/** 回合結束：調整選項數、決定貼紙。回傳 { sticker: item|null, isNewSticker }。 */
export function finishRound(round) {
  const data = store();
  if (data.choices === 3 && round.wrongs >= LEVEL_DOWN_WRONGS) { data.choices = 2; data.streak = 0; }
  const practiced = [...new Map(round.questions.map((it) => [it.id, it])).values()];
  // 貼紙只給這回合練過的（貼紙本＝認識過的動物）；都拿過了就再秀一次，不給新的
  const missing = practiced.filter((it) => !data.stickers.includes(it.id));
  const pickFrom = missing.length ? missing : practiced;
  const sticker = pickFrom[Math.floor(Math.random() * pickFrom.length)] || null;
  const isNewSticker = !!sticker && missing.length > 0;
  if (isNewSticker) data.stickers.push(sticker.id);
  save();
  return { sticker, isNewSticker };
}

export function mastery(item) {
  return itemState(item.id);
}

/** 單元星星 0～3：學過 ≥1/3、學過 ≥2/3、全部熟練度 ≥3。 */
export function unitStars(unit) {
  const n = unit.items.length;
  const learned = unit.items.filter((it) => !isNew(it)).length;
  const solid = unit.items.every((it) => itemState(it.id).box >= 3);
  return (learned >= n / 3 ? 1 : 0) + (learned >= (2 * n) / 3 ? 1 : 0) + (solid ? 1 : 0);
}

/** 建議的下一個單元：依順序第一個還沒 2 顆星的。 */
export function recommendedUnit(units) {
  return units.find((u) => unitStars(u) < 2) || null;
}

/** 這題用哪種題型：氣球（第 3、6 題）、句子（熟練度 ≥2 的字，一半機率）、單字。 */
export function questionKind(item, index) {
  if (index === 2 || index === 5) return "balloon";
  if (item.sentence && itemState(item.id).box >= 2 && Math.random() < 0.5) return "sentence";
  return "word";
}
