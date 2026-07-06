'use client';

interface Props {
  line1: string;
  line2: string;
  line3: string;
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
const CHAR_H_COMPACT = 5;
const SPACING = 1;
const CELL_W = CHAR_W + SPACING;

function textWidth(text: string): number { return text.length * CELL_W; }

function textToDots(text: string, offsetX = 0, offsetY = 0, compact = false): { x: number; y: number }[] {
  const dots: { x: number; y: number }[] = [];
  let cursor = offsetX;
  const charH = compact ? CHAR_H_COMPACT : CHAR_H;
  for (const ch of text) {
    const rows = getChar(ch, compact);
    if (!rows) { cursor += CELL_W; continue; }
    for (let row = 0; row < charH; row++) {
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

function getChar(ch: string, compact = false): number[] | undefined {
  const u = ch.toUpperCase();
  const rows = FONT[u] ?? (ch === '\u00A0' ? FONT[' '] : undefined);
  if (!rows || !compact) return rows;
  // Strip first and last row for 16px panels: 5x7 → 5x5
  return rows.slice(1, -1);
}

type LineDots = { dots: { x: number; y: number }[]; width: number; text: string; yOff: number };

function renderLine(text: string, yOff: number, panelWidth: number, compact = false): LineDots {
  const s = text || '';
  const w = textWidth(s);
  const xOff = w < panelWidth ? Math.floor((panelWidth - w) / 2) : 0;
  return {
    text: s, width: w, yOff,
    dots: textToDots(s.toUpperCase(), xOff, yOff, compact),
  };
}

function ScrollGroup({ line, panelWidth, yOff, compact }: { line: LineDots; panelWidth: number; yOff: number; compact?: boolean }) {
  const overflows = line.width > panelWidth;

  // Horizontal marquee scroll for overflowing lines
  const duration = Math.max(4, line.width * 0.3);
  const dupOffset = line.width + panelWidth + 4;

  const rendered = (
    <>
      {line.dots.map((d, i) => (
        <circle key={i} cx={d.x + 0.5} cy={d.y + 0.5} r={0.4} fill="#ffd8a0" opacity={0.95} />
      ))}
      {overflows && textToDots(line.text, line.width + panelWidth + 4, line.yOff, compact).map((d, i) => (
        <circle key={`dup-${i}`} cx={d.x + 0.5} cy={d.y + 0.5} r={0.4} fill="#ffd8a0" opacity={0.95} />
      ))}
    </>
  );

  if (!overflows) return <>{rendered}</>;

  return (
    <g>
      <style>{`
        @keyframes scroll-${line.yOff} {
          0% { transform: translateX(${panelWidth}px); }
          100% { transform: translateX(-${line.width}px); }
        }
      `}</style>
      <g style={{ animation: `scroll-${line.yOff} ${duration}s linear infinite` }}>
        {rendered}
      </g>
    </g>
  );
}

export function P10Display({ line1, line2, line3, layout = 'horizontal' }: Props) {
  const isHoriz = layout === 'horizontal';
  const cols = isHoriz ? 64 : 32;
  const rows = isHoriz ? 16 : 32;
  const compact = isHoriz;
  const charH = compact ? CHAR_H_COMPACT : CHAR_H;
  const lineGap = compact ? 0 : 2;
  const lineCount = compact ? 2 : 3; // 2 lines for 16px horizontal, 3 lines for 32px vertical

  const contentH = charH * lineCount + lineGap * (lineCount - 1);
  const topOff = Math.floor((rows - contentH) / 2) + 1; // +1 safety margin

  // For horizontal (64×16): 2 lines of 5x5 compact font, centered in 16 rows
  // For vertical (32×32): 3 lines of 5x7 font with 2px gaps, centered in 32 rows

  const rawLines = [line1 || '', line2 || '', line3 || ''];
  const displayLines = rawLines.slice(0, lineCount);

  const lines = displayLines.map((text, i) =>
    renderLine(text, topOff + i * (charH + lineGap), cols, compact),
  );

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
                {/* LED glow filter */}
                <filter id="led-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0.3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {/* Radial gradient for off-LEDs */}
                <radialGradient id="off-led" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#1a1210" />
                  <stop offset="100%" stopColor="#0d0806" />
                </radialGradient>
              </defs>

              {/* Panel background */}
              <rect width={cols} height={rows} fill="url(#off-led)" rx={0.3} />

              {/* Panel divider */}
              {isHoriz && (
                <rect x={32} y={0} width={0.5} height={16} fill="#1a1a1a" rx={0.1} />
              )}

              {/* All possible LED positions — dim/unlit */}
              {Array.from({ length: cols }).flatMap((_, cx) =>
                Array.from({ length: rows }).map((_, cy) => (
                  <circle
                    key={`g-${cx}-${cy}`}
                    cx={cx + 0.5}
                    cy={cy + 0.5}
                    r={0.3}
                    fill="#ffd8a0"
                    opacity={0.04}
                  />
                ))
              )}

              {/* Lit LED dots with glow */}
              <g clipPath="url(#panel-clip)" filter="url(#led-glow)">
                {lines.map((line, i) => (
                  <ScrollGroup key={i} line={line} panelWidth={cols} yOff={0} compact={compact} />
                ))}
              </g>

              {/* Scan line overlay */}
              <rect width={cols} height={rows} fill="url(#scanlines)" opacity={0.15} pointerEvents="none" />
              <defs>
                <pattern id="scanlines" width="1" height="2" patternUnits="userSpaceOnUse">
                  <rect width="1" height="1" fill="#000" opacity={0.3} />
                  <rect y="1" width="1" height="1" fill="transparent" />
                </pattern>
              </defs>

              {/* Subtle glare/reflection */}
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
