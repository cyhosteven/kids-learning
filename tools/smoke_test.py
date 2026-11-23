"""冒煙測試：本機 Chrome 無頭模式跑主要流程，截圖到 tools/out/。

用法：python tools/smoke_test.py            測本機（自動啟動 tools/serve.py）
      python tools/smoke_test.py <網址>     測正式網站，例如 https://cyhosteven.github.io/kids-learning/
（需要 pip install websockets、本機安裝 Google Chrome）
走子路徑 /kids-learning/（和 GitHub Pages 一樣），檢查：
- 沒有 JS 錯誤、沒有對外部網站的請求、service worker 有註冊
- 一回合 6 題（先故意點錯一次）→ 得到貼紙 → 貼紙本有 1 張
- 家長鎖 → 家長頁有學習紀錄
- 匯出 → 重設 → 匯入，貼紙恢復
- iPad 橫式與手機直式各截圖
"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import websockets

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", "out")
PORT = 8091
CDP = 9341
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome",
]
BASE = sys.argv[1].rstrip("/") + "/" if len(sys.argv) > 1 else f"http://localhost:{PORT}/kids-learning/"
URL = BASE + "?mute"
ORIGIN = "/".join(BASE.split("/")[:3]) + "/"
failures = []


def check(cond, text):
    print(("  OK  " if cond else "  NG  ") + text)
    if not cond:
        failures.append(text)


async def main():
    os.makedirs(OUT, exist_ok=True)
    chrome = next((c for c in CHROME_CANDIDATES if os.path.exists(c) or shutil.which(c)), None)
    if not chrome:
        sys.exit("找不到 Chrome")
    server = None if len(sys.argv) > 1 else subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "tools", "serve.py"), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    profile = tempfile.mkdtemp()
    proc = subprocess.Popen([chrome, "--headless=new", f"--remote-debugging-port={CDP}", f"--user-data-dir={profile}",
                             "--window-size=1024,768", "--autoplay-policy=no-user-gesture-required", "about:blank"])
    try:
        for _ in range(60):
            try:
                page = next(t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{CDP}/json")) if t["type"] == "page")
                urllib.request.urlopen(BASE)
                break
            except Exception:
                time.sleep(0.25)
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=100_000_000) as ws:
            n = 0
            requests = []
            errors = []

            async def call(method, **params):
                nonlocal n
                n += 1
                await ws.send(json.dumps({"id": n, "method": method, "params": params}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get("method") == "Network.requestWillBeSent":
                        requests.append(msg["params"]["request"]["url"])
                    elif msg.get("method") == "Runtime.exceptionThrown":
                        errors.append(msg["params"]["exceptionDetails"].get("text", "") + " " +
                                      str(msg["params"]["exceptionDetails"].get("exception", {}).get("description", "")))
                    if msg.get("id") == n:
                        return msg

            async def js(expr):
                r = await call("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True)
                return r.get("result", {}).get("result", {}).get("value")

            async def shot(name, w, h):
                await call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=w < 800)
                await asyncio.sleep(0.6)
                r = await call("Page.captureScreenshot", format="png")
                import base64
                open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["result"]["data"]))

            async def active():
                return await js("document.querySelector('.screen.active').id")

            await call("Network.enable")
            await call("Runtime.enable")
            await call("Page.enable")
            await call("Emulation.setDeviceMetricsOverride", width=1024, height=768, deviceScaleFactor=1, mobile=False)
            await call("Page.navigate", url=URL)
            await asyncio.sleep(2.5)
            await shot("1_start_ipad.png", 1024, 768)
            check(await active() == "screen-start", "開始畫面")
            await js("document.getElementById('btnStart').click()")
            await asyncio.sleep(0.6)
            check(await active() == "screen-map", "點開始 → 地圖")
            units = await js("document.querySelectorAll('#unitGrid .unit').length")
            check(units >= 10, f"地圖有單元（{units} 個）")
            check(await js("!!document.querySelector('#unitGrid .unit.recommended')"), "有建議的單元在跳動")
            await shot("2_map_ipad.png", 1024, 768)
            await shot("2_map_phone.png", 390, 844)
            await call("Emulation.setDeviceMetricsOverride", width=1024, height=768, deviceScaleFactor=1, mobile=False)

            # 英文音檔：抓得到、解得出來
            dur = await js("""(async () => { const r = await fetch('./audio/en/elephant_s.mp3'); if (!r.ok) return -1;
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const ab = await ctx.decodeAudioData(await r.arrayBuffer()); return ab.duration; })()""")
            check(dur and dur > 0.5, f"英文音檔可播放（elephant_s.mp3 {dur:.2f} 秒）" if dur else "英文音檔可播放")

            # 一回合（第一個單元）：點錯、氣球題、句子題
            await js("document.querySelector('#unitGrid .unit').click()")
            for _ in range(25):                      # 會先載入這個單元的照片（最多 2 秒）
                await asyncio.sleep(0.2)
                if await active() == "screen-game":
                    break
            await asyncio.sleep(0.5)
            check(await active() == "screen-game", "點單元 → 開始一回合")
            await shot("3_game_ipad.png", 1024, 768)
            await shot("3_game_phone.png", 390, 844)
            await call("Emulation.setDeviceMetricsOverride", width=1024, height=768, deviceScaleFactor=1, mobile=False)
            wrong_seen = balloon_seen = False
            for q in range(6):
                if await js("document.getElementById('options').classList.contains('balloons')"):
                    if not balloon_seen:
                        await shot("3_balloon_ipad.png", 1024, 768)
                    balloon_seen = True
                for attempt in range(4):
                    await js("document.querySelector('#options .card:not(.wrong)').click()")
                    await asyncio.sleep(0.3)
                    if await js("!!document.querySelector('#options .card.right, #options .card.popped')"):
                        break
                    wrong_seen = wrong_seen or await js("!!document.querySelector('#options .card.wrong')")
                await asyncio.sleep(1.0)
            check(wrong_seen, "點錯：圖卡變淡、不扣分，可以再點")
            check(balloon_seen, "一回合裡有氣球題")
            check(await active() == "screen-reward", "6 題後 → 得到貼紙")
            await shot("4_reward_ipad.png", 1024, 768)
            await js("document.getElementById('btnRewardHome').click()")
            await asyncio.sleep(0.3)
            await js("document.getElementById('btnBook').click()")
            await asyncio.sleep(0.4)
            got = await js("document.querySelectorAll('#bookGrid .slot.got').length")
            check(got == 1, f"貼紙本有 1 張彩色貼紙（實際 {got}）")
            tabs = await js("document.querySelectorAll('#bookTabs .tab').length")
            check(tabs == units, f"貼紙本依單元分頁（{tabs} 頁）")
            await shot("5_book_ipad.png", 1024, 768)
            await shot("5_book_phone.png", 390, 844)
            await call("Emulation.setDeviceMetricsOverride", width=1024, height=768, deviceScaleFactor=1, mobile=False)

            # 其他單元的圖：顏色色塊、數字星星
            for unit_id, sel in (("color", ".swatch"), ("number", ".count")):
                await js(f"document.querySelector('#bookTabs .tab[aria-label]') && [...document.querySelectorAll('#bookTabs .tab')]"
                         f".find(t => t.getAttribute('aria-label') === ({json.dumps({'color': '顏色', 'number': '數字'}[unit_id])})).click()")
                await asyncio.sleep(0.3)
                n = await js(f"document.querySelectorAll('#bookGrid {sel}').length")
                check(n >= 10, f"{unit_id} 單元的圖正常顯示（{n} 個）")
            await shot("5_book_number_ipad.png", 1024, 768)

            # 家長鎖
            await js("document.getElementById('btnBookBack').click()")
            await asyncio.sleep(0.2)
            await js("document.getElementById('btnParent').click()")
            await asyncio.sleep(0.3)
            await js("""(() => { const [a, b] = document.getElementById('gateQuestion').textContent.match(/\d+/g).map(Number);
                [...document.querySelectorAll('#gateAnswers button')].find(x => Number(x.textContent) === a + b).click(); })()""")
            await asyncio.sleep(0.4)
            check(await active() == "screen-parent", "家長鎖答對 → 家長頁")
            learned = await js("[...document.querySelectorAll('#progressTable td.stars')].length")
            check(learned >= 1, f"家長頁有學習紀錄（{learned} 個字）")
            await shot("6_parent_ipad.png", 1024, 768)

            # 匯出 → 重設 → 匯入
            restored = await js("""(async () => { const s = await import('./js/storage.js');
                const backup = s.exportJson(); s.resetAll(); const after = s.store().stickers.length;
                s.importJson(backup); return [after, s.store().stickers.length]; })()""")
            check(restored == [0, 1], f"匯出 → 重設 → 匯入，貼紙恢復（{restored}）")

            # 照片：家長頁來源清單、所有照片都抓得到並解得出來
            await js("document.getElementById('btnCredits').click()")
            await asyncio.sleep(1.0)
            credit_rows = await js("document.querySelectorAll('#creditsList > div').length")
            check(credit_rows >= 120, f"家長頁列出每張圖的作者與授權（{credit_rows} 張）")
            broken = await js("""(async () => { const c = await (await fetch('./content/credits.json')).json();
                const bad = [];
                await Promise.all(Object.keys(c).map(id => new Promise(res => { const im = new Image();
                  im.onload = () => { if (!im.naturalWidth) bad.push(id); res(); }; im.onerror = () => { bad.push(id); res(); };
                  im.src = './content/images/' + id + '.webp'; })));
                return bad; })()""")
            check(broken == [], f"所有照片都能顯示{'：壞掉 ' + ', '.join(broken[:8]) if broken else ''}")
            await shot("6_parent_credits_ipad.png", 1024, 768)

            cached = await js("""(async () => { await navigator.serviceWorker.ready; await new Promise(r => setTimeout(r, 3000));
                const c = await caches.open('kids-learning-' + self.APP_VERSION);
                const keys = await c.keys();
                return [keys.filter(r => r.url.includes('/audio/en/')).length, keys.filter(r => r.url.includes('/content/images/')).length]; })()""")
            check(cached and cached[0] > 250, f"音檔已預先快取，斷網也有聲音（{cached and cached[0]} 個）")
            check(cached and cached[1] >= 120, f"照片已預先快取，斷網也看得到（{cached and cached[1]} 張）")
            sw = await js("navigator.serviceWorker.getRegistration().then(r => !!r)")
            check(sw, "service worker 有註冊（可離線）")
            external = [u for u in requests if not u.startswith(ORIGIN) and not u.startswith("data:")
                        and not u.startswith("blob:")]
            check(not external, f"沒有對外部網站的請求{'：' + ', '.join(external[:5]) if external else ''}")
            check(not errors, f"沒有 JS 錯誤{'：' + '; '.join(errors[:3]) if errors else ''}")
    finally:
        proc.kill()
        if server:
            server.kill()
    print(f"\n截圖：{OUT}")
    if failures:
        sys.exit(f"{len(failures)} 項失敗")
    print("全部通過")


asyncio.run(main())
