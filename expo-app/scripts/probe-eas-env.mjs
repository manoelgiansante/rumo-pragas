#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const [name, environment, ...easCommand] = process.argv.slice(2);
const timeoutMs = Number(process.env.RUMO_EAS_PROBE_TIMEOUT_MS ?? '30000');

if (
  !/^[A-Z][A-Z0-9_]*$/.test(name ?? '') ||
  !['production', 'preview', 'development'].includes(environment) ||
  easCommand.length === 0 ||
  !Number.isSafeInteger(timeoutMs) ||
  timeoutMs < 50 ||
  timeoutMs > 120000
) {
  process.exit(2);
}

const expectedMissing = `Variable with name "${name}" not found`;
const expectedSecret = `${name} is a secret variable and cannot be displayed once it has been created.`;
let sawPresent = false;
let sawMissing = false;
let sawSecret = false;
let protocolInvalid = false;
let timedOut = false;
let spawnFailed = false;
let forceKillTimer;
let parentSignalExitCode = 0;

const startsWithEqualsField = (value) => value.startsWith(`${name}=`);

const child = spawn(
  easCommand[0],
  [
    ...easCommand.slice(1),
    'env:get',
    environment,
    '--variable-name',
    name,
    '--scope',
    'project',
    '--format',
    'short',
    '--non-interactive',
  ],
  {
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      DISABLE_EAS_ANALYTICS: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

const terminate = (signal) => {
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    // The child may have exited between the timer and the signal.
  }
};

for (const [signal, exitCode] of [
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.once(signal, () => {
    if (parentSignalExitCode) return;
    parentSignalExitCode = exitCode;
    terminate('SIGTERM');
    forceKillTimer = setTimeout(() => {
      terminate('SIGKILL');
      process.exit(exitCode);
    }, 2000);
  });
}

process.once('exit', () => {
  if (child.exitCode === null && child.signalCode === null) terminate('SIGKILL');
});

const timeout = setTimeout(() => {
  timedOut = true;
  terminate('SIGTERM');
  forceKillTimer = setTimeout(() => terminate('SIGKILL'), 2000);
}, timeoutMs);

const scan = (stream) => {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let discardRemainder = false;

  const inspect = (text, final = false) => {
    if (sawPresent) return;
    pending += text;

    while (pending.includes('\n')) {
      const newline = pending.indexOf('\n');
      const line = pending.slice(0, newline).replace(/\r$/, '');
      pending = pending.slice(newline + 1);
      if (line === expectedMissing) {
        sawMissing = true;
      } else if (line === expectedSecret) {
        sawSecret = true;
      } else if (startsWithEqualsField(line)) {
        sawPresent = true;
        pending = '';
        return;
      }
    }

    if (startsWithEqualsField(pending)) {
      sawPresent = true;
      pending = '';
      discardRemainder = true;
      return;
    }
    if (final && pending.replace(/\r$/, '') === expectedMissing) sawMissing = true;
    if (final && pending.replace(/\r$/, '') === expectedSecret) sawSecret = true;
    if (pending.length > 8192) {
      protocolInvalid = true;
      pending = '';
      discardRemainder = true;
    }
  };

  stream.on('data', (chunk) => {
    if (!discardRemainder) inspect(decoder.write(chunk));
  });
  stream.on('end', () => {
    if (!discardRemainder) inspect(decoder.end(), true);
  });
};

scan(child.stdout);
scan(child.stderr);
child.once('error', () => {
  spawnFailed = true;
});
child.once('close', (code) => {
  clearTimeout(timeout);
  if (forceKillTimer) clearTimeout(forceKillTimer);

  const markerCount = Number(sawPresent) + Number(sawMissing) + Number(sawSecret);
  if (parentSignalExitCode) process.exit(parentSignalExitCode);
  if (timedOut) process.exit(124);
  if (spawnFailed || protocolInvalid || markerCount !== 1) process.exit(4);
  if (sawSecret) process.exit(code === 1 ? 0 : 4);
  if (code !== 0) process.exit(4);
  process.exit(sawPresent ? 0 : 3);
});
