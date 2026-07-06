import mqtt, { MqttClient } from 'mqtt';

type CourtStatus = {
  status: 'online' | 'offline';
  ip?: string;
  rssi?: number;
  court?: string;
  seenAt: number;
};

const g = global as typeof globalThis & {
  _mqttClient?: MqttClient;
  _mqttConnected?: boolean;
  _courtStatuses?: Map<string, CourtStatus>;
};

if (!g._courtStatuses) g._courtStatuses = new Map();

function client(): MqttClient {
  // Fix #3: guard on existence, not .connected — mqtt lib reconnects automatically
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
    console.log('[mqtt] broker connected');
  });

  c.on('offline', () => { g._mqttConnected = false; });
  c.on('close',   () => { g._mqttConnected = false; });
  c.on('error', (err) => {
    g._mqttConnected = false;
    console.error('[mqtt]', err.message);
  });

  c.on('message', (topic, payload) => {
    const m = topic.match(/^(?:freq\.led\/)?courts\/(.+)\/status$/);
    if (m) {
      try {
        const data = JSON.parse(payload.toString());
        g._courtStatuses!.set(m[1], { ...data, seenAt: Date.now() });
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

// ── Publisher ─────────────────────────────────────────────────────────────────

// Published to courts/<courtId>/display — matches FreqClient universal library topic
export interface DisplayPayload {
  line1: string;
  line2: string;
  line3: string;
}

export async function publishDisplay(courtId: string, payload: DisplayPayload): Promise<boolean> {
  // Fix #9: race against a 5 s timeout so callers never hang indefinitely
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
