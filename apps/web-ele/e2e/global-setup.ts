import type { FullConfig } from '@playwright/test';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  portOpen,
  runDir,
  spawnLogged,
  waitHTTP,
  waitPort,
} from './helpers/processes';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));

function resolveScadaRoot(): string {
  if (process.env.E2E_SCADA_ROOT) return process.env.E2E_SCADA_ROOT;
  // apps/web-ele/e2e -> myprojs/scada-engine
  const guess = path.resolve(e2eDir, '../../../../scada-engine');
  if (fs.existsSync(path.join(guess, 'go.mod'))) return guess;
  const alt = path.resolve('D:/myprojs/scada-engine');
  if (fs.existsSync(path.join(alt, 'go.mod'))) return alt;
  throw new Error(
    'scada-engine root not found; set E2E_SCADA_ROOT to the repo path',
  );
}

async function globalSetup(_config: FullConfig) {
  fs.mkdirSync(runDir, { recursive: true });

  let scadaPid: number | undefined;
  let s7fakePid: number | undefined;
  const apiBase = process.env.E2E_SCADA_API || 'http://127.0.0.1:8888';
  const forceRestart =
    process.env.E2E_FORCE_SCADA === '1' ||
    process.env.E2E_FORCE_SCADA === 'true';
  let alreadyUp = await portOpen('127.0.0.1', 8888);
  const scadaRoot = resolveScadaRoot();

  // Optional in-process fake only when explicitly requested.
  // Never bind 127.0.0.1:102 alongside a real soft PLC on 0.0.0.0:102 —
  // Windows routes 127.0.0.1 connects to the more specific listener first.
  const wantFake =
    process.env.E2E_S7_FAKE === '1' || process.env.E2E_S7_FAKE === 'true';
  if (wantFake && !(await portOpen('127.0.0.1', 102))) {
    const proc = spawnLogged(
      'go',
      ['run', './cmd/s7fake', '-listen', '127.0.0.1:102'],
      {
        cwd: scadaRoot,
        logFile: path.join(runDir, 's7fake.log'),
      },
    );
    s7fakePid = proc.pid;
    await waitPort('127.0.0.1', 102, 120_000);
  } else if (!(await portOpen('127.0.0.1', 102))) {
    throw new Error(
      'Nothing listening on 127.0.0.1:102. Start your S7 soft PLC, or set E2E_S7_FAKE=1',
    );
  }

  if (alreadyUp && forceRestart) {
    alreadyUp = await portOpen('127.0.0.1', 8888);
  }

  if (alreadyUp && !forceRestart) {
    await waitHTTP(`${apiBase}/api/v1/drivers`);
  } else if (alreadyUp) {
    await waitHTTP(`${apiBase}/api/v1/drivers`);
  } else {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scada-e2e-'));
    const logDir = path.join(runDir, 'scada-logs');
    fs.mkdirSync(logDir, { recursive: true });
    const proc = spawnLogged(
      'go',
      [
        'run',
        './cmd/scada-engine',
        '-http',
        ':8888',
        '-mqtt',
        '',
        '-mqtt-listen',
        '',
        '-mqtt-ws-listen',
        '',
        '-ua',
        '127.0.0.1:14840',
        '-data-dir',
        dataDir,
        '-log-dir',
        logDir,
      ],
      {
        cwd: scadaRoot,
        logFile: path.join(runDir, 'scada.log'),
      },
    );
    scadaPid = proc.pid;
    await waitHTTP(`${apiBase}/api/v1/drivers`, 180_000);
  }

  const authFile = path.join(e2eDir, '.auth', 'user.json');
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  // Auth storage is filled by e2e/auth.setup.ts after webServer is up.
  if (!fs.existsSync(authFile)) {
    fs.writeFileSync(
      authFile,
      JSON.stringify({ cookies: [], origins: [] }),
      'utf8',
    );
  }

  fs.writeFileSync(
    path.join(runDir, 'state.json'),
    JSON.stringify({
      scadaPid,
      s7fakePid,
      startedScada: Boolean(scadaPid),
      startedS7Fake: Boolean(s7fakePid),
      authFile,
    }),
  );
}

export default globalSetup;
