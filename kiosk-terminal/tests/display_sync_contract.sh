#!/bin/sh
set -eu

source_file="$(dirname "$0")/../src/hal_esp32/esp32_display.c"

grep -q '\.pclk_hz[[:space:]]*= 30 \* 1000 \* 1000' "$source_file"
grep -q '\.num_fbs[[:space:]]*= 1' "$source_file"
grep -q '\.bounce_buffer_size_px = LCD_H_RES \* 10' "$source_file"
grep -q 'esp_lcd_rgb_panel_get_frame_buffer(s_panel, 1, &fb0)' "$source_file"
grep -q 's_disp_drv.direct_mode = 1' "$source_file"
grep -q 'esp_lcd_rgb_panel_register_event_callbacks' "$source_file"

if grep -q 'esp_lcd_panel_draw_bitmap' "$source_file"; then
  echo "display flush must not copy a second full-screen PSRAM buffer" >&2
  exit 1
fi

if grep -q 'ulTaskNotifyTake(pdTRUE, portMAX_DELAY)' "$source_file"; then
  echo "direct-mode flush must not block on frame-copy notifications" >&2
  exit 1
fi
