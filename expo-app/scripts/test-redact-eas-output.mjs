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
  assert.match(envValidator, /fnm exec --using=22\.22\.3 --/);
  assert.match(envValidator, /EAS_COMMAND=\(\.\/scripts\/eas-pinned\.sh\)/);
  assert.doesNotMatch(envValidator, /npx --yes eas-cli/);
  assert.match(envValidator, /probe-eas-env\.mjs/);
  assert.match(envValidator, /"\$PROBE_SCRIPT" "\$name" "\$EAS_ENVIRONMENT"/);
  assert.doesNotMatch(envValidator, /EAS_ENV_LIST=\$\(/);
  assert.doesNotMatch(envValidator, /env:list/);
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

test('production environment validation terminates and waits for every probe on SIGTERM', async () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-eas-cancel-'));
  const fakeEas = join(fixtureDirectory, 'eas');
  const tracePath = join(fixtureDirectory, 'trace.log');
  const validatorPath = fileURLToPath(new URL('./validate-prod-env.sh', import.meta.url));
  let validator;

  try {
    writeFileSync(
      fakeEas,
      `#!/usr/bin/env bash
trace="\${TRACE_PATH:?}"
printf 'start:%s\\n' "$$" >>"$trace"
on_term() {
  printf 'term:%s\\n' "$$" >>"$trace"
  exit 143
}
trap on_term HUP INT TERM
sleep 10 &
wait $!
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
    while (Date.now() < waitDeadline) {
      const trace = existsSync(tracePath) ? readFileSync(tracePath, 'utf8') : '';
      if ((trace.match(/^start:/gmu) ?? []).length === 8) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const beforeSignal = readFileSync(tracePath, 'utf8');
    assert.equal((beforeSignal.match(/^start:/gmu) ?? []).length, 8);
    const startedAt = Date.now();
    validator.kill('SIGTERM');
    const { code, signal } = await new Promise((resolve) => {
      validator.once('close', (closeCode, closeSignal) =>
        resolve({ code: closeCode, signal: closeSignal }),
      );
    });
    const elapsedMs = Date.now() - startedAt;
    const finalTrace = readFileSync(tracePath, 'utf8');

    assert.equal(code, 143);
    assert.equal(signal, null);
    assert.equal((finalTrace.match(/^term:/gmu) ?? []).length, 8);
    assert.ok(elapsedMs < 3000, `probe cleanup took ${elapsedMs}ms`);
  } finally {
    if (validator?.exitCode === null && validator?.signalCode === null) validator.kill('SIGKILL');
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});
