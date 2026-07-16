#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
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
const accountDeletionResolution = path.join(
  appRoot,
  'store-assets',
  'ACCOUNT_DELETION_RESOLUTION.json',
);
if (existsSync(accountDeletionBlocker)) {
  failures.push({
    platform: 'account-deletion',
    detail:
      'A identidade AgroRumo compartilhada ainda não possui uma resolução aprovada e testada de exclusão integral da conta.',
  });
} else if (!existsSync(accountDeletionResolution)) {
  failures.push({
    platform: 'account-deletion',
    detail:
      'O blocker de exclusão desapareceu sem uma atestação positiva, versionada e testada em ACCOUNT_DELETION_RESOLUTION.json.',
  });
} else {
  const resolutionErrors = [];
  try {
    const stat = lstatSync(accountDeletionResolution);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) {
      resolutionErrors.push('a atestação deve ser um arquivo regular pequeno');
    } else {
      const raw = readFileSync(accountDeletionResolution, 'utf8');
      const resolution = JSON.parse(raw);
      const expectedKeys = [
        'accountDeletionUrl',
        'integrationEvidenceSha256',
        'legalDecisionReference',
        'reviewer',
        'schemaVersion',
        'scope',
        'status',
        'verifiedAt',
      ];
      if (
        !resolution ||
        typeof resolution !== 'object' ||
        Array.isArray(resolution) ||
        JSON.stringify(Object.keys(resolution).sort()) !== JSON.stringify(expectedKeys)
      ) {
        resolutionErrors.push('o esquema ou os campos da atestação são inválidos');
      } else {
        if (resolution.schemaVersion !== 1 || resolution.status !== 'verified') {
          resolutionErrors.push('status/schema da resolução não comprovam verificação');
        }
        if (resolution.scope !== 'full-shared-agrorumo-account-deletion') {
          resolutionErrors.push('o escopo não cobre a identidade AgroRumo compartilhada');
        }
        if (resolution.accountDeletionUrl !== 'https://pragas.agrorumo.com/delete-account') {
          resolutionErrors.push('a URL de exclusão diverge da superfície pública canônica');
        }
        if (
          typeof resolution.integrationEvidenceSha256 !== 'string' ||
          !/^[0-9a-f]{64}$/.test(resolution.integrationEvidenceSha256)
        ) {
          resolutionErrors.push('o hash da evidência de integração é inválido');
        }
        if (
          typeof resolution.reviewer !== 'string' ||
          resolution.reviewer.trim().length < 3 ||
          typeof resolution.legalDecisionReference !== 'string' ||
          resolution.legalDecisionReference.trim().length < 3
        ) {
          resolutionErrors.push('revisor ou referência da decisão legal ausente');
        }
        if (
          typeof resolution.verifiedAt !== 'string' ||
          !Number.isFinite(Date.parse(resolution.verifiedAt))
        ) {
          resolutionErrors.push('data de verificação inválida');
        }
      }
    }
  } catch {
    resolutionErrors.push('a atestação não é JSON legível e válido');
  }

  const resolutionRelativePath = path.relative(appRoot, accountDeletionResolution);
  const tracked = spawnSync(
    'git',
    ['-C', appRoot, 'ls-files', '--error-unmatch', '--', resolutionRelativePath],
    { encoding: 'utf8' },
  );
  const unchanged = spawnSync(
    'git',
    ['-C', appRoot, 'diff', '--quiet', 'HEAD', '--', resolutionRelativePath],
    { encoding: 'utf8' },
  );
  if (tracked.status !== 0 || unchanged.status !== 0) {
    resolutionErrors.push('a atestação precisa estar rastreada e idêntica ao commit candidato');
  }

  if (resolutionErrors.length > 0) {
    failures.push({
      platform: 'account-deletion',
      detail: `A resolução de exclusão não é elegível: ${resolutionErrors.join('; ')}.`,
    });
  }
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
