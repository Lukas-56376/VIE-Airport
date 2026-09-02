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

UA = "vie-tower-preview/1.0"


def fetch(url: str, timeout: float = 20.0) -> tuple[int, bytes, str]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json, text/plain, */*",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content_type = response.headers.get(
                "Content-Type",
                "application/octet-stream",
            )

            return (
                response.status,
                response.read(),
                content_type,
            )

    except urllib.error.HTTPError as error:
        body = error.read() if error.fp else b""

        return (
            error.code,
            body,
            "text/plain",
        )

    except Exception as error:
        return (
            502,
            str(error).encode(),
            "text/plain",
        )


def json_response(data, status: int = 200):
    body = json.dumps(
        data,
        ensure_ascii=False,
    ).encode("utf-8")

    return status, body


class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            directory=str(ROOT),
            **kwargs,
        )

    def end_headers(self):
        self.send_header(
            "Cache-Control",
            "no-store",
        )

        self.send_header(
            "Access-Control-Allow-Origin",
            "*",
        )

        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/flights/arrivals":
            return self._flights(VIE_ARR, "arrival")

        if path == "/api/flights/departures":
            return self._flights(VIE_DEP, "departure")

        if path == "/api/metar":
            return self._proxy(METAR)

        if path == "/api/taf":
            return self._proxy(TAF)

        if path == "/api/weather":
            return self._weather()

        if path in ("/", "/index.html"):
            self.path = "/index.html"

        return super().do_GET()

    def _flights(self, url: str, direction: str):
        status, body, content_type = fetch(url)

        if status != 200:
            return self._send(
                status,
                body,
                "text/plain",
            )

        try:
            data = json.loads(
                body.decode("utf-8")
            )
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            return self._send(
                502,
                str(error).encode(),
                "text/plain",
            )

        if isinstance(data, dict):
            if "monitor" in data:
                return self._send_json(
                    data,
                    200,
                )

            if "flights" in data:
                flights = data["flights"]

            elif direction in data:
                flights = data[direction]

            else:
                flights = []

        elif isinstance(data, list):
            flights = data

        else:
            flights = []

        response = {
            "monitor": {
                direction: flights,
                "sendDate": None,
                "stale": False,
            }
        }

        return self._send_json(
            response,
            200,
        )

    def _proxy(self, url: str):
        status, body, content_type = fetch(url)

        return self._send(
            status if status else 502,
            body,
            content_type.split(";")[0],
        )

    def _weather(self):
        metar_status, metar_body, _ = fetch(METAR)
        taf_status, taf_body, _ = fetch(TAF)

        payload = {
            "ok": metar_status == 200,
            "metarStatus": metar_status,
            "tafStatus": taf_status,
            "metar": None,
            "taf": None,
            "error": None,
        }

        if metar_status == 200:
            try:
                data = json.loads(
                    metar_body.decode("utf-8")
                )

                if isinstance(data, list) and data:
                    payload["metar"] = data[0]

            except Exception as error:
                payload["ok"] = False
                payload["error"] = f"METAR parse error: {error}"

        else:
            payload["error"] = (
                f"METAR HTTP {metar_status}"
            )

        if taf_status == 200:
            payload["taf"] = (
                taf_body
                .decode("utf-8", errors="replace")
                .strip()
            )

        return self._send_json(
            payload,
            200,
        )

    def _send_json(self, data, status: int = 200):
        body = json.dumps(
            data,
            ensure_ascii=False,
        ).encode("utf-8")

        return self._send(
            status,
            body,
            "application/json",
        )

    def _send(
        self,
        status: int,
        body: bytes,
        content_type: str,
    ):
        self.send_response(status)

        self.send_header(
            "Content-Type",
            content_type + "; charset=utf-8",
        )

        self.send_header(
            "Content-Length",
            str(len(body)),
        )

        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(
            f"[{self.log_date_time_string()}] {args[0]}"
        )


def main():
    server = ThreadingHTTPServer(
        ("127.0.0.1", PORT),
        Handler,
    )

    print(
        f"VIE Tower preview → http://127.0.0.1:{PORT}"
    )

    print("Ctrl+C to stop")

    try:
        server.serve_forever()

    except KeyboardInterrupt:
        print("\nstopped")
        server.server_close()


if __name__ == "__main__":
    main()