# Zone Borders & Text Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-zone border row exclusion and per-line text alignment to the display sequence editor and firmware.

**Architecture:** Frontend types + UI + payload generation, then firmware structs + parsing + rendering. Each layer is independent but the data model flows through all of them.

**Tech Stack:** TypeScript (Next.js), C++ (ESP32 Arduino), MQTT JSON payload

---

## File Structure

| File | Role |
|------|------|
| `web/src/components/display/zone-types.ts` | Type definitions: `borderRows` on DisplayZone, `align` on DisplayLine |
| `web/src/components/display/ZonePanel.tsx` | UI: border range editor + alignment toggle per line |
| `web/src/components/display/P10Canvas.tsx` | SVG preview: dim border rows, align text correctly |
| `web/src/components/display/MockValuesPanel.tsx` | Editable mock variable values for live preview |
| `web/src/components/display/PageToolbar.tsx` | Accept `previewIndex` prop for preview highlight |
| `web/src/components/display/DisplaySequenceEditorV2.tsx` | Play/pause state, mock values, auto-cycle logic |
| `web/src/lib/display/sports-caster.ts` | MQTT payload: emit `borderRows` and `align` |
| `display-firmware/src/IDisplayDriver.h` | C++ structs: `align`, `BorderRange`, `borderRanges` |
| `display-firmware/src/Hub75Driver.cpp` | Rendering: clip border rows, alignment-based x-position |
| `display-firmware/src/MqttDisplayClient.cpp` | JSON parsing: `borderRows[]` and `align` |

---

### Task 1: Update Types (zone-types.ts)

**Files:**
- Modify: `web/src/components/display/zone-types.ts`

- [ ] **Add `borderRows` to DisplayZone and `align` to DisplayLine**

```typescript
export interface DisplayLine {
  text: string;
  color: string;
  effect: 'SCROLL' | 'STATIC' | 'BLINK' | 'paginate';
  align?: 'left' | 'center' | 'right';
}

export interface DisplayZone {
  panelStart: number;
  panelEnd: number;
  lines: DisplayLine[];
  borderRows?: { start: number; end: number }[];
}
```

- [ ] **Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20` (check for no errors)

- [ ] **Commit**

```bash
git add web/src/components/display/zone-types.ts
git commit -m "feat: add borderRows and align to zone types"
```

---

### Task 2: Add border rows editor + alignment selector to ZonePanel

**Files:**
- Modify: `web/src/components/display/ZonePanel.tsx`

- [ ] **Add border rows editor section after the "Lines" section**

Insert between lines 116-117 (after line count buttons, before the map over zone.lines):

```tsx
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-zinc-500">Border Rows (unlit)</Label>
          <button
            onClick={() => {
              const rows = [...(zone.borderRows || []), { start: 0, end: 0 }];
              onChange({ ...zone, borderRows: rows });
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-1"
          >
            + Add range
          </button>
        </div>
        {(zone.borderRows || []).map((br, bri) => (
          <div key={bri} className="flex items-center gap-2">
            <Input
              type="number" min={0} max={15}
              value={br.start}
              onChange={e => {
                const rows = [...(zone.borderRows || [])];
                rows[bri] = { ...rows[bri], start: Math.min(Math.max(Number(e.target.value), 0), 15) };
                onChange({ ...zone, borderRows: rows });
              }}
              className="w-16 h-7 text-xs bg-zinc-950 border-zinc-700 text-zinc-200"
              placeholder="0"
            />
            <span className="text-xs text-zinc-600">→</span>
            <Input
              type="number" min={0} max={15}
              value={br.end}
              onChange={e => {
                const rows = [...(zone.borderRows || [])];
                rows[bri] = { ...rows[bri], end: Math.min(Math.max(Number(e.target.value), 0), 15) };
                onChange({ ...zone, borderRows: rows });
              }}
              className="w-16 h-7 text-xs bg-zinc-950 border-zinc-700 text-zinc-200"
              placeholder="0"
            />
            <button
              onClick={() => {
                const rows = (zone.borderRows || []).filter((_, i) => i !== bri);
                onChange({ ...zone, borderRows: rows.length > 0 ? rows : undefined });
              }}
              className="text-xs text-red-500 hover:text-red-400 px-1"
            >
              x
            </button>
          </div>
        ))}
        {(zone.borderRows || []).length > 0 && (
          <p className="text-xs text-zinc-600">
            Masking {(zone.borderRows || []).reduce((s, r) => s + (r.end - r.start + 1), 0)} row{(zone.borderRows || []).reduce((s, r) => s + (r.end - r.start + 1), 0) > 1 ? 's' : ''}
          </p>
        )}
      </div>
```

- [ ] **Add alignment toggle to each line editor section**

Insert after the Effect dropdown (after line ~188, before the closing `</div>` of each line section):

```tsx
          <div className="space-y-1">
            <Label className="text-xs text-zinc-500">Alignment</Label>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => updateLine(li, { align: a })}
                  className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                    (line.align || 'center') === a
                      ? 'bg-zinc-700 text-white'
                      : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Commit**

```bash
git add web/src/components/display/ZonePanel.tsx
git commit -m "feat: add border rows editor and alignment selector to ZonePanel"
```

---

### Task 3: Update P10Canvas preview

**Files:**
- Modify: `web/src/components/display/P10Canvas.tsx`

- [ ] **Update `renderZoneDots` to handle alignment and border rows**

Replace `renderZoneDots` function and add a `isBorderRow` helper:

```typescript
function isBorderRow(y: number, borderRows?: { start: number; end: number }[]): boolean {
  if (!borderRows || borderRows.length === 0) return false;
  return borderRows.some(br => y >= br.start && y <= br.end);
}

function renderZoneDots(zone: DisplayZone): { x: number; y: number; color: string }[] {
  const zoneWidth = (zone.panelEnd - zone.panelStart + 1) * PANEL_W;
  const zoneX = getPanelX(zone.panelStart);
  const isTwoLine = zone.lines.length === 2;
  const scale = isTwoLine ? 1 : 2;
  const charH = CHAR_H * scale;
  const totalTextH = zone.lines.length * charH + (zone.lines.length - 1) * (isTwoLine ? 2 : 0);
  const startY = Math.floor((PANEL_H - totalTextH) / 2);

  const dots: { x: number; y: number; color: string }[] = [];

  zone.lines.forEach((line, li) => {
    const text = line.text.toUpperCase();
    const textW = text.length * CELL_W * scale;
    const align = line.align || 'center';
    let xOff: number;
    if (align === 'left' || line.effect === 'SCROLL') {
      xOff = zoneX;
    } else if (align === 'right') {
      xOff = zoneX + Math.max(0, zoneWidth - textW);
    } else {
      xOff = zoneX + Math.floor((zoneWidth - textW) / 2);
    }
    const yOff = startY + li * (charH + (isTwoLine ? 2 : 0));
    const rawDots = textToDots(text, 0, 0);
    for (const d of rawDots) {
      const dotY = yOff + d.y * scale;
      if (isBorderRow(dotY, zone.borderRows)) continue;
      dots.push({
        x: xOff + d.x * scale,
        y: dotY,
        color: line.color || '#00FF00',
      });
    }
  });

  return dots;
}
```

- [ ] **Add border row visual indicator to the SVG**

After the scanline overlay (around line 173), add a border row dimming layer:

```tsx
            {zones.map((zone, zi) => {
              if (!zone.borderRows || zone.borderRows.length === 0) return null;
              const zx = getPanelX(zone.panelStart);
              const zw = (zone.panelEnd - zone.panelStart + 1) * PANEL_W;
              return zone.borderRows.map((br, bri) => (
                <rect
                  key={`border-${zi}-${bri}`}
                  x={zx}
                  y={br.start}
                  width={zw}
                  height={br.end - br.start + 1}
                  fill="rgba(255,0,0,0.08)"
                  stroke="rgba(255,0,0,0.25)"
                  strokeWidth={0.15}
                  rx={0.1}
                  pointerEvents="none"
                />
              ));
            })}
```

- [ ] **Update the border row indicator to use the imported types**

Add import for `DisplayZone` at the top (already imported).

- [ ] **Commit**

```bash
git add web/src/components/display/P10Canvas.tsx
git commit -m "feat: render border rows and alignment in P10Canvas preview"
```

---

### Task 4: Update sports-caster MQTT payload

**Files:**
- Modify: `web/src/lib/display/sports-caster.ts`

- [ ] **Read the current file to understand the payload structure**

- [ ] **Emit `borderRows` and `align` in zone JSON**

In the zone serialization loop where zones are output, add:

```typescript
if (zone.borderRows && zone.borderRows.length > 0) {
  jsonZone.borderRows = zone.borderRows;
}
// ...
jsonLine.align = line.align || undefined;  // omit if "center" (default)
```

- [ ] **Commit**

```bash
git add web/src/lib/display/sports-caster.ts
git commit -m "feat: emit borderRows and align in MQTT payload"
```

---

### Task 5: Update firmware structs (IDisplayDriver.h)

**Files:**
- Modify: `display-firmware/src/IDisplayDriver.h`

- [ ] **Add `align` to ZoneLineRender and `BorderRange` struct + `borderCount`/`borderRanges` to ZoneRenderInfo**

```cpp
struct ZoneLineRender {
  String text;
  uint8_t r;
  uint8_t g;
  uint8_t b;
  String effect;
  String align;            // "left", "center", "right" (default "center")
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
  uint8_t borderCount;
  BorderRange borderRanges[4];
};
```

- [ ] **Commit**

```bash
git add display-firmware/src/IDisplayDriver.h
git commit -m "feat(firmware): add align and borderRanges to render structs"
```

---

### Task 6: Update firmware rendering (Hub75Driver.cpp)

**Files:**
- Modify: `display-firmware/src/Hub75Driver.cpp`

- [ ] **Add `MAX_BORDER_RANGES` constant and border storage to ZoneState**

```cpp
static constexpr uint8_t MAX_BORDER_RANGES = 4;

struct ZoneState {
  uint8_t panelStart;
  uint8_t panelEnd;
  uint8_t lineCount;
  bool hasData;
  struct {
    String text;
    uint16_t color;
    String effect;
    String align;
    int16_t scrollX;
    unsigned long scrollLastTick;
  } lines[MAX_LINES_PER_ZONE];
  uint8_t borderCount;
  BorderRange borderRanges[MAX_BORDER_RANGES];
};
```

- [ ] **Add `isBorderRow` helper function before `redraw()`**

```cpp
static bool isBorderRow(uint8_t y, uint8_t borderCount, const BorderRange* ranges) {
  for (uint8_t i = 0; i < borderCount; i++) {
    if (y >= ranges[i].start && y <= ranges[i].end) return true;
  }
  return false;
}
```

- [ ] **Update `setZones()` to copy border data**

In `setZones()`, after copying `dst.lineCount = src.lineCount;`:

```cpp
    dst.borderCount = src.borderCount;
    for (uint8_t bi = 0; bi < src.borderCount && bi < MAX_BORDER_RANGES; bi++) {
      dst.borderRanges[bi] = src.borderRanges[bi];
    }
```

Also copy the `align` field in the lines loop:

```cpp
      dst.lines[li].align = src.lines[li].align;
```

- [ ] **Update `redraw()` to handle alignment and clip border rows**

Replace the x-position logic in `redraw()`:

```cpp
      int x;
      String align = line.align;
      if (align.length() == 0) align = "center";

      if (line.effect == "SCROLL") {
        x = zoneX + line.scrollX;
      } else if (align == "left") {
        x = zoneX;
      } else if (align == "right") {
        int tw = textWidth5x7Scaled(display.c_str(), scale);
        x = zoneX + max(0, zoneW - tw);
      } else {
        int tw = textWidth5x7Scaled(display.c_str(), scale);
        x = zoneX + (zoneW - tw) / 2;
      }
```

- [ ] **Update `drawText5x7Scaled()` to skip border row pixels**

In the inner loop, before `drawPixelMapped`, add:

```cpp
                if (isBorderRow(py, z.borderCount, z.borderRanges)) continue;
```

But `z` is not in scope in `drawText5x7Scaled`. Better approach: pass `borderCount` and `borderRanges` as parameters, or check in `drawPixelMapped`. The simplest: modify `drawPixelMapped` to accept border info.

Actually, the cleanest approach: add border check inside `drawText5x7Scaled` by passing the border arrays from `redraw()`. Let me change the signature.

In `redraw()`:
```cpp
      drawText5x7Scaled(display.c_str(), x, y, line.color, scale, zoneX, zoneXEnd);
```
Change to:
```cpp
      drawText5x7Scaled(display.c_str(), x, y, line.color, scale, zoneX, zoneXEnd, z.borderCount, z.borderRanges);
```

New `drawText5x7Scaled` signature:
```cpp
void Hub75Driver::drawText5x7Scaled(const char* s, int x, int y, uint16_t color, int scale, int clipXStart, int clipXEnd, uint8_t borderCount, const BorderRange* borderRanges) {
```

And in the pixel-drawing loop:
```cpp
                int py = y + row * scale + dy;
                if (isBorderRow(py, borderCount, borderRanges)) continue;
                if (px >= clipXStart && px < clipXEnd && py >= 0 && py < WF2_RES_Y) {
```

- [ ] **Update `showRow()` fallback to initialize border fields**

```cpp
  z.borderCount = 0;
```

- [ ] **Commit**

```bash
git add display-firmware/src/Hub75Driver.cpp
git commit -m "feat(firmware): render border row clipping and text alignment"
```

---

### Task 7: Update firmware JSON parsing (MqttDisplayClient.cpp)

**Files:**
- Modify: `display-firmware/src/MqttDisplayClient.cpp`

- [ ] **Parse `align` from line JSON**

In the line parsing loop in `handleMessage()`:

```cpp
              z.lines[z.lineCount].align = line["align"] | "center";
```

- [ ] **Parse `borderRows[]` from zone JSON**

After parsing lines, in the zone parsing loop:

```cpp
          JsonArray borderArr = zone["borderRows"];
          z.borderCount = 0;
          if (!borderArr.isNull()) {
            for (JsonObject br : borderArr) {
              if (z.borderCount >= 4) break;
              z.borderRanges[z.borderCount].start = br["start"] | 0;
              z.borderRanges[z.borderCount].end = br["end"] | 0;
              z.borderCount++;
            }
          }
```

- [ ] **Add border/align initialization in legacy flat page fallback**

```cpp
        z.borderCount = 0;
        z.lines[0].align = "center";
```

- [ ] **Commit**

```bash
git add display-firmware/src/MqttDisplayClient.cpp
git commit -m "feat(firmware): parse borderRows and align from MQTT JSON"
```

---

### Task 8: MockValuesPanel component

**Files:**
- Create: `web/src/components/display/MockValuesPanel.tsx`

- [ ] **Create MockValuesPanel with editable inputs for each variable**

```tsx
'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export interface MockValues {
  court_name: string;
  match_title: string;
  match_type: string;
  duration: string;
  players: string;
  timer: string;
  elapsed: string;
  queue_count: string;
  next_name: string;
  next_match: string;
}

export const DEFAULT_MOCK_VALUES: MockValues = {
  court_name: 'COURT 1',
  match_title: 'MATCH 5',
  match_type: 'Singles',
  duration: '60min',
  players: 'Player 1 / Player 2',
  timer: '5:00',
  elapsed: '2:30',
  queue_count: '3',
  next_name: 'TEAM A',
  next_match: 'Next: TEAM B',
};

interface Props {
  values: MockValues;
  onChange: (values: MockValues) => void;
}

export function MockValuesPanel({ values, onChange }: Props) {
  const entries = Object.entries(values) as [keyof MockValues, string][];
  return (
    <div className="space-y-2 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
      <Label className="text-xs text-zinc-400 font-medium">Mock Values</Label>
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs text-zinc-600 w-24 shrink-0 font-mono">{`{${key}}`}</span>
          <Input
            value={val}
            onChange={e => onChange({ ...values, [key]: e.target.value })}
            className="h-6 text-xs bg-zinc-950 border-zinc-700 text-zinc-200 flex-1"
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add web/src/components/display/MockValuesPanel.tsx
git commit -m "feat: add MockValuesPanel for editable preview variables"
```

---

### Task 9: Update PageToolbar with previewIndex

**Files:**
- Modify: `web/src/components/display/PageToolbar.tsx`

- [ ] **Add optional `previewIndex` prop**

```tsx
interface Props {
  pageCount: number;
  currentPage: number;
  durationSeconds: number;
  previewIndex?: number;           // NEW: page currently shown in live preview
  onPageSelect: (index: number) => void;
  onAddPage: () => void;
  onRemovePage: () => void;
  onDurationChange: (seconds: number) => void;
}
```

- [ ] **Update page dot rendering to highlight previewIndex**

In the page dot loop, change the button style:

```tsx
        {Array.from({ length: pageCount }).map((_, i) => (
          <button
            key={i}
            onClick={() => onPageSelect(i)}
            className={`w-6 h-6 text-xs rounded-full font-medium transition-colors ${
              i === currentPage
                ? 'bg-zinc-700 text-white'
                : i === previewIndex
                ? 'bg-green-900/50 text-green-400 border border-green-500/50'
                : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {i + 1}
          </button>
        ))}
```

- [ ] **Commit**

```bash
git add web/src/components/display/PageToolbar.tsx
git commit -m "feat: add previewIndex prop to PageToolbar for live preview highlight"
```

---

### Task 10: Add live preview logic to DisplaySequenceEditorV2

**Files:**
- Modify: `web/src/components/display/DisplaySequenceEditorV2.tsx`

- [ ] **Add imports and state for preview + mock values**

```tsx
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MockValuesPanel, DEFAULT_MOCK_VALUES, type MockValues } from './MockValuesPanel';
```

Add state:

```tsx
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [mockValues, setMockValues] = useState<MockValues>(DEFAULT_MOCK_VALUES);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Build flat page list and mock substitution helper**

```tsx
  const flatPages = useMemo(() => {
    const all: { page: ZonePage; section: string }[] = [];
    for (const key of SECTIONS) {
      for (const p of sections[key].pages) {
        all.push({ page: p, section: key });
      }
    }
    return all;
  }, [sections]);

  function substituteMockVariables(text: string): string {
    let result = text;
    for (const [key, val] of Object.entries(mockValues)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
    }
    return result;
  }
```

- [ ] **Add preview zones computation**

```tsx
  const previewZones = useMemo(() => {
    if (!isPreviewing || flatPages.length === 0) return zones;
    const activePage = flatPages[previewPageIndex].page;
    return activePage.zones.map(zone => ({
      ...zone,
      lines: zone.lines.map(line => ({
        ...line,
        text: substituteMockVariables(line.text),
      })),
    }));
  }, [isPreviewing, previewPageIndex, flatPages, zones, mockValues]);
```

- [ ] **Add play/pause handlers**

```tsx
  function startPreview() {
    setIsPreviewing(true);
    setPreviewPageIndex(0);
  }

  function stopPreview() {
    setIsPreviewing(false);
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }

  // Auto-advance timer
  useEffect(() => {
    if (!isPreviewing || flatPages.length === 0) return;
    const currentPage = flatPages[previewPageIndex].page;
    const ms = (currentPage.durationSeconds || 10) * 1000;
    previewTimerRef.current = setTimeout(() => {
      setPreviewPageIndex(prev => (prev + 1) % flatPages.length);
    }, ms);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [isPreviewing, previewPageIndex, flatPages]);
```

- [ ] **Add play/pause button and MockValuesPanel to the editor toolbar**

Replace the section tabs area with added controls. Insert after the `TemplateDropdown` / before the Save button:

```tsx
          <Button
            onClick={isPreviewing ? stopPreview : startPreview}
            size="sm"
            variant={isPreviewing ? 'destructive' : 'default'}
            className="h-7 text-xs"
          >
            {isPreviewing ? '■ Stop' : '▶ Live Preview'}
          </Button>
```

And below the section tabs, conditionally show MockValuesPanel when previewing:

```tsx
      {isPreviewing && (
        <MockValuesPanel values={mockValues} onChange={setMockValues} />
      )}
```

- [ ] **Pass `previewIndex` to PageToolbar when previewing**

```tsx
      <PageToolbar
        pageCount={section.pages.length}
        currentPage={pageIdx}
        previewIndex={isPreviewing ? previewPageIndex : undefined}
        ...
      />
```

- [ ] **Use `previewZones` instead of `zones` for the P10Canvas**

```tsx
          <P10Canvas
            zones={previewZones}
            selectedZoneIndex={isPreviewing ? null : selectedZone}
            onZoneSelect={isPreviewing ? () => {} : setSelectedZone}
          />
```

- [ ] **Commit**

```bash
git add web/src/components/display/DisplaySequenceEditorV2.tsx
git commit -m "feat: add live preview with mock variables and auto-cycle"
```

---

## Self-Review Check

**Spec coverage:**
- Data model (borderRows on Zone, align on Line): Task 1
- UI border rows editor: Task 2
- UI alignment selector: Task 2
- P10Canvas border row dimming: Task 3
- P10Canvas alignment rendering: Task 3
- MQTT payload emission: Task 4
- Firmware structs: Task 5
- Firmware border clipping: Task 6
- Firmware alignment rendering: Task 6
- Firmware JSON parsing: Task 7
- MockValuesPanel component: Task 8
- PageToolbar previewIndex prop: Task 9
- Live preview play/pause + auto-cycle + mock substitution: Task 10

All spec requirements covered. No placeholders. Type names consistent across all tasks.
