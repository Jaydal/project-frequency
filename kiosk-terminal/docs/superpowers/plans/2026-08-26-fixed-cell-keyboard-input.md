# Fixed-Cell Keyboard Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the setup modal's screen-wide live text label with 48 fixed character cells so ordinary typing redraws only one small cell.

**Architecture:** Keep the full value in the existing `input_text` buffer and render it through a fixed array of 20×44 pixel LVGL labels. A comparison-based refresh function changes only cells whose character changed; 48-character page boundaries trigger the only multi-cell refresh. The recovered ESP32 display driver and clock configuration remain untouched.

**Tech Stack:** C, LVGL 8, ESP-IDF/PlatformIO, POSIX shell contract tests

---

## File Structure

- Modify `src/ui/screens/setup_screen.c`: own fixed-cell state, page calculation, incremental refresh, and modal cell creation.
- Create `tests/fixed_cell_input_contract.sh`: protect redraw scope, fixed geometry, paging state, masking, and the absence of the wide live-updated label.
- Modify `tests/static_keyboard_contract.sh`: retain the existing static keyboard and input-buffer behavior while replacing its old label expectations.

### Task 1: Add the Fixed-Cell Redraw Contract

**Files:**
- Create: `tests/fixed_cell_input_contract.sh`
- Modify: `tests/static_keyboard_contract.sh`

- [ ] **Step 1: Write the failing fixed-cell contract**

Create `tests/fixed_cell_input_contract.sh`:

```sh
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
```

Update `tests/static_keyboard_contract.sh` so it expects `refresh_input_cells(ctx)` and no longer expects `input_label` or `refresh_input_label`.

- [ ] **Step 2: Run the contract to verify it fails for the missing cells**

Run:

```sh
rtk sh tests/fixed_cell_input_contract.sh
```

Expected: FAIL because `INPUT_CELL_COUNT` and the fixed-cell state do not exist.

- [ ] **Step 3: Commit the failing contract**

```sh
rtk git add -- tests/fixed_cell_input_contract.sh tests/static_keyboard_contract.sh
rtk git commit -m "test: define fixed-cell input redraw contract"
```

### Task 2: Implement Incremental Character Cells

**Files:**
- Modify: `src/ui/screens/setup_screen.c`
- Test: `tests/fixed_cell_input_contract.sh`
- Test: `tests/static_keyboard_contract.sh`

- [ ] **Step 1: Add fixed-cell state to the setup context**

Add beside `SETUP_FIELD_COUNT`:

```c
#define INPUT_CELL_COUNT 48
#define INPUT_CELL_WIDTH 20
```

Replace `input_label` in `setup_ctx_t` with:

```c
lv_obj_t *input_cells[INPUT_CELL_COUNT];
char input_cell_text[INPUT_CELL_COUNT][2];
size_t input_page_start;
```

- [ ] **Step 2: Add page calculation and comparison-based cell refresh**

Replace `refresh_input_label()` with:

```c
static size_t input_page_for_length(size_t length) {
  if (length == 0) return 0;
  return ((length - 1) / INPUT_CELL_COUNT) * INPUT_CELL_COUNT;
}

static void set_input_cell(setup_ctx_t *ctx, size_t slot, char character) {
  if (!ctx->input_cells[slot]) return;
  if (ctx->input_cell_text[slot][0] == character &&
      ctx->input_cell_text[slot][1] == '\0') return;

  ctx->input_cell_text[slot][0] = character;
  ctx->input_cell_text[slot][1] = '\0';
  lv_obj_t *cell = ctx->input_cells[slot];
  lv_label_set_text_static(cell, ctx->input_cell_text[slot]);
}

static void refresh_input_cells(setup_ctx_t *ctx) {
  if (!ctx->input_cells[0]) return;

  size_t length = strlen(ctx->input_text);
  size_t page_start = input_page_for_length(length);
  ctx->input_page_start = page_start;

  for (size_t slot = 0; slot < INPUT_CELL_COUNT; slot++) {
    size_t text_index = page_start + slot;
    char character = '\0';
    if (text_index < length) {
      character = ctx->input_password ? '*' : ctx->input_text[text_index];
    }
    set_input_cell(ctx, slot, character);
  }
}
```

The loop compares every slot but calls LVGL only for changed cells. On ordinary append or backspace within a page, exactly one `lv_label_set_text_static()` call occurs.

- [ ] **Step 3: Clear cell references when closing the modal**

Extend `close_input_modal()` after deleting the modal:

```c
memset(ctx->input_cells, 0, sizeof(ctx->input_cells));
memset(ctx->input_cell_text, 0, sizeof(ctx->input_cell_text));
ctx->input_page_start = 0;
```

Keep the existing `editing_ta = NULL` and root visibility restoration.

- [ ] **Step 4: Route keyboard updates through the cell renderer**

In `static_keyboard_event_cb()`:

```c
if (!key || !ctx->input_cells[0]) return;
```

Replace the final call to the old label refresh with:

```c
refresh_input_cells(ctx);
```

OK and Cancel remain safe because `close_input_modal()` clears the pointers and `refresh_input_cells()` returns immediately.

- [ ] **Step 5: Create fixed labels in the existing input box**

Remove creation and styling of the wide `input_label`. Before creating cells, reset their backing state:

```c
memset(ctx->input_cells, 0, sizeof(ctx->input_cells));
memset(ctx->input_cell_text, 0, sizeof(ctx->input_cell_text));
ctx->input_page_start = 0;
```

Then create the absolute cells:

```c
for (size_t i = 0; i < INPUT_CELL_COUNT; i++) {
  lv_obj_t *cell = lv_label_create(input_box);
  ctx->input_cells[i] = cell;
  lv_obj_set_size(cell, INPUT_CELL_WIDTH, 44);
  lv_obj_set_pos(cell, i * INPUT_CELL_WIDTH, 0);
  lv_label_set_long_mode(cell, LV_LABEL_LONG_CLIP);
  lv_obj_set_style_text_align(cell, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_color(cell, kiosk_theme_color_text_strong(), 0);
  lv_obj_set_style_pad_all(cell, 0, 0);
  lv_obj_set_style_anim_time(cell, 0, 0);
  lv_obj_clear_flag(cell, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
  lv_label_set_text_static(cell, ctx->input_cell_text[i]);
}
refresh_input_cells(ctx);
```

Do not change the input-box or keyboard size and position.

- [ ] **Step 6: Run the focused contracts**

Run:

```sh
rtk sh tests/fixed_cell_input_contract.sh
rtk sh tests/static_keyboard_contract.sh
rtk sh tests/keyboard_geometry_contract.sh
```

Expected: all commands exit 0 with no output.

- [ ] **Step 7: Commit the fixed-cell implementation**

```sh
rtk git add -- src/ui/screens/setup_screen.c tests/fixed_cell_input_contract.sh tests/static_keyboard_contract.sh
rtk git commit -m "fix: redraw keyboard input by character cell"
```

### Task 3: Regression and Hardware Build Verification

**Files:**
- Verify: `src/hal_esp32/esp32_display.c`
- Verify: `sdkconfig.waveshare-7b`
- Test: `tests/display_sync_contract.sh`
- Test: `tests/hardware_clock_contract.sh`

- [ ] **Step 1: Run every local contract**

Run each command separately:

```sh
rtk sh tests/fixed_cell_input_contract.sh
rtk sh tests/static_keyboard_contract.sh
rtk sh tests/keyboard_geometry_contract.sh
rtk sh tests/display_sync_contract.sh
rtk sh tests/hardware_clock_contract.sh
rtk git diff --check
```

Expected: all commands exit 0 and `git diff --check` reports no errors.

- [ ] **Step 2: Build the Waveshare firmware**

Run:

```sh
rtk pio run -e waveshare-7b
```

Expected: `[SUCCESS]`; generated configuration contains 30 MHz panel code, 160 MHz CPU, 80 MHz PSRAM, one framebuffer, and direct mode.

- [ ] **Step 3: Perform physical acceptance**

Flash with:

```sh
pio run -e waveshare-7b -t upload
```

On the physical kiosk, verify:

1. Open each setup field.
2. Type one character every two seconds for at least 20 characters.
3. Type quickly for at least 20 characters.
4. Backspace slowly and quickly.
5. Verify password masking.
6. Enter 49 characters to cross a page boundary.
7. Use ABC, abc, and 123 modes.
8. Confirm OK saves and Cancel discards.

Expected: the keyboard and screen never roll, wrap, flicker, or move vertically. One redraw at the 48-character page boundary is acceptable only if it does not disturb scanout.
