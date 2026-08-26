#!/bin/sh
set -eu

config_file="$(dirname "$0")/../sdkconfig.waveshare-7b"
defaults_file="$(dirname "$0")/../sdkconfig.defaults"
platform_file="$(dirname "$0")/../platformio.ini"

grep -q '^CONFIG_ESPTOOLPY_FLASHFREQ_80M=y$' "$config_file"
grep -q '^CONFIG_ESPTOOLPY_FLASHFREQ="80m"$' "$config_file"
grep -q '^CONFIG_SPIRAM_SPEED_80M=y$' "$config_file"
grep -q '^CONFIG_SPIRAM_SPEED=80$' "$config_file"
grep -q '^CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ_160=y$' "$config_file"
grep -q '^CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ=160$' "$config_file"

grep -q '^CONFIG_ESPTOOLPY_FLASHFREQ_80M=y$' "$defaults_file"
grep -q '^CONFIG_SPIRAM_SPEED_80M=y$' "$defaults_file"
if grep -q '^board_build.f_flash = 120000000L$' "$platform_file"; then
  echo "installed esptool cannot encode a 120 MHz image header" >&2
  exit 1
fi
