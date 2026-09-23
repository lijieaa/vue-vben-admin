import type { MqttClient } from 'mqtt';

import mqtt from 'mqtt';

export type ScadaMqttSample = {
  path: string;
  value?: unknown;
  quality?: number | string;
  ts?: string;
};

export type ScadaMqttHandler = (sample: ScadaMqttSample) => void;

export type ScadaMqttWriteItem = {
  path: string;
  value: unknown;
};

export type ScadaMqttWriteResult = {
  path: string;
  ok: boolean;
  error?: string;
};

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

export function writeTopic(slug: string): string {
  return `scada/${slug || 'default'}/write`;
}

export function writeAckTopic(slug: string): string {
  return `scada/${slug || 'default'}/write/ack`;
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

type AckWaiter = {
  kind: 'batch' | 'single';
  path?: string;
  resolve: (results: ScadaMqttWriteResult[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Browser MQTT-over-WebSocket live feed for scada-engine embedded broker.
 * Prefer per-page tag topics over device `#` wildcards (large devices freeze SUBACK).
 */
export class ScadaMqttLive {
  private ackSubscribed = false;
  private activeTopics: string[] = [];
  private client: MqttClient | null = null;
  private connectPromise: null | Promise<boolean> = null;
  private handler: null | ScadaMqttHandler = null;
  private pendingAcks = new Set<AckWaiter>();
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
    this.rejectAllAcks(new Error('mqtt disconnected'));
    this.ackSubscribed = false;
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
          this.ackSubscribed = false;
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

  /** Single-tag write: publish {path,value}, wait matching write/ack. */
  async writeTag(
    path: string,
    value: unknown,
    timeoutMs = 5000,
  ): Promise<ScadaMqttWriteResult> {
    const results = await this.publishWrite(
      { path, value },
      'single',
      path,
      timeoutMs,
    );
    return results[0] ?? { path, ok: false, error: 'no ack' };
  }

  /** Multi-tag write: publish {items:[...]}, wait results ack. */
  async writeTags(
    items: ScadaMqttWriteItem[],
    timeoutMs = 8000,
  ): Promise<ScadaMqttWriteResult[]> {
    if (items.length === 0) return [];
    if (items.length === 1) {
      const only = items[0];
      if (!only) return [];
      const one = await this.writeTag(only.path, only.value, timeoutMs);
      return [one];
    }
    return this.publishWrite({ items }, 'batch', undefined, timeoutMs);
  }

  private async ensureAckSubscription(): Promise<void> {
    const client = this.client;
    if (!client?.connected) {
      throw new Error('mqtt not connected');
    }
    if (this.ackSubscribed) return;
    const topic = writeAckTopic(this.slug);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('ack subscribe timeout')),
        2000,
      );
      try {
        client.subscribe(topic, { qos: 0 }, (err) => {
          clearTimeout(timer);
          if (err) {
            reject(err);
            return;
          }
          this.ackSubscribed = true;
          resolve();
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private handleAckPayload(text: string) {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    const resultsRaw = body.results;
    if (Array.isArray(resultsRaw)) {
      const results = resultsRaw.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          path: String(r.path ?? ''),
          ok: !!r.ok,
          error:
            r.error === null || r.error === undefined
              ? undefined
              : String(r.error),
        } satisfies ScadaMqttWriteResult;
      });
      for (const waiter of [...this.pendingAcks]) {
        if (waiter.kind !== 'batch') continue;
        clearTimeout(waiter.timer);
        this.pendingAcks.delete(waiter);
        waiter.resolve(results);
      }
      return;
    }
    const path =
      body.path === null || body.path === undefined ? '' : String(body.path);
    const result: ScadaMqttWriteResult = {
      path,
      ok: !!body.ok,
      error:
        body.error === null || body.error === undefined
          ? undefined
          : String(body.error),
    };
    for (const waiter of [...this.pendingAcks]) {
      if (waiter.kind !== 'single') continue;
      if (waiter.path && path && waiter.path !== path) continue;
      clearTimeout(waiter.timer);
      this.pendingAcks.delete(waiter);
      waiter.resolve([result]);
    }
  }

  private handleMessage(topic: string, payload: Uint8Array) {
    const text = new TextDecoder().decode(payload);
    if (topic === writeAckTopic(this.slug)) {
      this.handleAckPayload(text);
      return;
    }
    if (!this.handler) return;
    const path = pathFromVtqTopic(this.slug, topic);
    if (!path) return;
    try {
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

  private async publishWrite(
    body: Record<string, unknown>,
    kind: 'batch' | 'single',
    path: string | undefined,
    timeoutMs: number,
  ): Promise<ScadaMqttWriteResult[]> {
    const ok = await this.ensureConnected();
    const client = this.client;
    if (!ok || !client?.connected) {
      throw new Error('mqtt not connected');
    }
    await this.ensureAckSubscription();
    return new Promise<ScadaMqttWriteResult[]>((resolve, reject) => {
      const waiter: AckWaiter = {
        kind,
        path,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pendingAcks.delete(waiter);
          reject(new Error('write ack timeout'));
        }, timeoutMs),
      };
      this.pendingAcks.add(waiter);
      try {
        client.publish(
          writeTopic(this.slug),
          JSON.stringify(body),
          { qos: 0 },
          (err) => {
            if (err) {
              clearTimeout(waiter.timer);
              this.pendingAcks.delete(waiter);
              reject(err);
            }
          },
        );
      } catch (error) {
        clearTimeout(waiter.timer);
        this.pendingAcks.delete(waiter);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private rejectAllAcks(err: Error) {
    for (const waiter of [...this.pendingAcks]) {
      clearTimeout(waiter.timer);
      this.pendingAcks.delete(waiter);
      waiter.reject(err);
    }
  }
}

export const scadaMqttLive = new ScadaMqttLive();
