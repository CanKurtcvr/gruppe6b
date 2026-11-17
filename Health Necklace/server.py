import http.server
import socketserver
import json
import threading
import time
import subprocess

PORT = 8080
events = []

def monitor_music():
    last_state = "stopped"
    while True:
        try:
            res = subprocess.run(
                ["osascript", "-e", 'tell application "Music" to get {player state as text, running}'],
                capture_output=True, text=True, timeout=2
            )
            out = res.stdout.strip()
            # If Music starts playing because user pressed play on speaker
            if "playing" in out:
                subprocess.run(["osascript", "-e", 'tell application "Music" to pause'], capture_output=True)
                events.append(time.time())
                print("[Trigger] Play button detected! Pausing Music and triggering assistant.")
        except Exception:
            pass
        time.sleep(0.3)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="src", **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/events"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            last_ts = 0
            if len(events) > 0:
                last_ts = events[-1]
            self.wfile.write(json.dumps({"lastEvent": last_ts}).encode())
            return
        super().do_GET()

if __name__ == "__main__":
    t = threading.Thread(target=monitor_music, daemon=True)
    t.start()
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Server started at http://localhost:{PORT}")
        httpd.serve_forever()
