# Fixed-Cell Keyboard Input Design

## Context

On the Waveshare ESP32-S3-Touch-LCD-7B, typing in the setup keyboard can make
the displayed frame roll vertically even though the simulator remains stable.
The panel must retain its known-working hardware configuration: one PSRAM
framebuffer, LVGL direct mode, a 30 MHz pixel clock, ten-line RGB bounce
buffers, and a 160 MHz CPU clock.

LVGL's button-matrix implementation invalidates only the selected key during a
normal press. The current input preview is different: each character calls
`lv_label_set_text_static()` on a label almost as wide as the screen, and LVGL
invalidates that entire label. This produces a large PSRAM write burst while
the RGB peripheral is scanning the same framebuffer.

## Goals

- Keep typed text visible without redrawing the full input row.
- Limit an ordinary append or backspace to one fixed character-cell redraw.
- Keep keyboard and input geometry fixed while typing.
- Preserve all existing field limits, masking, keyboard modes, OK, and Cancel.
- Avoid per-key heap allocation and animation.

## Non-goals

- Changing RGB panel timings, framebuffer count, CPU/PSRAM clocks, or LVGL's
  display driver.
- Redesigning the setup form or changing saved configuration formats.
- Supporting arbitrary Unicode input; the on-screen keyboard is ASCII-only.

## Design

Replace the single wide `input_label` with 48 fixed character cells inside the
existing 984×44 input box. Each cell is an absolutely positioned LVGL label,
20 pixels wide and 44 pixels high. The cells use static two-byte backing
buffers (`character` plus null terminator), clipped text, no cursor, no
transition, and no scrolling.

The complete value remains in `input_text`; the cells are only its view. For
password fields, each occupied cell displays `*`. A space remains visually
blank but still occupies its cell.

Long values are displayed in 48-character pages. The active page contains the
most recently entered character, with page starts at offsets 0, 48, and 96.
Crossing a page boundary repopulates the cells once; ordinary typing and
backspace within a page update only the affected cell. This avoids shifting all
visible characters on every key after the first page fills.

Keyboard mode changes may still redraw the button matrix because its map
changes. Normal character, Space, and Backspace events must not replace the
matrix map or alter any object size or position.

## Data Flow

1. A button-matrix event updates `input_text` within the selected field's
   existing capacity.
2. The input-view function computes the active 48-character page.
3. If the page did not change, it compares the previous and current character
   for the affected slot and refreshes only that cell.
4. If the page changed, it refreshes all 48 cells once.
5. OK copies `input_text` to the setup field; Cancel discards it, as today.

## State and Lifetime

The setup context owns:

- 48 cell object pointers;
- 48 two-byte static text buffers;
- the active page offset;
- the existing full input and password state.

The modal owns the LVGL cell objects. Closing the modal deletes those objects;
the setup context remains valid until its root receives `LV_EVENT_DELETE`.
Opening another field initializes every cell and resets the page offset.

## Verification

Automated contracts will verify:

- the wide live-updated input label is absent;
- exactly 48 fixed cells and two-byte static buffers are defined;
- cell geometry is absolute and animation-free;
- the hardware display contract remains at its recovered values;
- existing field capacities and keyboard actions remain unchanged.

The simulator will verify append, Space, Backspace, password masking, page
boundaries, OK, and Cancel. Final acceptance must be performed on physical
hardware by typing slowly and quickly, including crossing character 48. The
screen must not roll, wrap, or move vertically during those operations.
