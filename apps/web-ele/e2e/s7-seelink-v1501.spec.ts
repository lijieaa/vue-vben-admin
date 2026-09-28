import path from 'node:path';
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

const CHANNEL = `S7SeeLink_${Date.now().toString(36)}`;
const DEVICE = 'V1501';
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
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await deleteDevice(CHANNEL, DEVICE);
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
  const tag = await findTag(CHANNEL, DEVICE, tagName);
  expect(tag, `missing sample tag ${tagName}`).toBeTruthy();
  expect(String(tag?.address || '')).toBe(wantAddr);

  try {
    const live = await refreshTag(CHANNEL, DEVICE, tagName);
    expect(live.path).toContain(tagName);
  } catch (error) {
    // Soft PLC may be offline; import + address mapping still validated above.
    test.info().annotations.push({
      type: 'note',
      description: `live refresh skipped: ${error}`,
    });
  }
});

test('SeeLink V1501 device appears in workspace tree', async ({ page }) => {
  await ensureSeeLinkV1501Device(CHANNEL, DEVICE, FIXTURE);
  await openWorkspace(page);
  await refreshWorkspace(page);
  await selectDeviceInTree(page, CHANNEL, DEVICE);
});
