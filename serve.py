from __future__ import annotations

import json
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
PORT = 8765

VIE_ARR = "https://viennaairport.com/jart/prj3/va/data/flights/inc.json"
VIE_DEP = "https://viennaairport.com/jart/prj3/va/data/flights/out.json"
METAR = "https://aviationweather.gov/api/data/metar?ids=LOWW&format=json"
TAF = "https://aviationweather.gov/api/data/taf?ids=LOWW&format=raw"

UA = "vie-tower-preview/1.0 (local; +https://github.com)"


def fetch(url: str, timeout: float = 20.0) -> tuple[int, bytes, str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json, text/plain, */*",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            ctype = resp.headers.get("Content-Type", "application/octet-stream")
            return resp.status, resp.read(), ctype
    except urllib.error.HTTPError as e:
        body = e.read() if e.fp else b""
        return e.code, body, "text/plain"
    except Exception as e:
        return 502, str(e).encode(), "text/plain"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/flights/arrivals":
            return self._proxy(VIE_ARR)
        if path == "/api/flights/departures":
            return self._proxy(VIE_DEP)
        if path == "/api/metar":
            return self._proxy(METAR)
        if path == "/api/taf":
            return self._proxy(TAF)
        if path == "/api/weather":
            return self._weather()

        if path in ("/", "/index.html"):
            self.path = "/index.html"
        return super().do_GET()

    def _proxy(self, url: str):
        status, body, ctype = fetch(url)
        self.send_response(status if status else 502)
        self.send_header("Content-Type", ctype.split(";")[0] + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _weather(self):
        ms, mb, _ = fetch(METAR)
        ts, tb, _ = fetch(TAF)
        payload = {
            "ok": ms == 200,
            "metarStatus": ms,
            "tafStatus": ts,
            "metar": None,
            "taf": None,
            "error": None,
        }
        if ms == 200:
            try:
                arr = json.loads(mb.decode())
                payload["metar"] = arr[0] if arr else None
            except Exception as e:
                payload["ok"] = False
                payload["error"] = f"METAR parse: {e}"
        else:
            payload["error"] = f"METAR HTTP {ms}: {mb.decode(errors='replace')[:200]}"

        if ts == 200:
            payload["taf"] = tb.decode(errors="replace").strip()

        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"VIE Tower preview → http://127.0.0.1:{PORT}")
    print("Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
        server.server_close()


if __name__ == "__main__":
    main()
