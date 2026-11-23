# 專案規則（kids-learning）

給 4～5 歲小孩玩的學習網頁遊戲。需求與規格在 `docs/`，先讀 `docs/00_總覽.md`；做過的決定在 `docs/DECISIONS.md`，改動前先查有沒有相關決定。

## 技術
- 純靜態網站，沒有後端、沒有資料庫、沒有帳號、沒有打包步驟（直接改 `site/` 下的檔案）。
- HTML + CSS + 原生 JavaScript（ES modules），不用框架。
- PWA：`site/manifest.webmanifest` + `site/sw.js`，可加到主畫面、斷網可玩。
- 內容放 `site/content/*.csv`，程式不寫死任何單字。
- 英文語音是預先產生的音檔 `site/audio/en/`：改了 items.csv / units.csv 後要執行 `.tts\venv\Scripts\python tools\make_audio.py`（只產生缺少或文字改過的檔；`.tts/` 的安裝方式寫在該檔開頭，不進 git）。
- 版本號只寫在 `site/js/version.js`（網頁和 service worker 都讀它）。每次發布要加一，否則 iPad 上會一直用舊的快取。

## 部署
- GitHub Pages：https://cyhosteven.github.io/kids-learning/
- 推到 `main` 後由 `.github/workflows/pages.yml` 自動發布 `site/` 資料夾。
- 網站在子路徑 `/kids-learning/` 下：所有資源一律用相對路徑（`./`），不可用 `/` 開頭。

## 禁止
- repo 是公開的：不得放入家人照片、錄音、姓名或任何個人資料。
- 不載入任何第三方腳本、字型、分析工具、廣告；所有請求只能到自己的網站。
- 不收集、不上傳任何資料；進度只存在裝置的 localStorage。
- 不使用麥克風、相機、定位。
- 圖片、聲音只能用自己做的或授權清楚的，來源記在 `site/content/LICENSES.md`。
- 不使用任何現有卡通、電影、遊戲的角色或美術。

## 測試
- 本機：`python tools/serve.py` 後開 http://localhost:8080/
- 冒煙測試：`python tools/smoke_test.py`（用本機 Chrome 無頭模式跑主要流程並截圖到 `tools/out/`；需要 `pip install websockets`）。
- 發布後再測正式網站：`python tools/smoke_test.py https://cyhosteven.github.io/kids-learning/`
- 改完要用 iPad 尺寸（1024×768）和手機尺寸（390×844）截圖確認。

## 寫法
- 檔案 UTF-8、LF 換行。
- 註解和 UI 文字用繁體中文；遊戲裡給小孩的提示都要有語音，不能只有文字（4～5 歲不識字）。
