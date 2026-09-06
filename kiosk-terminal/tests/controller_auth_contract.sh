#!/usr/bin/env sh
set -eu

source_file="$(dirname "$0")/../src/net/freq_rest_client.c"
join_block="$(awk '/freq_rest_join_queue/{inside=1} /freq_rest_cancel_queue/{inside=0} inside' "$source_file")"

printf '%s\n' "$join_block" | grep -q '"x-api-key"'
printf '%s\n' "$join_block" | grep -q 's_api_key'
printf '%s\n' "controller auth contract: PASS"
