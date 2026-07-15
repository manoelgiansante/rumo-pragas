#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { isValidProbeInput, startEasEnvProbe } from './eas-env-probe.mjs';

const [name, environment, ...easCommand] = process.argv.slice(2);
const timeoutMs = Number(process.env.RUMO_EAS_PROBE_TIMEOUT_MS ?? '30000');

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (!isValidProbeInput({ name, environment, easCommand, timeoutMs })) process.exit(2);

  let controller;
  let parentSignalExitCode = 0;
  const signalHandlers = new Map();
  for (const [signal, exitCode] of [
    ['SIGHUP', 129],
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    const handler = () => {
      if (parentSignalExitCode) return;
      parentSignalExitCode = exitCode;
      controller?.cancel(exitCode);
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }

  const exitHandler = () => controller?.kill();
  process.once('exit', exitHandler);

  try {
    controller = startEasEnvProbe({ name, environment, easCommand, timeoutMs });
  } catch {
    process.exit(4);
  }
  if (parentSignalExitCode) controller.cancel(parentSignalExitCode);

  const status = await controller.completion;
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  process.off('exit', exitHandler);
  process.exit(status);
}
