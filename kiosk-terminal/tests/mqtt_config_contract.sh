#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
client="$root/kiosk-terminal/src/net/freq_rest_client.c"
header="$root/kiosk-terminal/src/net/freq_rest_client.h"
ui="$root/kiosk-terminal/src/ui/ui_app.c"

grep -q 'freq_rest_fetch_mqtt_config' "$header"
grep -q '/api/controller/config' "$client"
grep -q 'x-api-key' "$client"
grep -q 'freq_rest_fetch_mqtt_config(' "$ui"

echo "kiosk MQTT config contract: PASS"
