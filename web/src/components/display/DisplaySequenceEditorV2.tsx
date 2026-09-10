'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { P10Canvas } from './P10Canvas';
import { ZonePanel } from './ZonePanel';
import { PageToolbar } from './PageToolbar';
import { TemplateDropdown } from './TemplateDropdown';
import { ZONE_TEMPLATES, type ZoneTemplate } from './zone-types';
import type { DisplayZone, DisplayLine, ZonePage } from './zone-types';
import { MockValuesPanel, DEFAULT_MOCK_VALUES, type MockValues } from './MockValuesPanel';

interface SectionState {
  interval: number;
  pages: ZonePage[];
}

type SectionKey = 'idle' | 'game';

const SECTIONS: SectionKey[] = ['idle', 'game'];

const DEFAULTS: string = JSON.stringify({
  idle: {
    interval: 10,
    pages: [
      {
        durationSeconds: 10,
        zones: [
          {
            panelStart: 0,
            panelEnd: 2,
            lines: [{ text: '{court_name}', color: '#00FF00', effect: 'STATIC' }],
          },
        ],
      },
      {
        durationSeconds: 10,
        hideIfEmpty: ["{next_match}"],
        zones: [
          {
            panelStart: 0,
            panelEnd: 2,
            lines: [{ text: 'UP NEXT: {next_match}', color: '#FFFF00', effect: 'SCROLL' }],
          },
        ],
      },
    ],
  },
  game: {
    interval: 10,
    pages: [
      {
        durationSeconds: 10,
        zones: [
          {
            panelStart: 0,
            panelEnd: 1,
            lines: [
              { text: 'NOW PLAYING', color: '#00FF00', effect: 'STATIC' },
              { text: '{match_title}', color: '#FFFFFF', effect: 'SCROLL' },
            ],
          },
          {
            panelStart: 2,
            panelEnd: 2,
            lines: [{ text: '{timer}', color: '#00FFFF', effect: 'STATIC' }],
          },
        ],
      },
    ],
  },
}, null, 2);

function convertLineToSubpages(line: any): any {
  if (line.subpages) return line;
  return {
    ...line,
    subpages: [{
      text: line.text || '',
      color: line.color || '#00FF00',
      effect: line.effect || 'STATIC',
      ...(line.align ? { align: line.align } : {}),
      ...(line.scrollSpeed != null ? { scrollSpeed: line.scrollSpeed } : {}),
      durationMs: 5000,
    }],
  };
}

function convertZoneToNewFormat(zone: any): any {
  return {
    ...zone,
    lines: (zone.lines || []).map(convertLineToSubpages),
  };
}

interface Props {
  sequence: string;
}

type ParseResult = { sections: Record<SectionKey, SectionState>; parseError: string | null };

function getDefaultSections(): Record<SectionKey, SectionState> {
  // Hardcoded minimal fallback — avoids calling parseSequenceRaw which could recurse
  return {
    idle: { interval: 10, pages: [{ durationSeconds: 10, zones: [{ panelStart: 0, panelEnd: 2, lines: [{ subpages: [{ text: '{court_name}', color: '#00FF00', effect: 'STATIC', durationMs: 5000 }] }] }] }, { durationSeconds: 10, hideIfEmpty: ["{next_match}"], zones: [{ panelStart: 0, panelEnd: 2, lines: [{ subpages: [{ text: 'UP NEXT: {next_match}', color: '#FFFF00', effect: 'SCROLL', durationMs: 5000 }] }] }] }] },
    game: { interval: 10, pages: [{ durationSeconds: 10, zones: [{ panelStart: 0, panelEnd: 2, lines: [{ subpages: [{ text: '{match_title}', color: '#00FFFF', effect: 'SCROLL', durationMs: 5000 }] }, { subpages: [{ text: '{timer}', color: '#FFFFFF', effect: 'STATIC', durationMs: 5000 }] }] }] }] },
  };
}

function parseSequenceRaw(raw: string): ParseResult {
  try {
    const parsed = JSON.parse(raw);
    const defaults = JSON.parse(DEFAULTS);
    const sections: Record<SectionKey, SectionState> = {} as Record<SectionKey, SectionState>;
    for (const key of SECTIONS) {
      let s = parsed[key] || parsed.sections?.[key];
      if (!s) {
        // Fallback to DEFAULTS if missing (e.g. older saved sequence)
        s = defaults[key];
      }
      const pages: ZonePage[] = (s.pages || []).map((p: any) => {
        if (p.zones) {
          return {
            durationSeconds: p.durationSeconds ?? s.interval ?? 10,
            ...(p.hideIfEmpty && p.hideIfEmpty.length > 0 ? { hideIfEmpty: p.hideIfEmpty } : {}),
            ...(p.showIfEmpty && p.showIfEmpty.length > 0 ? { showIfEmpty: p.showIfEmpty } : {}),
            zones: p.zones.map((z: any) => ({
              panelStart: z.panelStart ?? 0,
              panelEnd: z.panelEnd ?? 2,
              borderRows: z.borderRows && z.borderRows.length > 0 ? z.borderRows : undefined,
              scaleX: z.scaleX ?? z.scale,
              scaleY: z.scaleY ?? z.scale,
              valign: z.valign,
              lines: (
                z.lines || [
                  {
                    text: z.text || '',
                    color: z.color || '#00FF00',
                    effect: z.effect || 'STATIC',
                  },
                ]
              ).map(
                (l: any): DisplayLine => convertLineToSubpages(l) as DisplayLine
              ),
            })),
          };
        }
        return {
          durationSeconds: p.durationSeconds ?? s.interval ?? 10,
          ...(p.hideIfEmpty && p.hideIfEmpty.length > 0 ? { hideIfEmpty: p.hideIfEmpty } : {}),
          ...(p.showIfEmpty && p.showIfEmpty.length > 0 ? { showIfEmpty: p.showIfEmpty } : {}),
          zones: [
            {
              panelStart: 0,
              panelEnd: 2,
              lines: [
                {
                  text: p.text ?? p.line1 ?? '',
                  color: p.color ?? '#00FF00',
                  effect: p.effect ?? 'SCROLL',
                  subpages: [{
                    text: p.text ?? p.line1 ?? '',
                    color: p.color ?? '#00FF00',
                    effect: (p.effect ?? 'SCROLL') as 'SCROLL' | 'STATIC' | 'BLINK',
                    durationMs: 5000,
                  }],
                } as DisplayLine,
              ],
            },
          ],
        };
      });
      sections[key] = { interval: s.interval ?? 10, pages };
    }
    return { sections, parseError: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sections: getDefaultSections(), parseError: `Could not read saved sequence (${msg}). Showing defaults — please review before saving.` };
  }
}
function serializeSequence(
  sections: Record<SectionKey, SectionState>,
  brightness: number,
  rotation: number
): string {
  const obj: Record<string, unknown> = { brightness, rotation };
  for (const key of SECTIONS) {
    obj[key] = {
      interval: sections[key].interval,
      pages: sections[key].pages.map(p => ({
        durationSeconds: p.durationSeconds,
        ...(p.hideIfEmpty && p.hideIfEmpty.length > 0 ? { hideIfEmpty: p.hideIfEmpty } : {}),
        ...(p.showIfEmpty && p.showIfEmpty.length > 0 ? { showIfEmpty: p.showIfEmpty } : {}),
        zones: p.zones.map(z => ({
          panelStart: z.panelStart,
          panelEnd: z.panelEnd,
          lines: z.lines,
          ...(z.borderRows && z.borderRows.length > 0 ? { borderRows: z.borderRows } : {}),
          ...(z.scaleX ? { scaleX: z.scaleX } : {}),
          ...(z.scaleY ? { scaleY: z.scaleY } : {}),
          ...(z.valign && z.valign !== 'middle' ? { valign: z.valign } : {}),
        })),
      })),
    };
  }
  return JSON.stringify(obj, null, 2);
}

function clampPage(page: number, max: number): number {
  return Math.max(0, Math.min(page, max - 1));
}

export function DisplaySequenceEditorV2({ sequence: initial }: Props) {
  const parsed = useMemo(() => parseSequenceRaw(initial), [initial]);
  const [sections, setSections] = useState<
    Record<SectionKey, SectionState>
  >(() => parsed.sections);
  const [parseWarning, setParseWarning] = useState<string | null>(() => parsed.parseError);
  const [brightness, setBrightness] = useState<number>(() => {
    try { const p = JSON.parse(initial); return p.brightness ?? 153; } catch { return 153; }
  });
  const [rotation, setRotation] = useState<number>(() => {
    try { const p = JSON.parse(initial); return p.rotation ?? 0; } catch { return 0; }
  });
  const [activeSection, setActiveSection] = useState<SectionKey>('idle');
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedZone, setSelectedZone] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [mockValues, setMockValues] = useState<MockValues>(DEFAULT_MOCK_VALUES);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const section = sections[activeSection];
  const pageIdx = clampPage(currentPage, section.pages.length);
  const page = section.pages[pageIdx];
  const zones = page?.zones || [];

  const flatPages = useMemo(() => {
    // Mirror sports-caster conditional filtering so the preview cycles only
    // pages the firmware will actually receive (evaluated with mock values)
    const strip = (k: string) => k.replace(/[{}]/g, '');
    const visible = (p: ZonePage) => {
      if (p.hideIfEmpty && p.hideIfEmpty.length > 0) {
        if (p.hideIfEmpty.every(k => !mockValues[strip(k) as keyof MockValues])) return false;
      }
      if (p.showIfEmpty && p.showIfEmpty.length > 0) {
        if (p.showIfEmpty.some(k => mockValues[strip(k) as keyof MockValues])) return false;
      }
      return true;
    };
    const all: { page: ZonePage; section: string }[] = [];
    for (const key of SECTIONS) {
      for (const p of sections[key].pages) {
        if (visible(p)) all.push({ page: p, section: key });
      }
    }
    return all;
  }, [sections, mockValues]);

  function substituteMockVariables(text: string): string {
    let result = text;
    for (const [key, val] of Object.entries(mockValues)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
    }
    return result;
  }

  const previewZones = useMemo(() => {
    if (!isPreviewing || flatPages.length === 0) return zones;
    const activePage = flatPages[previewPageIndex % flatPages.length].page;
    return activePage.zones.map(zone => ({
      ...zone,
      lines: zone.lines.map(line => ({
        ...line,
        text: substituteMockVariables(line.text ?? ''),
      })),
    }));
  }, [isPreviewing, previewPageIndex, flatPages, zones, mockValues]);

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

  useEffect(() => {
    if (!isPreviewing || flatPages.length === 0) return;
    const currentPage = flatPages[previewPageIndex % flatPages.length].page;
    const ms = (currentPage.durationSeconds || 10) * 1000;
    previewTimerRef.current = setTimeout(() => {
      setPreviewPageIndex(prev => (prev + 1) % flatPages.length);
    }, ms);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [isPreviewing, previewPageIndex, flatPages]);

  function updateSection(
    updater: (s: SectionState) => SectionState
  ) {
    setSections(prev => ({
      ...prev,
      [activeSection]: updater(prev[activeSection]),
    }));
  }

  function updateCurrentPage(updater: (zones: DisplayZone[]) => DisplayZone[]) {
    updateSection(s => ({
      ...s,
      pages: s.pages.map((p, i) =>
        i === pageIdx ? { ...p, zones: updater(p.zones) } : p
      ),
    }));
  }

  const handleZoneChange = useCallback(
    (index: number, updated: DisplayZone) => {
      updateCurrentPage(zones =>
        zones.map((z, zi) => (zi === index ? updated : z))
      );
    },
    [pageIdx, activeSection]
  );

  const applyTemplate = useCallback(
    (tpl: ZoneTemplate) => {
      const newZones = tpl.zones.map(z => ({
        panelStart: z.panelStart,
        panelEnd: z.panelEnd,
        lines: Array.from(
          { length: z.lines },
          (): DisplayLine => ({
            text: '',
            color: '#00FF00',
            effect: 'STATIC' as const,
          })
        ),
      }));
      updateCurrentPage(() => newZones);
      setSelectedZone(0);
    },
    [pageIdx, activeSection]
  );

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const json = serializeSequence(sections, brightness, rotation);
      JSON.parse(json);
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'displaySequence', value: json }),
      });
      if (!res.ok) throw new Error('Save failed');
      const pubRes = await fetch('/api/display/publish-all', { method: 'POST' });
      if (!pubRes.ok) setError('Sequence saved but publish failed');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      {parseWarning && (
        <div className="flex items-start gap-2 px-3 py-2 bg-yellow-950/60 border border-yellow-700/50 rounded-md text-xs text-yellow-300">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{parseWarning}</span>
          <button onClick={() => setParseWarning(null)} className="ml-auto shrink-0 text-yellow-500 hover:text-yellow-300">✕</button>
        </div>
      )}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-2">
        {SECTIONS.map(s => (
          <button
            key={s}
            onClick={() => {
              setActiveSection(s);
              setCurrentPage(0);
              setSelectedZone(0);
            }}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              activeSection === s
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={isPreviewing ? stopPreview : startPreview}
            size="sm"
            variant={isPreviewing ? 'destructive' : 'default'}
            className="h-7 text-xs"
          >
            {isPreviewing ? '■ Stop' : '▶ Live Preview'}
          </Button>
          <TemplateDropdown onSelect={applyTemplate} />
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="h-7 text-xs"
          >
            {saving ? 'Saving...' : 'Save Sequence'}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900/50 rounded border border-zinc-700/50">
        <label className="text-xs text-zinc-500 whitespace-nowrap">Brightness</label>
        <input
          type="range"
          min={1}
          max={255}
          value={brightness}
          onChange={e => setBrightness(Number(e.target.value))}
          className="w-24 h-6 accent-emerald-500"
        />
        <span className="text-xs text-zinc-400 w-8">{brightness}</span>
        <span className="w-px h-5 bg-zinc-700" />
        <label className="text-xs text-zinc-500 whitespace-nowrap">Rotate 180°</label>
        <button
          onClick={() => setRotation(rotation === 2 ? 0 : 2)}
          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
            rotation === 2
              ? 'bg-emerald-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-300'
          }`}
        >
          {rotation === 2 ? 'ON' : 'OFF'}
        </button>
      </div>

      {isPreviewing && (
        <MockValuesPanel values={mockValues} onChange={setMockValues} />
      )}

      <PageToolbar
        pageCount={section.pages.length}
        currentPage={pageIdx}
        previewIndex={isPreviewing ? previewPageIndex : undefined}
        durationSeconds={page?.durationSeconds ?? 10}
        hideIfEmpty={page?.hideIfEmpty}
        showIfEmpty={page?.showIfEmpty}
        onHideIfEmptyChange={vars => {
          setSections(prev => ({
            ...prev,
            [activeSection]: {
              ...prev[activeSection],
              pages: prev[activeSection].pages.map((p, i) =>
                i === pageIdx ? { ...p, hideIfEmpty: vars.length > 0 ? vars : undefined } : p
              ),
            },
          }));
        }}
        onShowIfEmptyChange={vars => {
          setSections(prev => ({
            ...prev,
            [activeSection]: {
              ...prev[activeSection],
              pages: prev[activeSection].pages.map((p, i) =>
                i === pageIdx ? { ...p, showIfEmpty: vars.length > 0 ? vars : undefined } : p
              ),
            },
          }));
        }}
        onPageSelect={i => {
          setCurrentPage(i);
          setSelectedZone(0);
        }}
        onAddPage={() => {
          updateSection(s => ({
            ...s,
            pages: [
              ...s.pages,
              {
                durationSeconds: s.interval,
                zones: [
                  {
                    panelStart: 0,
                    panelEnd: 2,
                    lines: [
                      {
                        text: '',
                        color: '#00FF00',
                        effect: 'STATIC',
                      },
                    ],
                  },
                ],
              },
            ],
          }));
        }}
        onRemovePage={() => {
          if (section.pages.length <= 1) return;
          updateSection(s => ({
            ...s,
            pages: s.pages.filter((_, i) => i !== pageIdx),
          }));
          setCurrentPage(prev => Math.min(prev, section.pages.length - 2));
        }}
        onDuplicatePage={() => {
          updateSection(s => ({
            ...s,
            pages: [
              ...s.pages.slice(0, pageIdx + 1),
              JSON.parse(JSON.stringify(s.pages[pageIdx])),
              ...s.pages.slice(pageIdx + 1),
            ],
          }));
          setCurrentPage(pageIdx + 1);
          setSelectedZone(0);
        }}
        onDurationChange={sec => {
          updateSection(s => ({
            ...s,
            pages: s.pages.map((p, i) =>
              i === pageIdx ? { ...p, durationSeconds: sec } : p
            ),
          }));
        }}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <P10Canvas
            zones={isPreviewing ? previewZones : zones}
            selectedZoneIndex={isPreviewing ? null : selectedZone}
            onZoneSelect={isPreviewing ? () => {} : setSelectedZone}
          />
          {zones.length === 0 && (
            <p className="text-xs text-zinc-500 mt-2">
              No zones defined. Use a template or add zones manually.
            </p>
          )}
        </div>
        <div className="space-y-3">
          {selectedZone !== null && zones[selectedZone] && (
            <ZonePanel
              zone={zones[selectedZone]}
              zoneIndex={selectedZone}
              onChange={z => handleZoneChange(selectedZone, z)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
