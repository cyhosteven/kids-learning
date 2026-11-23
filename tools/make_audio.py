"""從 site/content/*.csv 產生英文語音音檔（Kokoro-82M，Apache-2.0），存到 site/audio/en/。

用法（在專案根目錄）：
  .tts\\venv\\Scripts\\python tools\\make_audio.py          只產生缺少或文字改過的檔
  .tts\\venv\\Scripts\\python tools\\make_audio.py --all    全部重新產生

第一次安裝（模型約 350 MB，放在 .tts/，不進 git）：
  python -m venv .tts\\venv
  .tts\\venv\\Scripts\\python -m pip install kokoro-onnx soundfile
  到 https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
  下載 kokoro-v1.0.onnx、voices-v1.0.bin 放進 .tts/
需要 ffmpeg 在 PATH 上（轉 mp3）。

產生的清單 site/audio/index.json（檔名 → 文字）也給 service worker 預先快取用。
"""
import csv
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "site", "content")
OUT = os.path.join(ROOT, "site", "audio", "en")
INDEX = os.path.join(ROOT, "site", "audio", "index.json")
TTS = os.path.join(ROOT, ".tts")
VOICE = "af_heart"
SPEED = {"word": 0.85, "sentence": 0.9, "phrase": 1.0}
PHRASES = {
    "praise_1": "Great job!", "praise_2": "Good job!", "praise_3": "Yay!",
    "praise_4": "Well done!", "praise_5": "You got it!", "praise_6": "Awesome!",
    "sticker": "You got a sticker!", "again": "Oops! Let's listen again.", "lets_play": "Let's play!",
    "pick_place": "Hi! Where do you want to go?",
    "listen_touch": "Listen, and touch the picture!",
    "rest": "Time for a break. See you tomorrow!",
}


def read_csv(name):
    with open(os.path.join(CONTENT, name), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def jobs():
    out = {}
    for it in read_csv("items.csv"):
        out[it["id"]] = (it["英文"], "word")
        if it.get("sentence"):
            out[it["id"] + "_s"] = (it["sentence"], "sentence")
    for u in read_csv("units.csv"):
        out["u_" + u["id"]] = (u.get("say") or u["英文"], "phrase")
    for k, v in PHRASES.items():
        out[k] = (v, "phrase")
    return out


def trim(samples, sr, thr=0.01, pad=0.06):
    loud = np.where(np.abs(samples) > thr)[0]
    if not len(loud):
        return samples
    a = max(0, loud[0] - int(pad * sr))
    b = min(len(samples), loud[-1] + int(pad * 1.5 * sr))
    return samples[a:b]


def to_mp3(samples, sr, path):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("找不到 ffmpeg")
    data = np.clip(samples, -1, 1).astype(np.float32).tobytes()
    subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "pipe:",
                    "-af", "afade=t=in:d=0.01", "-codec:a", "libmp3lame", "-b:a", "48k", path],
                   input=data, check=True)


def main():
    regen_all = "--all" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    old = {}
    if os.path.exists(INDEX):
        old = json.load(open(INDEX, encoding="utf-8")).get("texts", {})
    todo = jobs()
    kokoro = None
    made = 0
    for name, (text, kind) in todo.items():
        path = os.path.join(OUT, name + ".mp3")
        if not regen_all and os.path.exists(path) and old.get(name) == text:
            continue
        if kokoro is None:
            kokoro = Kokoro(os.path.join(TTS, "kokoro-v1.0.onnx"), os.path.join(TTS, "voices-v1.0.bin"))
        samples, sr = kokoro.create(text, voice=VOICE, speed=SPEED[kind], lang="en-us")
        to_mp3(trim(np.asarray(samples, dtype=np.float32), sr), sr, path)
        made += 1
        print(f"{name}: {text}")
    # 刪掉已不在清單裡的舊檔
    for f in os.listdir(OUT):
        if f.endswith(".mp3") and f[:-4] not in todo:
            os.remove(os.path.join(OUT, f))
            print("刪除", f)
    texts = {k: v[0] for k, v in sorted(todo.items())}
    with open(INDEX, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"voice": f"Kokoro-82M {VOICE}", "texts": texts}, f, ensure_ascii=False, indent=0)
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"產生 {made} 個；共 {len(todo)} 個音檔，{size / 1e6:.1f} MB")


main()
