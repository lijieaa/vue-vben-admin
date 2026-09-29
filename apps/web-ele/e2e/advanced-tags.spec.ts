import { expect, test } from '@playwright/test';

import { getAdvancedTagsConfig, resetAdvancedTagsConfig } from './helpers/api';
import {
  addComplexElement,
  clickAdvancedToolbar,
  confirmAdvancedDialog,
  expectAdvancedTableRow,
  fillAdvancedExpression,
  fillAdvancedTagName,
  fillAdvancedTagPath,
  openNewAdvancedGroupDialog,
  openNewAdvancedKind,
  openWorkspace,
  refreshWorkspace,
  saveWorkspaceProject,
  selectAdvancedFormOption,
  selectAdvancedGroupInTree,
  selectAdvancedTagsRoot,
} from './helpers/workspace';

test.describe.configure({ mode: 'serial' });

const stamp = () => Date.now().toString(36);

test.beforeEach(async () => {
  await resetAdvancedTagsConfig();
});

test.afterAll(async () => {
  await resetAdvancedTagsConfig();
});

async function openAtRoot(page: import('@playwright/test').Page) {
  await openWorkspace(page);
  await refreshWorkspace(page);
  await selectAdvancedTagsRoot(page);
}

test('AT root enables New Tag Group and all New* kinds', async ({ page }) => {
  await openAtRoot(page);
  const toolbar = page.locator('[aria-label="toolbar"]');
  const labels = [
    /新建标签组|New Tag Group/i,
    /新建复合标签|New Complex Tag/i,
    /新建平均标签|New Average Tag/i,
    /新建最大标签|New Maximum Tag/i,
    /新建最小标签|New Minimum Tag/i,
    /新建派生标签|New Derived Tag/i,
    /新建累计标签|New Cumulative Tag/i,
    /新建链接标签|New Link Tag/i,
  ];
  for (const name of labels) {
    await expect(toolbar.getByRole('button', { name })).toBeEnabled();
  }
});

test('AT root creates Link with On Interval mode', async ({ page }) => {
  const tagName = `Link_${stamp()}`;
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(page, /新建链接标签|New Link Tag/i);
  await fillAdvancedTagName(dialog, tagName);
  await fillAdvancedTagPath(dialog, /输入标签|Input/i, 'Sim.Dev.A');
  await fillAdvancedTagPath(dialog, /输出标签|Output/i, 'Sim.Dev.B');
  await selectAdvancedFormOption(
    dialog,
    /链接模式|Link Mode/i,
    /定时|On Interval/i,
  );
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const cfg = await getAdvancedTagsConfig();
  const tag = (cfg.tags || []).find((t) => t.name === tagName);
  expect(tag?.kind).toBe('link');
  expect(tag?.link_mode).toBe('on_interval');
  expect(tag?.input).toBe('Sim.Dev.A');
  expect(tag?.output).toBe('Sim.Dev.B');
});

test('AT root creates Average / Minimum / Maximum with RunTag', async ({
  page,
}) => {
  const kinds: {
    btn: RegExp;
    kind: string;
    name: string;
  }[] = [
    {
      btn: /新建平均标签|New Average Tag/i,
      kind: 'average',
      name: `Avg_${stamp()}`,
    },
    {
      btn: /新建最小标签|New Minimum Tag/i,
      kind: 'minimum',
      name: `Min_${stamp()}`,
    },
    {
      btn: /新建最大标签|New Maximum Tag/i,
      kind: 'maximum',
      name: `Max_${stamp()}`,
    },
  ];

  await openAtRoot(page);

  for (const item of kinds) {
    const dialog = await openNewAdvancedKind(page, item.btn);
    await fillAdvancedTagName(dialog, item.name);
    await fillAdvancedTagPath(dialog, /源标签|Source/i, 'Sim.Dev.T');
    await fillAdvancedTagPath(dialog, /运行标签|Run Tag/i, 'Sim.Dev.Run');
    await confirmAdvancedDialog(dialog);
    await expectAdvancedTableRow(page, item.name);
  }

  await saveWorkspaceProject(page);
  const cfg = await getAdvancedTagsConfig();
  for (const item of kinds) {
    const tag = (cfg.tags || []).find((t) => t.name === item.name);
    expect(tag?.kind, item.name).toBe(item.kind);
    expect(tag?.source).toBe('Sim.Dev.T');
    expect(tag?.run_tag).toBe('Sim.Dev.Run');
  }
});

test('AT root creates Derived with expression and Check Expression', async ({
  page,
}) => {
  const tagName = `Der_${stamp()}`;
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建派生标签|New Derived Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await fillAdvancedExpression(dialog, 'ABS(-2)');
  await dialog
    .getByRole('button', { name: /检查表达式|Check Expression/i })
    .click();
  await expect(page.getByText(/表达式有效|Expression is valid/i)).toBeVisible({
    timeout: 10_000,
  });
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const cfg = await getAdvancedTagsConfig();
  const tag = (cfg.tags || []).find((t) => t.name === tagName);
  expect(tag?.kind).toBe('derived');
  expect(tag?.expression).toBe('ABS(-2)');
});

test('AT root creates Complex with element and ByRate send', async ({
  page,
}) => {
  const tagName = `Cx_${stamp()}`;
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建复合标签|New Complex Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await addComplexElement(dialog, { name: 'E1', tag: 'Sim.Dev.T' });
  await expect(dialog.getByText('E1')).toBeVisible();
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
  expect(tag?.elements?.[0]?.name).toBe('E1');
  expect(tag?.elements?.[0]?.tag).toBe('Sim.Dev.T');
  expect(tag?.send_trigger?.mode).toBe('by_rate');
});

test('AT root creates Cumulative with Word wrap', async ({ page }) => {
  const tagName = `Cum_${stamp()}`;
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(
    page,
    /新建累计标签|New Cumulative Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await fillAdvancedTagPath(dialog, /源标签|Source/i, 'Sim.Dev.Cnt');
  await selectAdvancedFormOption(dialog, /数据类型|Data Type/i, /^Word$/i);
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const cfg = await getAdvancedTagsConfig();
  const tag = (cfg.tags || []).find((t) => t.name === tagName);
  expect(tag?.kind).toBe('cumulative');
  expect(tag?.source).toBe('Sim.Dev.Cnt');
  expect(tag?.max_type).toBe('word');
});

test('AT group hosts New Average under nested Tag Group', async ({ page }) => {
  const groupName = `G_${stamp()}`;
  const tagName = `AvgG_${stamp()}`;
  await openAtRoot(page);

  const gDlg = await openNewAdvancedGroupDialog(page);
  await gDlg
    .locator('.el-form-item')
    .filter({ hasText: /组名称|Group Name/i })
    .locator('input')
    .fill(groupName);
  await confirmAdvancedDialog(gDlg);
  await selectAdvancedGroupInTree(page, groupName);

  const dialog = await openNewAdvancedKind(
    page,
    /新建平均标签|New Average Tag/i,
  );
  await fillAdvancedTagName(dialog, tagName);
  await fillAdvancedTagPath(dialog, /源标签|Source/i, 'Sim.Dev.T');
  await fillAdvancedTagPath(dialog, /运行标签|Run Tag/i, 'Sim.Dev.Run');
  await confirmAdvancedDialog(dialog);
  await expectAdvancedTableRow(page, tagName);
  await saveWorkspaceProject(page);

  const cfg = await getAdvancedTagsConfig();
  const group = (cfg.groups || []).find((g) => g.name === groupName);
  const tag = (group?.tags || []).find((t) => t.name === tagName);
  expect(tag?.kind).toBe('average');
});

test('AT parent Disable greys nested group without rewriting child enabled', async ({
  page,
}) => {
  const parentName = `P_${stamp()}`;
  const childName = `C_${stamp()}`;
  await openAtRoot(page);

  const pDlg = await openNewAdvancedGroupDialog(page);
  await pDlg
    .locator('.el-form-item')
    .filter({ hasText: /组名称|Group Name/i })
    .locator('input')
    .fill(parentName);
  await confirmAdvancedDialog(pDlg);
  await selectAdvancedGroupInTree(page, parentName);

  const cDlg = await openNewAdvancedGroupDialog(page);
  await cDlg
    .locator('.el-form-item')
    .filter({ hasText: /组名称|Group Name/i })
    .locator('input')
    .fill(childName);
  await confirmAdvancedDialog(cDlg);
  await saveWorkspaceProject(page);

  await selectAdvancedGroupInTree(page, parentName);
  const waitAtPut = () =>
    page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/advanced-tags') &&
        r.request().method() === 'PUT' &&
        r.ok(),
    );
  await Promise.all([
    waitAtPut(),
    clickAdvancedToolbar(page, /^禁用$|^Disable$/i),
  ]);

  const childRow = page.locator(
    `.el-tree-node[data-key="at-group-${parentName}/${childName}"] > .el-tree-node__content`,
  );
  await expect(childRow.locator('span.truncate')).toHaveClass(/opacity-70/);

  const cfg = await getAdvancedTagsConfig();
  const parent = (cfg.groups || []).find((g) => g.name === parentName);
  const child = (parent?.groups || []).find((g) => g.name === childName);
  expect(parent?.enabled).toBe(false);
  // Child keeps its own stored flag (host soft-enable cascade is effective-only).
  expect(child?.enabled).not.toBe(false);

  await selectAdvancedGroupInTree(page, parentName);
  await Promise.all([
    waitAtPut(),
    clickAdvancedToolbar(page, /^启用$|^Enable$/i),
  ]);
  await expect(childRow.locator('span.truncate')).not.toHaveClass(/opacity-70/);
});

test('AT Enable / Disable selected tag via host toolbar', async ({ page }) => {
  const tagName = `En_${stamp()}`;
  await openAtRoot(page);

  const dialog = await openNewAdvancedKind(page, /新建链接标签|New Link Tag/i);
  await fillAdvancedTagName(dialog, tagName);
  await fillAdvancedTagPath(dialog, /输入标签|Input/i, 'Sim.Dev.A');
  await fillAdvancedTagPath(dialog, /输出标签|Output/i, 'Sim.Dev.B');
  await confirmAdvancedDialog(dialog);

  const row = await expectAdvancedTableRow(page, tagName);
  await row.click();

  const waitAtPut = () =>
    page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/advanced-tags') &&
        r.request().method() === 'PUT' &&
        r.ok(),
    );

  await Promise.all([
    waitAtPut(),
    clickAdvancedToolbar(page, /^禁用$|^Disable$/i),
  ]);
  let cfg = await getAdvancedTagsConfig();
  expect((cfg.tags || []).find((t) => t.name === tagName)?.enabled).toBe(false);

  // Disabled tree node uses muted label styling.
  const treeLabel = page
    .locator('.el-tree-node__content')
    .filter({ hasText: tagName });
  await expect(treeLabel.locator('span.truncate')).toHaveClass(/opacity-70/);

  await row.click();
  await Promise.all([
    waitAtPut(),
    clickAdvancedToolbar(page, /^启用$|^Enable$/i),
  ]);
  cfg = await getAdvancedTagsConfig();
  expect((cfg.tags || []).find((t) => t.name === tagName)?.enabled).toBe(true);
  await expect(treeLabel.locator('span.truncate')).not.toHaveClass(
    /opacity-70/,
  );
});
