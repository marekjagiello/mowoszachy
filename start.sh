#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8000}"

# Stop any running instance on this port
pkill -f "python3.*server.py $PORT" 2>/dev/null || true
pkill -f "python3 server.py" 2>/dev/null || true

echo "Uruchamianie MowoSzachy na porcie $PORT..."
nohup python3 "$DIR/server.py" "$PORT" </dev/null > /dev/null 2>&1 &
SERVER_PID=$!
disown $SERVER_PID 2>/dev/null || true
echo "Serwer działa w tle (PID: $SERVER_PID)."
sleep 1

python3 -c "
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    ip = s.getsockname()[0]
    s.close()
except:
    ip = '127.0.0.1'
print(f'Otwórz na telefonie (w tej samej sieci Wi-Fi): http://{ip}:$PORT/')
print(f'Otwórz lokalnie na PC: http://localhost:$PORT/')
"
