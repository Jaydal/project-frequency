#!/bin/sh
set -eu

source_file="$(dirname "$0")/../src/ui/screens/setup_screen.c"

grep -q '^#define INPUT_CELL_COUNT 48$' "$source_file"
grep -q '^#define INPUT_CELL_WIDTH 20$' "$source_file"
grep -q 'lv_obj_t \*input_cells\[INPUT_CELL_COUNT\];' "$source_file"
grep -q 'char input_cell_text\[INPUT_CELL_COUNT\]\[2\];' "$source_file"
grep -q 'size_t input_page_start;' "$source_file"
grep -q 'static size_t input_page_for_length(size_t length)' "$source_file"
grep -q 'static void refresh_input_cells(setup_ctx_t \*ctx)' "$source_file"
grep -q 'lv_obj_set_size(cell, INPUT_CELL_WIDTH, 44);' "$source_file"
grep -q 'lv_obj_set_pos(cell, i \* INPUT_CELL_WIDTH, 0);' "$source_file"
grep -q 'lv_label_set_text_static(cell, ctx->input_cell_text\[slot\]);' "$source_file"

if grep -q 'lv_obj_t \*input_label;' "$source_file"; then
  echo "wide input label state must be removed" >&2
  exit 1
fi

if grep -q 'refresh_input_label' "$source_file"; then
  echo "wide input label refresh must be removed" >&2
  exit 1
fi
