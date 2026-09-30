import type { Locator, Page } from '@playwright/test';

import { expect } from '@playwright/test';

export async function openWorkspace(page: Page) {
  await page.goto('/scada/workspace');
  await expect(page.locator('[aria-label="toolbar"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText(/工程树|Project Tree|项目树/i).first(),
  ).toBeVisible({ timeout: 15_000 });
}

export async function refreshWorkspace(page: Page) {
  const toolbar = page.locator('[aria-label="toolbar"]');
  // Refresh icon button: tooltip "刷新" / "Refresh"
  await toolbar
    .getByRole('button')
    .filter({ has: page.locator('svg') })
    .nth(0);
  // Prefer menu View -> Refresh for a11y text
  await page
    .locator('nav[aria-label="menu"]')
    .getByRole('button', { name: /查看|View/i })
    .click();
  await page.getByRole('menuitem', { name: /刷新|Refresh/i }).click();
  await page.waitForTimeout(500);
}

export async function selectChannelInTree(page: Page, channelName: string) {
  const tree = page.locator('.el-tree');
  const node = tree.getByText(new RegExp(`${channelName}\\s*\\(`));
  await expect(node.first()).toBeVisible({ timeout: 20_000 });
  await node.first().click();
}

/** Click only the row chrome — not the full treeitem box (includes children). */
export async function selectDeviceInTree(
  page: Page,
  channelName: string,
  deviceName: string,
) {
  const filter = page.getByPlaceholder(/筛选|Filter/i);
  if (await filter.isVisible()) {
    await filter.fill(deviceName);
    await page.waitForTimeout(200);
  }

  const row = page.locator(
    `.el-tree-node[data-key="ch-${channelName}-dev-${deviceName}"] > .el-tree-node__content`,
  );
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();

  // Props dock shows the selected device name (disabled).
  await expect(
    page.getByRole('textbox', { name: '名称', exact: true }).first(),
  ).toHaveValue(deviceName, { timeout: 10_000 });

  if (await filter.isVisible()) {
    await filter.clear();
  }
}

export async function openNewDeviceDialog(page: Page) {
  await page
    .locator('nav[aria-label="menu"]')
    .getByRole('button', { name: /编辑|Edit/i })
    .click();
  await page.getByRole('menuitem', { name: /新建设备|New Device/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function openNewTagDialog(page: Page) {
  await page
    .locator('nav[aria-label="menu"]')
    .getByRole('button', { name: /编辑|Edit/i })
    .click();
  const menuItem = page.getByRole('menuitem', { name: /新建标签|New Tag/i });
  await expect(menuItem).toBeVisible();
  await menuItem.click();
  const dialog = page.getByRole('dialog', { name: /新建标签|New Tag/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  return dialog;
}

export async function fillTagForm(
  dialog: Locator,
  opts: {
    name: string;
    address: string;
    dataTypeLabel?: RegExp;
    accessLabel?: RegExp;
  },
) {
  await dialog
    .getByRole('textbox', { name: /\*? ?名称|\*? ?Name/i })
    .fill(opts.name);
  await dialog
    .getByRole('textbox', { name: /\*? ?地址|\*? ?Address/i })
    .fill(opts.address);

  if (opts.dataTypeLabel) {
    const typeItem = dialog
      .locator('.el-form-item')
      .filter({ hasText: /数据类型|Data Type/i })
      .first();
    await typeItem.locator('.el-select').click();
    await dialog
      .page()
      .getByRole('option', { name: opts.dataTypeLabel })
      .click();
  }

  if (opts.accessLabel) {
    const accessItem = dialog
      .locator('.el-form-item')
      .filter({ hasText: /客户端访问|Client Access|Access/i })
      .first();
    await accessItem.locator('.el-select').click();
    await dialog.page().getByRole('option', { name: opts.accessLabel }).click();
  }
}

export async function submitTagForm(dialog: Locator) {
  await dialog
    .getByRole('button', { name: /新建标签|Create Tag|^Create$/i })
    .click();
}

/** Open write dialog by clicking the live-value control on a tag list row. */
export async function openWriteDialogForTag(page: Page, tagName: string) {
  const row = page
    .locator('.scada-list-table')
    .getByRole('row')
    .filter({ has: page.getByText(tagName, { exact: true }) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  // Writable value cell is a button (shows "-" before first sample).
  const valueBtn = row.getByRole('button').last();
  await valueBtn.click();
  const dialog = page.getByRole('dialog', {
    name: /写标签|Write Tag|批量写标签|Batch/i,
  });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

export async function fillWriteDialogValue(
  dialog: Locator,
  opts: { value: boolean | string },
) {
  if (typeof opts.value === 'boolean') {
    // Element Plus: native input is aria-hidden/visually hidden; click the track.
    const core = dialog.locator('.el-switch .el-switch__core').first();
    await expect(core).toBeVisible({ timeout: 10_000 });
    const input = dialog.locator('.el-switch input').first();
    const checked = await input.isChecked();
    if (checked !== opts.value) {
      await core.click();
    }
  } else {
    const input = dialog
      .locator('.el-form-item.write-value-form-item input')
      .first();
    await input.fill(String(opts.value));
    await input.blur();
  }
}

export async function submitWriteDialog(dialog: Locator) {
  await dialog.getByRole('button', { name: /^写入$|^Write$/i }).click();
}

export async function expectWriteDialogClosed(dialog: Locator) {
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

export async function selectAdvancedTagsRoot(page: Page) {
  const row = page.locator(
    '.el-tree-node[data-key="advanced-tags"] > .el-tree-node__content',
  );
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(
    page.getByRole('button', { name: /新建标签组|New Tag Group/i }),
  ).toBeEnabled({ timeout: 10_000 });
}

export async function selectAdvancedGroupInTree(page: Page, path: string) {
  const row = page.locator(
    `.el-tree-node[data-key="at-group-${path}"] > .el-tree-node__content`,
  );
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
}

export async function openNewAdvancedKind(page: Page, kindLabel: RegExp) {
  const btn = page
    .locator('[aria-label="toolbar"]')
    .getByRole('button', { name: kindLabel });
  await expect(btn).toBeEnabled({ timeout: 10_000 });
  await btn.click();
  const dialog = page.getByRole('dialog').filter({
    hasText: kindLabel,
  });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

export async function openNewAdvancedGroupDialog(page: Page) {
  await page
    .locator('[aria-label="toolbar"]')
    .getByRole('button', { name: /新建标签组|New Tag Group/i })
    .click();
  const dialog = page.getByRole('dialog', {
    name: /新建标签组|New Tag Group/i,
  });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

export async function fillAdvancedTagName(dialog: Locator, name: string) {
  const item = dialog
    .locator('.el-form-item')
    .filter({ hasText: /标签名称|Tag Name/i })
    .first();
  await item.locator('input').fill(name);
}

export async function fillAdvancedTagPath(
  dialog: Locator,
  label: RegExp,
  path: string,
) {
  const item = dialog
    .locator('.el-form-item')
    .filter({ hasText: label })
    .first();
  await item.locator('input').first().fill(path);
}

export async function fillAdvancedExpression(
  dialog: Locator,
  expression: string,
) {
  const item = dialog
    .locator('.el-form-item')
    .filter({ hasText: /表达式|Expression/i })
    .first();
  await item.locator('textarea').fill(expression);
}

export async function selectAdvancedFormOption(
  dialog: Locator,
  label: RegExp,
  option: RegExp,
) {
  const item = dialog
    .locator('.el-form-item')
    .filter({ hasText: label })
    .first();
  // Trigger/rate rows may include a unit ElSelect beside the mode select.
  await item.locator('.el-select').first().click();
  await dialog.page().getByRole('option', { name: option }).click();
}

export async function addComplexElement(
  dialog: Locator,
  opts: {
    name: string;
    tag: string;
    insertBy?: 'by_rate' | 'by_tag';
    rate?: number;
    rateUnit?: RegExp;
    triggerTag?: string;
    completeTag?: string;
  },
) {
  await dialog.getByRole('button', { name: /添加元素|Add Element/i }).click();
  const elDlg = dialog.page().getByRole('dialog', {
    name: /复合元素|Complex Element|Element/i,
  });
  await expect(elDlg).toBeVisible({ timeout: 10_000 });
  await elDlg
    .locator('.el-form-item')
    .filter({ hasText: /^名称$|Element Name|^Name$/i })
    .locator('input')
    .fill(opts.name);
  await fillAdvancedTagPath(elDlg, /标签路径|Element Tag|Tag Path/i, opts.tag);

  if (opts.insertBy === 'by_tag') {
    await selectAdvancedFormOption(
      elDlg,
      /插入方式|Insert By/i,
      /按标签|By Tag/i,
    );
    await elDlg
      .getByPlaceholder(/触发标签|Trigger Tag/i)
      .fill(opts.triggerTag || 'Sim.Dev.Trig');
    await elDlg
      .getByPlaceholder(/完成标签|Complete Tag/i)
      .fill(opts.completeTag || 'Sim.Dev.Done');
  } else if (
    opts.insertBy === 'by_rate' &&
    opts.rate !== null &&
    opts.rate !== undefined
  ) {
    await selectAdvancedFormOption(
      elDlg,
      /插入方式|Insert By/i,
      /按周期|By Rate/i,
    );
    const insertItem = elDlg
      .locator('.el-form-item')
      .filter({ hasText: /插入方式|Insert By/i });
    await insertItem.locator('.el-input-number input').fill(String(opts.rate));
    if (opts.rateUnit) {
      await insertItem.locator('.el-select').last().click();
      await elDlg.page().getByRole('option', { name: opts.rateUnit }).click();
    }
  }

  await elDlg.getByRole('button', { name: /^确定$|^OK$/i }).click();
  await expect(elDlg).toBeHidden({ timeout: 10_000 });
}

/** Switch complex tag send trigger to By Tag and fill paths. */
export async function setComplexSendByTag(
  dialog: Locator,
  opts: { triggerTag: string; completeTag?: string },
) {
  await selectAdvancedFormOption(
    dialog,
    /发送触发|Send Trigger/i,
    /按标签|By Tag/i,
  );
  const item = dialog
    .locator('.el-form-item')
    .filter({ hasText: /发送触发|Send Trigger/i })
    .first();
  // Prefer placeholders; fallback skips ElSelect readonly combobox inputs.
  const trigger = item.getByPlaceholder(
    /触发标签|Trigger tag|通道\.设备\.标签|Channel\.Device\.Tag/i,
  );
  await expect(trigger.first()).toBeVisible({ timeout: 10_000 });
  await trigger.first().fill(opts.triggerTag);
  if (opts.completeTag) {
    const complete = item.getByPlaceholder(/完成标签|Complete tag/i);
    await expect(complete).toBeVisible({ timeout: 10_000 });
    await complete.fill(opts.completeTag);
  }
}

/** Derived output Data Type (String/Boolean/.../Double). */
export async function setDerivedDataType(dialog: Locator, typeName: RegExp) {
  await selectAdvancedFormOption(dialog, /数据类型|Data Type/i, typeName);
}

/** Derived trigger: By Tag + optional Complete. */
export async function setDerivedTriggerByTag(
  dialog: Locator,
  opts: { triggerTag: string; completeTag?: string },
) {
  await selectAdvancedFormOption(
    dialog,
    /触发方式|Trigger Mode|Run By/i,
    /按标签|By Tag/i,
  );
  const item = dialog
    .locator('.el-form-item')
    .filter({ hasText: /触发方式|Trigger Mode|Run By/i })
    .first();
  const trigger = item.getByPlaceholder(
    /触发标签|Trigger tag|通道\.设备\.标签|Channel\.Device\.Tag/i,
  );
  await expect(trigger.first()).toBeVisible({ timeout: 10_000 });
  await trigger.first().fill(opts.triggerTag);
  if (opts.completeTag) {
    const complete = item.getByPlaceholder(/完成标签|Complete tag/i);
    if (await complete.count()) {
      await complete.fill(opts.completeTag);
    } else {
      const pathInputs = item.locator(
        'input.el-input__inner:not([readonly]):not([role="combobox"])',
      );
      await pathInputs.nth(1).fill(opts.completeTag);
    }
  }
}

/** Derived trigger: By Rate with numeric period. */
export async function setDerivedTriggerByRate(
  dialog: Locator,
  opts: { rate: number; rateUnit?: RegExp },
) {
  await selectAdvancedFormOption(
    dialog,
    /触发方式|Trigger Mode|Run By/i,
    /按周期|By Rate/i,
  );
  const item = dialog
    .locator('.el-form-item')
    .filter({ hasText: /触发方式|Trigger Mode|Run By/i })
    .first();
  await item.locator('.el-input-number input').fill(String(opts.rate));
  if (opts.rateUnit) {
    await item.locator('.el-select').last().click();
    await dialog.page().getByRole('option', { name: opts.rateUnit }).click();
  }
}

export async function checkAdvancedExpression(dialog: Locator) {
  await dialog
    .getByRole('button', { name: /检查表达式|Check Expression/i })
    .click();
}

export async function openComplexJsonValue(
  page: Page,
  tagName: string,
  livePath: string,
  jsonValue: string,
) {
  await page.route('**/api/v1/tags', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          path: livePath,
          value: jsonValue,
          quality: 'good',
          timestamp: new Date().toISOString(),
        },
      ]),
    });
  });

  const row = await expectAdvancedTableRow(page, tagName);
  await row.click();
  // Wait for polled live value to become clickable.
  const valueCell = row.locator('.text-primary').filter({ hasText: /items/i });
  await expect(valueCell).toBeVisible({ timeout: 15_000 });
  await valueCell.click();
  const dlg = page.getByRole('dialog').filter({
    hasText: /复合标签值|Complex tag value/i,
  });
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await expect(dlg.locator('pre')).toContainText('"items"');
  return dlg;
}

export async function expectAdvancedTableRow(page: Page, tagName: string) {
  const row = page
    .locator('.el-table')
    .getByRole('row')
    .filter({ hasText: tagName });
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

export async function clickAdvancedToolbar(page: Page, name: RegExp) {
  const btn = page.locator('[aria-label="toolbar"]').getByRole('button', {
    name,
  });
  await expect(btn).toBeEnabled({ timeout: 10_000 });
  await btn.click();
}

export async function confirmAdvancedDialog(dialog: Locator) {
  await dialog.getByRole('button', { name: /^确定$|^OK$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

export async function saveWorkspaceProject(page: Page) {
  await page
    .locator('[aria-label="toolbar"]')
    .getByRole('button', { name: /^(保存|Save)$/i })
    .click();
  await expect(
    page
      .getByText(/工程已保存|Project saved|高级标签已保存|Advanced tags saved/i)
      .first(),
  ).toBeVisible({
    timeout: 20_000,
  });
}

export async function wizardNext(dialog: Locator) {
  await dialog
    .getByRole('button', { name: /下一步|Next|完成|Create/i })
    .click();
}

export async function fillDeviceName(dialog: Locator, name: string) {
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: /名称|Name/i })
    .locator('input')
    .first()
    .fill(name);
}

export async function selectDeviceModel(dialog: Locator, modelLabel: string) {
  const modelItem = dialog
    .locator('.el-form-item')
    .filter({ hasText: /型号|Model/i })
    .first();
  await modelItem.locator('.el-select').click();
  await dialog
    .page()
    .getByRole('option', { name: modelLabel, exact: true })
    .click();
}

export async function expectGroupVisible(dialog: Locator, re: RegExp) {
  await expect(dialog.getByRole('button', { name: re }).first()).toBeVisible();
}

/** Ensure a PropertySheet foldout is expanded (click if body looks collapsed). */
export async function expandGroup(dialog: Locator, re: RegExp) {
  const btn = dialog.getByRole('button', { name: re }).first();
  await btn.scrollIntoViewIfNeeded();
  await expect(btn).toBeVisible();
  // If the next sibling body is hidden, click to expand.
  const section = btn.locator('xpath=ancestor::section[1]');
  const body = section.locator('.property-inspector-body');
  if (!(await body.isVisible())) {
    await btn.click();
  }
}

export async function expectLabelVisible(dialog: Locator, re: RegExp) {
  const loc = dialog.getByText(re).filter({ visible: true }).first();
  await expect(loc).toBeVisible();
}

export async function expectLabelHidden(dialog: Locator, re: RegExp) {
  await expect(dialog.getByText(re).filter({ visible: true })).toHaveCount(0);
}

export async function setNumberField(
  dialog: Locator,
  labelRe: RegExp,
  value: number,
) {
  const item = dialog
    .locator('.el-form-item')
    .filter({ hasText: labelRe })
    .filter({ visible: true })
    .first();
  const input = item.locator('input').first();
  await input.fill(String(value));
  await input.blur();
}
