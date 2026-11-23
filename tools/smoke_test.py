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
            await asyncio.sleep(0.5)
            check(await active() == "screen-home", "點開始 → 首頁")
            await shot("2_home_ipad.png", 1024, 768)

            # 一回合：第一題先點錯
            await js("document.getElementById('btnPlay').click()")
            await asyncio.sleep(0.6)
            check(await active() == "screen-game", "進入遊戲")
            await shot("3_game_ipad.png", 1024, 768)
            await shot("3_game_phone.png", 390, 844)
            await call("Emulation.setDeviceMetricsOverride", width=1024, height=768, deviceScaleFactor=1, mobile=False)
            wrong_seen = False
            for q in range(6):
                for attempt in range(4):
                    cards = await js("document.querySelectorAll('#options .card:not(.wrong)').length")
                    await js("document.querySelector('#options .card:not(.wrong)').click()")
                    await asyncio.sleep(0.3)
                    if await js("!!document.querySelector('#options .card.right')"):
                        break
                    wrong_seen = wrong_seen or await js("!!document.querySelector('#options .card.wrong')")
                await asyncio.sleep(1.2)
            check(wrong_seen, "點錯：圖卡變淡、不扣分，可以再點")
            check(await active() == "screen-reward", "6 題後 → 得到貼紙")
            await shot("4_reward_ipad.png", 1024, 768)
            await js("document.getElementById('btnRewardHome').click()")
            await js("document.getElementById('btnBook').click()")
            await asyncio.sleep(0.4)
            got = await js("document.querySelectorAll('#bookGrid .slot.got').length")
            check(got == 1, f"貼紙本有 1 張彩色貼紙（實際 {got}）")
            await shot("5_book_ipad.png", 1024, 768)
            await shot("5_book_phone.png", 390, 844)
            await call("Emulation.setDeviceMetricsOverride", width=1024, height=768, deviceScaleFactor=1, mobile=False)

            # 家長鎖
            await js("document.getElementById('btnBookBack').click()")
            await js("document.getElementById('btnParent').click()")
            await asyncio.sleep(0.3)
            await js("""(() => { const [a, b] = document.getElementById('gateQuestion').textContent.match(/\\d+/g).map(Number);
                [...document.querySelectorAll('#gateAnswers button')].find(x => Number(x.textContent) === a + b).click(); })()""")
            await asyncio.sleep(0.4)
            check(await active() == "screen-parent", "家長鎖答對 → 家長頁")
            learned = await js("[...document.querySelectorAll('#progressTable td.stars')].filter(td => td.textContent !== '還沒學').length")
            check(learned >= 1, f"家長頁有學習紀錄（{learned} 個字）")
            await shot("6_parent_ipad.png", 1024, 768)

            # 匯出 → 重設 → 匯入
            restored = await js("""(async () => { const s = await import('./js/storage.js');
                const backup = s.exportJson(); s.resetAll(); const after = s.store().stickers.length;
                s.importJson(backup); return [after, s.store().stickers.length]; })()""")
            check(restored == [0, 1], f"匯出 → 重設 → 匯入，貼紙恢復（{restored}）")

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
