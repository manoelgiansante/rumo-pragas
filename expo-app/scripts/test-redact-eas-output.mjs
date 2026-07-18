#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

test('keeps production mobile builds on the native local output-suppressed path', () => {
  const wrapper = readFileSync(new URL('./eas-local-production-build.sh', import.meta.url), 'utf8');
  const nativeBuilder = readFileSync(
    new URL('./native-local-production-build.mjs', import.meta.url),
    'utf8',
  );
  const launch = readFileSync(new URL('./launch.sh', import.meta.url), 'utf8');
  const submit = readFileSync(new URL('./submit.sh', import.meta.url), 'utf8');
  const uploadOta = readFileSync(new URL('./upload-sentry-ota.sh', import.meta.url), 'utf8');
  const envValidator = readFileSync(new URL('./validate-prod-env.sh', import.meta.url), 'utf8');
  const envCoordinator = readFileSync(new URL('./validate-prod-env.mjs', import.meta.url), 'utf8');
  const envProbeCore = readFileSync(new URL('./eas-env-probe.mjs', import.meta.url), 'utf8');
  const easExecutor = readFileSync(new URL('./eas-pinned.sh', import.meta.url), 'utf8');
  const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

  assert.match(wrapper, /set -Eeuo pipefail/);
  assert.match(wrapper, /\/usr\/bin\/env -i/);
  assert.match(wrapper, /git archive --format=tar "\$CANDIDATE_COMMIT"/);
  assert.match(wrapper, /CURRENT_WRAPPER_BLOB/);
  assert.match(wrapper, /FNM_BIN="\/opt\/homebrew\/Cellar\/fnm\/1\.39\.0\/bin\/fnm"/);
  assert.match(easExecutor, /NODE_BIN=.*v22\.22\.3/);
  assert.match(easExecutor, /EAS_CLI_PACKAGE="eas-cli@21\.0\.0"/);
  assert.match(easExecutor, /build\|build:\*\|workflow\|workflow:\*\|cloud\|cloud:\*/);
  assert.match(easExecutor, /comando EAS não pertence à allowlist segura/);
  assert.match(wrapper, /CI=1 \\\n/);
  assert.match(wrapper, /DISABLE_EAS_ANALYTICS=1 \\\n/);
  assert.match(wrapper, /<\/dev\/null >\/dev\/null 2>&1/);
  assert.doesNotMatch(wrapper, /node "\$REDACTOR"|PIPESTATUS/);
  assert.match(wrapper, /ARTIFACTS_DIR="\$APP_ROOT\/\.artifacts"/);
  assert.match(wrapper, /GLOBAL_LOCK_DIR=.*native-production-build\.lock/);
  assert.match(wrapper, /recovered-native-lock/);
  assert.match(wrapper, /credentials\.json é proibido/);
  assert.match(wrapper, /trap 'handle_signal HUP 129' HUP/);
  assert.match(wrapper, /trap 'handle_signal INT 130' INT/);
  assert.match(wrapper, /trap 'handle_signal TERM 143' TERM/);
  assert.match(wrapper, /"\$PINNED_NODE" "\$BOOTSTRAP_RUNNER"/);
  assert.doesNotMatch(
    wrapper,
    /materialize-ios-credentials|security find-generic-password|eas-pinned\.sh build/,
  );
  assert.match(nativeBuilder, /createEasEnvPullArguments/);
  assert.doesNotMatch(nativeBuilder, /env:exec/);
  assert.match(nativeBuilder, /detached: true/);
  assert.match(nativeBuilder, /process\.kill\(-pid, signal\)/);
  assert.match(nativeBuilder, /PINNED_TOOLS\.xcodebuild/);
  assert.match(nativeBuilder, /'--no-daemon'/);
  assert.match(nativeBuilder, /'--no-configuration-cache'/);
  assert.doesNotMatch(nativeBuilder, /distributionCertificate|p12Password|credentials\.json/);
  assert.match(nativeBuilder, /npm ci isolado pelo lockfile/);
  assert.match(nativeBuilder, /bundletool\.jarPath/);
  assert.doesNotMatch(nativeBuilder, /apkanalyzer/);
  assert.doesNotMatch(wrapper, /--auto-submit|eas submit/);
  assert.match(launch, /exec \.\/scripts\/eas-local-production-build\.sh --platform/);
  assert.match(launch, /ainda não possui executor nativo local atestado/);
  assert.doesNotMatch(launch, /eas-pinned\.sh build/);
  assert.doesNotMatch(launch, /PLATFORM="all"|LOCAL_BUILD=false|Build concluído ou enfileirado/);
  assert.match(launch, /ios\|android\) ;;/);
  assert.match(submit, /\.\/scripts\/eas-pinned\.sh submit/);
  assert.match(uploadOta, /\.\/scripts\/eas-pinned\.sh env:exec/);
  for (const releaseScript of [submit, uploadOta]) {
    assert.match(releaseScript, /<\/dev\/null >\/dev\/null 2>&1/);
  }
  assert.match(envValidator, /fnm exec --using=22\.22\.3 -- node -p 'process\.execPath'/);
  assert.match(envValidator, /RUMO_EAS_CLI_MODE:-pinned/);
  assert.match(envValidator, /RUMO_EAS_TEST_FIXTURE:-/);
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
  assert.match(envExample, /snapshot local aprovado/);
  assert.doesNotMatch(envExample, /eas-pinned\.sh env:create/);
});

test('pinned executor blocks cloud-capable invocations before fake fnm or npx can run', () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-eas-pinned-guard-'));
  const binDirectory = join(fixtureDirectory, 'bin');
  const executorPath = join(fixtureDirectory, 'eas-pinned.sh');
  const tracePath = join(fixtureDirectory, 'npx-arguments.txt');

  try {
    mkdirSync(binDirectory);
    writeFileSync(executorPath, readFileSync(new URL('./eas-pinned.sh', import.meta.url)), {
      mode: 0o700,
    });
    writeFileSync(
      join(binDirectory, 'fnm'),
      `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == exec ]]
shift
[[ "$1" == --using=22.22.3 ]]
shift
[[ "$1" == -- ]]
shift
if [[ "$1" == node && "\${2:-}" == --version ]]; then
  printf 'v22.22.3\\n'
  exit 0
fi
exec "$@"
`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(binDirectory, 'npx'),
      '#!/usr/bin/env bash\nprintf \'%s\\n\' "$@" >"${TRACE_PATH:?}"\n',
      { mode: 0o700 },
    );

    const runExecutor = (arguments_) =>
      spawnSync('bash', [executorPath, ...arguments_], {
        cwd: fixtureDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
          TRACE_PATH: tracePath,
        },
      });
    const assertBlockedBeforeNpx = (arguments_) => {
      rmSync(tracePath, { force: true });
      const result = runExecutor(arguments_);
      assert.equal(result.status, 2, `${arguments_.join(' ')}\n${result.stdout}${result.stderr}`);
      assert.equal(existsSync(tracePath), false, 'guard must reject before npx is reached');
    };

    for (const arguments_ of [
      ['build', '--platform', 'ios'],
      ['build', '--local'],
      ['build', '--local', '--platform', 'all'],
      ['build', '--local', '--platform=web'],
      ['build', '--local', '--no-local', '--platform', 'ios'],
      ['build', '--local=false', '--platform', 'android'],
      ['build', '--platform', 'ios', '--', '--local'],
      ['build', '--local', '--platform', 'ios', '--auto-submit'],
      ['build', '--local', '--platform', 'android', '--auto-submit-with-profile=production'],
      ['build', '--local', '--platform', 'ios', '--profile', 'preview'],
      ['build', '--local', '--platform', 'android', '--profile', 'production'],
      [
        'build',
        '--local',
        '--freeze-credentials',
        '--platform',
        'android',
        '--profile',
        'production',
      ],
      ['workflow:run', './eas/workflows/release.yml'],
      ['--non-interactive', 'workflow:run', './eas/workflows/release.yml'],
      ['workflow:list'],
    ]) {
      assertBlockedBeforeNpx(arguments_);
    }

    for (const arguments_ of [
      ['build:dev', '--platform', 'android'],
      ['build:internal', '--platform', 'ios'],
      ['cloud:build', '--platform', 'android'],
      ['env:create', 'production', '--name', 'X'],
      ['env:pull', 'production', '--path', '/tmp/secret.env', '--non-interactive'],
    ]) {
      assertBlockedBeforeNpx(arguments_);
    }
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('production environment validator defaults to pinned and rejects unmarked system mode', () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-eas-validator-mode-'));
  const binDirectory = join(fixtureDirectory, 'bin');
  const fakeNode = join(binDirectory, 'node-22');
  const tracePath = join(fixtureDirectory, 'validator-arguments.txt');
  const easMarker = join(fixtureDirectory, 'system-eas-ran');
  const validatorPath = fileURLToPath(new URL('./validate-prod-env.sh', import.meta.url));

  try {
    mkdirSync(binDirectory);
    writeFileSync(
      fakeNode,
      `#!/usr/bin/env bash
if [[ "\${1:-}" == --version ]]; then printf 'v22.22.3\\n'; exit 0; fi
printf '%s\\n' "$@" >"\${TRACE_PATH:?}"
`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(binDirectory, 'fnm'),
      `#!/usr/bin/env bash
[[ "$*" == "exec --using=22.22.3 -- node -p process.execPath" ]] || exit 91
printf '%s\\n' "\${FAKE_PINNED_NODE:?}"
`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(binDirectory, 'eas'),
      `#!/usr/bin/env bash
printf 'called' >"\${SYSTEM_EAS_MARKER:?}"
`,
      { mode: 0o700 },
    );

    const baseEnvironment = {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
      FAKE_PINNED_NODE: fakeNode,
      TRACE_PATH: tracePath,
      SYSTEM_EAS_MARKER: easMarker,
    };
    const pinned = spawnSync('bash', [validatorPath, 'production'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: baseEnvironment,
    });
    assert.equal(pinned.status, 0, `${pinned.stdout}${pinned.stderr}`);
    assert.deepEqual(readFileSync(tracePath, 'utf8').trim().split('\n'), [
      './scripts/validate-prod-env.mjs',
      'production',
      './scripts/eas-pinned.sh',
    ]);
    assert.equal(existsSync(easMarker), false);

    const unmarkedSystem = spawnSync('bash', [validatorPath, 'production'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: { ...baseEnvironment, RUMO_EAS_CLI_MODE: 'system' },
    });
    assert.equal(unmarkedSystem.status, 2);
    assert.match(unmarkedSystem.stderr, /somente para fixtures de teste explícitas/);
    assert.equal(existsSync(easMarker), false);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('launch CLI cannot enqueue a cloud build or combine platforms', () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rumo-launch-local-only-'));
  const scriptsDirectory = join(fixtureDirectory, 'scripts');
  const launchPath = join(scriptsDirectory, 'launch.sh');
  const tracePath = join(fixtureDirectory, 'build-arguments.txt');

  try {
    mkdirSync(scriptsDirectory);
    mkdirSync(join(fixtureDirectory, 'store-assets', 'ios'), { recursive: true });
    mkdirSync(join(fixtureDirectory, 'store-assets', 'android'), { recursive: true });
    writeFileSync(launchPath, readFileSync(new URL('./launch.sh', import.meta.url)), {
      mode: 0o700,
    });
    writeFileSync(
      join(scriptsDirectory, 'eas-pinned.sh'),
      '#!/usr/bin/env bash\nprintf \'%s\\n\' "$@" >"${TRACE_PATH:?}"\n',
      { mode: 0o700 },
    );
    writeFileSync(
      join(scriptsDirectory, 'eas-local-production-build.sh'),
      '#!/usr/bin/env bash\n{ printf \'production-wrapper\\n\'; printf \'%s\\n\' "$@"; } >"${TRACE_PATH:?}"\n',
      { mode: 0o700 },
    );

    const runLaunch = (arguments_) =>
      spawnSync('bash', [launchPath, ...arguments_], {
        cwd: fixtureDirectory,
        encoding: 'utf8',
        env: { ...process.env, TRACE_PATH: tracePath },
      });
    const tracedArguments = () => readFileSync(tracePath, 'utf8').trim().split('\n');

    const preview = runLaunch(['--platform', 'android', '--profile', 'preview']);
    assert.equal(preview.status, 3);
    assert.match(preview.stderr, /ainda não possui executor nativo local/);
    assert.equal(existsSync(tracePath), false);

    rmSync(tracePath, { force: true });
    const storeQa = runLaunch(['--platform', 'ios', '--profile', 'storeQa', '--local']);
    assert.equal(storeQa.status, 3);
    assert.match(storeQa.stderr, /ainda não possui executor nativo local/);
    assert.equal(existsSync(tracePath), false);

    rmSync(tracePath, { force: true });
    const production = runLaunch(['--platform', 'ios', '--profile', 'production']);
    assert.equal(production.status, 0);
    assert.deepEqual(tracedArguments(), ['production-wrapper', '--platform', 'ios']);

    rmSync(tracePath, { force: true });
    const missingPlatform = runLaunch([]);
    assert.equal(missingPlatform.status, 2);
    assert.equal(existsSync(tracePath), false);

    const allPlatforms = runLaunch(['--platform', 'all']);
    assert.equal(allPlatforms.status, 2);
    assert.equal(existsSync(tracePath), false);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
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
        RUMO_EAS_TEST_FIXTURE: '1',
      },
    });
    const combinedOutput = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.equal(combinedOutput.includes(sentinelValue), false);
    assert.equal(combinedOutput.includes('https://example.invalid'), false);
    assert.match(combinedOutput, /OK: variável remota presente: EXPO_PUBLIC_SUPABASE_URL/);
    assert.match(combinedOutput, /EAS Environment:EXPO_PUBLIC_SENTRY_DSN/);
    assert.doesNotMatch(combinedOutput, /GOOGLE_SERVICES_JSON/);
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
          RUMO_EAS_TEST_FIXTURE: '1',
          TRACE_PATH: tracePath,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      validator.stdout.resume();
      validator.stderr.resume();

      const waitDeadline = Date.now() + 3000;
      while (Date.now() < waitDeadline && tracedPids().length < 7) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      assert.equal(tracedPids().length, 7);
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
      assert.equal((finalTrace.match(/^term:/gmu) ?? []).length, 7);
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
