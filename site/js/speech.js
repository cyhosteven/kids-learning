// 語音（瀏覽器內建 Web Speech API）與音效（Web Audio 合成）。
// 瀏覽器規定要先有使用者點擊才能出聲：開始畫面的按鈕呼叫 unlock()。

let voices = { en: null, zh: null };
let audioCtx = null;
let slow = true;

const EN_PREFER = [/samantha/i, /google us english/i, /aria/i, /jenny/i, /zira/i, /ava/i, /allison/i];
const ZH_PREFER = [/mei-?jia/i, /台灣|臺灣|taiwan/i, /hsiaochen|hsiaoyu|hanhan|yating|zhiwei/i];

function pick(list, langRe, prefer) {
  const cands = list.filter((v) => langRe.test(v.lang.replace("_", "-")));
  for (const re of prefer) {
    const hit = cands.find((v) => re.test(v.name));
    if (hit) return hit;
  }
  return cands.find((v) => v.localService) || cands[0] || null;
}

function refreshVoices() {
  if (!("speechSynthesis" in window)) return;
  const list = speechSynthesis.getVoices();
  voices.en = pick(list, /^en-US/i, EN_PREFER) || pick(list, /^en/i, EN_PREFER);
  voices.zh = pick(list, /^zh-TW/i, ZH_PREFER) || pick(list, /^zh/i, ZH_PREFER);
}

if ("speechSynthesis" in window) {
  refreshVoices();
  speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
}

export function setSlow(v) { slow = !!v; }

export function hasVoice(lang) {
  refreshVoices();
  return !!voices[lang];
}

/** 念一句；回傳在念完時 resolve 的 Promise（最多等 6 秒，避免某些瀏覽器不回報 end）。 */
// 網址加 ?mute：不念（自動測試用，免得每句都要等）
const MUTED = new URLSearchParams(location.search).has("mute");

export function say(text, lang = "en") {
  return new Promise((resolve) => {
    if (MUTED || !("speechSynthesis" in window)) return resolve();
    refreshVoices();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices[lang];
    if (v) u.voice = v;
    u.lang = v ? v.lang : lang === "en" ? "en-US" : "zh-TW";
    u.rate = lang === "en" ? (slow ? 0.75 : 0.95) : (slow ? 0.95 : 1.05);
    u.pitch = 1.05;
    const done = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(done, 6000);
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}

export function stopSpeech() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

export function unlock() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !audioCtx) audioCtx = new AC();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { /* 沒有音效也能玩 */ }
}

function tone(freq, start, dur, type = "sine", gain = 0.18) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + start;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** 答對：上行三音。 */
export function chimeRight() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.28)); }
/** 答錯：輕柔的低音，不刺耳。 */
export function chimeSoft() { tone(330, 0, 0.22, "triangle", 0.12); }
/** 得到貼紙：小段旋律。 */
export function chimeReward() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3)); }
