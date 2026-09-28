import { expect, test } from '@playwright/test';

import {
  deleteDeviceTag,
  ensureS7Device,
  fetchChannel,
  findTag,
  getRuntimeWritesTotal,
  waitLiveValue,
} from './helpers/api';
import {
  expectWriteDialogClosed,
  fillTagForm,
  fillWriteDialogValue,
  openNewTagDialog,
  openWorkspace,
  openWriteDialogForTag,
  refreshWorkspace,
  selectDeviceInTree,
  submitTagForm,
  submitWriteDialog,
} from './helpers/workspace';

/** Align with scada-engine s7_tcp live_rw (S7-300). */
const S7_AREA_TAGS: {
  name: string;
  address: string;
  type: RegExp;
  write: boolean | string;
  want: unknown;
}[] = [
  {
    name: 'MB0',
    address: 'MB0',
    type: /^字节$|^Byte$/i,
    write: '90',
    want: 90,
  },
  {
    name: 'MW2',
    address: 'MW2',
    type: /^字$|^Word$/i,
    write: '42435',
    want: 42_435,
  },
  {
    name: 'MD4',
    address: 'MD4',
    type: /^双字$|^DWord$/i,
    write: '287454020',
    want: 287_454_020,
  },
  {
    name: 'M8_0',
    address: 'M8.0',
    type: /^布尔$|^Boolean$/i,
    write: true,
    want: true,
  },
  {
    name: 'QB0',
    address: 'QB0',
    type: /^字节$|^Byte$/i,
    write: '60',
    want: 60,
  },
  {
    name: 'Q1_0',
    address: 'Q1.0',
    type: /^布尔$|^Boolean$/i,
    write: true,
    want: true,
  },
  {
    name: 'IB0',
    address: 'IB0',
    type: /^字节$|^Byte$/i,
    write: '17',
    want: 17,
  },
  {
    name: 'I0_1',
    address: 'I0.1',
    type: /^布尔$|^Boolean$/i,
    write: true,
    want: true,
  },
  {
    name: 'DB1_DBB0',
    address: 'DB1,DBB0',
    type: /^字节$|^Byte$/i,
    write: '126',
    want: 126,
  },
  {
    name: 'DB1_DBW2',
    address: 'DB1,DBW2',
    type: /^字$|^Word$/i,
    write: '48879',
    want: 48_879,
  },
  {
    name: 'DB1_DBD4',
    address: 'DB1,DBD4',
    type: /^双字$|^DWord$/i,
    write: '2864434397',
    want: 2_864_434_397,
  },
  {
    name: 'DB1_DBX8_0',
    address: 'DB1,DBX8.0',
    type: /^布尔$|^Boolean$/i,
    write: true,
    want: true,
  },
  {
    name: 'PIB0',
    address: 'PIB0',
    type: /^字节$|^Byte$/i,
    write: '34',
    want: 34,
  },
  {
    name: 'PQB0',
    address: 'PQB0',
    type: /^字节$|^Byte$/i,
    write: '51',
    want: 51,
  },
];

let channel = '';
let device = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const stamp = Date.now().toString(36);
  channel = `S7TagCh_${stamp}`;
  device = `S7TagDev_${stamp}`;
  await ensureS7Device(channel, device);
  const ch = await fetchChannel(channel);
  expect(ch.started, `channel ${channel} should auto-start`).toBe(true);
});

test('create S7 tags for all data areas from workspace UI', async ({
  page,
}) => {
  test.setTimeout(180_000);

  for (const t of S7_AREA_TAGS) {
    await deleteDeviceTag(channel, device, t.name);
  }

  await openWorkspace(page);
  await refreshWorkspace(page);
  await selectDeviceInTree(page, channel, device);

  for (const t of S7_AREA_TAGS) {
    const dialog = await openNewTagDialog(page);
    await expect(
      dialog.getByRole('button', { name: /标识|Identification/i }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: /数据属性|Data/i }),
    ).toBeVisible();

    await fillTagForm(dialog, {
      name: t.name,
      address: t.address,
      dataTypeLabel: t.type,
    });
    await submitTagForm(dialog);
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    await expect
      .poll(async () => findTag(channel, device, t.name), { timeout: 10_000 })
      .toBeTruthy();
    const saved = await findTag(channel, device, t.name);
    expect(saved?.address).toBe(t.address);

    await selectDeviceInTree(page, channel, device);
    const row = page
      .locator('.scada-list-table')
      .getByRole('row')
      .filter({ has: page.getByText(t.name, { exact: true }) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(t.address);
  }

  await refreshWorkspace(page);
  await selectDeviceInTree(page, channel, device);
  for (const t of S7_AREA_TAGS) {
    await expect(
      page
        .locator('.scada-list-table')
        .getByRole('row')
        .filter({ has: page.getByText(t.name, { exact: true }) }),
    ).toBeVisible();
  }
});

test('write S7 tags for all data areas from workspace UI', async ({ page }) => {
  test.setTimeout(240_000);

  await openWorkspace(page);
  await refreshWorkspace(page);
  await selectDeviceInTree(page, channel, device);

  const writesBefore = await getRuntimeWritesTotal();

  for (const t of S7_AREA_TAGS) {
    const dialog = await openWriteDialogForTag(page, t.name);
    await fillWriteDialogValue(dialog, { value: t.write });
    await submitWriteDialog(dialog);
    await expectWriteDialogClosed(dialog);
    await expect(
      page
        .locator('.el-message__content')
        .filter({ hasText: /已写入|Wrote/i })
        .first(),
    ).toBeVisible({ timeout: 5000 });

    // Refresh hits the PLC on :102; must match the written value.
    await waitLiveValue(channel, device, t.name, t.want, 20_000);
  }

  const writesAfter = await getRuntimeWritesTotal();
  expect(
    writesAfter - writesBefore,
    `runtime writes_total should increase by at least ${S7_AREA_TAGS.length}`,
  ).toBeGreaterThanOrEqual(S7_AREA_TAGS.length);
});
