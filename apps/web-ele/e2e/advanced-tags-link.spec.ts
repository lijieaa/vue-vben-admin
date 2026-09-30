import type { AdvancedTagsConfigBody } from './helpers/api';

/**
 * Link Advanced Tags e2e against SeeLink V1501.
 *
 * Data retention (default): does NOT reset AT config, does NOT delete the
 * V1501 device, and saves the project after each case so created Link tags
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
  confirmAdvancedDialog,
  expectAdvancedTableRow,
  fillAdvancedTagName,
  openNewAdvancedKind,
  openWorkspace,
  refreshWorkspace,
  saveWorkspaceProject,
  selectAdvancedTagsRoot,
  setLinkDeadValue,
  setLinkMode,
  setLinkPaths,
  setLinkRateMs,
  setLinkTriggerGate,
  setLinkTriggerType,
} from './helpers/workspace';

test.describe.configure({ mode: 'serial' });

const CHANNEL = process.env.E2E_SEELINK_CHANNEL || 'S7ATLink_V1501';
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

async function findLink(name: string) {
  const cfg = await getAdvancedTagsConfig();
  const root = (cfg.tags || []).find((t) => t.name === name);
  if (root) return root as Record<string, unknown>;
  for (const g of cfg.groups || []) {
    const hit = (g.tags || []).find((t) => t.name === name);
    if (hit) return hit as Record<string, unknown>;
  }
  return undefined;
}

test('Link On Data Change copies V1501 Pv_0 to Pv_1', async ({ page }) => {
  const tagName = `LinkChg_${stamp()}`;
  const input = pvPath(0);
  const output = pvPath(1);
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(page, /新建链接标签|New Link Tag/i);
  await fillAdvancedTagName(dialog, tagName);
  await setLinkPaths(dialog, { input, output });
  await setLinkDeadValue(dialog, '0');
  await setLinkMode(
    dialog,
    /^输入标签数据变化时$|^On data change of input tag$/i,
  );
  await setLinkTriggerType(dialog, /始终|Always/i);
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findLink(tagName);
  expect(tag?.kind).toBe('link');
  expect(tag?.input).toBe(input);
  expect(tag?.output).toBe(output);
  expect(tag?.dead_value).toBe('0');
  expect(tag?.link_mode).toBe('on_data_change');
  expect(tag?.trigger_type).toBe('always');
});

test('Link On Interval with rate on V1501', async ({ page }) => {
  const tagName = `LinkInt_${stamp()}`;
  const input = pvPath(2);
  const output = pvPath(3);
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(page, /新建链接标签|New Link Tag/i);
  await fillAdvancedTagName(dialog, tagName);
  await setLinkPaths(dialog, { input, output });
  await setLinkDeadValue(dialog, '-1');
  await setLinkMode(dialog, /定时|^On interval$/i);
  await setLinkRateMs(dialog, 500);
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findLink(tagName);
  expect(tag?.kind).toBe('link');
  expect(tag?.input).toBe(input);
  expect(tag?.output).toBe(output);
  expect(tag?.dead_value).toBe('-1');
  expect(tag?.link_mode).toBe('on_interval');
  expect(tag?.update_rate_ms).toBe(500);
});

test('Link Ignore Initial Update mode', async ({ page }) => {
  const tagName = `LinkIgn_${stamp()}`;
  const input = pvPath(4);
  const output = pvPath(5);
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(page, /新建链接标签|New Link Tag/i);
  await fillAdvancedTagName(dialog, tagName);
  await setLinkPaths(dialog, { input, output });
  await setLinkMode(dialog, /忽略初值|ignore initial/i);
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findLink(tagName);
  expect(tag?.kind).toBe('link');
  expect(tag?.link_mode).toBe('on_data_change_ignore_initial');
  expect(tag?.input).toBe(input);
  expect(tag?.output).toBe(output);
});

test('Link While True gate uses V1501 bAlarmIn', async ({ page }) => {
  const tagName = `LinkGate_${stamp()}`;
  const input = pvPath(6);
  const output = pvPath(7);
  const trigger = boolPath('bAlarmIn');
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(page, /新建链接标签|New Link Tag/i);
  await fillAdvancedTagName(dialog, tagName);
  await setLinkPaths(dialog, { input, output });
  await setLinkMode(
    dialog,
    /^输入标签数据变化时$|^On data change of input tag$/i,
  );
  await setLinkTriggerType(dialog, /为真期间|While trigger comparison true/i);
  await setLinkTriggerGate(dialog, {
    triggerTag: trigger,
    // comparison defaults to "==" on new Link tags
    triggerValue: 'true',
    scanRateMs: 1000,
  });
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const tag = await findLink(tagName);
  expect(tag?.kind).toBe('link');
  expect(tag?.input).toBe(input);
  expect(tag?.output).toBe(output);
  expect(tag?.link_mode).toBe('on_data_change');
  expect(tag?.trigger_type).toBe('while_true');
  expect(tag?.trigger_tag).toBe(trigger);
  expect(tag?.comparison).toBe('==');
  expect(tag?.trigger_value).toBe('true');
  expect(tag?.trigger_scan_rate_ms).toBe(1000);
});
