#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
portal="$root/display-firmware/src/ConfigPortal.cpp"
header="$root/display-firmware/src/ConfigPortal.h"
main="$root/display-firmware/src/main.cpp"
credentials="$root/display-firmware/src/wifi_config.h"

grep -q 'fetchMqttConfig' "$header"
grep -q 'HTTPClient' "$portal"
grep -q 'x-device-id' "$portal"
grep -q 'fetchMqttConfig(' "$main"
grep -q 'x-device-id' "$portal"
if grep -E -q '#define MQTT_(USER|PASSWORD)' "$credentials"; then
  echo "display firmware must not ship MQTT credentials" >&2
  exit 1
fi

echo "display config bootstrap contract: PASS"
