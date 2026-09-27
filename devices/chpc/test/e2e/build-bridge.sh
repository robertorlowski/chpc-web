#!/bin/sh
# Kompiluje most łańcucha: firmware chpc (symulacja) + logika co. Wymaga g++ (MinGW) i bibliotek pobranych
# przez "pio test -e native" w repozytorium co (ArduinoJson w .pio/libdeps/native).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
CHPC="$HERE/../.."
CO="${CO_DIR:-$CHPC/../heatpump}"
g++ -std=gnu++17 -O1 -w \
  -c "$HERE/bridge_chpc.cpp" -I "$CHPC/test/sim_env" -o "$HERE/bridge_chpc.o"
g++ -std=gnu++17 -O1 -w \
  -I "$CO/src" -I "$CO/.pio/libdeps/native/ArduinoJson/src" \
  "$HERE/bridge_main.cpp" "$CO/src/operation_parser.cpp" "$CO/src/operation_controller.cpp" \
  "$CO/src/modbus_frame.cpp" "$CO/src/cop_estimator.cpp" "$HERE/bridge_chpc.o" \
  -o "$HERE/bridge.exe"
echo "bridge.exe gotowy"
