#!/usr/bin/env python3
import http.server
import json
import os
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def load_dotenv():
    env_file = os.path.join(SCRIPT_DIR, ".env")
    if os.path.isfile(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip())

load_dotenv()

class OrgChartHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
        if self.path == "/api/ldap-org":
            self._handle_ldap_org()
        else:
            self.send_error(404)

    def _handle_ldap_org(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
        except (json.JSONDecodeError, ValueError):
            self._json_error(400, "Invalid JSON body")
            return

        uid = body.get("uid", "").strip()
        if not uid:
            self._json_error(400, "uid is required")
            return

        depth = str(body.get("depth", 999))
        outfile = os.path.join(SCRIPT_DIR, "data", f"{uid}.csv")
        script = os.path.join(SCRIPT_DIR, "fetch-org.sh")

        try:
            result = subprocess.run(
                [script, uid, depth, outfile],
                capture_output=True, text=True, timeout=600,
                cwd=SCRIPT_DIR,
            )
        except FileNotFoundError:
            self._json_error(500, "fetch-org.sh not found")
            return
        except subprocess.TimeoutExpired:
            self._json_error(504, "LDAP fetch timed out (>10 min)")
            return

        if result.returncode != 0:
            stderr = result.stderr.strip()
            msg = stderr.split("\n")[-1] if stderr else "fetch-org.sh failed"
            self._json_error(502, msg)
            return

        try:
            with open(outfile, "r") as f:
                csv_text = f.read()
        except FileNotFoundError:
            self._json_error(500, "CSV file was not created")
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.end_headers()
        self.wfile.write(csv_text.encode("utf-8"))

    def _json_error(self, code, message):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode("utf-8"))

os.chdir(SCRIPT_DIR)
server = http.server.HTTPServer(("", 8080), OrgChartHandler)
print("Serving on http://localhost:8080 (no-cache)")
server.serve_forever()
