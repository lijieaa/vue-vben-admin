import type { ChildProcess } from 'node:child_process';

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const e2eDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const runDir = path.join(e2eDir, '.run');

export async function waitPort(
  host: string,
  port: number,
  timeoutMs = 120_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.connect({ host, port }, () => {
        s.end();
        resolve(true);
      });
      s.on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout waiting ${host}:${port}`);
}

export async function portOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port }, () => {
      s.end();
      resolve(true);
    });
    s.on('error', () => resolve(false));
  });
}

export async function waitHTTP(
  url: string,
  timeoutMs = 120_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout waiting ${url}`);
}

export function spawnLogged(
  command: string,
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; logFile: string },
): ChildProcess {
  fs.mkdirSync(path.dirname(opts.logFile), { recursive: true });
  const out = fs.openSync(opts.logFile, 'a');
  return spawn(command, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    shell: process.platform === 'win32',
    stdio: ['ignore', out, out],
  });
}
