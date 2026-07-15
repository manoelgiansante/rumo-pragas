#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const selectedPlatform = process.argv[2] === '--platform' ? process.argv[3] : null;
let binding = null;

if (process.argv.length > 2) {
  if (!['ios', 'android'].includes(selectedPlatform)) {
    console.error(
      'Uso: node scripts/store-submission-status.mjs [--platform ios|android --artifact CAMINHO]',
    );
    process.exit(2);
  }
  const bindingFlag = process.argv[4];
  const bindingValue = process.argv[5];
  if (
    bindingFlag !== '--artifact' ||
    typeof bindingValue !== 'string' ||
    bindingValue.length === 0 ||
    process.argv.length !== 6
  ) {
    console.error('ERRO: contexto de artefato de submissão ausente ou inválido.');
    process.exit(2);
  }
  binding = [bindingFlag, bindingValue];
}

const accountDeletionBlocker = path.join(appRoot, 'store-assets', 'ACCOUNT_DELETION_BLOCKER.md');
if (existsSync(accountDeletionBlocker)) {
  failures.push({
    platform: 'account-deletion',
    detail:
      'A identidade AgroRumo compartilhada ainda não possui uma resolução aprovada e testada de exclusão integral da conta.',
  });
}

const appleSigningRotationBlocker = path.join(
  appRoot,
  'store-assets',
  'APPLE_SIGNING_ROTATION_BLOCKER.md',
);
if (existsSync(appleSigningRotationBlocker)) {
  failures.push({
    platform: 'apple-signing-rotation',
    detail:
      'O certificado Apple Distribution, provisioning profile e senha expostos em 15/07/2026 ainda exigem rotação/revogação externa comprovada; nenhum artefato iOS anterior é elegível.',
  });
}

for (const platform of ['ios', 'android']) {
  const validatorArguments = [path.join(appRoot, 'scripts/validate-store-assets.mjs'), platform];
  if (platform === selectedPlatform && binding) validatorArguments.push(...binding);
  const result = spawnSync(process.execPath, validatorArguments, {
    cwd: appRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failures.push({ platform, detail: (result.stderr || result.stdout).trim() });
  }
}

if (failures.length > 0) {
  console.error('STORE_SUBMISSION_STATUS=BLOCKED_EXTERNALLY');
  for (const failure of failures) {
    console.error(`[${failure.platform}] ${failure.detail}`);
  }
  process.exit(3);
}

console.log('STORE_SUBMISSION_STATUS=ASSETS_READY');
