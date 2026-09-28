import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { runDir } from './helpers/processes';

function killPid(pid?: number) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    /* already dead */
  }
}

async function globalTeardown() {
  const statePath = path.join(runDir, 'state.json');
  if (!fs.existsSync(statePath)) return;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
    scadaPid?: number;
    s7fakePid?: number;
    startedScada?: boolean;
    startedS7Fake?: boolean;
  };
  if (state.startedScada) {
    killPid(state.scadaPid);
  }
  if (state.startedS7Fake) {
    killPid(state.s7fakePid);
  }
}

export default globalTeardown;
