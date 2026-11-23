# Leo's English（kids-learning）

給 4～5 歲小孩玩的英文單字網頁遊戲：聽英文，點出正確的圖。13 個單元、約 140 個字。

- 開始玩：https://cyhosteven.github.io/kids-learning/
- 建議用平板，並用瀏覽器的「加到主畫面」，就能全螢幕、斷網也能玩。
- 不需要帳號、不收集任何資料、沒有廣告。進度只存在你的裝置上（家長頁可匯出備份）。

## 給開發者（和 AI）
- 規則：`CLAUDE.md`
- 規格：`docs/`（從 `docs/00_總覽.md` 開始）
- 內容：`site/content/items.csv`
- 本機執行：`python tools/serve.py`，開 http://localhost:8080/
- 英文語音：改了 items.csv 後執行 `.ttsenvScriptspython toolsmake_audio.py`（安裝方式見檔案開頭）
