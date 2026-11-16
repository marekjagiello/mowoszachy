#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Uruchomienie serwera
"$DIR/start.sh" 8000

# Pobranie lokalnego adresu IP w sieci Wi-Fi
IP=$(python3 -c "
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    ip = s.getsockname()[0]
    s.close()
    print(ip)
except:
    print('127.0.0.1')
")

# Powiadomienie na pulpicie
if command -v notify-send >/dev/null 2>&1; then
    notify-send -i "$DIR/assets/icon-512.png" \
        "♞ MowoSzachy uruchomione" \
        "Serwer działa na porcie 8000!\n• PC: http://localhost:8000\n• Telefon: http://${IP}:8000"
fi

# Otwarcie aplikacji w domyślnej przeglądarce
if command -v xdg-open >/dev/null 2>&1; then
    sleep 0.5
    xdg-open "http://localhost:8000" >/dev/null 2>&1 &
fi
