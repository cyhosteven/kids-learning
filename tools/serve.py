"""本機測試用的靜態伺服器：python tools/serve.py [port]，然後開 http://localhost:8080/

模擬 GitHub Pages 的子路徑：http://localhost:8080/kids-learning/ 也能開（確認沒有用到 / 開頭的路徑）。
"""
import functools
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
SUB = "/kids-learning"


class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows 的登錄檔可能把 .js 對應成 text/plain，ES module 會載入失敗，這裡明確指定
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
                      ".webmanifest": "application/manifest+json", ".json": "application/json",
                      ".csv": "text/csv; charset=utf-8", ".md": "text/markdown; charset=utf-8"}

    def translate_path(self, path):
        if path == SUB or path.startswith(SUB + "/"):
            path = path[len(SUB):] or "/"
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler) as httpd:
        print(f"http://localhost:{PORT}/  （子路徑：http://localhost:{PORT}{SUB}/）")
        httpd.serve_forever()
