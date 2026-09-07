# Zone Borders & Text Alignment — Design Spec

## Overview

Two features for the multi-panel LED display system:

1. **Per-zone border rows** — exclude specific rows (0-15) from lighting up, creating a masked/bordered look
2. **Per-line text alignment** — left, center, or right align text within a zone

## Data Model (`zone-types.ts`)

```typescript
interface DisplayZone {
  panelStart: number;
  panelEnd: number;
  lines: DisplayLine[];
  borderRows?: { start: number; end: number }[];  // row ranges to keep dark (inclusive, 0-15)
}

interface DisplayLine {
  text: string;
  color: string;
  effect: 'SCROLL' | 'STATIC' | 'BLINK' | 'paginate';
  align?: 'left' | 'center' | 'right';  // defaults to 'center' for backward compat
}
```

### Border rows

- Array of inclusive row ranges, each `{ start: 0..15, end: 0..15, start <= end }`
- Pixels in these rows are never rendered (LED stays off)
- Example: `[{start:0, end:1}, {start:14, end:15}]` masks top 2 + bottom 2 rows
- Empty array or undefined = no borders
- Ranges may overlap, duplicates are harmless (clipped on render)

### Alignment

- `'center'` = default (matches existing behavior)
- `STATIC` / `paginate`: align text within zone bounds
- `SCROLL`: always scrolls from right edge regardless of alignment setting
- `BLINK`: always centers regardless of alignment setting

## UI: ZonePanel.tsx

New controls added below the existing line editor sections.

### Border rows editor

```
┌─────────────────────────────────┐
│  Border Rows (unlit rows)   [+] │
│  ┌──────┐  ┌──────┐  [x]       │
│  │  0   │→ │  1   │  remove    │
│  └──────┘  └──────┘            │
│  ┌──────┐  ┌──────┐  [x]       │
│  │  14  │→ │  15  │  remove    │
│  └──────┘  └──────┘            │
│  (start)   (end)               │
└─────────────────────────────────┘
```

- "Add border range" button (+ icon)
- Each range: two number inputs (start, end), range 0-15, validated so start ≤ end
- Remove button on each range
- Summary text: "Masking N rows"

### Alignment per line

In each line editor section, after the Effect dropdown, add:

```
┌─────────────────────────────────┐
│  Alignment                      │
│  [Left] [Center] [Right]        │
└─────────────────────────────────┘
```

Three toggle buttons, mutually exclusive.

## UI: P10Canvas.tsx

- Border rows rendered as dimmer/unlit LEDs (dark grey or very dim color)
- Text positioned at correct horizontal offset based on alignment

## Live Preview

A play/pause mode in the editor that simulates the real display cycling behavior with mock variable substitution.

### Mock Values panel

A collapsible panel in the editor sidebar that lets users set what each variable resolves to during preview:

```
┌─────────────────────────────────┐
│  Mock Values              [▼]   │
│  {court_name}  [ COURT 1    ]   │
│  {match_title} [ MATCH 5    ]   │
│  {timer}       [ 5:00       ]   │
│  {elapsed}     [ 2:30       ]   │
│  {queue_count} [ 3          ]   │
│  {next_name}   [ TEAM A     ]   │
│  {duration}    [ 60min      ]   │
│  {players}     [ P1 / P2    ]   │
│  {match_type}  [ Singles    ]   │
│  {next_match}  [ Next: Team ]   │
└─────────────────────────────────┘
```

- Default values shown above
- Stored as editor state only (not persisted to settings/supabase)
- Variable lookup: when a line contains `{timer}`, the mock panel value for `{timer}` is substituted before passing to P10Canvas

### Play/Pause toggle

- A **▶ Live Preview** / **■ Stop** button in the editor toolbar (DisplaySequenceEditorV2)
- On Play:
  1. Build a flat array of all pages: `[...idle.pages, ...prep.pages, ...game.pages]`
  2. Start at index 0
  3. Set a timer using the active page's `durationSeconds`
  4. On each tick, advance to next page (loop back to 0 at end)
  5. Replace variables using mock values before rendering on canvas
  6. Highlight the active page dot in PageToolbar
- On Stop:
  1. Clear timer
  2. Return to normal editing state (selected page)

### P10Canvas

No code changes needed — it already renders whatever zones it receives. The preview just feeds it cycled pages with mock-substituted text.

### PageToolbar

Accept optional `previewIndex?: number` prop. When set, highlight that page dot differently (e.g., pulsing green dot) to indicate it's the currently-displayed page in preview mode.

## MQTT Payload (`sports-caster.ts`)

Each zone in the JSON payload gains:

```json
{
  "panelStart": 0,
  "panelEnd": 2,
  "borderRows": [{"start": 0, "end": 1}, {"start": 14, "end": 15}],
  "lines": [
    {"text": "COURT 1", "color": "#00FF00", "effect": "STATIC", "align": "center"}
  ]
}
```

Both fields optional for backward compatibility with old firmware.

## Firmware

### IDisplayDriver.h

```cpp
struct ZoneLineRender {
  String text;
  uint8_t r, g, b;
  String effect;
  String align;  // NEW: "left", "center", "right" (default "center")
};

struct BorderRange {
  uint8_t start;
  uint8_t end;
};

struct ZoneRenderInfo {
  uint8_t panelStart;
  uint8_t panelEnd;
  uint8_t lineCount;
  ZoneLineRender lines[2];
  uint8_t borderCount;         // NEW: number of border ranges (0-4)
  BorderRange borderRanges[4]; // NEW: up to 4 ranges
};
```

### Hub75Driver.cpp

- `drawText5x7Scaled()` — add Y clipping against border rows: if a pixel's y falls in any border range, skip it
- `redraw()` — alignment handling: for left → x = zoneX; center → x = zoneX + (zoneW - tw) / 2; right → x = zoneX + zoneW - tw (clamp to ≥ zoneX)
- SCROLL ignores align (always scrolls from right), BLINK ignores align (always center)

### MqttDisplayClient.cpp

- Parse `borderRows[]` from zone JSON: up to 4 ranges
- Parse `align` from line JSON: default `"center"` if missing

## Backward Compatibility

- Old JSON without `borderRows` or `align` fields: firmware defaults to no borders and center alignment
- Old firmware that doesn't send `borderRows`/`align`: server code defaults to empty/undefined, no change in behavior
- Zone templates unchanged (no borders, center alignment)

## Files Changed

| File | Changes |
|------|---------|
| `web/src/components/display/zone-types.ts` | Add `borderRows` to DisplayZone, `align` to DisplayLine |
| `web/src/components/display/ZonePanel.tsx` | Add border rows editor, alignment selector |
| `web/src/components/display/P10Canvas.tsx` | Render border rows dimmed, alignment-aware text |
| `web/src/components/display/PageToolbar.tsx` | Accept `previewIndex` prop for preview highlight |
| `web/src/components/display/DisplaySequenceEditorV2.tsx` | Play/pause state, mock values panel, auto-cycle logic |
| `web/src/lib/display/sports-caster.ts` | Emit `borderRows` and `align` in payload |
| `display-firmware/src/IDisplayDriver.h` | Add `align`, `BorderRange`, `borderRanges` to structs |
| `display-firmware/src/Hub75Driver.cpp` | Clip border rows, handle alignment in redraw |
| `display-firmware/src/MqttDisplayClient.cpp` | Parse `borderRows` and `align` from JSON |
