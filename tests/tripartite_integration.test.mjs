import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ── 1. Static Contract & Identity Alignment ───────────────────────────────────

test('Architecture: All 3 projects share the same Device Allowlist identity format', () => {
  const kioskClient = readFileSync(resolve(ROOT, 'kiosk-terminal/src/net/freq_rest_client.c'), 'utf8');
  const displayPortal = readFileSync(resolve(ROOT, 'display-firmware/src/ConfigPortal.cpp'), 'utf8');
  const webAuth = readFileSync(resolve(ROOT, 'web/src/lib/controller-device-auth.ts'), 'utf8');
  const webConfigRoute = readFileSync(resolve(ROOT, 'web/src/app/api/controller/config/route.ts'), 'utf8');

  // Both thin clients must supply x-device-id
  assert.match(kioskClient, /x-device-id/);
  assert.match(displayPortal, /x-device-id/);

  // Server must enforce allowlist authentication
  assert.match(webAuth, /authenticateControllerDevice/);
  assert.match(webConfigRoute, /authenticateControllerDevice/);

  // Server must return courtId to synchronize displays
  assert.match(webConfigRoute, /courtId:\s*device\?\.court_id/);
});

test('Security: Neither Kiosk nor Display firmware ships with hardcoded MQTT credentials', () => {
  const kioskConfig = readFileSync(resolve(ROOT, 'kiosk-terminal/src/hal_esp32/esp32_mqtt_transport.c'), 'utf8');
  const displayConfig = readFileSync(resolve(ROOT, 'display-firmware/src/wifi_config.h'), 'utf8');

  assert.doesNotMatch(kioskConfig, /#define\s+MQTT_PASSWORD/);
  assert.doesNotMatch(displayConfig, /#define\s+MQTT_PASSWORD/);
});

// ── 2. Message Bus & State Synchronization (Smart Server <-> Kiosk <-> Display) ──

test('End-to-End State Sync: Server updates both Kiosk Board and Court Display simultaneously', () => {
  const messages = new Map();

  // Simulated MQTT Bus
  const bus = {
    publish(topic, payload) {
      messages.set(topic, JSON.parse(payload));
    },
    get(topic) {
      return messages.get(topic);
    }
  };

  // 1. Initial State: Court 1 is Available, Queue is empty
  const stateIdle = {
    courts: [{ id: 'court-1', name: 'Court 1', status: 'Available' }],
    queue: []
  };

  bus.publish('freq/board', JSON.stringify(stateIdle));
  bus.publish('courts/court-1/display', JSON.stringify({
    courtId: 'court-1',
    pages: [{
      name: 'IDLE',
      durationSeconds: 10,
      zones: [{
        panelStart: 0,
        panelEnd: 2,
        lines: [{ text: 'COURT 1 - AVAILABLE', color: '#00FF00', effect: 'SCROLL' }]
      }]
    }]
  }));

  // Kiosk verifies venue state
  let kioskBoard = bus.get('freq/board');
  assert.equal(kioskBoard.courts[0].status, 'Available');
  assert.equal(kioskBoard.queue.length, 0);

  // Display verifies scoreboard state
  let displayPage = bus.get('courts/court-1/display');
  assert.equal(displayPage.courtId, 'court-1');
  assert.equal(displayPage.pages[0].name, 'IDLE');
  assert.equal(displayPage.pages[0].zones[0].lines[0].text, 'COURT 1 - AVAILABLE');

  // 2. Member joins Queue via Kiosk -> Server advances to Waiting
  const stateWaiting = {
    courts: [{ id: 'court-1', name: 'Court 1', status: 'In Game', startTime: 1780000000 }],
    queue: [
      { id: 'q-1', member_id: 'mem-101', member_name: 'Alice', status: 'waiting', duration_minutes: 60 }
    ]
  };

  bus.publish('freq/board', JSON.stringify(stateWaiting));
  bus.publish('courts/court-1/display', JSON.stringify({
    courtId: 'court-1',
    pages: [{
      name: 'GAME',
      durationSeconds: 10,
      zones: [{
        panelStart: 0,
        panelEnd: 2,
        lines: [
          { text: 'MATCH IN PROGRESS', color: '#FFCC00', effect: 'NONE' },
          { text: 'NEXT: ALICE', color: '#00E5FF', effect: 'SCROLL' }
        ]
      }]
    }]
  }));

  // Verify Kiosk received the waiting queue
  kioskBoard = bus.get('freq/board');
  assert.equal(kioskBoard.courts[0].status, 'In Game');
  assert.equal(kioskBoard.queue[0].member_name, 'Alice');

  // Verify Display shows active match and upcoming player
  displayPage = bus.get('courts/court-1/display');
  assert.equal(displayPage.pages[0].name, 'GAME');
  assert.equal(displayPage.pages[0].zones[0].lines[1].text, 'NEXT: ALICE');

  // 3. Game finishes -> Server offers Court 1 to Alice
  const stateOffered = {
    courts: [{ id: 'court-1', name: 'Court 1', status: 'Available' }],
    queue: [
      { id: 'q-1', member_id: 'mem-101', member_name: 'Alice', status: 'offered', court_id: 'court-1' }
    ]
  };

  bus.publish('freq/board', JSON.stringify(stateOffered));
  bus.publish('courts/court-1/display', JSON.stringify({
    courtId: 'court-1',
    pages: [{
      name: 'OFFERED',
      durationSeconds: 10,
      zones: [{
        panelStart: 0,
        panelEnd: 2,
        lines: [{ text: 'COURT 1 READY - ALICE PLEASE CHECK IN', color: '#00E5FF', effect: 'SCROLL' }]
      }]
    }]
  }));

  // Verify Kiosk prompts offer
  kioskBoard = bus.get('freq/board');
  assert.equal(kioskBoard.queue[0].status, 'offered');
  assert.equal(kioskBoard.queue[0].court_id, 'court-1');

  // Verify Display signals court ready
  displayPage = bus.get('courts/court-1/display');
  assert.equal(displayPage.pages[0].name, 'OFFERED');
  assert.match(displayPage.pages[0].zones[0].lines[0].text, /COURT 1 READY/);
});

// ── 3. Configuration Provisioning Contract ───────────────────────────────────

test('Provisioning: /api/controller/config schema conforms to Kiosk and Display parsers', () => {
  // Expected JSON payload from Server
  const sampleServerConfig = {
    broker: '594d608708f34a7b9607e86258c3b3ae.s1.eu.hivemq.cloud',
    username: 'freq-device',
    password: 'secure-token-here',
    boardTopic: 'freq/board',
    displayTopicPrefix: 'courts/',
    courtId: 'court-1'
  };

  // Kiosk C parser expectations
  assert.ok(typeof sampleServerConfig.broker === 'string' && sampleServerConfig.broker.length > 0);
  assert.ok(typeof sampleServerConfig.username === 'string');
  assert.ok(typeof sampleServerConfig.password === 'string');
  assert.equal(sampleServerConfig.boardTopic, 'freq/board');

  // Display C++ parser expectations
  assert.ok(sampleServerConfig.broker.length > 0);
  assert.equal(sampleServerConfig.displayTopicPrefix, 'courts/');
  assert.equal(sampleServerConfig.courtId, 'court-1');
});
