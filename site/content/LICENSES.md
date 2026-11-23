# 素材來源與授權

| 素材 | 來源 | 授權 |
|---|---|---|
| 英文語音（`audio/en/*.mp3`） | `tools/make_audio.py` 用 Kokoro-82M（hexgrad/Kokoro-82M，ONNX 版 thewh1teagle/kokoro-onnx）產生，聲音 `af_heart` | 模型 Apache-2.0；產生的音檔可散佈 |
| 華語語音 | 不使用（v0.3 起全部提示都是英文音檔） | — |
| 照片（`images/*.webp`，81 張：動物、水果、食物、交通工具、海洋、大自然） | Openverse（Flickr、Wikimedia Commons 等），人工挑選，裁切為正方形並縮小 | CC0、公有領域、CC BY、CC BY-SA；逐張作者與授權見 `credits.json`（家長頁可查） |
| 3D 插圖（`images/*.webp`，41 張：身體、玩具、衣服、家裡，以及太陽、星星、彩虹、雨、鯊魚、章魚、蝦子、魷魚） | Microsoft Fluent Emoji（github.com/microsoft/fluentui-emoji），放到淺色底並縮小 | MIT，全文見 `licenses/fluentui-emoji-MIT.txt` |
| 地圖單元圖示（顏色、數字單元） | emoji，由使用者裝置的系統字型顯示 | 不散佈圖檔 |
| 顏色色塊、數字星星 | CSS / emoji 即時畫出 | 自製 |
| 吉祥物「獅寶」 | `js/mascot.js` 程式畫的 SVG | 自製、原創 |
| 音效 | 程式即時合成（Web Audio API） | 自製 |
| App 圖示 | `tools/make_icons.py` 程式產生 | 自製 |

新增任何圖檔、音檔、字型前，先在這裡登記來源與授權。
