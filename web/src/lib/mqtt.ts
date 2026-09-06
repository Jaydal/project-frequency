import mqtt, { MqttClient } from 'mqtt';
import { boardEmitter, BOARD_UPDATE_EVENT } from '@/lib/queue/board-emitter';

type CourtStatus = {
  status: 'online' | 'offline';
  ip?: string;
  rssi?: number;
  court?: string;
  seenAt: number;
};

export interface DisplayPage {
  text?: string;
  color?: string;
  effect?: 'SCROLL' | 'STATIC' | 'BLINK' | 'paginate';
  durationSeconds?: number;
  zones?: {
    panelStart: number;
    panelEnd: number;
    borderRows?: { start: number; end: number }[];
    scale?: number;
    valign?: string;
    lines: {
      subpages?: { text: string; color: string; effect: string; align?: string; scrollSpeed?: number; durationMs: number; bgColor?: string; font?: string }[];
      text?: string;  // legacy compat
      color?: string;
      font?: string;
      effect?: string;
      marginTop?: number;
      marginBottom?: number;
      align?: string;
      scrollSpeed?: number;
    }[];
  }[];
}

export interface DisplayBlock {
  startEpoch: number;
  endEpoch: number;
  pages: DisplayPage[];
}

export interface DisplayPayload {
  courtId: string;
  action?: string;
  state: 'OPEN' | 'PLAYING' | 'MAINTENANCE';
  schedule: {
    current?: { name: string; startTime: string; startTimeEpoch?: number; durationMinutes: number } | null;
    upcoming: { name: string }[];
  };
  serverTime: number;
  brightness?: number;
  rotation?: number;
  blocks: DisplayBlock[];
}

export interface DisplayInfo {
  mac: string;
  ip: string;
  courtId: string;
  rssi: number;
  heap: number;
  overrideActive: boolean;
  lastSeen: number;
}

const g = global as typeof globalThis & {
  _mqttClient?: MqttClient;
  _mqttConnected?: boolean;
  _courtStatuses?: Map<string, CourtStatus>;
  _displayStates?: Map<string, DisplayPayload>;
  _connectingPromise?: Promise<MqttClient | null> | null;
  _discoveryResponses?: Map<string, DisplayInfo>;
  _discoveryGeneration?: number;
};

if (!g._courtStatuses) g._courtStatuses = new Map();
if (!g._displayStates) g._displayStates = new Map();
if (!g._discoveryResponses) g._discoveryResponses = new Map();
if (!g._discoveryGeneration) g._discoveryGeneration = 0;

export async function connectMqtt(): Promise<MqttClient | null> {
  const url = process.env.MQTT_BROKER_URL;
  if (!url) return null;

  if (g._mqttClient && g._mqttConnected) {
    return g._mqttClient;
  }

  if (g._connectingPromise) {
    return g._connectingPromise;
  }

  if (!g._mqttClient) {
    g._mqttClient = mqtt.connect(url, {
      clientId: `paddle-point-web-${crypto.randomUUID().slice(0, 12)}`,
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
      g._mqttClient?.subscribe('freq/display/discover/response', { qos: 1 });
      g._mqttClient?.subscribe('freq/queue/boundary/#', { qos: 1 });
      console.log('[mqtt] broker connected');
    });

    g._mqttClient.on('offline', () => { g._mqttConnected = false; });
    g._mqttClient.on('close',   () => { g._mqttConnected = false; });
    g._mqttClient.on('error', (err: Error) => {
      g._mqttConnected = false;
      console.error('[mqtt]', err.message);
    });

    g._mqttClient.on('message', (topic: string, payload: Buffer) => {
      // Discovery response
      if (topic === 'freq/display/discover/response') {
        try {
          const data = JSON.parse(payload.toString());
          const info: DisplayInfo = {
            mac: data.mac,
            ip: data.ip,
            courtId: data.courtId,
            rssi: data.rssi,
            heap: data.heap,
            overrideActive: data.overrideActive ?? false,
            lastSeen: Date.now(),
          };
          g._discoveryResponses!.set(info.mac, info);
        } catch { /* ignore malformed */ }
        return;
      }

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

  g._connectingPromise = new Promise((resolve) => {
    let resolved = false;

    const onConnect = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      g._connectingPromise = null;
      resolve(g._mqttClient!);
    };

    const onError = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      g._connectingPromise = null;
      resolve(null);
    };

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      g._connectingPromise = null;
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

  return g._connectingPromise;
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

export function getMqttClient(): MqttClient | null {
  return g._mqttClient ?? null;
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
          boardEmitter.emit(BOARD_UPDATE_EVENT, snapshotJson);
          resolve(true);
        }
      });
    });
  } catch (err) {
    console.error('[mqtt] publishBoard error:', err);
    return false;
  }
}

export function publishDiscover(): void {
  const c = g._mqttClient;
  if (!c || !g._mqttConnected) return;
  g._discoveryGeneration!++;
  g._discoveryResponses!.clear();
  c.publish('freq/display/discover', '{}', { qos: 1 });
}

export async function collectDiscoveryResponses(timeoutMs = 3000): Promise<DisplayInfo[]> {
  publishDiscover();
  const gen = g._discoveryGeneration!;
  await new Promise(resolve => setTimeout(resolve, timeoutMs));
  if (gen !== g._discoveryGeneration) return [];
  return Array.from(g._discoveryResponses!.values());
}

export function publishCommand(mac: string, command: Record<string, unknown>): void {
  const c = g._mqttClient;
  if (!c || !g._mqttConnected) return;
  const topic = `freq/display/cmd/${mac}`;
  c.publish(topic, JSON.stringify(command), { qos: 1 });
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

// ── Lights Control ──────────────────────────────────────────────────────────

export async function publishLightsCommand(state: 'ON' | 'OFF'): Promise<boolean> {
  try {
    const c = await connectMqtt();
    if (!c) return false;
    return new Promise((resolve) => {
      c.publish(
        'freq/lights',
        JSON.stringify({ state }),
        { qos: 1, retain: true },
        (err) => {
          if (err) {
            console.error('[mqtt] publishLightsCommand error:', err);
            resolve(false);
          } else {
            console.log(`[mqtt] lights → ${state}`);
            resolve(true);
          }
        }
      );
    });
  } catch (err) {
    console.error('[mqtt] publishLightsCommand error:', err);
    return false;
  }
}
