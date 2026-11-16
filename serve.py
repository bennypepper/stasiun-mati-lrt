#!/usr/bin/env python3
"""Local HTTP static server for hydrogen-subway.

Serves the workspace root with proper MIME types for WebGL/ESM/glTF/WASM/HDR assets
and Cache-Control: no-store for src/*.js and HTML/manifest files.
"""
from __future__ import annotations

import argparse
import functools
import os
import signal
import socket
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".hdr": "application/octet-stream",
    ".gltf": "model/gltf+json",
    ".glb": "model/gltf-binary",
    ".bin": "application/octet-stream",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".txt": "text/plain; charset=utf-8",
}


class AssetRequestHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **MIME_TYPES}

    def guess_type(self, path: str) -> str:
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME_TYPES:
            return MIME_TYPES[ext]
        return super().guess_type(path)

    def end_headers(self) -> None:
        clean_path = unquote(self.path.split("?", 1)[0]).lstrip("/")
        if (
            clean_path == ""
            or clean_path.endswith(".html")
            or clean_path.startswith("src/")
            or clean_path == "assets/manifest.json"
        ):
            self.send_header("Cache-Control", "no-store, must-revalidate")
        else:
            self.send_header("Cache-Control", "public, max-age=3600")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        # Quiet successful 200/304 logs unless verbose; always log non-2xx errors.
        code = str(args[1]) if len(args) > 1 else ""
        if code and not code.startswith(("2", "3")):
            sys.stderr.write(f"[serve] {self.address_string()} - {format % args}\n")

    def copyfile(self, source, outputfile) -> None:
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def bind_server(host: str, port: int, auto_port: bool, handler) -> ReusableThreadingHTTPServer:
    if not auto_port or port == 0:
        return ReusableThreadingHTTPServer((host, port), handler)

    for candidate in range(port, port + 20):
        # On Windows SO_REUSEADDR allows binding an in-use port unless we check if anything is already listening.
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.15)
            if probe.connect_ex((host, candidate)) == 0:
                continue
        try:
            return ReusableThreadingHTTPServer((host, candidate), handler)
        except OSError:
            continue

    return ReusableThreadingHTTPServer((host, 0), handler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve hydrogen-subway over local HTTP.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8080, help="Port (0 for ephemeral port)")
    parser.add_argument("--auto-port", action="store_true", help="Pick next free port if requested port is busy")
    parser.add_argument("--open", action="store_true", help="Open game URL in default browser once listening")
    args = parser.parse_args()

    handler = functools.partial(AssetRequestHandler, directory=str(ROOT))
    server = bind_server(args.host, args.port, args.auto_port, handler)
    bound_host, bound_port = server.server_address
    url = f"http://{bound_host}:{bound_port}/"

    print(f"PORT={bound_port}", flush=True)
    print(f"SERVING {url}", flush=True)

    if args.open:
        threading.Timer(0.25, webbrowser.open, args=(url,)).start()

    def _shutdown(signum, frame):
        raise SystemExit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    try:
        server.serve_forever()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
