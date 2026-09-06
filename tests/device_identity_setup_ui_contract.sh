#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rest="$root/kiosk-terminal/src/net/freq_rest_client.c"
rest_header="$root/kiosk-terminal/src/net/freq_rest_client.h"
setup="$root/kiosk-terminal/src/ui/screens/setup_screen.c"
portal="$root/display-firmware/src/ConfigPortal.cpp"

grep -q 'freq_device_id_get' "$rest_header"
grep -q 'freq_device_id_get' "$rest"
grep -q 'freq_device_id_get' "$setup"
grep -E -q 'Device ID|MAC Address' "$setup"
if grep -E -q 'API Key|MQTT Broker|MQTT Username|MQTT Password' "$setup"; then
  echo "kiosk setup must not request legacy controller/MQTT credentials" >&2
  exit 1
fi
grep -E -q 'MAC Address|deviceId' "$portal"

echo "device identity setup UI contract: PASS"
