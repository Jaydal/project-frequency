import test from 'node:test';
import assert from 'node:assert/strict';
import { createVenue, fixtures, runScenario } from './virtual-venue.mjs';

test('delivers idle, active, waiting, offered, and scheduled states to both consumers', () => {
  const venue = createVenue();
  for (const [name, fixture] of Object.entries(fixtures)) {
    venue.publishState(fixture);
    assert.equal(venue.kiosk.queue.length, fixture.queue.length, `${name} queue`);
    assert.equal(venue.display.currentPageName(), fixture.displayName, `${name} display`);
  }
});

test('keeps the last valid state after malformed MQTT payloads', () => {
  const venue = createVenue();
  venue.publishState(fixtures.waiting);
  assert.equal(venue.kiosk.queue[0].id, 'queue-waiting-1');
  venue.bus.publish('freq/board', '{not-json');
  venue.bus.publish('courts/court-1/display', JSON.stringify({ pages: [{}] }));
  assert.equal(venue.kiosk.queue[0].id, 'queue-waiting-1');
  assert.equal(venue.display.currentPageName(), 'WAITING');
});

test('bounds kiosk queue data to the firmware capacity', () => {
  const venue = createVenue();
  venue.publishState({ ...fixtures.waiting, queue: Array.from({ length: 20 }, (_, i) => ({ id: `q-${i}`, member_id: `m-${i}`, status: 'waiting' })) });
  assert.equal(venue.kiosk.queue.length, 8);
  assert.equal(venue.kiosk.queue.at(-1).id, 'q-7');
});

test('runs every named scenario successfully', () => {
  const result = runScenario({ html: false });
  assert.deepEqual(result.scenarios, ['idle', 'active', 'waiting', 'offered', 'scheduled', 'malformed', 'capacity']);
  assert.equal(result.failed, 0);
});
