#!/usr/bin/env python3
"""Checksummed binary transfer using supported sandbox exec, then supervised restart."""
import hashlib
import http.server
import json
import pathlib
import secrets
import shlex
import subprocess
import threading
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SID = "CS4cff70216b6c6d7b499790b5"

def cli(*args):
    result = subprocess.run(["fural-agent", *args], capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return json.loads(result.stdout)

def execute(name, command):
    run = cli("sandboxes", "exec", SID, "--name", name, "--cmd", command)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        jobs = cli("sandboxes", "ps", SID)
        job = next((j for j in jobs if j["name"] == name and j.get("pid") == run["pid"]), None)
        if job and not job.get("running"):
            logs = cli("sandboxes", "logs", SID, "--name", name, "--lines", "10")
            print(json.dumps(logs), flush=True)
            if job.get("exit_code") != 0:
                raise RuntimeError(name + " failed")
            return
        time.sleep(2)
    cli("sandboxes", "stop", SID, "--name", name)
    raise RuntimeError(name + " timed out")

artifact = ROOT / ".deploy-content-api/content-api"
digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
who = cli("whoami")
hostname = "arkodia-content-transfer-" + who["user_id"].lower() + "-arkodia.fural.space"
domains = cli("organization", "sandbox-domains", "list", "--user", who["user_id"])
domain = next((d for d in domains if d["hostname"] == hostname), None)
if domain is None:
    domain = cli("organization", "sandbox-domains", "add", "--hostname", hostname, "--port", "3193", "--user", who["user_id"])
else:
    cli("organization", "sandbox-domains", "update", domain["id"], "--enabled", "true", "--port", "3193")
route = "/" + secrets.token_urlsafe(24)
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != route:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Length", str(artifact.stat().st_size))
        self.end_headers()
        with artifact.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                self.wfile.write(chunk)
    def log_message(self, *args):
        pass
server = http.server.ThreadingHTTPServer(("0.0.0.0", 3193), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    destination = "app/releases/content-api-" + commit
    execute("content-install", "set -eu\nmkdir -p app/releases\n" +
        "curl --fail --silent --show-error --retry 3 --max-time 90 " + shlex.quote("https://" + hostname + route) + " -o " + destination + ".part\n" +
        "printf '%s  %s\\n' " + digest + " " + destination + ".part | sha256sum -c -\n" +
        "chmod 755 " + destination + ".part\nmv " + destination + ".part " + destination + "\n" +
        "cp app/content-api app/releases/content-api-previous\n" +
        "cp " + destination + " app/content-api.next\nmv -f app/content-api.next app/content-api\n" +
        "printf '%s\\n' " + commit + " > app/content-api.commit")
finally:
    server.shutdown()
    cli("organization", "sandbox-domains", "update", domain["id"], "--enabled", "false")
cli("sandboxes", "boot", SID)
deadline = time.monotonic() + 60
while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen("https://content.arkodia.online/healthz", timeout=10) as response:
            if response.status == 200:
                print(json.dumps({"status": "deployed", "commit": commit, "sha256": digest}), flush=True)
                break
    except Exception:
        pass
    time.sleep(2)
else:
    print(json.dumps(cli("sandboxes", "logs", SID, "--name", "boot", "--lines", "20")))
    raise RuntimeError("Content API public health did not recover")
