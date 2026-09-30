import type { AdvancedTagsConfigBody } from './helpers/api';

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import {
  deleteDevice,
  ensureSeeLinkV1501Device,
  getAdvancedTagsConfig,
  putAdvancedTagsConfig,
  resetAdvancedTagsConfig,
  tagPath,
} from './helpers/api';
import {
  addComplexElement,
  confirmAdvancedDialog,
  expectAdvancedTableRow,
  fillAdvancedTagName,
  openComplexJsonValue,
  openNewAdvancedKind,
  openWorkspace,
  refreshWorkspace,
  saveWorkspaceProject,
  selectAdvancedTagsRoot,
  setComplexSendByTag,
} from './helpers/workspace';

test.describe.configure({ mode: 'serial' });

const CHANNEL =
  process.env.E2E_SEELINK_CHANNEL || `S7ATCx_${Date.now().toString(36)}`;
const DEVICE = process.env.E2E_SEELINK_DEVICE || 'V1501';
const GROUP = '实时监控';
const KEEP = process.env.E2E_KEEP === '1' || process.env.E2E_KEEP === 'true';
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'seelink-v1501-device.json',
);

const stamp = () => Date.now().toString(36);

/** Snapshot of shared scada AT config; restored in afterAll. */
let atSnapshot: AdvancedTagsConfigBody = { groups: [], tags: [] };

/** Numeric source / element tag on V1501. */
function pvPath(n = 0) {
  return tagPath(CHANNEL, DEVICE, `Pv_${n}`, GROUP);
}

/** Boolean tags for trigger / complete. */
function boolPath(name: string) {
  return tagPath(CHANNEL, DEVICE, name, GROUP);
}

test.beforeAll(async () => {
  atSnapshot = await getAdvancedTagsConfig();
  await ensureSeeLinkV1501Device(CHANNEL, DEVICE, FIXTURE);
});

test.beforeEach(async () => {
  await resetAdvancedTagsConfig();
});

test.afterAll(async () => {
  await putAdvancedTagsConfig({
    groups: atSnapshot.groups ?? [],
    tags: atSnapshot.tags ?? [],
  });
  if (!KEEP) {
    await deleteDevice(CHANNEL, DEVICE);
  }
});

async function openAtRoot(page: import('@playwright/test').Page) {
  await openWorkspace(page);
  await refreshWorkspace(page);
  await selectAdvancedTagsRoot(page);
}

test('Complex ByRate uses V1501 Pv_0 element', async ({ page }) => {
  const tagName = `Cx_${stamp()}`;
  const elementTag = pvPath(0);
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建复合标签|New Complex Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await addComplexElement(dialog, { name: 'Pv0', tag: elementTag });
  await expect(dialog.getByText('Pv0')).toBeVisible();
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const cfg = await getAdvancedTagsConfig();
  const tag = (cfg.tags || []).find((t) => t.name === tagName) as
    | undefined
    | {
        kind?: string;
        elements?: Array<{ name?: string; tag?: string }>;
        send_trigger?: { mode?: string };
      };
  expect(tag?.kind).toBe('complex');
  expect(tag?.elements?.length).toBe(1);
  expect(tag?.elements?.[0]?.name).toBe('Pv0');
  expect(tag?.elements?.[0]?.tag).toBe(elementTag);
  expect(tag?.send_trigger?.mode).toBe('by_rate');
});

test('Complex element Insert By Tag uses V1501 bools', async ({ page }) => {
  const tagName = `CxTrig_${stamp()}`;
  const elementTag = pvPath(1);
  const trigger = boolPath('bAlarmIn');
  const complete = boolPath('bAlarmStop');
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建复合标签|New Complex Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await addComplexElement(dialog, {
    name: 'Pv1',
    tag: elementTag,
    insertBy: 'by_tag',
    triggerTag: trigger,
    completeTag: complete,
  });
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const cfg = await getAdvancedTagsConfig();
  const tag = (cfg.tags || []).find((t) => t.name === tagName) as
    | undefined
    | {
        kind?: string;
        elements?: Array<{
          name?: string;
          tag?: string;
          insert_trigger?: {
            mode?: string;
            trigger_tag?: string;
            complete_tag?: string;
          };
        }>;
      };
  expect(tag?.kind).toBe('complex');
  expect(tag?.elements?.[0]?.tag).toBe(elementTag);
  expect(tag?.elements?.[0]?.insert_trigger?.mode).toBe('by_tag');
  expect(tag?.elements?.[0]?.insert_trigger?.trigger_tag).toBe(trigger);
  expect(tag?.elements?.[0]?.insert_trigger?.complete_tag).toBe(complete);
});

test('Complex send By Tag uses V1501 bools', async ({ page }) => {
  const tagName = `CxSend_${stamp()}`;
  const elementTag = pvPath(2);
  const trigger = boolPath('bAlarmIn');
  const complete = boolPath('bAlarmStop');
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建复合标签|New Complex Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await addComplexElement(dialog, { name: 'Pv2', tag: elementTag });
  await setComplexSendByTag(dialog, {
    triggerTag: trigger,
    completeTag: complete,
  });
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const cfg = await getAdvancedTagsConfig();
  const tag = (cfg.tags || []).find((t) => t.name === tagName) as
    | undefined
    | {
        kind?: string;
        send_trigger?: {
          mode?: string;
          trigger_tag?: string;
          complete_tag?: string;
        };
      };
  expect(tag?.kind).toBe('complex');
  expect(tag?.send_trigger?.mode).toBe('by_tag');
  expect(tag?.send_trigger?.trigger_tag).toBe(trigger);
  expect(tag?.send_trigger?.complete_tag).toBe(complete);
});

test('Complex value click opens formatted JSON dialog', async ({ page }) => {
  const tagName = `CxJson_${stamp()}`;
  const livePath = `_AdvancedTags.${tagName}`;
  const payload = JSON.stringify({
    items: [
      {
        name: 'Pv0',
        value: 12.5,
        data_type: 5,
        quality: 192,
        time_stamp: '1',
      },
    ],
  });

  await openAtRoot(page);
  const dialog = await openNewAdvancedKind(
    page,
    /新建复合标签|New Complex Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await addComplexElement(dialog, {
    name: 'Pv0',
    tag: pvPath(0),
  });
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);

  const jsonDlg = await openComplexJsonValue(page, tagName, livePath, payload);
  await expect(jsonDlg.locator('pre')).toContainText('"name": "Pv0"');
  await expect(jsonDlg.locator('pre')).toContainText('12.5');
  await page.keyboard.press('Escape');
  await expect(jsonDlg).toBeHidden({ timeout: 10_000 });
});
