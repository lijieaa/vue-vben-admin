import type { MqttClient } from 'mqtt';

import mqtt from 'mqtt';

export type ScadaMqttSample = {
  path: string;
  value?: unknown;
  quality?: number | string;
  ts?: string;
};

export type ScadaMqttHandler = (sample: ScadaMqttSample) => void;

/** Match scada-engine project.Slug() for VTQ topic prefix. */
export function projectSlug(title: string): string {
  const s = title.trim().toLowerCase();
  if (!s) return 'default';
  let out = '';
  for (const r of s) {
    if (
      (r >= 'a' && r <= 'z') ||
      (r >= '0' && r <= '9') ||
      r === '-' ||
      r === '_'
    ) {
      out += r;
    } else if (r === ' ') {
      out += '-';
    }
  }
  return out || 'default';
}

export function vtqTopic(slug: string, path: string): string {
  return `scada/${slug || 'default'}/vtq/${path.split('.').join('/')}`;
}

export function vtqDeviceFilter(
  slug: string,
  channel: string,
  device: string,
): string {
  return `scada/${slug || 'default'}/vtq/${channel}/${device}/#`;
}

/** Topic `scada/{slug}/vtq/a/b/c` -> path `a.b.c`. */
export function pathFromVtqTopic(slug: string, topic: string): null | string {
  const prefix = `scada/${slug || 'default'}/vtq/`;
  if (!topic.startsWith(prefix)) return null;
  const rest = topic.slice(prefix.length);
  if (!rest || rest.includes('#') || rest.includes('+')) return null;
  return rest.split('/').filter(Boolean).join('.');
}

function defaultBrokerUrl(): string {
  const fromEnv = (
    import.meta.env.VITE_SCADA_MQTT_URL as string | undefined
  )?.trim();
  if (fromEnv) return fromEnv;
  // Prefer direct broker WS (FluxMQ). Same-origin /mqtt proxy is optional for prod gateways.
  return 'ws://127.0.0.1:8085/mqtt';
}

/**
 * Browser MQTT-over-WebSocket live feed for scada-engine embedded broker.
 * Prefer per-page tag topics over device `#` wildcards (large devices freeze SUBACK).
 */
export class ScadaMqttLive {
  private activeTopics: string[] = [];
  private client: MqttClient | null = null;
  private connectPromise: null | Promise<boolean> = null;
  private handler: null | ScadaMqttHandler = null;
  private slug = 'default';
  private subscribeSeq = 0;

  async clearSubscription() {
    if (this.client && this.activeTopics.length > 0) {
      try {
        this.client.unsubscribe(this.activeTopics);
      } catch {
        // ignore
      }
    }
    this.activeTopics = [];
  }

  async disconnect() {
    await this.clearSubscription();
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this.connectPromise = null;
  }

  async ensureConnected(timeoutMs = 4000): Promise<boolean> {
    if (this.client?.connected) return true;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<boolean>((resolve) => {
      const url = defaultBrokerUrl();
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        this.connectPromise = null;
        resolve(ok);
      };

      try {
        const client = mqtt.connect(url, {
          protocolVersion: 4,
          reconnectPeriod: 2000,
          connectTimeout: timeoutMs,
          clean: true,
          clientId: `scada-ui-${Math.random().toString(16).slice(2, 10)}`,
        });
        this.client = client;

        const timer = setTimeout(() => {
          if (!client.connected) {
            client.end(true);
            if (this.client === client) this.client = null;
            finish(false);
          }
        }, timeoutMs);

        client.on('connect', () => {
          clearTimeout(timer);
          finish(true);
          if (this.activeTopics.length > 0) {
            client.subscribe(this.activeTopics, { qos: 0 });
          }
        });
        client.on('error', () => {
          clearTimeout(timer);
          finish(false);
        });
        client.on('close', () => {
          /* reconnect handled by mqtt.js */
        });
        client.on('message', (topic, payload) => {
          this.handleMessage(topic, payload);
        });
      } catch {
        finish(false);
      }
    });

    return this.connectPromise;
  }

  getSlug() {
    return this.slug;
  }

  isConnected() {
    return !!this.client?.connected;
  }

  setHandler(handler: null | ScadaMqttHandler) {
    this.handler = handler;
  }

  setSlug(titleOrSlug: string) {
    this.slug = projectSlug(titleOrSlug);
  }

  /**
   * Subscribe exact VTQ topics for the given tag paths (current list page).
   * Avoid device `#` wildcards — those expand to every tag and stall the broker.
   */
  async subscribeTagPaths(paths: string[]): Promise<boolean> {
    const ok = await this.ensureConnected();
    if (!ok || !this.client) return false;
    const uniq = [...new Set(paths.filter(Boolean))];
    const nextTopics = uniq.map((p) => vtqTopic(this.slug, p));
    const seq = ++this.subscribeSeq;
    const client = this.client;

    const prev = this.activeTopics;
    const prevSet = new Set(prev);
    const nextSet = new Set(nextTopics);
    const drop = prev.filter((t) => !nextSet.has(t));
    const add = nextTopics.filter((t) => !prevSet.has(t));
    this.activeTopics = nextTopics;

    if (drop.length > 0) {
      try {
        client.unsubscribe(drop);
      } catch {
        // ignore
      }
    }
    if (add.length === 0) return true;

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const timer = setTimeout(finish, 2000);
      try {
        client.subscribe(add, { qos: 0 }, () => {
          if (seq !== this.subscribeSeq) {
            clearTimeout(timer);
            finish();
            return;
          }
          clearTimeout(timer);
          finish();
        });
      } catch {
        clearTimeout(timer);
        finish();
      }
    });
    return seq === this.subscribeSeq;
  }

  private handleMessage(topic: string, payload: Uint8Array) {
    if (!this.handler) return;
    const path = pathFromVtqTopic(this.slug, topic);
    if (!path) return;
    try {
      const text = new TextDecoder().decode(payload);
      const body = JSON.parse(text) as ScadaMqttSample;
      this.handler({
        path: body.path || path,
        value: body.value,
        quality: body.quality,
        ts: body.ts,
      });
    } catch {
      // ignore bad payload
    }
  }
}

export const scadaMqttLive = new ScadaMqttLive();
