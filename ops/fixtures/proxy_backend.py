"""Synthetic HTTP services for the isolated shared-Caddy integration test."""

import json
import os
import socket
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

writes = 0
lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def serve(self):
        global writes
        size = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(size) if size else None
        if os.environ["ROLE"] == "web":
            request = urllib.request.Request(
                os.environ["API_URL"] + self.path, data=body, method=self.command
            )
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    result = json.load(response)
                result.update(via_web=True, public_host=self.headers.get("Host"))
                status = 200
            except urllib.error.HTTPError as error:
                result, status = {"error": "upstream_error"}, error.code
        else:
            if self.command == "POST":
                with lock:
                    writes += 1
                if self.path == "/drop-after-write":
                    self.close_connection = True
                    return
            result = {
                "backend": socket.gethostname(),
                "path": self.path,
                "upstream_host": self.headers.get("Host"),
                "writes": writes,
            }
            status = 200
        payload = json.dumps(result).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    do_GET = serve
    do_POST = serve


ThreadingHTTPServer(("0.0.0.0", int(os.environ["PORT"])), Handler).serve_forever()
