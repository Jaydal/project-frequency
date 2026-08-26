#!/bin/sh
set -eu

source_file="$(dirname "$0")/../src/ui/screens/setup_screen.c"

grep -q 'lv_btnmatrix_create(ctx->input_modal)' "$source_file"
grep -q 'lv_btnmatrix_set_map' "$source_file"
! grep -q 'lv_keyboard_create' "$source_file"
! grep -q 'lv_textarea_create(ctx->input_modal)' "$source_file"
grep -q 'lv_label_create(input_box)' "$source_file"
grep -q 'refresh_input_cells(ctx)' "$source_file"
! grep -q 'input_label' "$source_file"
! grep -q 'refresh_input_label' "$source_file"
