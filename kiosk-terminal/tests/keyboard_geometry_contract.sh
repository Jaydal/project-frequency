#!/bin/sh
set -eu

source_file="$(dirname "$0")/../src/ui/screens/setup_screen.c"

grep -q 'lv_obj_set_size(kb, 1024, 360);' "$source_file"
grep -q 'lv_obj_set_pos(kb, 0, 240);' "$source_file"
grep -q 'lv_label_create(input_box)' "$source_file"
