#!/usr/bin/env python3
"""Tiny dev server that returns correct MIME types for ES modules.

Python's http.server on Windows often serves .js as text/plain, which makes
browsers refuse to execute them as ES modules. This server overrides the
guess for .js, .mjs, .css, .svg, .json so module imports work in dev.

Usage: python scripts/serve.py [port]   (default port 8765)
"""
from __future__ import annotations

import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
import mimetypes

# Force-correct MIME mappings for static assets the browser cares about.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("text/plain", ".md")


class FixedMimeHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js":   "application/javascript",
        ".mjs":  "application/javascript",
        ".css":  "text/css",
        ".svg":  "image/svg+xml",
        ".json": "application/json",
        ".html": "text/html; charset=utf-8",
        "":      "application/octet-stream",
    }

    def end_headers(self):
        # Loosen caching so iteration during development is painless.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    bind = "127.0.0.1"
    server = HTTPServer((bind, port), FixedMimeHandler)
    print(f"serving http://{bind}:{port}/  (ES-module-safe MIME)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
