#!/bin/bash
echo "Zatrzymywanie serwera MowoSzachy..."
pkill -f "python3.*server.py" 2>/dev/null && echo "Serwer zatrzymany." || echo "Żaden serwer nie był uruchomiony."
