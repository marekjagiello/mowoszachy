#!/usr/bin/env python3
import os
import sys
import json
import socket
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 8000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, 'app_console.log')

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

class AppServerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Disable browser caching for rapid mobile development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/log':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length).decode('utf-8')
                data = json.loads(body) if body else {}

                log_type = data.get('type', 'INFO').upper()
                msg = data.get('message', '')
                stack = data.get('stack', '')
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

                formatted_log = f"[{timestamp}] [{log_type}] {msg}\n"
                if stack:
                    formatted_log += f"  Stack: {stack}\n"

                with open(LOG_FILE, 'a', encoding='utf-8') as f:
                    f.write(formatted_log)
                    f.flush()

                sys.stdout.write(formatted_log)
                sys.stdout.flush()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            self.send_error(404, "Not Found")

def run():
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, 'w', encoding='utf-8') as f:
            f.write(f"=== MowoSzachy Console Log Initialized {datetime.now()} ===\n")

    local_ip = get_local_ip()
    server = ThreadingHTTPServer(('0.0.0.0', PORT), AppServerHandler)
    print("=" * 60)
    print(" ♚ MowoSzachy - Serwer treningu szachowego")
    print(f" -> Lokalnie:   http://localhost:{PORT}/")
    print(f" -> Na telefon: http://{local_ip}:{PORT}/")
    print(f" -> Logi:       {LOG_FILE}")
    print("=" * 60)
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    run()
