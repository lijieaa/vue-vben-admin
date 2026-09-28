import type { Page } from '@playwright/test';

import fs from 'node:fs';
import path from 'node:path';

import { chromium, expect } from '@playwright/test';

export async function authLogin(page: Page) {
  await page.goto('/auth/login');
  const usernameInput = page.locator(`input[name='username']`);
  await expect(usernameInput).toBeVisible();
  await usernameInput.fill('admin');

  const passwordInput = page.locator(`input[name='password']`);
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill('123456');

  const sliderCaptcha = page.locator(`div[name='captcha']`);
  const sliderCaptchaAction = page.locator(`div[name='captcha-action']`);
  await expect(sliderCaptcha).toBeVisible();
  await expect(sliderCaptchaAction).toBeVisible();

  const sliderCaptchaBox = await sliderCaptcha.boundingBox();
  if (!sliderCaptchaBox) throw new Error('captcha track not found');
  const actionBoundingBox = await sliderCaptchaAction.boundingBox();
  if (!actionBoundingBox) throw new Error('captcha thumb not found');

  const startX = Math.round(actionBoundingBox.x + actionBoundingBox.width / 2);
  const startY = Math.round(actionBoundingBox.y + actionBoundingBox.height / 2);
  const targetX = Math.round(
    sliderCaptchaBox.x + sliderCaptchaBox.width - actionBoundingBox.width / 2,
  );

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, startY, { steps: 24 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const box = await sliderCaptchaAction.boundingBox();
      return box?.x ?? actionBoundingBox.x;
    })
    .toBeGreaterThan(actionBoundingBox.x);

  await page.getByRole('button', { name: 'login', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), {
    timeout: 30_000,
  });
}

export async function saveStorageState(baseURL: string, outFile: string) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(baseURL);
  await authLogin(page);
  await page.context().storageState({ path: outFile });
  await browser.close();
}
