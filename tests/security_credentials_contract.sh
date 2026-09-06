#!/usr/bin/env sh
set -eu

if grep -E -n -r 'Frequency@123|freq-kiosk-4aaf57f19c605f82ac70fe65|OTA_PASSWORD "freqota"' \
  kiosk-terminal/src display-firmware/src; then
  printf '%s\n' 'security credentials contract: FAIL (embedded credential found)' >&2
  exit 1
fi

printf '%s\n' 'security credentials contract: PASS'
