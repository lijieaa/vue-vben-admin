import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as setup } from '@playwright/test';

import { saveStorageState } from './helpers/auth';

const authFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '.auth',
  'user.json',
);

setup('authenticate', async () => {
  await saveStorageState('http://127.0.0.1:5777', authFile);
});
