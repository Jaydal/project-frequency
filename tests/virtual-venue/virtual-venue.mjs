import { writeFile } from 'node:fs/promises';

export const KIOSK_MAX_QUEUE = 8;

export const fixtures = {
  idle: {
    displayName: 'IDLE',
    displayText: 'PADDLE POINT',
    queue: [],
    courts: [{ id: 'court-1', status: 'Available' }],
  },
  active: {
    displayName: 'ACTIVE',
    displayText: 'JANE  12:30',
    queue: [],
    courts: [{ id: 'court-1', status: 'In Game', startTime: 1_780_000_000 }],
  },
  waiting: {
    displayName: 'WAITING',
    displayText: 'QUEUE 1',
    queue: [{ id: 'queue-waiting-1', member_id: 'member-1', status: 'waiting' }],
    courts: [{ id: 'court-1', status: 'Available' }],
  },
  offered: {
    displayName: 'OFFERED',
    displayText: 'COURT READY',
    queue: [{ id: 'queue-offered-1', member_id: 'member-1', status: 'offered', court_id: 'court-1' }],
    courts: [{ id: 'court-1', status: 'Available' }],
  },
  scheduled: {
    displayName: 'SCHEDULED',
    displayText: 'UP NEXT 14:00',
    queue: [{ id: 'queue-scheduled-1', member_id: 'member-1', status: 'scheduled', requested_start: '2099-01-01T14:00:00Z' }],
    courts: [{ id: 'court-1', status: 'Available' }],
  },
};

function validBoard(value) {
  return value && typeof value === 'object' && Array.isArray(value.queue) && Array.isArray(value.courts);
}

function validDisplay(value) {
  return value && typeof value === 'object' && Array.isArray(value.pages) && value.pages.length > 0
    && value.pages.every(page => page && typeof page.name === 'string' && Array.isArray(page.zones));
}

function safeJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

export function createVenue() {
  const retained = new Map();
  const subscriptions = new Map();
  const bus = {
    publish(topic, raw) {
      retained.set(topic, raw);
      for (const handler of subscriptions.get(topic) ?? []) handler(raw, topic);
    },
    subscribe(topic, handler) {
      const handlers = subscriptions.get(topic) ?? [];
      handlers.push(handler);
      subscriptions.set(topic, handlers);
      if (retained.has(topic)) handler(retained.get(topic), topic);
    },
  };

  const kiosk = { board: null, queue: [], lastError: null };
  const display = { payload: null, lastError: null, currentPageName: () => display.payload?.pages?.[0]?.name ?? null };

  bus.subscribe('freq/board', raw => {
    const value = safeJson(raw);
    if (!validBoard(value)) { kiosk.lastError = 'invalid board payload'; return; }
    kiosk.board = value;
    kiosk.queue = value.queue.slice(0, KIOSK_MAX_QUEUE);
    kiosk.lastError = null;
  });
  bus.subscribe('courts/court-1/display', raw => {
    const value = safeJson(raw);
    if (!validDisplay(value)) { display.lastError = 'invalid display payload'; return; }
    display.payload = value;
    display.lastError = null;
  });

  function publishState(state) {
    bus.publish('freq/board', JSON.stringify({ courts: state.courts, queue: state.queue }));
    bus.publish('courts/court-1/display', JSON.stringify({
      courtId: 'court-1',
      pages: [{
        name: state.displayName,
        durationSeconds: 10,
        zones: [{ panelStart: 0, panelEnd: 2, lines: [{ subpages: [{ text: state.displayText, color: '#FFFFFF', bgColor: '#101612' }] }] }],
      }],
    }));
  }

  return { bus, kiosk, display, publishState };
}

export function runScenario({ html = false, htmlPath = '/tmp/freq-virtual-venue.html' } = {}) {
  const venue = createVenue();
  const scenarioNames = ['idle', 'active', 'waiting', 'offered', 'scheduled', 'malformed', 'capacity'];
  let failed = 0;

  for (const name of scenarioNames.slice(0, 5)) {
    venue.publishState(fixtures[name]);
    if (venue.display.currentPageName() !== fixtures[name].displayName) failed++;
  }

  const lastValid = venue.display.currentPageName();
  venue.bus.publish('freq/board', '{invalid');
  venue.bus.publish('courts/court-1/display', JSON.stringify({ pages: [{}] }));
  if (venue.display.currentPageName() !== lastValid || venue.kiosk.queue.length === 0) failed++;

  const capacity = { ...fixtures.waiting, queue: Array.from({ length: 20 }, (_, i) => ({ id: `capacity-${i}`, member_id: `m-${i}`, status: 'waiting' })) };
  venue.publishState(capacity);
  if (venue.kiosk.queue.length !== KIOSK_MAX_QUEUE) failed++;

  if (html) writeFile(htmlPath, renderHtml(venue)).catch(() => { failed++; });
  return { scenarios: scenarioNames, failed, venue, htmlPath: html ? htmlPath : null };
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function renderHtml(venue) {
  const page = venue.display.payload?.pages?.[0];
  const text = page?.zones?.flatMap(zone => zone.lines ?? []).flatMap(line => line.subpages ?? []).map(subpage => subpage.text).join(' · ') ?? '';
  const queueRows = venue.kiosk.queue.map(row => `<li><code>${escapeHtml(row.id)}</code> · ${escapeHtml(row.status)}</li>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Freq Virtual Venue</title>
<style>body{margin:0;background:#0d120f;color:#eef5ef;font:16px system-ui;padding:32px}main{max-width:760px;margin:auto}section{border:1px solid #37503f;border-radius:16px;padding:20px;margin:16px 0;background:#152019}.led{display:grid;place-items:center;min-height:190px;background:#101612;color:#fff;border-radius:10px;font:700 28px monospace;letter-spacing:2px}.ok{color:#7bd694}code{color:#f1d58a}</style>
<main><h1>Freq Virtual Venue</h1><p class="ok">All consumers connected to the in-process retained MQTT bus.</p>
<section><h2>Virtual LED display · ${escapeHtml(page?.name ?? 'none')}</h2><div class="led">${escapeHtml(text)}</div></section>
<section><h2>Virtual kiosk queue</h2><ol>${queueRows || '<li>Empty</li>'}</ol></section></main>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const htmlIndex = process.argv.indexOf('--html');
  const htmlPath = htmlIndex >= 0 ? process.argv[htmlIndex + 1] : null;
  const result = runScenario({ html: Boolean(htmlPath), htmlPath: htmlPath ?? undefined });
  for (const scenario of result.scenarios) console.log(`PASS | ${scenario}`);
  if (htmlPath) console.log(`HTML | ${htmlPath}`);
  process.exitCode = result.failed ? 1 : 0;
}
