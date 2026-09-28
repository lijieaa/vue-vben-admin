import { expect, test } from '@playwright/test';

import { deleteDevice, ensureS7Channel, fetchDevice } from './helpers/api';
import {
  expandGroup,
  expectGroupVisible,
  expectLabelHidden,
  expectLabelVisible,
  fillDeviceName,
  openNewDeviceDialog,
  openWorkspace,
  refreshWorkspace,
  selectChannelInTree,
  selectDeviceModel,
  setNumberField,
  wizardNext,
} from './helpers/workspace';

const CHANNEL = `S7E2E_${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await ensureS7Channel(CHANNEL);
});

test('S7 device form shows model-gated fields and persists settings', async ({
  page,
}) => {
  const deviceName = `Dev_${Date.now().toString(36)}`;
  await deleteDevice(CHANNEL, deviceName);

  await openWorkspace(page);
  await refreshWorkspace(page);
  await selectChannelInTree(page, CHANNEL);

  const dialog = await openNewDeviceDialog(page);

  // parent -> name
  await wizardNext(dialog);
  await fillDeviceName(dialog, deviceName);
  await wizardNext(dialog);

  // props step: S7 groups
  await expectGroupVisible(dialog, /S7 通信|S7 Communications/);
  await expectGroupVisible(dialog, /寻址选项|Addressing Options/);
  await expectGroupVisible(dialog, /自动生成标签|Auto Tag Generation/);
  await expandGroup(dialog, /S7 通信|S7 Communications/);
  await expandGroup(dialog, /自动生成标签|Auto Tag Generation/);

  // S7-200: TSAP, no rack
  await selectDeviceModel(dialog, 'S7-200');
  await expandGroup(dialog, /S7 通信|S7 Communications/);
  await expectLabelVisible(dialog, /本地 TSAP|Local TSAP/);
  await expectLabelVisible(dialog, /远程 TSAP|Remote TSAP/);
  await expectLabelHidden(dialog, /^机架$|^Rack$/);
  await expectLabelHidden(dialog, /^MPI ID$/);

  // S7-300: rack/slot + ATG project fields
  await selectDeviceModel(dialog, 'S7-300');
  await expandGroup(dialog, /S7 通信|S7 Communications/);
  await expandGroup(dialog, /自动生成标签|Auto Tag Generation/);
  await expectLabelVisible(dialog, /^机架$|^Rack$/);
  await expectLabelVisible(dialog, /^插槽$|^Slot$/);
  await expectLabelVisible(dialog, /链路类型|Link type/);
  await expectLabelHidden(dialog, /本地 TSAP|Local TSAP/);
  await expectLabelVisible(dialog, /工程文件|Project file/);

  await setNumberField(dialog, /^机架$|^Rack$/, 3);
  await setNumberField(dialog, /^插槽$|^Slot$/, 2);
  await setNumberField(dialog, /^端口$|^Port$/, 102);

  // NetLink: MPI, no rack
  await selectDeviceModel(dialog, 'NetLink S7-300');
  await expectLabelVisible(dialog, /^MPI ID$/);
  await expectLabelHidden(dialog, /^机架$|^Rack$/);

  // back to S7-300 for save
  await selectDeviceModel(dialog, 'S7-300');
  await setNumberField(dialog, /^机架$|^Rack$/, 3);

  await wizardNext(dialog); // summary
  await wizardNext(dialog); // create

  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const info = await fetchDevice(CHANNEL, deviceName);
  expect(info.model).toBe('s7_300');
  const comm = (info.settings?.communications || {}) as Record<string, unknown>;
  expect(comm.port).toBe(102);
  expect(comm.rack).toBe(3);
  expect(comm.slot).toBe(2);

  // inspector hydrate
  await refreshWorkspace(page);
  await selectChannelInTree(page, CHANNEL);
  const tree = page.locator('.el-tree');
  await tree.getByText(deviceName, { exact: true }).click();

  const inspector = page
    .locator('.inspector-form')
    .or(page.locator('form').filter({ hasText: /型号|Model/ }));
  await expect(inspector.first()).toBeVisible({ timeout: 15_000 });
  await expectGroupVisible(page, /S7 通信|S7 Communications/);
  await expectLabelVisible(page, /^机架$|^Rack$/);
});
