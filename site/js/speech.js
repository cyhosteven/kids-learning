// 聲音：英文用預先產生的音檔（audio/en/*.mp3，Web Audio 播放），找不到才用瀏覽器語音；
// 華語提示用裝置語音；音效用 Web Audio 合成。
// 瀏覽器規定要先有使用者點擊才能出聲：開始畫面的按鈕呼叫 unlock()。

let voices = { en: null, zh: null };
let audioCtx = null;
let slow = true;
let currentSource = null;
const raw = new Map();       // 檔名 -> Promise<ArrayBuffer|null>
const decoded = new Map();   // 檔名 -> AudioBuffer

// 網址加 ?mute：不出聲（自動測試用，免得每句都要等）
const MUTED = new URLSearchParams(location.search).has("mute");

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

/** 瀏覽器語音念一句；念完 resolve（最多等 6 秒，避免某些瀏覽器不回報 end）。 */
export function say(text, lang = "zh") {
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

function fetchClip(name) {
  if (!raw.has(name)) {
    raw.set(name, fetch(`./audio/en/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null));
  }
  return raw.get(name);
}

function decode(buf) {
  // 舊版 Safari 的 decodeAudioData 只支援 callback
  return new Promise((resolve, reject) => audioCtx.decodeAudioData(buf.slice(0), resolve, reject));
}

async function getBuffer(name) {
  if (decoded.has(name)) return decoded.get(name);
  const buf = await fetchClip(name);
  if (!buf || !audioCtx) return null;
  try {
    const ab = await decode(buf);
    decoded.set(name, ab);
    return ab;
  } catch (e) {
    return null;
  }
}

/** 先下載一批音檔（例如一個單元的），之後播放不用等。 */
export function preload(names) {
  for (const n of names) fetchClip(n);
}

/** 播英文音檔；沒有音檔就用瀏覽器英文語音念 fallback。播完 resolve。 */
export async function playEn(name, fallback) {
  if (MUTED) return;
  stopSpeech();
  const buffer = await getBuffer(name);
  if (!buffer) return fallback ? say(fallback, "en") : undefined;
  if (audioCtx.state === "suspended") { try { await audioCtx.resume(); } catch (e) { /* ignore */ } }
  return new Promise((resolve) => {
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = slow ? 1 : 1.08;
    src.connect(audioCtx.destination);
    const t = setTimeout(resolve, (buffer.duration + 1) * 1000);
    src.onended = () => { clearTimeout(t); if (currentSource === src) currentSource = null; resolve(); };
    currentSource = src;
    src.start();
  });
}

export function stopSpeech() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (currentSource) {
    try { currentSource.onended = null; currentSource.stop(); } catch (e) { /* 已停 */ }
    currentSource = null;
  }
}

export function unlock() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !audioCtx) audioCtx = new AC();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    // iOS：在點擊當下播一段無聲，確保之後可以出聲
    if (audioCtx) {
      const b = audioCtx.createBuffer(1, 1, 22050);
      const s = audioCtx.createBufferSource();
      s.buffer = b;
      s.connect(audioCtx.destination);
      s.start(0);
    }
  } catch (e) { /* 沒有音效也能玩 */ }
}

function tone(freq, start, dur, type = "sine", gain = 0.16) {
  if (!audioCtx || MUTED) return;
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
export function chimeSoft() { tone(330, 0, 0.22, "triangle", 0.1); }
/** 氣球破掉：短促上滑。 */
export function chimePop() { tone(880, 0, 0.08, "square", 0.06); tone(1320, 0.05, 0.12, "sine", 0.1); }
/** 得到貼紙：小段旋律。 */
export function chimeReward() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3)); }
