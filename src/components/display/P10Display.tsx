'use client';

import { useState, useEffect } from 'react';

export interface DisplayPage {
  text: string;
  color?: string;
  effect?: 'SCROLL' | 'STATIC' | 'BLINK';
  durationSeconds?: number;
}

interface Props {
  pages?: DisplayPage[];
  layout?: 'horizontal' | 'vertical';
}

const FONT: Record<string, number[]> = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01110, 0b10001, 0b10000, 0b01110, 0b00001, 0b10001, 0b01110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100],
  ':': [0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b00000],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '\u00A0': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
};

const CHAR_W = 5;
const CHAR_H = 7;
const SPACING = 1;
const CELL_W = CHAR_W + SPACING;

function textWidth(text: string): number { return text.length * CELL_W; }

function textToDots(text: string, offsetX = 0, offsetY = 0): { x: number; y: number }[] {
  const dots: { x: number; y: number }[] = [];
  let cursor = offsetX;
  for (const ch of text) {
    const rows = getChar(ch);
    if (!rows) { cursor += CELL_W; continue; }
    for (let row = 0; row < CHAR_H; row++) {
      for (let col = 0; col < CHAR_W; col++) {
        if (rows[row] & (1 << (CHAR_W - 1 - col))) {
          dots.push({ x: cursor + col, y: offsetY + row });
        }
      }
    }
    cursor += CELL_W;
  }
  return dots;
}

function getChar(ch: string): number[] | undefined {
  const u = ch.toUpperCase();
  return FONT[u] ?? (ch === '\u00A0' ? FONT[' '] : undefined);
}

type LineDots = { dots: { x: number; y: number }[]; width: number; text: string; color: string; effect: string };

function renderPage(page: DisplayPage, panelWidth: number): LineDots {
  const s = page.text || '';
  const w = textWidth(s);
  const isStatic = page.effect === 'STATIC' && w <= panelWidth;
  const xOff = isStatic ? Math.floor((panelWidth - w) / 2) : 0;
  
  // The scale factor is 2, so the actual virtual height is 7 * 2 = 14.
  // The panel height is 16. So y offset is 1. We don't scale the coordinates here, 
  // we just scale the SVG group wrapper.
  // So the unscaled yOff is 1 / 2 = 0.5 (or just 0, it doesn't matter since we center the group).
  
  return {
    text: s, 
    width: w,
    color: page.color || '#00FF00',
    effect: page.effect || 'SCROLL',
    dots: textToDots(s.toUpperCase(), xOff, 0),
  };
}

function PageGroup({ line, panelWidth }: { line: LineDots; panelWidth: number }) {
  const overflows = line.width > panelWidth || line.effect === 'SCROLL';
  const duration = Math.max(4, line.width * 0.3);

  const rendered = (
    <>
      {line.dots.map((d, i) => (
        <circle key={i} cx={d.x + 0.5} cy={d.y + 0.5} r={0.4} fill={line.color} opacity={0.95} />
      ))}
      {overflows && textToDots(line.text, line.width + panelWidth + 4, 0).map((d, i) => (
        <circle key={`dup-${i}`} cx={d.x + 0.5} cy={d.y + 0.5} r={0.4} fill={line.color} opacity={0.95} />
      ))}
    </>
  );

  if (!overflows) {
    if (line.effect === 'BLINK') {
       return (
         <g>
           <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
           <g style={{ animation: 'blink 1s step-end infinite' }}>{rendered}</g>
         </g>
       );
    }
    return <>{rendered}</>;
  }

  return (
    <g>
      <style>{`
        @keyframes scroll-page {
          0% { transform: translateX(${panelWidth}px); }
          100% { transform: translateX(-${line.width}px); }
        }
      `}</style>
      <g style={{ animation: `scroll-page ${duration}s linear infinite` }}>
        {rendered}
      </g>
    </g>
  );
}

export function P10Display({ pages = [], layout = 'horizontal' }: Props) {
  const isHoriz = layout === 'horizontal';
  const cols = isHoriz ? 64 : 32;
  const rows = isHoriz ? 16 : 32;

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!pages || pages.length <= 1) return;
    const dur = (pages[idx]?.durationSeconds || 10) * 1000;
    const t = setTimeout(() => {
      setIdx((prev) => (prev + 1) % pages.length);
    }, dur);
    return () => clearTimeout(t);
  }, [idx, pages]);

  const activePage = pages && pages.length > 0 ? pages[idx] : { text: 'NO DATA', color: '#ff0000', effect: 'STATIC' as const };
  const line = renderPage(activePage, cols / 2); // Unscaled cols is half

  return (
    <div className="w-full mx-auto" style={{ perspective: '600px' }}>
      <div className="bg-zinc-800 rounded-lg p-1.5 shadow-2xl"
        style={{
          boxShadow: '0 0 30px rgba(0,0,0,0.6), 0 4px 15px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="bg-zinc-950 rounded-md p-0.5"
          style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}
        >
          <div className="relative overflow-hidden rounded-sm"
            style={{ background: '#080806', aspectRatio: `${cols} / ${rows}` }}
          >
            <svg
              viewBox={`0 0 ${cols} ${rows}`}
              className="w-full h-full block"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <clipPath id="panel-clip">
                  <rect x={0} y={0} width={cols} height={rows} rx={0.3} />
                </clipPath>
                <filter id="led-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0.3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <radialGradient id="off-led" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#1a1210" />
                  <stop offset="100%" stopColor="#0d0806" />
                </radialGradient>
              </defs>

              <rect width={cols} height={rows} fill="url(#off-led)" rx={0.3} />

              {isHoriz && (
                <rect x={32} y={0} width={0.5} height={16} fill="#1a1a1a" rx={0.1} />
              )}

              {Array.from({ length: cols }).flatMap((_, cx) =>
                Array.from({ length: rows }).map((_, cy) => (
                  <circle
                    key={`g-${cx}-${cy}`}
                    cx={cx + 0.5}
                    cy={cy + 0.5}
                    r={0.3}
                    fill="#333333"
                    opacity={0.1}
                  />
                ))
              )}

              <g clipPath="url(#panel-clip)" filter="url(#led-glow)">
                {/* Scale 2x and center vertically */}
                <g transform={`translate(0, ${(rows - 14)/2}) scale(2)`}>
                  <PageGroup line={line} panelWidth={cols / 2} />
                </g>
              </g>

              <rect width={cols} height={rows} fill="url(#scanlines)" opacity={0.15} pointerEvents="none" />
              <defs>
                <pattern id="scanlines" width="1" height="2" patternUnits="userSpaceOnUse">
                  <rect width="1" height="1" fill="#000" opacity={0.3} />
                  <rect y="1" width="1" height="1" fill="transparent" />
                </pattern>
              </defs>

              <rect
                x={0} y={0} width={cols} height={rows * 0.4}
                fill="url(#glare)" opacity={0.06} pointerEvents="none"
              />
              <defs>
                <linearGradient id="glare" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
