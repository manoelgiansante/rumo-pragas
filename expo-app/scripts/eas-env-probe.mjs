import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const FORCE_KILL_DELAY_MS = 2000;

export const isValidProbeInput = ({ name, environment, easCommand, timeoutMs }) =>
  /^[A-Z][A-Z0-9_]*$/.test(name ?? '') &&
  ['production', 'preview', 'development'].includes(environment) &&
  Array.isArray(easCommand) &&
  easCommand.length > 0 &&
  Number.isSafeInteger(timeoutMs) &&
  timeoutMs >= 50 &&
  timeoutMs <= 120000;

/**
 * Inicia um comando EAS em grupo de processo próprio. Nenhum byte de stdout ou
 * stderr é encaminhado ao chamador; a resposta é reduzida a um status seguro.
 */
export const startEasEnvProbe = ({ name, environment, easCommand, timeoutMs = 30000 }) => {
  if (!isValidProbeInput({ name, environment, easCommand, timeoutMs })) {
    throw new TypeError('Invalid EAS environment probe input');
  }

  const expectedMissing = `Variable with name "${name}" not found`;
  const expectedSecret = `${name} is a secret variable and cannot be displayed once it has been created.`;
  let sawPresent = false;
  let sawMissing = false;
  let sawSecret = false;
  let protocolInvalid = false;
  let timedOut = false;
  let spawnFailed = false;
  let cancellationExitCode = 0;
  let forceKillTimer;
  let timeout;
  let child;
  let processGroupId;
  let settled = false;
  let resolveCompletion;

  const completion = new Promise((resolve) => {
    resolveCompletion = resolve;
  });

  const finish = (status) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (forceKillTimer) clearTimeout(forceKillTimer);
    resolveCompletion(status);
  };

  const terminateGroup = (signal) => {
    try {
      if (process.platform !== 'win32' && processGroupId) {
        // O líder pode terminar antes dos descendentes. O PGID imutável
        // continua sendo a única identidade segura da árvore inteira.
        process.kill(-processGroupId, signal);
      } else if (child && child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
      }
    } catch {
      // O grupo pode encerrar entre a inspeção e o sinal.
    }
  };

  const processGroupExists = () => {
    if (process.platform === 'win32' || !processGroupId) return false;
    try {
      process.kill(-processGroupId, 0);
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      return true;
    }
  };

  const drainResidualGroup = async () => {
    if (!processGroupExists()) return false;
    while (processGroupExists()) {
      terminateGroup('SIGKILL');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return true;
  };

  const scheduleForceKill = () => {
    if (forceKillTimer || settled) return;
    forceKillTimer = setTimeout(() => terminateGroup('SIGKILL'), FORCE_KILL_DELAY_MS);
  };

  const controller = {
    completion,
    cancel(exitCode) {
      if (settled || cancellationExitCode) return;
      cancellationExitCode = exitCode;
      terminateGroup('SIGTERM');
      scheduleForceKill();
    },
    kill() {
      terminateGroup('SIGKILL');
    },
    get pid() {
      return child?.pid;
    },
  };

  try {
    child = spawn(
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
    if (process.platform !== 'win32') processGroupId = child.pid;
  } catch {
    finish(4);
    return controller;
  }

  const startsWithEqualsField = (value) => value.startsWith(`${name}=`);
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
    if (!child.pid) finish(cancellationExitCode || 4);
  });
  child.once('close', async (code) => {
    const hadResidualGroup = await drainResidualGroup();
    const markerCount = Number(sawPresent) + Number(sawMissing) + Number(sawSecret);
    if (cancellationExitCode) return finish(cancellationExitCode);
    if (timedOut) return finish(124);
    if (spawnFailed || protocolInvalid || hadResidualGroup || markerCount !== 1) return finish(4);
    if (sawSecret) return finish(code === 1 ? 0 : 4);
    if (code !== 0) return finish(4);
    return finish(sawPresent ? 0 : 3);
  });

  timeout = setTimeout(() => {
    timedOut = true;
    terminateGroup('SIGTERM');
    scheduleForceKill();
  }, timeoutMs);

  return controller;
};
