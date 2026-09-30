import type { AdvancedTagsConfigBody } from './helpers/api';

/**
 * Derived Advanced Tags e2e against SeeLink V1501.
 *
 * Data retention (default): does NOT reset AT config, does NOT delete the
 * V1501 device, and saves the project after each case so created Derived tags
 * remain for manual inspection. Set E2E_CLEAN=1 to restore prior AT snapshot
 * and remove the e2e device after the suite.
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
  checkAdvancedExpression,
  confirmAdvancedDialog,
  expectAdvancedTableRow,
  fillAdvancedExpression,
  fillAdvancedTagName,
  openNewAdvancedKind,
  openWorkspace,
  refreshWorkspace,
  saveWorkspaceProject,
  selectAdvancedTagsRoot,
  setDerivedDataType,
  setDerivedTriggerByRate,
  setDerivedTriggerByTag,
} from './helpers/workspace';

test.describe.configure({ mode: 'serial' });

const CHANNEL = process.env.E2E_SEELINK_CHANNEL || 'S7ATDer_V1501';
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

function pvPath(n = 0) {
  return tagPath(CHANNEL, DEVICE, `Pv_${n}`, GROUP);
}

function boolPath(name: string) {
  return tagPath(CHANNEL, DEVICE, name, GROUP);
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

async function findDerived(name: string) {
  const cfg = await getAdvancedTagsConfig();
  const root = (cfg.tags || []).find((t) => t.name === name);
  if (root) return root as Record<string, unknown>;
  for (const g of cfg.groups || []) {
    const hit = (g.tags || []).find((t) => t.name === name);
    if (hit) return hit as Record<string, unknown>;
  }
  return undefined;
}

test('Derived Check Expression accepts ON/OFF and V1501 TAG paths', async ({
  page,
}) => {
  const tagName = `DerOn_${stamp()}`;
  const expr = `TAG (${pvPath(0)}) + ABS(-2) + (ON AND NOT OFF)`;
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建派生标签|New Derived Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await setDerivedDataType(dialog, /^Double$/i);
  await fillAdvancedExpression(dialog, expr);
  await checkAdvancedExpression(dialog);
  await expect(page.getByText(/表达式有效|Expression is valid/i)).toBeVisible({
    timeout: 10_000,
  });
  await setDerivedTriggerByRate(dialog, { rate: 1, rateUnit: /^s$|seconds/i });
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findDerived(tagName);
  expect(tag?.kind).toBe('derived');
  expect(tag?.expression).toBe(expr);
  expect(tag?.data_type).toBe('Double');
  const trig = tag?.trigger as
    | undefined
    | { mode?: string; rate?: number; rate_unit?: string };
  expect(trig?.mode).toBe('by_rate');
});

test('Derived Check Expression rejects IF()', async ({ page }) => {
  const tagName = `DerIf_${stamp()}`;
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建派生标签|New Derived Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await fillAdvancedExpression(dialog, 'IF(1,2,3)');
  await checkAdvancedExpression(dialog);
  await expect(page.locator('.el-message--error').first()).toBeVisible({
    timeout: 10_000,
  });
  // Dismiss without creating a tag.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden({ timeout: 10_000 });
});

test('Derived Boolean data type + ByRate on V1501', async ({ page }) => {
  const tagName = `DerBool_${stamp()}`;
  const expr = `QUALITY (${pvPath(0)}) OR TRUE`;
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建派生标签|New Derived Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await setDerivedDataType(dialog, /^Boolean$/i);
  await fillAdvancedExpression(dialog, expr);
  await checkAdvancedExpression(dialog);
  await expect(page.getByText(/表达式有效|Expression is valid/i)).toBeVisible({
    timeout: 10_000,
  });
  await setDerivedTriggerByRate(dialog, {
    rate: 500,
    rateUnit: /^ms$|milliseconds/i,
  });
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findDerived(tagName);
  expect(tag?.kind).toBe('derived');
  expect(tag?.data_type).toBe('Boolean');
  expect(tag?.expression).toBe(expr);
  const trig = tag?.trigger as undefined | { mode?: string; rate?: number };
  expect(trig?.mode).toBe('by_rate');
  expect(trig?.rate).toBe(500);
});

test('Derived ByTag uses V1501 bAlarmIn / bAlarmStop Complete', async ({
  page,
}) => {
  const tagName = `DerTrig_${stamp()}`;
  const expr = `TAG (${pvPath(1)}) * 2`;
  const trigger = boolPath('bAlarmIn');
  const complete = boolPath('bAlarmStop');
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建派生标签|New Derived Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await setDerivedDataType(dialog, /^Float$/i);
  await fillAdvancedExpression(dialog, expr);
  await setDerivedTriggerByTag(dialog, {
    triggerTag: trigger,
    completeTag: complete,
  });
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findDerived(tagName);
  expect(tag?.kind).toBe('derived');
  expect(tag?.data_type).toBe('Float');
  expect(tag?.expression).toBe(expr);
  const trig = tag?.trigger as
    | undefined
    | { mode?: string; trigger_tag?: string; complete_tag?: string };
  expect(trig?.mode).toBe('by_tag');
  expect(trig?.trigger_tag).toBe(trigger);
  expect(trig?.complete_tag).toBe(complete);
});

test('Derived POW/SIN snippet math Check Expression', async ({ page }) => {
  const tagName = `DerMath_${stamp()}`;
  const expr = `POW (2, 3) + SIN (0)`;
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建派生标签|New Derived Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await fillAdvancedExpression(dialog, expr);
  await checkAdvancedExpression(dialog);
  await expect(page.getByText(/表达式有效|Expression is valid/i)).toBeVisible({
    timeout: 10_000,
  });
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findDerived(tagName);
  expect(tag?.kind).toBe('derived');
  expect(tag?.expression).toBe(expr);
});
