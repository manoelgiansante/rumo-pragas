#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProjectEnv } from '@expo/env';

import {
  validateReleaseEnvironment,
  verifyReleaseBundleEnvironment,
} from './verify-release-bundle-env.mjs';

const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACTS_ROOT = resolve(APP_ROOT, '.artifacts');
const EXPECTED_NODE_VERSION = 'v22.22.3';

const fail = (message) => {
  throw new Error(message);
};

const parseArguments = (arguments_) => {
  let derivedData = '';
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--derived-data') derivedData = arguments_[++index] ?? '';
    else fail('Uso: node scripts/build-ios-release-simulator.mjs --derived-data .artifacts/<dir>');
  }
  if (!derivedData) {
    fail('Uso: node scripts/build-ios-release-simulator.mjs --derived-data .artifacts/<dir>');
  }

  const absolutePath = resolve(APP_ROOT, derivedData);
  const relativePath = relative(ARTIFACTS_ROOT, absolutePath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    fail('O DerivedData precisa ficar em expo-app/.artifacts/.');
  }
  return { derivedData: absolutePath };
};

const hasConcurrentXcodeBuild = () => {
  const result = spawnSync('/usr/bin/pgrep', ['-x', 'xcodebuild'], {
    stdio: 'ignore',
  });
  return result.status === 0;
};

const quoteForPosixShell = (value) => `'${value.replaceAll("'", `'\\''`)}'`;

const withPinnedXcodeNode = async (run) => {
  const xcodeEnvironmentPath = resolve(APP_ROOT, 'ios', '.xcode.env.local');
  const hadOriginal = existsSync(xcodeEnvironmentPath);
  let original;
  let originalMode;

  if (hadOriginal) {
    if (lstatSync(xcodeEnvironmentPath).isSymbolicLink()) {
      fail('ios/.xcode.env.local não pode ser um link simbólico.');
    }
    original = readFileSync(xcodeEnvironmentPath);
    originalMode = statSync(xcodeEnvironmentPath).mode & 0o777;
  }

  try {
    writeFileSync(
      xcodeEnvironmentPath,
      `export NODE_BINARY=${quoteForPosixShell(process.execPath)}\n`,
      { mode: 0o600 },
    );
    chmodSync(xcodeEnvironmentPath, 0o600);
    return await run();
  } finally {
    if (hadOriginal) {
      writeFileSync(xcodeEnvironmentPath, original, { mode: originalMode });
      chmodSync(xcodeEnvironmentPath, originalMode);
    } else if (existsSync(xcodeEnvironmentPath)) {
      unlinkSync(xcodeEnvironmentPath);
    }
  }
};

const runXcodebuild = (arguments_, environment) =>
  new Promise((resolveRun) => {
    let settled = false;
    let forceKillTimer;
    let interruptedBy = '';
    const child = spawn('/usr/bin/xcodebuild', arguments_, {
      cwd: APP_ROOT,
      detached: true,
      env: environment,
      stdio: ['ignore', 'ignore', 'ignore'],
    });

    const terminateGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // The build may finish between the signal and process-group lookup.
      }
    };

    const signalHandlers = new Map();
    for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
      const handler = () => {
        if (interruptedBy) return;
        interruptedBy = signal;
        terminateGroup(signal);
        forceKillTimer = setTimeout(() => terminateGroup('SIGKILL'), 2000);
      };
      signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (forceKillTimer) clearTimeout(forceKillTimer);
      for (const [signal, handler] of signalHandlers) process.off(signal, handler);
      resolveRun({ ...result, interruptedBy });
    };

    child.once('error', (error) => finish({ error, status: null }));
    child.once('close', (status, signal) => finish({ status, signal }));
  });

export const buildIosReleaseSimulator = async ({ derivedData }) => {
  if (process.platform !== 'darwin') fail('O build de simulador iOS exige macOS.');
  if (process.version !== EXPECTED_NODE_VERSION) {
    fail(`Node ${EXPECTED_NODE_VERSION.slice(1)} é obrigatório.`);
  }
  if (hasConcurrentXcodeBuild()) fail('Já existe outro xcodebuild ativo; tente novamente depois.');

  const workspacePath = resolve(APP_ROOT, 'ios', 'RumoPragasIA.xcworkspace');
  if (!existsSync(workspacePath)) {
    fail('Workspace iOS ausente; gere o projeto nativo antes deste comando.');
  }

  process.env.NODE_ENV = 'production';
  loadProjectEnv(APP_ROOT, { mode: 'production', silent: true });
  validateReleaseEnvironment(process.env);

  const childEnvironment = {
    ...process.env,
    NODE_ENV: 'production',
    RCT_NO_LAUNCH_PACKAGER: '1',
    RUMO_RELEASE_DISABLE_WATCHMAN: '1',
    SENTRY_DISABLE_AUTO_UPLOAD: 'true',
  };
  delete childEnvironment.CI;
  delete childEnvironment.EXPO_NO_DOTENV;

  const buildResult = await withPinnedXcodeNode(() =>
    runXcodebuild(
      [
        '-workspace',
        workspacePath,
        '-scheme',
        'RumoPragasIA',
        '-configuration',
        'Release',
        '-sdk',
        'iphonesimulator',
        '-destination',
        'generic/platform=iOS Simulator',
        '-derivedDataPath',
        derivedData,
        'CODE_SIGNING_ALLOWED=NO',
        'COMPILER_INDEX_STORE_ENABLE=NO',
        'build',
      ],
      childEnvironment,
    ),
  );

  if (buildResult.error || buildResult.status !== 0 || buildResult.interruptedBy) {
    fail(`xcodebuild falhou com código ${buildResult.status ?? 'desconhecido'}; saída suprimida.`);
  }

  const appPath = resolve(
    derivedData,
    'Build',
    'Products',
    'Release-iphonesimulator',
    'RumoPragasIA.app',
  );
  const verification = verifyReleaseBundleEnvironment({
    platform: 'ios',
    artifactPath: appPath,
    environment: process.env,
  });

  return { appPath, bundleBytes: verification.bundleBytes };
};

const mainEntry = process.argv[1];
const isMain = Boolean(
  mainEntry && existsSync(mainEntry) && realpathSync(mainEntry) === fileURLToPath(import.meta.url),
);

if (isMain) {
  try {
    const result = await buildIosReleaseSimulator(parseArguments(process.argv.slice(2)));
    console.log(
      `OK: simulador Release validado (${result.bundleBytes} bytes); valores não exibidos.`,
    );
    console.log(`App: ${relative(APP_ROOT, result.appPath)}`);
  } catch (error) {
    console.error(`ERRO: ${error instanceof Error ? error.message : 'build failed'}`);
    process.exit(1);
  }
}
