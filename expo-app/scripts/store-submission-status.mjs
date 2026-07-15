#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

const accountDeletionBlocker = path.join(
  appRoot,
  'store-assets',
  'ACCOUNT_DELETION_BLOCKER.md',
);
if (existsSync(accountDeletionBlocker)) {
  failures.push({
    platform: 'account-deletion',
    detail:
      'A identidade AgroRumo compartilhada ainda não possui uma resolução aprovada e testada de exclusão integral da conta.',
  });
}

for (const platform of ['ios', 'android']) {
  const result = spawnSync(
    process.execPath,
    [path.join(appRoot, 'scripts/validate-store-assets.mjs'), platform],
    { cwd: appRoot, encoding: 'utf8' },
  );
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
