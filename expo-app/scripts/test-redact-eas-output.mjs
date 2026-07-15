#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
  assert.match(redacted, /\[REDACTED:PASSWORD\]/);
  assert.match(redacted, /\[REDACTED:BASE64\]/);
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
  assert.equal((redacted.match(/\[REDACTED:PASSWORD\]/g) ?? []).length, 3);
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
  assert.equal((result.stdout.match(/\[REDACTED:PASSWORD\]/g) ?? []).length, 2);
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
  assert.match(output, /\[REDACTED:PASSWORD\]/);
  assert.match(output, /\[REDACTED:BASE64\]/);
});

test('keeps the production wrapper on the sanitized local-only path', () => {
  const wrapper = readFileSync(new URL('./eas-local-production-build.sh', import.meta.url), 'utf8');
  const launch = readFileSync(new URL('./launch.sh', import.meta.url), 'utf8');

  assert.match(wrapper, /set -Eeuo pipefail/);
  assert.match(wrapper, /NODE_VERSION="22\.22\.3"/);
  assert.match(wrapper, /EAS_CLI_PACKAGE="eas-cli@21\.0\.0"/);
  assert.match(wrapper, /NO_COLOR=1 FORCE_COLOR=0 SENTRY_DISABLE_AUTO_UPLOAD=true \\\n+  fnm exec/);
  assert.match(wrapper, /node "\$REDACTOR" \\\n+  \| tee "\$LOG_PATH"/);
  assert.match(wrapper, /PIPELINE_STATUS=\("\$\{PIPESTATUS\[@\]\}"\)/);
  assert.match(wrapper, /ARTIFACTS_DIR="\$APP_ROOT\/\.artifacts"/);
  assert.doesNotMatch(wrapper, /--auto-submit|eas submit/);
  assert.match(launch, /exec \.\/scripts\/eas-local-production-build\.sh --platform/);
});
