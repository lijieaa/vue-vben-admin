import type { AdvancedTagsConfigBody } from './helpers/api';

/**
 * Cumulative Advanced Tags e2e against SeeLink V1501.
 *
 * Data retention (default): does NOT reset AT config, does NOT delete the
 * V1501 device, and saves the project after each case so created Cumulative
 * tags remain for manual inspection. Set E2E_CLEAN=1 to restore prior AT
 * snapshot and remove the e2e device after the suite.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import {
  deleteDevice,
  ensureSeeLinkV1501Device,
  getAdvancedTagsConfig,
  putAdvancedTagsConfig,
  tagPath,
} from './helpers/api';
import {
  confirmAdvancedDialog,
  expectAdvancedTableRow,
  fillAdvancedTagName,
  openNewAdvancedKind,
  openWorkspace,
  refreshWorkspace,
  saveWorkspaceProject,
  selectAdvancedTagsRoot,
  setCumulativeMaxType,
  setCumulativeMaxValue,
  setCumulativeSource,
} from './helpers/workspace';

test.describe.configure({ mode: 'serial' });

const CHANNEL = process.env.E2E_SEELINK_CHANNEL || 'S7ATCum_V1501';
const DEVICE = process.env.E2E_SEELINK_DEVICE || 'V1501';
const GROUP = '实时监控';
/** Default keep. Set E2E_CLEAN=1 to tear down AT snapshot restore + device. */
const CLEAN = process.env.E2E_CLEAN === '1' || process.env.E2E_CLEAN === 'true';
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'seelink-v1501-device.json',
);

const runId = Date.now().toString(36);
const stamp = () => `${runId}_${Date.now().toString(36)}`;

let atSnapshot: AdvancedTagsConfigBody = { groups: [], tags: [] };

/** Byte-sized counter-like source on V1501. */
function byteSource() {
  return tagPath(CHANNEL, DEVICE, 'Year', GROUP);
}

/** Short/Word-sized counter-like source. */
function wordSource() {
  return tagPath(CHANNEL, DEVICE, 'Pfcount', GROUP);
}

test.beforeAll(async () => {
  atSnapshot = await getAdvancedTagsConfig();
  await ensureSeeLinkV1501Device(CHANNEL, DEVICE, FIXTURE);
});

test.afterAll(async () => {
  if (CLEAN) {
    await putAdvancedTagsConfig({
      groups: atSnapshot.groups ?? [],
      tags: atSnapshot.tags ?? [],
    });
    await deleteDevice(CHANNEL, DEVICE);
  }
});

async function openAtRoot(page: import('@playwright/test').Page) {
  await openWorkspace(page);
  await refreshWorkspace(page);
  await selectAdvancedTagsRoot(page);
}

async function findCumulative(name: string) {
  const cfg = await getAdvancedTagsConfig();
  const root = (cfg.tags || []).find((t) => t.name === name);
  if (root) return root as Record<string, unknown>;
  for (const g of cfg.groups || []) {
    const hit = (g.tags || []).find((t) => t.name === name);
    if (hit) return hit as Record<string, unknown>;
  }
  return undefined;
}

test('Cumulative Byte wrap uses V1501 Year source', async ({ page }) => {
  const tagName = `CumByte_${stamp()}`;
  const source = byteSource();
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建累计标签|New Cumulative Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await setCumulativeSource(dialog, source);
  await setCumulativeMaxType(dialog, /^Byte$/i);
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findCumulative(tagName);
  expect(tag?.kind).toBe('cumulative');
  expect(tag?.source).toBe(source);
  expect(tag?.max_type).toBe('byte');
});

test('Cumulative Word wrap uses V1501 Pfcount source', async ({ page }) => {
  const tagName = `CumWord_${stamp()}`;
  const source = wordSource();
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建累计标签|New Cumulative Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await setCumulativeSource(dialog, source);
  await setCumulativeMaxType(dialog, /^Word$/i);
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findCumulative(tagName);
  expect(tag?.kind).toBe('cumulative');
  expect(tag?.source).toBe(source);
  expect(tag?.max_type).toBe('word');
});

test('Cumulative DWord with custom Maximum Value', async ({ page }) => {
  const tagName = `CumMax_${stamp()}`;
  const source = wordSource();
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建累计标签|New Cumulative Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await setCumulativeSource(dialog, source);
  await setCumulativeMaxType(dialog, /^DWord$/i);
  await setCumulativeMaxValue(dialog, 1000);
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findCumulative(tagName);
  expect(tag?.kind).toBe('cumulative');
  expect(tag?.source).toBe(source);
  expect(tag?.max_type).toBe('dword');
  expect(tag?.max_value).toBe(1000);
});
