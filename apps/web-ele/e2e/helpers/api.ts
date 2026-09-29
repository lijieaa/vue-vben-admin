import process from 'node:process';

const SCADA_API = process.env.E2E_SCADA_API || 'http://127.0.0.1:8888';

async function jsonFetch<T>(
  method: string,
  pathName: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${SCADA_API}${pathName}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${pathName} -> ${res.status}: ${typeof data === 'object' ? JSON.stringify(data) : text}`,
    );
  }
  return data as T;
}

export async function ensureS7Channel(name: string) {
  const drivers = await jsonFetch<{ name: string }[]>('GET', '/api/v1/drivers');
  if (!drivers.some((d) => d.name === 's7_tcp')) {
    throw new Error('s7_tcp driver not registered in scada-engine');
  }

  const channels = await jsonFetch<{ name: string; driver: string }[]>(
    'GET',
    '/api/v1/channels',
  );
  const existing = channels.find((c) => c.name === name);
  if (existing) {
    if (existing.driver !== 's7_tcp') {
      throw new Error(`channel ${name} exists with driver ${existing.driver}`);
    }
    return name;
  }

  await jsonFetch('POST', '/api/v1/channels', {
    id: name,
    name,
    driver: 's7_tcp',
    medium: { kind: 'ethernet', host: '127.0.0.1', port: 102 },
    devices: [],
  });
  return name;
}

export async function fetchDevice(channel: string, device: string) {
  return jsonFetch<Record<string, any>>(
    'GET',
    `/api/v1/channels/${encodeURIComponent(channel)}/devices/${encodeURIComponent(device)}`,
  );
}

export async function ensureS7Device(channel: string, device: string) {
  await ensureS7Channel(channel);
  // Immediate writes (UI e2e); default write_last_value_only only flushes on scan.
  await jsonFetch('PATCH', `/api/v1/channels/${encodeURIComponent(channel)}`, {
    settings: { write_optimization: 'write_all_values' },
  });
  try {
    await fetchDevice(channel, device);
    return device;
  } catch {
    /* create */
  }
  await jsonFetch(
    'POST',
    `/api/v1/channels/${encodeURIComponent(channel)}/devices`,
    {
      id: device,
      name: device,
      model: 's7_300',
      scan_rate_ms: 1000,
      timeout_ms: 3000,
      settings: {
        communications: {
          port: 102,
          link_type: 'PC',
          rack: 0,
          slot: 2,
        },
        scan_mode: 'request_all_at_rate',
      },
      tags: [],
    },
  );
  return device;
}

export async function findTag(
  channel: string,
  device: string,
  tagName: string,
) {
  const q = new URLSearchParams({
    name: tagName,
    page: '1',
    page_size: '50',
  });
  const raw = await jsonFetch<{ tags?: Record<string, any>[] }>(
    'GET',
    `/api/v1/channels/${encodeURIComponent(channel)}/devices/${encodeURIComponent(device)}/tags?${q}`,
  );
  const tags = raw.tags ?? [];
  return tags.find((t) => t.name === tagName) ?? tags[0];
}

export async function deleteDevice(channel: string, device: string) {
  try {
    await jsonFetch(
      'DELETE',
      `/api/v1/channels/${encodeURIComponent(channel)}/devices/${encodeURIComponent(device)}`,
    );
  } catch {
    /* ignore missing */
  }
}

export async function deleteDeviceTag(
  channel: string,
  device: string,
  tag: string,
) {
  try {
    await jsonFetch(
      'DELETE',
      `/api/v1/channels/${encodeURIComponent(channel)}/devices/${encodeURIComponent(device)}/tags/${encodeURIComponent(tag)}`,
    );
  } catch {
    /* ignore missing */
  }
}

export function tagPath(
  channel: string,
  device: string,
  tag: string,
  group?: string,
) {
  if (group) {
    return `${channel}.${device}.${group}.${tag}`;
  }
  return `${channel}.${device}.${tag}`;
}

export async function getLiveTag(
  channel: string,
  device: string,
  tag: string,
  group?: string,
) {
  const path = tagPath(channel, device, tag, group);
  const segments = path
    .split('.')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return jsonFetch<{ path: string; value?: unknown; quality?: unknown }>(
    'GET',
    `/api/v1/tags/${segments}`,
  );
}

export async function refreshTag(
  channel: string,
  device: string,
  tag: string,
  group?: string,
) {
  const path = tagPath(channel, device, tag, group);
  return jsonFetch<{ path: string; value?: unknown; quality?: unknown }>(
    'POST',
    '/api/v1/tags/refresh',
    { path },
  );
}

export async function getRuntimeWritesTotal() {
  const snap = await jsonFetch<{ writes_total?: number }>(
    'GET',
    '/api/v1/diagnostics/runtime',
  );
  return Number(snap.writes_total ?? 0);
}

/** Force a PLC read (not cache-only) and wait for the expected value. */
export async function waitLiveValue(
  channel: string,
  device: string,
  tag: string,
  want: unknown,
  timeoutMs = 15_000,
) {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const live = await refreshTag(channel, device, tag);
      last = live.value;
      if (live.value === want) return live;
      if (String(live.value) === String(want)) return live;
    } catch {
      try {
        const cached = await getLiveTag(channel, device, tag);
        last = cached.value;
      } catch {
        /* not ready */
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(
    `live value ${channel}.${device}.${tag}: want ${JSON.stringify(want)}, last ${JSON.stringify(last)}`,
  );
}

export async function fetchChannel(name: string) {
  return jsonFetch<{ name: string; started?: boolean }>(
    'GET',
    `/api/v1/channels/${encodeURIComponent(name)}`,
  );
}

function s7CommSettings() {
  const port = Number(process.env.S7_PORT || '102');
  const rack = Number(process.env.S7_RACK || '0');
  const slot = Number(process.env.S7_SLOT || '2');
  const model = process.env.S7_MODEL || 's7_300';
  return { port, rack, slot, model };
}

/** Import full SeeLink V1501 tag set onto an S7 channel/device (API). */
export async function ensureSeeLinkV1501Device(
  channel: string,
  device: string,
  fixturePath: string,
) {
  await ensureS7Channel(channel);
  await jsonFetch('PATCH', `/api/v1/channels/${encodeURIComponent(channel)}`, {
    settings: { write_optimization: 'write_all_values' },
  });
  await deleteDevice(channel, device);

  const fs = await import('node:fs');
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    device: Record<string, unknown>;
    tag_count: number;
    samples?: Array<Record<string, unknown>>;
  };
  const { port, rack, slot, model } = s7CommSettings();
  const body = {
    ...raw.device,
    id: device,
    name: device,
    model,
    scan_rate_ms: (raw.device.scan_rate_ms as number) || 1000,
    timeout_ms: (raw.device.timeout_ms as number) || 3000,
    settings: {
      communications: {
        port,
        link_type: 'PC',
        rack,
        slot,
      },
      scan_mode: 'request_all_at_rate',
    },
  };
  await jsonFetch(
    'POST',
    `/api/v1/channels/${encodeURIComponent(channel)}/devices`,
    body,
  );
  const listed = await jsonFetch<{ total?: number; tags?: unknown[] }>(
    'GET',
    `/api/v1/channels/${encodeURIComponent(channel)}/devices/${encodeURIComponent(device)}/tags?page_size=50`,
  );
  const total = Number(listed.total ?? listed.tags?.length ?? 0);
  if (total < (raw.tag_count || 2000)) {
    throw new Error(`SeeLink import tag total=${total} want>=${raw.tag_count}`);
  }
  return { tagCount: total, samples: raw.samples || [] };
}

export async function listDeviceTagsPage(
  channel: string,
  device: string,
  pageSize = 50,
) {
  return jsonFetch<{ tags?: Record<string, any>[]; total?: number }>(
    'GET',
    `/api/v1/channels/${encodeURIComponent(channel)}/devices/${encodeURIComponent(device)}/tags?page_size=${pageSize}`,
  );
}

export type AdvancedTagsConfigBody = {
  groups?: Array<{
    name: string;
    enabled?: boolean;
    groups?: AdvancedTagsConfigBody['groups'];
    tags?: Array<Record<string, unknown>>;
  }>;
  tags?: Array<Record<string, unknown>>;
};

export async function getAdvancedTagsConfig() {
  return jsonFetch<AdvancedTagsConfigBody>('GET', '/api/v1/advanced-tags');
}

export async function putAdvancedTagsConfig(body: AdvancedTagsConfigBody) {
  return jsonFetch<AdvancedTagsConfigBody>(
    'PUT',
    '/api/v1/advanced-tags',
    body,
  );
}

/** Reset Advanced Tags tree to empty (root TagList + groups cleared). */
export async function resetAdvancedTagsConfig() {
  return putAdvancedTagsConfig({ groups: [], tags: [] });
}
