import mqtt, { MqttClient } from 'mqtt';

type CourtStatus = {
  status: 'online' | 'offline';
  ip?: string;
  rssi?: number;
  court?: string;
  seenAt: number;
};

export interface DisplayPage {
  text: string;
  color?: string; // Hex string e.g. "#00FF00"
  effect?: 'SCROLL' | 'STATIC' | 'BLINK';
  durationSeconds?: number;
}

export interface DisplayPayload {
  courtId: string;
  action?: string;
  state: 'OPEN' | 'PLAYING' | 'MAINTENANCE';
  schedule: {
    current?: { name: string; startTime: string; durationMinutes: number } | null;
    upcoming: { name: string }[];
  };
  display: {
    pages: DisplayPage[];
  };
}

const g = global as typeof globalThis & {
  _mqttClient?: MqttClient;
  _mqttConnected?: boolean;
  _courtStatuses?: Map<string, CourtStatus>;
  _displayStates?: Map<string, DisplayPayload>;
};

if (!g._courtStatuses) g._courtStatuses = new Map();
if (!g._displayStates) g._displayStates = new Map();

function client(): MqttClient {
  if (g._mqttClient) return g._mqttClient;

  const url = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
  const c = mqtt.connect(url, {
    clientId: `freq-web-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5000,
    connectTimeout: 5000,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
  });

  c.on('connect', () => {
    g._mqttConnected = true;
    c.subscribe('freq.led/courts/+/status', { qos: 1 });
    c.subscribe('courts/+/status', { qos: 1 });
    c.subscribe('courts/+/display', { qos: 1 });
    console.log('[mqtt] broker connected');
  });

  c.on('offline', () => { g._mqttConnected = false; });
  c.on('close',   () => { g._mqttConnected = false; });
  c.on('error', (err: Error) => {
    g._mqttConnected = false;
    console.error('[mqtt]', err.message);
  });

  c.on('message', (topic: string, payload: Buffer) => {
    const statusMatch = topic.match(/^(?:freq\.led\/)?courts\/(.+)\/status$/);
    if (statusMatch) {
      try {
        const data = JSON.parse(payload.toString());
        g._courtStatuses!.set(statusMatch[1], { ...data, seenAt: Date.now() });
      } catch { /* ignore malformed */ }
      return;
    }
    const displayMatch = topic.match(/^courts\/(.+)\/display$/);
    if (displayMatch) {
      try {
        const data = JSON.parse(payload.toString());
        g._displayStates!.set(displayMatch[1], data);
      } catch { /* ignore malformed */ }
    }
  });

  g._mqttClient = c;
  return c;
}

// ── Health helpers ────────────────────────────────────────────────────────────

export function ensureConnected(): boolean {
  client();
  return g._mqttConnected ?? false;
}

export function isBrokerConnected(): boolean {
  return g._mqttConnected ?? false;
}

export function getCourtStatuses(): Record<string, CourtStatus> {
  return Object.fromEntries(g._courtStatuses ?? []);
}

export function getCourtStatus(courtId: string): CourtStatus | undefined {
  return g._courtStatuses?.get(courtId);
}

export function getDisplayState(courtId: string): DisplayPayload | undefined {
  return g._displayStates?.get(courtId);
}

export function getAllDisplayStates(): Record<string, DisplayPayload> {
  return Object.fromEntries(g._displayStates ?? []);
}

// ── Publisher ─────────────────────────────────────────────────────────────────

// Publishes the full board snapshot for the firmware kiosk (retained, so a
// freshly-connected kiosk gets the latest immediately). Fire-and-forget.
export function publishBoard(snapshotJson: string): void {
  try {
    client().publish('freq/board', snapshotJson, { qos: 0, retain: true });
  } catch (err) {
    console.error('[mqtt] publishBoard error:', err);
  }
}

export async function publishDisplay(courtId: string, payload: DisplayPayload): Promise<boolean> {
  // Cache locally immediately — don't wait for MQTT echo
  g._displayStates!.set(courtId, payload);

  const topic = `courts/${courtId}/display`;
  const publish = new Promise<boolean>((resolve) => {
    try {
      client().publish(
        topic,
        JSON.stringify(payload),
        { qos: 1, retain: true },
        (err) => resolve(!err),
      );
    } catch (err) {
      console.error('[mqtt] publish error:', err);
      resolve(false);
    }
  });

  const timeout = new Promise<false>((r) => setTimeout(() => r(false), 5000));
  return Promise.race([publish, timeout]);
}
