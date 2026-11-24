"""Assemble a local copy of docs/ that reads repo files instead of GitHub raw.

Lets the UI be exercised before the data it reads exists on main. Copies docs/
verbatim, rewrites RAW_BASE in config.js to the local server, and places the
repo's data/ under a ref-named folder so the raw URL shape still matches. (#40)

Usage:
    python src/scripts/serve_ui_locally.py --build
    python src/scripts/serve_ui_locally.py --serve --port 8123
"""

from __future__ import annotations

import argparse
import functools
import http.server
import re
import shutil
import socketserver
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DOCS = REPO / "docs"
OUT = REPO / ".local-ui"
REF = "main"
DATA_PATHS = ["data/json", "data/summaries", "data/alaf"]


def build(port: int) -> Path:
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(DOCS, OUT)

    config = OUT / "config.js"
    text = config.read_text(encoding="utf-8")
    patched, count = re.subn(
        r"export const RAW_BASE = `[^`]*`;",
        f'export const RAW_BASE = "http://localhost:{port}";',
        text,
    )
    if count != 1:
        raise SystemExit("RAW_BASE not found in docs/config.js, update this script")
    config.write_text(patched, encoding="utf-8", newline="\n")

    for rel in DATA_PATHS:
        src = REPO / rel
        if src.is_dir():
            shutil.copytree(src, OUT / REF / rel)
    return OUT


def serve(port: int) -> None:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(OUT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {OUT} at http://localhost:{port}")
        httpd.serve_forever()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--build", action="store_true")
    p.add_argument("--serve", action="store_true")
    p.add_argument("--port", type=int, default=8123)
    args = p.parse_args()
    if args.build or not OUT.exists():
        print(f"Built {build(args.port)}")
    if args.serve:
        serve(args.port)


if __name__ == "__main__":
    main()
