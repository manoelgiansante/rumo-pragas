#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { redactEasOutput, redactEasStream } from './redact-eas-output.mjs';

const syntheticPassword = ['synthetic', 'apple', 'credential'].join('-');
const syntheticBase64 = Buffer.from('synthetic-certificate-material|'.repeat(20)).toString(
  'base64',
);

test('redacts password values and long base64 from EAS error payloads', () => {
  const rawJob = JSON.stringify({
    credentials: {
      distributionCertificate: {
        data: syntheticBase64,
        password: syntheticPassword,
      },
      provisioningProfile: syntheticBase64,
    },
  });

  const redacted = redactEasOutput(rawJob);

  assert.equal(redacted.includes(syntheticPassword), false);
  assert.equal(redacted.includes(syntheticBase64), false);
  assert.equal(redacted, '[REDACTED:SENSITIVE_LINE]');
});

test('redacts escaped JSON and shell-style password fields', () => {
  const escapedJob = JSON.stringify(
    JSON.stringify({ certPassword: syntheticPassword, payload: syntheticBase64 }),
  );
  const shellOutput = `p12Password=${syntheticPassword}`;
  const yamlOutput = `password: "${syntheticPassword}"`;
  const redacted = redactEasOutput(`${escapedJob}\n${shellOutput}\n${yamlOutput}`);

  assert.equal(redacted.includes(syntheticPassword), false);
  assert.equal(redacted.includes(syntheticBase64), false);
  assert.equal((redacted.match(/\[REDACTED:SENSITIVE_LINE\]/g) ?? []).length, 3);
});

test('preserves ordinary output and short non-secret base64', () => {
  const ordinaryOutput = 'Build phase complete: YWJjZA==';

  assert.equal(redactEasOutput(ordinaryOutput), ordinaryOutput);
});

test('strips terminal controls before redacting a streamed password', () => {
  const ansiPayload = [
    `password\u001b[0m: "${syntheticPassword}"`,
    `password:\u001b[31m "${syntheticPassword}"\u001b[0m`,
    syntheticBase64,
  ].join('\n');
  const redactorPath = fileURLToPath(new URL('./redact-eas-output.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [redactorPath], {
    input: ansiPayload,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes(syntheticPassword), false);
  assert.equal(result.stdout.includes(syntheticBase64), false);
  assert.equal(result.stdout.includes('\u001b'), false);
  assert.equal((result.stdout.match(/\[REDACTED:SENSITIVE_LINE\]/g) ?? []).length, 2);
  assert.match(result.stdout, /\[REDACTED:BASE64\]/);
});

test('redacts secrets split across stream chunks', async () => {
  let output = '';
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const chunks = [
    'pass',
    'word\u001b[0m: "',
    syntheticPassword.slice(0, 8),
    `${syntheticPassword.slice(8)}"\n${syntheticBase64.slice(0, 24)}`,
    `${syntheticBase64.slice(24)}\n`,
  ];

  await redactEasStream(Readable.from(chunks), sink);

  assert.equal(output.includes(syntheticPassword), false);
  assert.equal(output.includes(syntheticBase64), false);
  assert.equal(output.includes('\u001b'), false);
  assert.match(output, /\[REDACTED:SENSITIVE_LINE\]/);
  assert.match(output, /\[REDACTED:BASE64\]/);
});

test('redacts named secrets, authorization values, JWTs, and credentialed URLs', () => {
  const syntheticJwtSegments = [
    Buffer.from('synthetic-jwt-header').toString('base64url'),
    Buffer.from('synthetic-jwt-payload').toString('base64url'),
    'synthetic-signature-value',
  ];
  const values = [
    'apiKey=short-api-key.with-punctuation',
    'accessToken: token.with+punctuation/and=padding',
    'clientSecret="short-client-secret"',
    'dsn=https://public-key@example.invalid/42',
    'privateKey: short-private-key',
    'Cookie: session=short-cookie',
    'Authorization: Bearer short-access-token',
    'Bearer standalone-token-value',
    syntheticJwtSegments.join('.'),
    'https://credential@example.invalid/path',
  ];
  const redacted = redactEasOutput(values.join('\n'));

  for (const value of [
    'short-api-key.with-punctuation',
    'token.with+punctuation/and=padding',
    'short-client-secret',
    'public-key',
    'short-private-key',
    'short-cookie',
    'short-access-token',
    'standalone-token-value',
    syntheticJwtSegments[0],
    'credential',
  ]) {
    assert.equal(redacted.includes(value), false);
  }
  assert.equal((redacted.match(/\[REDACTED:SENSITIVE_LINE\]/g) ?? []).length, 7);
  assert.match(redacted, /\[REDACTED:AUTHORIZATION\]/);
  assert.match(redacted, /\[REDACTED:JWT\]/);
  assert.match(redacted, /\[REDACTED:URL_CREDENTIAL\]/);
});

test('keeps the production wrapper on a pinned output-suppressed local-only path', () => {
  const wrapper = readFileSync(new URL('./eas-local-production-build.sh', import.meta.url), 'utf8');
  const launch = readFileSync(new URL('./launch.sh', import.meta.url), 'utf8');
  const submit = readFileSync(new URL('./submit.sh', import.meta.url), 'utf8');
  const uploadOta = readFileSync(new URL('./upload-sentry-ota.sh', import.meta.url), 'utf8');
  const envValidator = readFileSync(new URL('./validate-prod-env.sh', import.meta.url), 'utf8');
  const envCoordinator = readFileSync(new URL('./validate-prod-env.mjs', import.meta.url), 'utf8');
  const envProbeCore = readFileSync(new URL('./eas-env-probe.mjs', import.meta.url), 'utf8');
  const easExecutor = readFileSync(new URL('./eas-pinned.sh', import.meta.url), 'utf8');
  const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

  assert.match(wrapper, /set -Eeuo pipefail/);
  assert.match(wrapper, /EAS_EXECUTOR="\$APP_ROOT\/scripts\/eas-pinned\.sh"/);
  assert.match(easExecutor, /NODE_VERSION="22\.22\.3"/);
  assert.match(easExecutor, /EAS_CLI_PACKAGE="eas-cli@21\.0\.0"/);
  assert.match(wrapper, /CI=1 DISABLE_EAS_ANALYTICS=1 NO_COLOR=1 FORCE_COLOR=0/);
  assert.match(wrapper, /<\/dev\/null >\/dev\/null 2>&1/);
  assert.doesNotMatch(wrapper, /node "\$REDACTOR"|PIPESTATUS/);
  assert.match(wrapper, /ARTIFACTS_DIR="\$APP_ROOT\/\.artifacts"/);
  assert.match(wrapper, /RUMO_EAS_CLI_MODE=pinned \.\/scripts\/validate-prod-env\.sh production/);
  assert.doesNotMatch(wrapper, /--auto-submit|eas submit/);
  assert.match(launch, /exec \.\/scripts\/eas-local-production-build\.sh --platform/);
  assert.match(launch, /\.\/scripts\/eas-pinned\.sh build/);
  assert.match(submit, /\.\/scripts\/eas-pinned\.sh submit/);
  assert.match(uploadOta, /\.\/scripts\/eas-pinned\.sh env:exec/);
  for (const releaseScript of [launch, submit, uploadOta]) {
    assert.match(releaseScript, /<\/dev\/null >\/dev\/null 2>&1/);
  }
  assert.match(envValidator, /fnm exec --using=22\.22\.3 -- node -p 'process\.execPath'/);
  assert.match(envValidator, /EAS_COMMAND=\(\.\/scripts\/eas-pinned\.sh\)/);
  assert.doesNotMatch(envValidator, /npx --yes eas-cli/);
  assert.match(envValidator, /validate-prod-env\.mjs/);
  assert.match(envValidator, /exec "\$\{NODE_COMMAND\[@\]\}" "\$VALIDATOR_SCRIPT"/);
  assert.doesNotMatch(envValidator, /EAS_ENV_LIST=\$\(/);
  assert.doesNotMatch(envValidator, /env:list/);
  assert.match(envCoordinator, /startEasEnvProbe/);
  assert.doesNotMatch(envCoordinator, /spawn\(/);
  assert.match(envCoordinator, /terminateProbes\('SIGTERM'\)/);
  assert.match(envCoordinator, /Promise\.all\(completions\)/);
  assert.match(envProbeCore, /stdio: \['ignore', 'pipe', 'pipe'\]/);
  assert.match(envProbeCore, /process\.kill\(-processGroupId, signal\)/);
  assert.match(envProbeCore, /setTimeout\(\(\) => terminateGroup\('SIGKILL'\)/);
  assert.match(envExample, /\.\/scripts\/eas-pinned\.sh env:create/);
  assert.doesNotMatch(envExample, /env:create[^\n]*--value/);
});

test('production environment validation emits only allowlisted names, never remote values', () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-eas-validator-'));
  const fakeEas = join(fixtureDirectory, 'eas');
  const sentinelValue = 'synthetic-remote-value-that-must-never-be-logged';
  const validatorPath = fileURLToPath(new URL('./validate-prod-env.sh', import.meta.url));

  try {
    writeFileSync(
      fakeEas,
      `#!/usr/bin/env bash
name=''
while (($# > 0)); do
  if [[ "$1" == '--variable-name' ]]; then
    name="$2"
    shift 2
  else
    shift
  fi
done
case "$name" in
  EXPO_PUBLIC_SUPABASE_URL) printf '%s\\n' "$name=https://example.invalid" ;;
  EXPO_PUBLIC_SUPABASE_ANON_KEY) printf '%s\\n' "$name=${sentinelValue}" ;;
  SENTRY_AUTH_TOKEN)
    printf '%s is a secret variable and cannot be displayed once it has been created.\\n' "$name" >&2
    exit 1
    ;;
  *) printf 'Variable with name "%s" not found\\n' "$name" ;;
esac
`,
      { mode: 0o700 },
    );
    chmodSync(fakeEas, 0o700);

    const result = spawnSync('bash', [validatorPath, 'production'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixtureDirectory}:${process.env.PATH ?? ''}`,
        RUMO_EAS_CLI_MODE: 'system',
      },
    });
    const combinedOutput = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.equal(combinedOutput.includes(sentinelValue), false);
    assert.equal(combinedOutput.includes('https://example.invalid'), false);
    assert.match(combinedOutput, /OK: variável remota presente: EXPO_PUBLIC_SUPABASE_URL/);
    assert.match(combinedOutput, /EAS Environment:EXPO_PUBLIC_SENTRY_DSN/);
    assert.match(combinedOutput, /EAS Environment:GOOGLE_SERVICES_JSON/);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('EAS environment probe times out without echoing child output', () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-eas-timeout-'));
  const fakeEas = join(fixtureDirectory, 'eas');
  const probePath = fileURLToPath(new URL('./probe-eas-env.mjs', import.meta.url));

  try {
    writeFileSync(fakeEas, '#!/usr/bin/env bash\nprintf "secret-before-hang"\nsleep 5\n', {
      mode: 0o700,
    });
    const result = spawnSync(
      process.execPath,
      [probePath, 'GOOGLE_SERVICES_JSON', 'production', fakeEas],
      {
        encoding: 'utf8',
        env: { ...process.env, RUMO_EAS_PROBE_TIMEOUT_MS: '100' },
        timeout: 3000,
      },
    );

    assert.equal(result.status, 124);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('EAS probe drains descendants after the detached group leader exits', async () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-eas-descendant-'));
  const fakeEas = join(fixtureDirectory, 'eas');
  const tracePath = join(fixtureDirectory, 'trace.log');
  const probePath = fileURLToPath(new URL('./probe-eas-env.mjs', import.meta.url));
  let probe;

  const traceNumber = (label) => {
    if (!existsSync(tracePath)) return undefined;
    const match = readFileSync(tracePath, 'utf8').match(new RegExp(`^${label}:(\\d+)$`, 'mu'));
    return match ? Number(match[1]) : undefined;
  };
  const isAlive = (pid) => {
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw error;
    }
  };

  try {
    writeFileSync(
      fakeEas,
      `#!/usr/bin/env bash
trace="\${TRACE_PATH:?}"
printf 'group:%s\\n' "$$" >>"$trace"
(
  trap '' HUP INT TERM
  printf 'descendant:%s\\n' "$BASHPID" >>"$trace"
  while :; do sleep 10; done
) &
printf 'GOOGLE_SERVICES_JSON=synthetic-present-marker\\n'
exit 0
`,
      { mode: 0o700 },
    );

    probe = spawn(process.execPath, [probePath, 'GOOGLE_SERVICES_JSON', 'production', fakeEas], {
      env: {
        ...process.env,
        TRACE_PATH: tracePath,
        RUMO_EAS_PROBE_TIMEOUT_MS: '100',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    probe.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    probe.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const startedAt = Date.now();
    const result = await new Promise((resolve) => {
      const hardStop = setTimeout(() => probe.kill('SIGKILL'), 3500);
      probe.once('close', (code, signal) => {
        clearTimeout(hardStop);
        resolve({ code, signal });
      });
    });
    const elapsedMs = Date.now() - startedAt;

    assert.deepEqual(result, { code: 124, signal: null });
    assert.equal(stdout, '');
    assert.equal(stderr, '');
    assert.ok(elapsedMs < 3000, `descendant cleanup took ${elapsedMs}ms`);
    assert.equal(isAlive(traceNumber('descendant')), false);
  } finally {
    if (probe?.exitCode === null && probe?.signalCode === null) probe.kill('SIGKILL');
    const groupId = traceNumber('group');
    if (groupId) {
      try {
        process.kill(-groupId, 'SIGKILL');
      } catch {
        // O grupo já foi drenado pelo caminho esperado.
      }
    }
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('EAS environment probe rejects generic errors and spawn failures without echoing them', () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-eas-errors-'));
  const fakeEas = join(fixtureDirectory, 'eas');
  const probePath = fileURLToPath(new URL('./probe-eas-env.mjs', import.meta.url));

  try {
    writeFileSync(
      fakeEas,
      '#!/usr/bin/env bash\nprintf "generic-error-with-secret" >&2\nexit 1\n',
      {
        mode: 0o700,
      },
    );
    const genericError = spawnSync(
      process.execPath,
      [probePath, 'GOOGLE_SERVICES_JSON', 'production', fakeEas],
      { encoding: 'utf8' },
    );
    const spawnFailure = spawnSync(
      process.execPath,
      [probePath, 'GOOGLE_SERVICES_JSON', 'production', join(fixtureDirectory, 'missing-eas')],
      { encoding: 'utf8' },
    );

    assert.equal(genericError.status, 4);
    assert.equal(genericError.stdout, '');
    assert.equal(genericError.stderr, '');
    assert.equal(spawnFailure.status, 4);
    assert.equal(spawnFailure.stdout, '');
    assert.equal(spawnFailure.stderr, '');
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('EAS probe installs signal cleanup before spawning its detached child', async () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-eas-early-signal-'));
  const fakeEas = join(fixtureDirectory, 'eas');
  const tracePath = join(fixtureDirectory, 'trace.log');
  const probePath = fileURLToPath(new URL('./probe-eas-env.mjs', import.meta.url));
  const probes = [];

  const tracedPids = () => {
    if (!existsSync(tracePath)) return [];
    return (readFileSync(tracePath, 'utf8').match(/^start:(\d+)$/gmu) ?? []).map((line) =>
      Number(line.slice('start:'.length)),
    );
  };
  const isAlive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw error;
    }
  };

  try {
    writeFileSync(
      fakeEas,
      `#!/bin/sh
trace="\${TRACE_PATH:?}"
printf 'start:%s\\n' "$$" >>"$trace"
trap '' HUP INT TERM
kill -TERM "$PPID"
while :; do sleep 10; done
`,
      { mode: 0o700 },
    );

    const completions = Array.from({ length: 64 }, () => {
      const probe = spawn(
        process.execPath,
        [probePath, 'GOOGLE_SERVICES_JSON', 'production', fakeEas],
        {
          env: { ...process.env, TRACE_PATH: tracePath },
          stdio: ['ignore', 'ignore', 'ignore'],
        },
      );
      probes.push(probe);
      return new Promise((resolve) => {
        probe.once('close', (code, signal) => resolve({ code, signal }));
      });
    });

    const results = await Promise.all(completions);
    assert.equal(tracedPids().length, 64);
    assert.deepEqual(
      results.filter(({ code, signal }) => code !== 143 || signal !== null),
      [],
      'every early signal must use the controlled cleanup path',
    );
    assert.deepEqual(
      tracedPids().filter(isAlive),
      [],
      'no detached EAS process may survive an early parent signal',
    );
  } finally {
    for (const probe of probes) {
      if (probe.exitCode === null && probe.signalCode === null) probe.kill('SIGKILL');
    }
    for (const pid of tracedPids()) {
      if (!isAlive(pid)) continue;
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        process.kill(pid, 'SIGKILL');
      }
    }
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

for (const [parentSignal, expectedExitCode] of [
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  test(`production environment validation drains every probe after repeated ${parentSignal}`, async () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-eas-cancel-'));
    const fakeEas = join(fixtureDirectory, 'eas');
    const tracePath = join(fixtureDirectory, 'trace.log');
    const validatorPath = fileURLToPath(new URL('./validate-prod-env.sh', import.meta.url));
    let validator;

    const tracedPids = () => {
      if (!existsSync(tracePath)) return [];
      return (readFileSync(tracePath, 'utf8').match(/^start:(\d+)$/gmu) ?? []).map((line) =>
        Number(line.slice('start:'.length)),
      );
    };
    const isAlive = (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        if (error?.code === 'ESRCH') return false;
        throw error;
      }
    };

    try {
      writeFileSync(
        fakeEas,
        `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const trace = process.env.TRACE_PATH;
appendFileSync(trace, \`start:\${process.pid}\\n\`);
for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    appendFileSync(trace, \`term:\${process.pid}\\n\`);
  });
}
setInterval(() => {}, 1_000);
`,
        { mode: 0o700 },
      );
      validator = spawn('bash', [validatorPath, 'production'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
          ...process.env,
          PATH: `${fixtureDirectory}:${process.env.PATH ?? ''}`,
          RUMO_EAS_CLI_MODE: 'system',
          TRACE_PATH: tracePath,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      validator.stdout.resume();
      validator.stderr.resume();

      const waitDeadline = Date.now() + 3000;
      while (Date.now() < waitDeadline && tracedPids().length < 8) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      assert.equal(tracedPids().length, 8);
      const startedAt = Date.now();
      assert.equal(validator.kill(parentSignal), true);
      await new Promise((resolve) => setTimeout(resolve, 25));
      validator.kill(parentSignal);
      const { code, signal } = await new Promise((resolve) => {
        validator.once('close', (closeCode, closeSignal) =>
          resolve({ code: closeCode, signal: closeSignal }),
        );
      });
      const elapsedMs = Date.now() - startedAt;
      const finalTrace = readFileSync(tracePath, 'utf8');

      assert.equal(code, expectedExitCode);
      assert.equal(signal, null);
      assert.equal((finalTrace.match(/^term:/gmu) ?? []).length, 8);
      assert.deepEqual(
        tracedPids().filter(isAlive),
        [],
        'every EAS fixture process must be gone before the validator closes',
      );
      assert.ok(elapsedMs < 3000, `probe cleanup took ${elapsedMs}ms`);
    } finally {
      if (validator?.exitCode === null && validator?.signalCode === null) validator.kill('SIGKILL');
      for (const pid of tracedPids()) {
        if (isAlive(pid)) process.kill(pid, 'SIGKILL');
      }
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });
}
