"""Loopback-only read-only synthetic dashboard."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import asyncio, json
from orchestrator import load_fixture, run_all
ROOT=Path(__file__).parent
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/run":
            body=json.dumps(asyncio.run(run_all(load_fixture())),ensure_ascii=False).encode()
            self.send_response(200); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body); return
        body=(ROOT/"web/index.html").read_bytes()
        self.send_response(200); self.send_header("Content-Type","text/html; charset=utf-8"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self,*args): pass
if __name__=="__main__":
    print("Synthetic-only UI: http://127.0.0.1:8000")
    HTTPServer(("127.0.0.1",8000),Handler).serve_forever()
