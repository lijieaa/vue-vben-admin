import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import {
  deleteDevice,
  ensureSeeLinkV1501Device,
  findTag,
  listDeviceTagsPage,
  refreshTag,
} from './helpers/api';
import {
  openWorkspace,
  refreshWorkspace,
  selectDeviceInTree,
} from './helpers/workspace';

const CHANNEL =
  process.env.E2E_SEELINK_CHANNEL || `S7SeeLink_${Date.now().toString(36)}`;
const DEVICE = process.env.E2E_SEELINK_DEVICE || 'V1501';
const KEEP = process.env.E2E_KEEP === '1' || process.env.E2E_KEEP === 'true';
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'seelink-v1501-device.json',
);

type Sample = {
  Name?: string;
  name?: string;
  Address?: string;
  address?: string;
  Group?: string;
  group?: string;
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  if (!KEEP) {
    await deleteDevice(CHANNEL, DEVICE);
  }
});

test('SeeLink V1501 template imports full tag set via API', async () => {
  const { tagCount, samples } = await ensureSeeLinkV1501Device(
    CHANNEL,
    DEVICE,
    FIXTURE,
  );
  expect(tagCount).toBeGreaterThanOrEqual(2000);

  const page = await listDeviceTagsPage(CHANNEL, DEVICE, 50);
  expect(Number(page.total)).toBe(tagCount);

  const spot = (samples[0] || {}) as Sample;
  const tagName = spot.Name || spot.name || 'bAlarmIn';
  const wantAddr = spot.Address || spot.address || 'DB1,DBX0.0';
  const group = spot.Group || spot.group || '';
  const tag = await findTag(CHANNEL, DEVICE, tagName);
  expect(tag, `missing sample tag ${tagName}`).toBeTruthy();
  expect(String(tag?.address || '')).toBe(wantAddr);

  const live = await refreshTag(CHANNEL, DEVICE, tagName, group || undefined);
  expect(live.path).toContain(tagName);
  expect(String(live.quality || '')).toMatch(/good/i);
});

test('SeeLink V1501 device appears in workspace tree', async ({ page }) => {
  await ensureSeeLinkV1501Device(CHANNEL, DEVICE, FIXTURE);
  await openWorkspace(page);
  await refreshWorkspace(page);
  await selectDeviceInTree(page, CHANNEL, DEVICE);
});
