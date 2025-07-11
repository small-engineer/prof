#!/usr/bin/env python3

"""
@fileoverview 開発用サーバー
@package
"""

import http.server
import socketserver
import os

PORT = 8000

class SPARequestHandler(http.server.SimpleHTTPRequestHandler):

    def translate_path(self, path):
        """リクエストパスをローカルパスに変換"""
        path = path.split("?", 1)[0].split("#", 1)[0]
        rel_path = path.lstrip("/") or "index.html"
        abs_path = os.path.abspath(rel_path)
        return abs_path

    def do_GET(self):
        file_path = self.translate_path(self.path)
        if os.path.exists(file_path) and not os.path.isdir(file_path):
            return http.server.SimpleHTTPRequestHandler.do_GET(self)
        else:
            if self.path.startswith("/assets/") or self.path == "/favicon.ico":
                self.send_error(404, "File not found")
                return
            # ページリロード
            self.path = "/index.html"
            return super().do_GET()

Handler = SPARequestHandler

def run():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"[DEV SERVER] Serving at http://localhost:{PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    run()
