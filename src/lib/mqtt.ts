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
    current?: { name: string; startTime: string; startTimeEpoch?: number; durationMinutes: number } | null;
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

export async function connectMqtt(): Promise<MqttClient | null> {
  const url = process.env.MQTT_BROKER_URL;
  if (!url) return null;

  if (g._mqttClient && g._mqttConnected) {
    return g._mqttClient;
  }

  if (!g._mqttClient) {
    g._mqttClient = mqtt.connect(url, {
      clientId: `freq-web-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 5000,
      connectTimeout: 5000,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    });

    g._mqttClient.on('connect', () => {
      g._mqttConnected = true;
      g._mqttClient?.subscribe('freq.led/courts/+/status', { qos: 1 });
      g._mqttClient?.subscribe('courts/+/status', { qos: 1 });
      g._mqttClient?.subscribe('courts/+/display', { qos: 1 });
      console.log('[mqtt] broker connected');
    });

    g._mqttClient.on('offline', () => { g._mqttConnected = false; });
    g._mqttClient.on('close',   () => { g._mqttConnected = false; });
    g._mqttClient.on('error', (err: Error) => {
      g._mqttConnected = false;
      console.error('[mqtt]', err.message);
    });

    g._mqttClient.on('message', (topic: string, payload: Buffer) => {
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
  }

  if (g._mqttConnected) {
    return g._mqttClient;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const onConnect = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(g._mqttClient!);
    };

    const onError = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(null);
    };

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(null);
    }, 4000);

    function cleanup() {
      clearTimeout(timeout);
      g._mqttClient?.off('connect', onConnect);
      g._mqttClient?.off('error', onError);
      g._mqttClient?.off('close', onError);
    }

    g._mqttClient?.once('connect', onConnect);
    g._mqttClient?.once('error', onError);
    g._mqttClient?.once('close', onError);
  });
}

// ── Health helpers ────────────────────────────────────────────────────────────

export async function ensureConnected(): Promise<boolean> {
  const c = await connectMqtt();
  return !!c;
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
// freshly-connected kiosk gets the latest immediately).
export async function publishBoard(snapshotJson: string): Promise<boolean> {
  try {
    const c = await connectMqtt();
    if (!c) return false;
    return new Promise((resolve) => {
      c.publish('freq/board', snapshotJson, { qos: 1, retain: true }, (err) => {
        if (err) {
          console.error('[mqtt] publishBoard callback error:', err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  } catch (err) {
    console.error('[mqtt] publishBoard error:', err);
    return false;
  }
}

export async function publishDisplay(courtId: string, payload: DisplayPayload): Promise<boolean> {
  // Cache locally immediately
  g._displayStates!.set(courtId, payload);

  try {
    const c = await connectMqtt();
    if (!c) return false;
    return new Promise((resolve) => {
      c.publish(
        `courts/${courtId}/display`,
        JSON.stringify(payload),
        { qos: 1, retain: true },
        (err) => {
          if (err) {
            console.error('[mqtt] publishDisplay callback error:', err);
            resolve(false);
          } else {
            resolve(true);
          }
        }
      );
    });
  } catch (err) {
    console.error('[mqtt] publishDisplay error:', err);
    return false;
  }
}
