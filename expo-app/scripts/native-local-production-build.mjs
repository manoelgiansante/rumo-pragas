#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NATIVE_SIGNING_POLICY,
  createAndroidSigningInitScript,
  createEasEnvPullArguments,
  deriveNativeBuildVersion,
  normalizeFingerprint,
  openStableArtifact,
  parseCanonicalZipCentralDirectory,
  readApprovedSigningFile,
  sanitizeNativeBuildEnvironment,
  sha256,
  validateAndroidArtifactMetadata,
  validateGoogleOAuthEnvironment,
  validateGoogleServicesConfiguration,
  validateIosArtifactMetadata,
  validateIosProvisioningProfile,
  validateIosSignedEntitlements,
  validateJarsignerCoverage,
  validateNativeBuildVersion,
  validateStrictJarsignerResult,
} from './native-signing-policy.mjs';
import {
  validateReleaseEnvironment,
  verifyReleaseBundleEnvironment,
} from './verify-release-bundle-env.mjs';

const EXPECTED_APP_ROOT = '/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app';
const APP_ROOT = resolve(process.env.RUMO_NATIVE_APP_ROOT ?? '');
const REPOSITORY_ROOT = resolve(APP_ROOT, '..');
const ARTIFACTS_ROOT = resolve(APP_ROOT, '.artifacts');
const EXPECTED_EAS_EXECUTOR = resolve(APP_ROOT, 'scripts/eas-pinned.sh');
const BOOTSTRAP_SCRIPTS_ROOT = dirname(fileURLToPath(import.meta.url));
const ENCRYPTED_VOLUME = '/Volumes/RumoPragasProdBackup';
const ENCRYPTED_ENV_ROOT = `${ENCRYPTED_VOLUME}/native-build-environment`;
const XCODE_PROFILE_DIRECTORY =
  '/Users/manoelnascimento/Library/Developer/Xcode/UserData/Provisioning Profiles';
const ANDROID_SDK_ROOT = '/Users/manoelnascimento/Library/Android/sdk';
const SAFE_SYSTEM_PATH = `${dirname(NATIVE_SIGNING_POLICY.toolchain.node.path)}:/usr/bin:/bin:/usr/sbin:/sbin`;
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 90_000;
const EAS_ENV_TIMEOUT_MS = 5 * 60_000;
const NPM_INSTALL_TIMEOUT_MS = 30 * 60_000;
const NATIVE_BUILD_TIMEOUT_MS = 2 * 60 * 60_000;
const STABLE_ARTIFACT_CHILD_PATH = '/dev/fd/3';
const BOOTSTRAP_FILES = Object.freeze([
  'native-local-production-build.mjs',
  'native-signing-policy.mjs',
  'verify-release-bundle-env.mjs',
]);
const PINNED_TOOLS = Object.freeze({
  bsdtar: '/usr/bin/bsdtar',
  codesign: '/usr/bin/codesign',
  git: '/usr/bin/git',
  hdiutil: '/usr/bin/hdiutil',
  jarsigner: NATIVE_SIGNING_POLICY.toolchain.java.jarsignerPath,
  java: NATIVE_SIGNING_POLICY.toolchain.java.path,
  keytool: NATIVE_SIGNING_POLICY.toolchain.java.keytoolPath,
  node: NATIVE_SIGNING_POLICY.toolchain.node.path,
  npmCli: NATIVE_SIGNING_POLICY.toolchain.node.npmCliPath,
  plutil: '/usr/bin/plutil',
  pod: NATIVE_SIGNING_POLICY.toolchain.pod.path,
  security: '/usr/bin/security',
  sdkmanager: NATIVE_SIGNING_POLICY.toolchain.android.sdkManagerPath,
  unzip: '/usr/bin/unzip',
  xcodebuild: NATIVE_SIGNING_POLICY.toolchain.xcode.executablePath,
  xcrun: '/usr/bin/xcrun',
});

const fail = (message) => {
  const error = new Error(message);
  error.name = 'NativeLocalBuildError';
  throw error;
};

const lstatExists = (path) => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const parseArguments = (arguments_) => {
  const parsed = { outputPath: '', platform: '', statusLogPath: '' };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--platform') parsed.platform = arguments_[++index] ?? '';
    else if (argument === '--output') parsed.outputPath = arguments_[++index] ?? '';
    else if (argument === '--status-log') parsed.statusLogPath = arguments_[++index] ?? '';
    else fail('Argumentos inválidos para o build nativo local.');
  }
  if (
    !['ios', 'android'].includes(parsed.platform) ||
    !parsed.outputPath ||
    !parsed.statusLogPath
  ) {
    fail('Informe exatamente plataforma, saída e log privado do build nativo.');
  }
  return parsed;
};

const assertDirectArtifactPath = (candidatePath, extension, { mustExist = false } = {}) => {
  const absolutePath = resolve(APP_ROOT, candidatePath);
  const relativePath = relative(ARTIFACTS_ROOT, absolutePath);
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    dirname(absolutePath) !== ARTIFACTS_ROOT ||
    !absolutePath.endsWith(extension)
  ) {
    fail('Saída do build precisa ser um arquivo direto e tipado em .artifacts/.');
  }
  if (mustExist) {
    const metadata = lstatSync(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
      fail('Arquivo de status do build é inseguro.');
    }
  } else if (lstatExists(absolutePath)) {
    fail('Destino final do build já existe.');
  }
  return absolutePath;
};

const ensurePrivateArtifactsRoot = () => {
  mkdirSync(ARTIFACTS_ROOT, { recursive: true, mode: 0o700 });
  const metadata = lstatSync(ARTIFACTS_ROOT);
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync(ARTIFACTS_ROOT) !== ARTIFACTS_ROOT ||
    (uid !== undefined && metadata.uid !== uid)
  ) {
    fail('.artifacts não pertence ao operador local aprovado.');
  }
  chmodSync(ARTIFACTS_ROOT, 0o700);
  if ((lstatSync(ARTIFACTS_ROOT).mode & 0o077) !== 0) fail('.artifacts precisa ser privado.');
};

let activeChild;
let interruptedSignal = '';
let forceKillTimer;

const assertNotInterrupted = () => {
  if (interruptedSignal) fail('Build nativo interrompido pelo operador.');
};

const processGroupExists = (pid) => {
  if (!pid) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return true;
  }
};

const terminateProcessGroup = (pid, signal) => {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // O grupo pode terminar entre a verificação e o sinal.
  }
};

const registerSignalHandlers = () => {
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (interruptedSignal) return;
      interruptedSignal = signal;
      terminateProcessGroup(activeChild?.pid, signal);
      forceKillTimer = setTimeout(() => terminateProcessGroup(activeChild?.pid, 'SIGKILL'), 3000);
    });
  }
  process.once('exit', () => terminateProcessGroup(activeChild?.pid, 'SIGKILL'));
};

const drainResidualProcessGroup = async (pid) => {
  if (!processGroupExists(pid)) return false;
  terminateProcessGroup(pid, 'SIGTERM');
  const deadline = Date.now() + 3000;
  while (processGroupExists(pid) && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  if (processGroupExists(pid)) terminateProcessGroup(pid, 'SIGKILL');
  const killDeadline = Date.now() + 3000;
  while (processGroupExists(pid) && Date.now() < killDeadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  return true;
};

const runManaged = ({
  command,
  arguments_: argumentsValue,
  cwd,
  environment,
  timeoutMs = NATIVE_BUILD_TIMEOUT_MS,
}) =>
  new Promise((resolveRun) => {
    if (interruptedSignal) return resolveRun({ interruptedSignal, status: null });
    const child = spawn(command, argumentsValue, {
      cwd,
      detached: true,
      env: environment,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    activeChild = child;
    let settled = false;
    let timedOut = false;
    let timeoutKillTimer;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateProcessGroup(child.pid, 'SIGTERM');
      timeoutKillTimer = setTimeout(() => terminateProcessGroup(child.pid, 'SIGKILL'), 3000);
    }, timeoutMs);
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (timeoutKillTimer) clearTimeout(timeoutKillTimer);
      const residualGroup = await drainResidualProcessGroup(child.pid);
      if (activeChild === child) activeChild = undefined;
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = undefined;
      }
      resolveRun({ ...result, interruptedSignal, residualGroup, timedOut });
    };
    child.once('error', (error) => void finish({ error, status: null }));
    child.once('close', (status, signal) => void finish({ signal, status }));
  });

const requireManagedSuccess = async (invocation, label) => {
  const result = await runManaged(invocation);
  if (
    result.error ||
    result.status !== 0 ||
    result.interruptedSignal ||
    result.residualGroup ||
    result.timedOut
  ) {
    fail(`${label} falhou ou deixou descendentes sem expor saída bruta.`);
  }
};

const runCaptured = (
  command,
  arguments_,
  {
    childDescriptor,
    cwd = APP_ROOT,
    encoding = 'utf8',
    environment,
    maxBuffer = MAX_CAPTURE_BYTES,
    timeout,
  } = {},
) => {
  if (
    childDescriptor !== undefined &&
    (!Number.isSafeInteger(childDescriptor) || childDescriptor < 0)
  ) {
    fail('Descritor herdado do artefato é inválido.');
  }
  assertNotInterrupted();
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding,
    env: environment,
    maxBuffer,
    timeout: timeout ?? COMMAND_TIMEOUT_MS,
    stdio:
      childDescriptor === undefined
        ? ['ignore', 'pipe', 'pipe']
        : ['ignore', 'pipe', 'pipe', childDescriptor],
  });
  assertNotInterrupted();
  if (result.error || result.status !== 0) fail(`Atestação local falhou em ${basename(command)}.`);
  return { stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
};

const writePrivateFile = (path, contents) => {
  const descriptor = openSync(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(path, 0o600);
};

const parsePlistFile = (plistPath, environment) => {
  const result = runCaptured(PINNED_TOOLS.plutil, ['-convert', 'json', '-o', '-', plistPath], {
    environment,
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail('Plist nativo inválido.');
  }
};

const parsePlistBytes = (contents, environment, workRoot, label) => {
  const temporaryPath = join(workRoot, `${label}-${randomUUID()}.plist`);
  writePrivateFile(temporaryPath, contents);
  try {
    return parsePlistFile(temporaryPath, environment);
  } finally {
    unlinkSync(temporaryPath);
  }
};

const extractPlistValue = ({ environment, format, keyPath, optional = false, plistPath }) => {
  assertNotInterrupted();
  const result = spawnSync(
    PINNED_TOOLS.plutil,
    ['-extract', keyPath, format, '-o', '-', '--', plistPath],
    {
      encoding: 'utf8',
      env: environment,
      maxBuffer: MAX_CAPTURE_BYTES,
      timeout: COMMAND_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  assertNotInterrupted();
  if (result.error) fail('Leitura estruturada do provisioning profile falhou.');
  if (result.status !== 0) {
    if (optional) return undefined;
    fail('Provisioning profile não contém todos os campos obrigatórios.');
  }
  const output = String(result.stdout ?? '').trim();
  if (!output) fail('Provisioning profile contém campo obrigatório vazio.');
  if (format !== 'json') return output;
  try {
    return JSON.parse(output);
  } catch {
    fail('Provisioning profile contém campo estruturado inválido.');
  }
};

export const decodeMobileProvision = (profilePath, environment, workRoot) => {
  const decodedPath = join(workRoot, `profile-${randomUUID()}.plist`);
  runCaptured(PINNED_TOOLS.security, ['cms', '-D', '-i', profilePath, '-o', decodedPath], {
    environment,
  });
  try {
    const required = (keyPath, format) =>
      extractPlistValue({ environment, format, keyPath, plistPath: decodedPath });
    const optional = (keyPath, format) =>
      extractPlistValue({
        environment,
        format,
        keyPath,
        optional: true,
        plistPath: decodedPath,
      });
    const certificateCount = Number(required('DeveloperCertificates', 'raw'));
    if (!Number.isSafeInteger(certificateCount) || certificateCount < 1 || certificateCount > 20) {
      fail('Provisioning profile contém uma lista de certificados inválida.');
    }
    const developerCertificates = [];
    for (let index = 0; index < certificateCount; index += 1) {
      developerCertificates.push(required(`DeveloperCertificates.${index}`, 'raw'));
    }
    const provisionsAllDevices = optional('ProvisionsAllDevices', 'raw');
    if (provisionsAllDevices !== undefined && !['true', 'false'].includes(provisionsAllDevices)) {
      fail('Provisioning profile contém flag de distribuição inválida.');
    }
    return {
      DeveloperCertificates: developerCertificates,
      Entitlements: required('Entitlements', 'json'),
      ExpirationDate: required('ExpirationDate', 'raw'),
      Name: required('Name', 'raw'),
      ProvisionsAllDevices:
        provisionsAllDevices === undefined ? undefined : provisionsAllDevices === 'true',
      ProvisionedDevices: optional('ProvisionedDevices', 'json'),
      TeamIdentifier: required('TeamIdentifier', 'json'),
      UUID: required('UUID', 'raw'),
    };
  } finally {
    if (lstatExists(decodedPath)) unlinkSync(decodedPath);
  }
};

const assertPinnedFileHash = ({ executable = false, expectedSha256, path }) => {
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    fail(`Toolchain fixada ausente: ${basename(path)}.`);
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o022) !== 0 ||
    (executable && (metadata.mode & 0o111) === 0) ||
    (uid !== undefined && ![0, uid].includes(metadata.uid)) ||
    sha256(readFileSync(path)) !== expectedSha256
  ) {
    fail(`Toolchain fixada divergiu: ${basename(path)}.`);
  }
};

const assertRootTool = (path) => {
  const metadata = lstatSync(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== 0 ||
    (metadata.mode & 0o022) !== 0 ||
    (metadata.mode & 0o111) === 0
  ) {
    fail(`Ferramenta do sistema insegura: ${basename(path)}.`);
  }
};

const verifyToolchain = (platform, environment) => {
  const { toolchain } = NATIVE_SIGNING_POLICY;
  for (const path of [
    PINNED_TOOLS.bsdtar,
    PINNED_TOOLS.codesign,
    PINNED_TOOLS.git,
    PINNED_TOOLS.hdiutil,
    PINNED_TOOLS.plutil,
    PINNED_TOOLS.security,
    PINNED_TOOLS.unzip,
    PINNED_TOOLS.xcrun,
  ]) {
    assertRootTool(path);
  }
  assertPinnedFileHash({
    executable: true,
    expectedSha256: toolchain.fnm.sha256,
    path: toolchain.fnm.path,
  });
  assertPinnedFileHash({
    executable: true,
    expectedSha256: toolchain.node.sha256,
    path: toolchain.node.path,
  });
  assertPinnedFileHash({
    expectedSha256: toolchain.node.npmCliSha256,
    path: toolchain.node.npmCliPath,
  });
  if (
    realpathSync(process.execPath) !== toolchain.node.path ||
    process.version !== `v${toolchain.node.version}`
  ) {
    fail('O runner não está no Node fixado.');
  }
  const fnmVersion = runCaptured(toolchain.fnm.path, ['--version'], { environment }).stdout.trim();
  const npmVersion = runCaptured(toolchain.node.path, [toolchain.node.npmCliPath, '--version'], {
    environment,
  }).stdout.trim();
  if (!fnmVersion.endsWith(toolchain.fnm.version) || npmVersion !== toolchain.node.npmVersion) {
    fail('Versão de fnm/npm divergiu da política local.');
  }

  if (platform === 'ios') {
    assertPinnedFileHash({
      executable: true,
      expectedSha256: toolchain.pod.sha256,
      path: toolchain.pod.path,
    });
    assertPinnedFileHash({
      executable: true,
      expectedSha256: toolchain.xcode.executableSha256,
      path: toolchain.xcode.executablePath,
    });
    const podVersion = runCaptured(toolchain.pod.path, ['--version'], {
      environment,
    }).stdout.trim();
    const xcodeVersion = runCaptured(toolchain.xcode.executablePath, ['-version'], {
      environment,
    }).stdout;
    const sdkVersion = runCaptured(
      PINNED_TOOLS.xcrun,
      ['--sdk', 'iphoneos', '--show-sdk-version'],
      {
        environment,
      },
    ).stdout.trim();
    if (
      podVersion !== toolchain.pod.version ||
      !xcodeVersion.includes(`Xcode ${toolchain.xcode.version}\n`) ||
      !xcodeVersion.includes(`Build version ${toolchain.xcode.buildVersion}`) ||
      sdkVersion !== toolchain.xcode.sdkVersion ||
      environment.DEVELOPER_DIR !== toolchain.xcode.developerDirectory
    ) {
      fail('Toolchain CocoaPods/Xcode/SDK divergiu da política local.');
    }
  } else {
    for (const [path, expectedSha256] of [
      [toolchain.java.path, toolchain.java.sha256],
      [toolchain.java.jarsignerPath, toolchain.java.jarsignerSha256],
      [toolchain.java.keytoolPath, toolchain.java.keytoolSha256],
      [toolchain.bundletool.jarPath, toolchain.bundletool.sha256],
      [toolchain.android.sdkManagerPath, toolchain.android.sdkManagerSha256],
      [
        toolchain.android.commandLineToolsSourcePath,
        toolchain.android.commandLineToolsSourceSha256,
      ],
      [toolchain.android.androidJarPath, toolchain.android.androidJarSha256],
      [toolchain.android.aapt2Path, toolchain.android.aapt2Sha256],
      [toolchain.android.ndkSourcePath, toolchain.android.ndkSourceSha256],
    ]) {
      assertPinnedFileHash({
        executable: path.includes('/bin/') || basename(path) === 'aapt2',
        expectedSha256,
        path,
      });
    }
    const javaVersion = runCaptured(toolchain.java.path, ['-version'], { environment }).stderr;
    const bundletoolVersion = runCaptured(
      toolchain.java.path,
      ['-jar', toolchain.bundletool.jarPath, 'version'],
      { environment },
    ).stdout.trim();
    const sdkmanagerVersion = runCaptured(toolchain.android.sdkManagerPath, ['--version'], {
      environment,
    }).stdout.trim();
    const ndkSource = readFileSync(toolchain.android.ndkSourcePath, 'utf8');
    if (
      !javaVersion.includes(`version \"${toolchain.java.version}\"`) ||
      bundletoolVersion !== toolchain.bundletool.version ||
      sdkmanagerVersion !== toolchain.android.commandLineToolsVersion ||
      !ndkSource.includes(`Pkg.Revision = ${toolchain.android.ndkVersion}`) ||
      environment.JAVA_HOME !== toolchain.java.home
    ) {
      fail('Toolchain Java/Android/Bundletool divergiu da política local.');
    }
  }

  return Object.freeze({
    android:
      platform === 'android'
        ? {
            aapt2Sha256: toolchain.android.aapt2Sha256,
            buildToolsVersion: toolchain.android.buildToolsVersion,
            commandLineToolsVersion: toolchain.android.commandLineToolsVersion,
            compileSdkVersion: toolchain.android.compileSdkVersion,
            gradleDistributionSha256: toolchain.android.gradleDistributionSha256,
            gradleVersion: toolchain.android.gradleVersion,
            gradleWrapperJarSha256: toolchain.android.gradleWrapperJarSha256,
            ndkVersion: toolchain.android.ndkVersion,
            sdkManagerSha256: toolchain.android.sdkManagerSha256,
          }
        : null,
    bundletool:
      platform === 'android'
        ? { sha256: toolchain.bundletool.sha256, version: toolchain.bundletool.version }
        : null,
    java:
      platform === 'android'
        ? { sha256: toolchain.java.sha256, version: toolchain.java.version }
        : null,
    node: { sha256: toolchain.node.sha256, version: toolchain.node.version },
    npm: { cliSha256: toolchain.node.npmCliSha256, version: toolchain.node.npmVersion },
    pod:
      platform === 'ios'
        ? {
            podfileLockSha256: toolchain.pod.podfileLockSha256,
            sha256: toolchain.pod.sha256,
            version: toolchain.pod.version,
          }
        : null,
    xcode:
      platform === 'ios'
        ? {
            buildVersion: toolchain.xcode.buildVersion,
            executableSha256: toolchain.xcode.executableSha256,
            sdkVersion: toolchain.xcode.sdkVersion,
            version: toolchain.xcode.version,
          }
        : null,
  });
};

const assertBootstrapBoundToCommit = (commit, environment) => {
  const bootstrapSha256 = {};
  for (const name of BOOTSTRAP_FILES) {
    const committed = runCaptured(
      PINNED_TOOLS.git,
      ['-C', REPOSITORY_ROOT, 'show', `${commit}:expo-app/scripts/${name}`],
      { cwd: REPOSITORY_ROOT, encoding: null, environment },
    ).stdout;
    const bootstrapPath = join(BOOTSTRAP_SCRIPTS_ROOT, name);
    const committedSha256 = Buffer.isBuffer(committed) ? sha256(committed) : '';
    if (!committedSha256 || committedSha256 !== sha256(readFileSync(bootstrapPath))) {
      fail(`Bootstrap nativo não corresponde ao blob commitado: ${name}.`);
    }
    bootstrapSha256[name] = committedSha256;
  }
  return Object.freeze(bootstrapSha256);
};

const assertCleanCommittedCandidate = (environment, platform, expectedCommit) => {
  const status = runCaptured(
    PINNED_TOOLS.git,
    ['-C', REPOSITORY_ROOT, 'status', '--porcelain=v1', '--untracked-files=all', '--', 'expo-app'],
    { cwd: REPOSITORY_ROOT, environment },
  ).stdout;
  if (status.trim())
    fail('O candidato expo-app precisa estar integralmente commitado antes do build.');
  const commit = runCaptured(
    PINNED_TOOLS.git,
    ['-C', REPOSITORY_ROOT, 'rev-parse', '--verify', 'HEAD'],
    { cwd: REPOSITORY_ROOT, environment },
  ).stdout.trim();
  if (commit !== expectedCommit || !/^[0-9a-f]{40}$/.test(commit)) {
    fail('HEAD mudou após a seleção do runner commitado.');
  }
  const bootstrapSha256 = assertBootstrapBoundToCommit(commit, environment);
  const timestampText = runCaptured(
    PINNED_TOOLS.git,
    ['-C', REPOSITORY_ROOT, 'show', '-s', '--format=%ct', commit],
    { cwd: REPOSITORY_ROOT, environment },
  ).stdout.trim();
  const commitTimestamp = Number(timestampText);
  if (!Number.isSafeInteger(commitTimestamp)) fail('Timestamp do commit candidato inválido.');
  const buildVersion = deriveNativeBuildVersion(commitTimestamp);
  validateNativeBuildVersion({ buildVersion, platform });
  return Object.freeze({ bootstrapSha256, buildVersion, commit, commitTimestamp });
};

const assertSourceTreeHasNoSymlinks = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    const metadata = lstatSync(entryPath);
    if (metadata.isSymbolicLink()) fail('Commit candidato contém link simbólico não reproduzível.');
    if (metadata.isDirectory()) assertSourceTreeHasNoSymlinks(entryPath);
  }
};

const validatePackageLock = (sourceRoot) => {
  const lockPath = join(sourceRoot, 'package-lock.json');
  const lockBytes = readFileSync(lockPath);
  let lock;
  try {
    lock = JSON.parse(lockBytes);
  } catch {
    fail('package-lock.json do candidato é inválido.');
  }
  if (lock.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== 'object') {
    fail('package-lock.json não usa o formato reproduzível aprovado.');
  }
  for (const [packagePath, entry] of Object.entries(lock.packages)) {
    if (!packagePath) continue;
    if (
      typeof entry?.resolved !== 'string' ||
      !entry.resolved.startsWith('https://registry.npmjs.org/') ||
      typeof entry?.integrity !== 'string' ||
      !entry.integrity.startsWith('sha512-')
    ) {
      fail(`Dependência sem origem/integridade npm fixada: ${packagePath}.`);
    }
  }
  return sha256(lockBytes);
};

const createCommittedSource = async ({ commit, environment, workRoot }) => {
  const sourceRoot = join(workRoot, 'source');
  const archivePath = join(workRoot, 'candidate.tar');
  mkdirSync(sourceRoot, { mode: 0o700 });
  await requireManagedSuccess(
    {
      arguments_: [
        '-C',
        REPOSITORY_ROOT,
        'archive',
        '--format=tar',
        `--output=${archivePath}`,
        `${commit}:expo-app`,
      ],
      command: PINNED_TOOLS.git,
      cwd: REPOSITORY_ROOT,
      environment,
    },
    'Extração do commit candidato',
  );
  await requireManagedSuccess(
    {
      arguments_: ['-xf', archivePath, '-C', sourceRoot],
      command: PINNED_TOOLS.bsdtar,
      cwd: workRoot,
      environment,
    },
    'Restauração do código candidato',
  );
  unlinkSync(archivePath);
  assertSourceTreeHasNoSymlinks(sourceRoot);

  const appConfig = JSON.parse(readFileSync(join(sourceRoot, 'app.json'), 'utf8')).expo;
  const packageConfig = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  if (
    appConfig?.version !== NATIVE_SIGNING_POLICY.appVersion ||
    packageConfig?.version !== NATIVE_SIGNING_POLICY.appVersion ||
    appConfig?.ios?.bundleIdentifier !== NATIVE_SIGNING_POLICY.bundleIdentifier ||
    appConfig?.android?.package !== NATIVE_SIGNING_POLICY.bundleIdentifier
  ) {
    fail('Commit candidato diverge de versão ou identificador nativo.');
  }

  const packageLockSha256 = validatePackageLock(sourceRoot);
  const npmCache = join(workRoot, 'npm-cache');
  mkdirSync(npmCache, { mode: 0o700 });
  await requireManagedSuccess(
    {
      arguments_: [
        PINNED_TOOLS.npmCli,
        'ci',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--cache',
        npmCache,
      ],
      command: PINNED_TOOLS.node,
      cwd: sourceRoot,
      environment,
      timeoutMs: NPM_INSTALL_TIMEOUT_MS,
    },
    'npm ci isolado pelo lockfile',
  );
  const nodeModules = join(sourceRoot, 'node_modules');
  const nodeModulesMetadata = lstatSync(nodeModules);
  if (!nodeModulesMetadata.isDirectory() || nodeModulesMetadata.isSymbolicLink()) {
    fail('npm ci não criou node_modules local e isolado.');
  }
  return Object.freeze({ packageLockSha256, sourceRoot });
};

const assertEncryptedCredentialVolume = (environment) => {
  const output = runCaptured(PINNED_TOOLS.hdiutil, ['info'], { environment }).stdout;
  const blocks = output.split(/\n(?=image-path\s*:)/);
  if (
    !blocks.some(
      (block) =>
        block.includes(`\t${ENCRYPTED_VOLUME}`) && /image-encrypted\s*:\s*TRUE/.test(block),
    )
  ) {
    fail('Volume criptografado de credenciais não está montado/aprovado.');
  }
};

const parseDotenvValue = (rawValue) => {
  if (!rawValue) return '';
  if (rawValue.startsWith("'")) {
    if (!rawValue.endsWith("'") || rawValue.length < 2)
      fail('EAS Environment contém aspas inválidas.');
    return rawValue.slice(1, -1);
  }
  if (rawValue.startsWith('"')) {
    if (!rawValue.endsWith('"') || rawValue.length < 2)
      fail('EAS Environment contém aspas inválidas.');
    try {
      return JSON.parse(rawValue);
    } catch {
      fail('EAS Environment contém string inválida.');
    }
  }
  if (/\s#|[\r\n\0]/.test(rawValue)) fail('EAS Environment contém valor não canônico.');
  return rawValue;
};

const parsePulledEnvironment = (contents) => {
  const parsed = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || Object.hasOwn(parsed, match[1]))
      fail('EAS Environment contém linha/duplicata inválida.');
    parsed[match[1]] = parseDotenvValue(match[2]);
  }
  return parsed;
};

const pullProductionEnvironment = async ({ baseEnvironment, easExecutor }) => {
  assertEncryptedCredentialVolume(baseEnvironment);
  mkdirSync(ENCRYPTED_ENV_ROOT, { recursive: true, mode: 0o700 });
  chmodSync(ENCRYPTED_ENV_ROOT, 0o700);
  const root = mkdtempSync(join(ENCRYPTED_ENV_ROOT, '.pull-'));
  chmodSync(root, 0o700);
  const environmentPath = join(root, 'production.env');
  try {
    await requireManagedSuccess(
      {
        arguments_: createEasEnvPullArguments(environmentPath),
        command: easExecutor,
        cwd: APP_ROOT,
        environment: baseEnvironment,
        timeoutMs: EAS_ENV_TIMEOUT_MS,
      },
      'Leitura segura do EAS Environment production',
    );
    chmodSync(environmentPath, 0o600);
    const metadata = lstatSync(environmentPath);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1 ||
      metadata.size <= 0 ||
      metadata.size > 1024 * 1024 ||
      (metadata.mode & 0o077) !== 0
    ) {
      fail('Snapshot do EAS Environment é inseguro.');
    }
    const remote = parsePulledEnvironment(readFileSync(environmentPath, 'utf8'));
    const allowed = {};
    for (const name of [
      'EXPO_PUBLIC_ENABLE_ANALYTICS',
      'EXPO_PUBLIC_GOOGLE_CLIENT_ID',
      'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      'EXPO_PUBLIC_SENTRY_DSN',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_URL',
      'SENTRY_ORG',
      'SENTRY_PROJECT',
    ]) {
      if (Object.hasOwn(remote, name)) allowed[name] = remote[name];
    }
    return allowed;
  } finally {
    if (lstatExists(root)) rmSync(root, { recursive: true });
  }
};

const runPrebuild = async ({ environment, platform, sourceRoot }) => {
  const expoCli = join(sourceRoot, 'node_modules', 'expo', 'bin', 'cli');
  await requireManagedSuccess(
    {
      arguments_: [expoCli, 'prebuild', '--platform', platform, '--no-install'],
      command: PINNED_TOOLS.node,
      cwd: sourceRoot,
      environment,
      timeoutMs: NPM_INSTALL_TIMEOUT_MS,
    },
    'Expo prebuild local',
  );
};

const pinGeneratedGradleWrapper = (sourceRoot) => {
  const { android } = NATIVE_SIGNING_POLICY.toolchain;
  const wrapperRoot = join(sourceRoot, 'android', 'gradle', 'wrapper');
  const propertiesPath = join(wrapperRoot, 'gradle-wrapper.properties');
  const jarPath = join(wrapperRoot, 'gradle-wrapper.jar');
  let properties = readFileSync(propertiesPath, 'utf8');
  const expectedUrl = `distributionUrl=https\\://services.gradle.org/distributions/gradle-${android.gradleVersion}-bin.zip`;
  if (!properties.split(/\r?\n/).includes(expectedUrl)) {
    fail('Gradle wrapper gerado aponta para outra distribuição.');
  }
  const checksumLines = properties
    .split(/\r?\n/)
    .filter((line) => line.startsWith('distributionSha256Sum='));
  if (checksumLines.length > 1) fail('Gradle wrapper contém checksum duplicado.');
  if (checksumLines.length === 1) {
    if (checksumLines[0] !== `distributionSha256Sum=${android.gradleDistributionSha256}`) {
      fail('Gradle wrapper contém checksum divergente.');
    }
  } else {
    properties = `${properties.replace(/\s*$/, '\n')}distributionSha256Sum=${android.gradleDistributionSha256}\n`;
    writeFileSync(propertiesPath, properties, { encoding: 'utf8', flag: 'w' });
  }
  if (sha256(readFileSync(jarPath)) !== android.gradleWrapperJarSha256) {
    fail('gradle-wrapper.jar gerado divergiu do artefato oficial fixado.');
  }
};

const verifyIosIdentity = (environment) => {
  const output = runCaptured(
    PINNED_TOOLS.security,
    ['find-identity', '-v', '-p', 'codesigning', NATIVE_SIGNING_POLICY.ios.keychainPath],
    { environment },
  ).stdout;
  const matching = output
    .split(/\r?\n/)
    .filter((line) => line.toUpperCase().includes(NATIVE_SIGNING_POLICY.ios.certificateSha1));
  if (matching.length !== 1 || !matching[0].includes('Apple Distribution:')) {
    fail('Identidade Apple Distribution aprovada indisponível no login Keychain.');
  }
};

const installIosProfile = ({ environment, profileBytes, workRoot }) => {
  mkdirSync(XCODE_PROFILE_DIRECTORY, { recursive: true, mode: 0o700 });
  const profileDirectoryMetadata = lstatSync(XCODE_PROFILE_DIRECTORY);
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (
    realpathSync(XCODE_PROFILE_DIRECTORY) !== XCODE_PROFILE_DIRECTORY ||
    !profileDirectoryMetadata.isDirectory() ||
    profileDirectoryMetadata.isSymbolicLink() ||
    (expectedUid !== undefined && profileDirectoryMetadata.uid !== expectedUid)
  ) {
    fail('Diretório de profiles do Xcode é inseguro.');
  }
  const destination = join(
    XCODE_PROFILE_DIRECTORY,
    `${NATIVE_SIGNING_POLICY.ios.profileUuid}.mobileprovision`,
  );
  if (lstatExists(destination)) {
    const metadata = lstatSync(destination);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1 ||
      (metadata.mode & 0o022) !== 0 ||
      (expectedUid !== undefined && metadata.uid !== expectedUid) ||
      sha256(readFileSync(destination)) !== NATIVE_SIGNING_POLICY.ios.profileSha256
    ) {
      fail('Xcode possui outro profile no UUID aprovado.');
    }
    return Object.freeze({ created: false, destination });
  }
  writePrivateFile(destination, profileBytes);
  validateIosProvisioningProfile(decodeMobileProvision(destination, environment, workRoot));
  const createdMetadata = lstatSync(destination);
  return Object.freeze({
    created: true,
    destination,
    dev: createdMetadata.dev,
    ino: createdMetadata.ino,
  });
};

const exportOptionsPlist = () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>destination</key><string>export</string>
<key>manageAppVersionAndBuildNumber</key><false/>
<key>method</key><string>app-store-connect</string>
<key>provisioningProfiles</key><dict>
<key>${NATIVE_SIGNING_POLICY.bundleIdentifier}</key><string>${NATIVE_SIGNING_POLICY.ios.profileUuid}</string>
</dict>
<key>signingCertificate</key><string>${NATIVE_SIGNING_POLICY.ios.certificateSha1}</string>
<key>signingStyle</key><string>manual</string>
<key>stripSwiftSymbols</key><false/>
<key>teamID</key><string>${NATIVE_SIGNING_POLICY.teamId}</string>
<key>uploadSymbols</key><false/>
</dict></plist>
`;

const listArchiveEntries = (archivePath, environment) => {
  const entries = runCaptured(PINNED_TOOLS.unzip, ['-Z1', archivePath], { environment })
    .stdout.split(/\r?\n/)
    .filter(Boolean);
  if (
    entries.length === 0 ||
    entries.length > 100_000 ||
    new Set(entries).size !== entries.length
  ) {
    fail('Arquivo nativo contém entradas vazias, duplicadas ou excessivas.');
  }
  for (const entry of entries) {
    if (
      entry.startsWith('/') ||
      entry.includes('\\') ||
      entry.split('/').some((segment) => segment === '..' || segment === '.')
    ) {
      fail('Arquivo nativo contém caminho inseguro.');
    }
  }
  return entries;
};

const assertExtractedTreeSafe = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    const metadata = lstatSync(entryPath);
    if (metadata.isSymbolicLink() || (metadata.isFile() && metadata.nlink !== 1)) {
      fail('IPA extraída contém link simbólico/hardlink.');
    }
    if (metadata.isDirectory()) assertExtractedTreeSafe(entryPath);
  }
};

const findSignedBundles = (directory, bundles = []) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entryPath = join(directory, entry.name);
    if (entry.name.endsWith('.app') || entry.name.endsWith('.appex')) bundles.push(entryPath);
    findSignedBundles(entryPath, bundles);
  }
  return bundles;
};

const profileCertificateFingerprints = (profile) =>
  (Array.isArray(profile?.DeveloperCertificates) ? profile.DeveloperCertificates : []).map(
    (certificate) =>
      createHash('sha1').update(Buffer.from(certificate, 'base64')).digest('hex').toUpperCase(),
  );

const validateEmbeddedProfile = ({ bundleIdentifier, isMainApp, profile }) => {
  const expiration = new Date(profile?.ExpirationDate ?? Number.NaN);
  if (
    !Array.isArray(profile?.TeamIdentifier) ||
    !profile.TeamIdentifier.includes(NATIVE_SIGNING_POLICY.teamId) ||
    profile?.ProvisionsAllDevices ||
    profile?.ProvisionedDevices !== undefined ||
    !Number.isFinite(expiration.getTime()) ||
    expiration <= new Date() ||
    !profileCertificateFingerprints(profile).includes(NATIVE_SIGNING_POLICY.ios.certificateSha1) ||
    profile?.Entitlements?.['application-identifier'] !==
      `${NATIVE_SIGNING_POLICY.teamId}.${bundleIdentifier}`
  ) {
    fail('Profile incorporado não é App Store production aprovado para o bundle.');
  }
  if (isMainApp) validateIosProvisioningProfile(profile);
};

const extractSignedEntitlements = (bundlePath, environment, workRoot) => {
  const result = runCaptured(
    PINNED_TOOLS.codesign,
    ['-d', '--entitlements', ':-', '--xml', bundlePath],
    { environment },
  );
  if (!String(result.stdout).startsWith('<?xml'))
    fail('Entitlements assinados não foram extraídos.');
  return parsePlistBytes(Buffer.from(result.stdout), environment, workRoot, 'signed-entitlements');
};

const extractSigningCertificateSha1 = (bundlePath, environment, workRoot) => {
  const prefix = join(workRoot, `codesign-certificate-${randomUUID()}-`);
  runCaptured(PINNED_TOOLS.codesign, ['-d', '--extract-certificates', prefix, bundlePath], {
    environment,
  });
  const certificatePath = `${prefix}0`;
  if (!lstatExists(certificatePath)) fail('Certificado da assinatura iOS não foi extraído.');
  return createHash('sha1').update(readFileSync(certificatePath)).digest('hex').toUpperCase();
};

const attestIosArtifact = ({ buildVersion, environment, ipaPath, workRoot }) => {
  const stable = openStableArtifact({ filePath: ipaPath, label: 'IPA exportada' });
  try {
    const entries = listArchiveEntries(stable.path, environment);
    stable.assertUnchanged({ rehash: true });
    const appRoots = new Set(
      entries.map((entry) => entry.match(/^(Payload\/[^/]+\.app)\//)?.[1]).filter(Boolean),
    );
    if (appRoots.size !== 1) fail('IPA precisa conter exatamente um app principal.');
    const extractionRoot = join(workRoot, `ipa-${randomUUID()}`);
    mkdirSync(extractionRoot, { mode: 0o700 });
    runCaptured(PINNED_TOOLS.unzip, ['-q', stable.path, '-d', extractionRoot], { environment });
    stable.assertUnchanged({ rehash: true });
    assertExtractedTreeSafe(extractionRoot);
    const mainAppPath = resolve(extractionRoot, [...appRoots][0]);
    const bundles = findSignedBundles(mainAppPath);
    if (!bundles.includes(mainAppPath)) bundles.unshift(mainAppPath);
    if (new Set(bundles).size !== bundles.length) fail('IPA contém bundle assinado duplicado.');

    let mainInfoPlist;
    let mainCodesignDisplay;
    for (const bundlePath of bundles) {
      const isMainApp = bundlePath === mainAppPath;
      runCaptured(PINNED_TOOLS.codesign, ['--verify', '--strict', '--verbose=2', bundlePath], {
        environment,
      });
      const infoPlist = parsePlistFile(join(bundlePath, 'Info.plist'), environment);
      const bundleIdentifier = String(infoPlist?.CFBundleIdentifier ?? '');
      if (
        !bundleIdentifier ||
        (isMainApp
          ? bundleIdentifier !== NATIVE_SIGNING_POLICY.bundleIdentifier
          : !bundleIdentifier.startsWith(`${NATIVE_SIGNING_POLICY.bundleIdentifier}.`))
      ) {
        fail('IPA contém app/extensão com bundle identifier não aprovado.');
      }
      const profilePath = join(bundlePath, 'embedded.mobileprovision');
      const profile = decodeMobileProvision(profilePath, environment, workRoot);
      validateEmbeddedProfile({ bundleIdentifier, isMainApp, profile });
      const signedEntitlements = extractSignedEntitlements(bundlePath, environment, workRoot);
      validateIosSignedEntitlements({
        bundleIdentifier,
        isMainApp,
        profile,
        signedEntitlements,
      });
      const certificateSha1 = extractSigningCertificateSha1(bundlePath, environment, workRoot);
      if (normalizeFingerprint(certificateSha1) !== NATIVE_SIGNING_POLICY.ios.certificateSha1) {
        fail('IPA contém app/extensão assinado por certificado divergente.');
      }
      if (isMainApp) {
        mainInfoPlist = infoPlist;
        mainCodesignDisplay = runCaptured(PINNED_TOOLS.codesign, ['-dvvv', bundlePath], {
          environment,
        }).stderr;
        validateIosArtifactMetadata({
          buildVersion,
          codesignDisplay: mainCodesignDisplay,
          embeddedProfileSha256: sha256(readFileSync(profilePath)),
          infoPlist,
          signingCertificateSha1: certificateSha1,
        });
      }
    }
    runCaptured(
      PINNED_TOOLS.codesign,
      ['--verify', '--deep', '--strict', '--verbose=2', mainAppPath],
      { environment },
    );
    stable.assertUnchanged({ rehash: true });
    verifyReleaseBundleEnvironment({ artifactPath: stable.path, environment, platform: 'ios' });
    stable.assertUnchanged({ rehash: true });
    if (!mainInfoPlist || !mainCodesignDisplay) fail('IPA principal não foi atestada.');
    return Object.freeze({ signedBundleCount: bundles.length, stable });
  } catch (error) {
    stable.close();
    throw error;
  }
};

const assertAndroidKeychainItems = (environment) => {
  for (const account of [
    NATIVE_SIGNING_POLICY.android.keystorePasswordAccount,
    NATIVE_SIGNING_POLICY.android.keyAliasAccount,
    NATIVE_SIGNING_POLICY.android.keyPasswordAccount,
  ]) {
    const result = spawnSync(
      PINNED_TOOLS.security,
      [
        'find-generic-password',
        '-a',
        account,
        '-s',
        NATIVE_SIGNING_POLICY.android.keychainService,
        NATIVE_SIGNING_POLICY.android.keychainPath,
      ],
      { env: environment, stdio: 'ignore', timeout: COMMAND_TIMEOUT_MS },
    );
    if (result.error || result.status !== 0) fail('Credencial Android ausente no login Keychain.');
  }
};

const runBundletoolAgainstStableAab = (stable, arguments_, environment) =>
  runCaptured(
    PINNED_TOOLS.java,
    ['-jar', NATIVE_SIGNING_POLICY.toolchain.bundletool.jarPath, ...arguments_],
    { childDescriptor: stable.childDescriptor, environment },
  );

const dumpAabManifestValue = (stable, xpath, environment) =>
  runBundletoolAgainstStableAab(
    stable,
    [
      'dump',
      'manifest',
      `--bundle=${STABLE_ARTIFACT_CHILD_PATH}`,
      '--module=base',
      `--xpath=${xpath}`,
    ],
    environment,
  ).stdout.trim();

const attestAndroidArtifact = ({ aabPath, buildVersion, environment }) => {
  const stable = openStableArtifact({ filePath: aabPath, label: 'AAB exportado' });
  try {
    const { entries } = parseCanonicalZipCentralDirectory({
      fileSize: stable.size,
      readRange: stable.readRange,
    });
    stable.assertUnchanged({ rehash: true });
    runBundletoolAgainstStableAab(
      stable,
      ['validate', `--bundle=${STABLE_ARTIFACT_CHILD_PATH}`],
      environment,
    );
    stable.assertUnchanged({ rehash: true });
    assertNotInterrupted();
    const jarsignerResult = spawnSync(
      PINNED_TOOLS.jarsigner,
      [
        '-J-Duser.language=en',
        '-J-Duser.country=US',
        '-verify',
        '-strict',
        '-verbose:all',
        '-certs',
        STABLE_ARTIFACT_CHILD_PATH,
      ],
      {
        cwd: APP_ROOT,
        encoding: 'utf8',
        env: environment,
        maxBuffer: MAX_CAPTURE_BYTES,
        timeout: COMMAND_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'pipe', stable.childDescriptor],
      },
    );
    assertNotInterrupted();
    if (jarsignerResult.error || jarsignerResult.signal || jarsignerResult.status === null) {
      fail('Atestação local falhou em jarsigner.');
    }
    const jarsignerOutput = validateStrictJarsignerResult({
      entries,
      status: jarsignerResult.status,
      stderr: jarsignerResult.stderr ?? '',
      stdout: jarsignerResult.stdout ?? '',
    });
    stable.assertUnchanged({ rehash: true });
    validateJarsignerCoverage({
      entries,
      output: jarsignerOutput,
    });
    const keytoolOutput = runCaptured(
      PINNED_TOOLS.keytool,
      [
        '-J-Duser.language=en',
        '-J-Duser.country=US',
        '-printcert',
        '-jarfile',
        STABLE_ARTIFACT_CHILD_PATH,
      ],
      {
        childDescriptor: stable.childDescriptor,
        environment,
      },
    ).stdout;
    stable.assertUnchanged({ rehash: true });
    const applicationId = dumpAabManifestValue(stable, '/manifest/@package', environment);
    stable.assertUnchanged({ rehash: true });
    const versionCode = dumpAabManifestValue(stable, '/manifest/@android:versionCode', environment);
    stable.assertUnchanged({ rehash: true });
    const versionName = dumpAabManifestValue(stable, '/manifest/@android:versionName', environment);
    stable.assertUnchanged({ rehash: true });
    validateAndroidArtifactMetadata({
      applicationId,
      buildVersion,
      keytoolOutput,
      versionCode,
      versionName,
    });
    stable.assertUnchanged({ rehash: true });
    verifyReleaseBundleEnvironment({
      artifactDescriptor: stable.childDescriptor,
      artifactPath: stable.path,
      environment,
      platform: 'android',
    });
    stable.assertUnchanged({ rehash: true });
    return Object.freeze({ stable });
  } catch (error) {
    stable.close();
    throw error;
  }
};

const preserveIosSymbols = async ({ archivePath, environment, outputPath, workRoot }) => {
  const dsyms = join(archivePath, 'dSYMs');
  if (!lstatExists(dsyms) || !lstatSync(dsyms).isDirectory() || readdirSync(dsyms).length === 0) {
    fail('Archive iOS não contém dSYMs para symbolication.');
  }
  const relativeEntries = ['dSYMs'];
  const bcSymbolMaps = join(archivePath, 'BCSymbolMaps');
  if (lstatExists(bcSymbolMaps)) {
    if (!lstatSync(bcSymbolMaps).isDirectory()) fail('BCSymbolMaps do archive é inválido.');
    relativeEntries.push('BCSymbolMaps');
  }
  const temporaryArchive = join(workRoot, 'ios-symbols.tar.gz');
  await requireManagedSuccess(
    {
      arguments_: ['-czf', temporaryArchive, '-C', archivePath, ...relativeEntries],
      command: PINNED_TOOLS.bsdtar,
      cwd: archivePath,
      environment,
    },
    'Preservação de dSYM/BCSymbolMaps',
  );
  const stable = openStableArtifact({
    filePath: temporaryArchive,
    label: 'Arquivo de símbolos iOS',
  });
  try {
    const evidence = stable.copyTo(outputPath);
    return Object.freeze({ ...evidence, included: relativeEntries });
  } finally {
    stable.close();
  }
};

const buildIos = async ({
  buildVersion,
  environment,
  outputPath,
  sourceRoot,
  symbolsPath,
  workRoot,
}) => {
  if (process.platform !== 'darwin') fail('Archive iOS nativo exige macOS.');
  verifyIosIdentity(environment);
  const profileBytes = readApprovedSigningFile({
    expectedSha256: NATIVE_SIGNING_POLICY.ios.profileSha256,
    filePath: resolve(APP_ROOT, NATIVE_SIGNING_POLICY.ios.profileRelativePath),
    label: 'Provisioning profile iOS',
  });
  const profileSnapshot = join(workRoot, 'approved-profile.mobileprovision');
  writePrivateFile(profileSnapshot, profileBytes);
  validateIosProvisioningProfile(decodeMobileProvision(profileSnapshot, environment, workRoot));
  const installedProfile = installIosProfile({ environment, profileBytes, workRoot });
  try {
    await runPrebuild({ environment, platform: 'ios', sourceRoot });
    writePrivateFile(
      join(sourceRoot, 'ios', '.xcode.env.local'),
      `export NODE_BINARY='${PINNED_TOOLS.node.replaceAll("'", `'\\''`)}'\n`,
    );
    const pinnedPodLock = readFileSync(join(sourceRoot, 'scripts', 'native-pins', 'Podfile.lock'));
    if (sha256(pinnedPodLock) !== NATIVE_SIGNING_POLICY.toolchain.pod.podfileLockSha256) {
      fail('Podfile.lock commitado divergiu do snapshot nativo aprovado.');
    }
    writePrivateFile(join(sourceRoot, 'ios', 'Podfile.lock'), pinnedPodLock);
    await requireManagedSuccess(
      {
        arguments_: ['install', '--deployment', '--no-repo-update'],
        command: PINNED_TOOLS.pod,
        cwd: join(sourceRoot, 'ios'),
        environment,
        timeoutMs: NPM_INSTALL_TIMEOUT_MS,
      },
      'CocoaPods local',
    );
    const resolvedPodLock = join(sourceRoot, 'ios', 'Podfile.lock');
    if (
      !lstatExists(resolvedPodLock) ||
      sha256(readFileSync(resolvedPodLock)) !==
        NATIVE_SIGNING_POLICY.toolchain.pod.podfileLockSha256
    ) {
      fail('Podfile.lock resolvido divergiu do snapshot nativo aprovado.');
    }
    const archivePath = join(workRoot, 'RumoPragasIA.xcarchive');
    const derivedDataPath = join(workRoot, 'DerivedData');
    await requireManagedSuccess(
      {
        arguments_: [
          '-workspace',
          join(sourceRoot, 'ios', 'RumoPragasIA.xcworkspace'),
          '-scheme',
          'RumoPragasIA',
          '-configuration',
          'Release',
          '-sdk',
          'iphoneos',
          '-destination',
          'generic/platform=iOS',
          '-archivePath',
          archivePath,
          '-derivedDataPath',
          derivedDataPath,
          `CODE_SIGN_IDENTITY=${NATIVE_SIGNING_POLICY.ios.certificateSha1}`,
          'CODE_SIGN_STYLE=Manual',
          `CURRENT_PROJECT_VERSION=${buildVersion}`,
          `DEVELOPMENT_TEAM=${NATIVE_SIGNING_POLICY.teamId}`,
          `MARKETING_VERSION=${NATIVE_SIGNING_POLICY.appVersion}`,
          `OTHER_CODE_SIGN_FLAGS=--keychain ${NATIVE_SIGNING_POLICY.ios.keychainPath}`,
          `PRODUCT_BUNDLE_IDENTIFIER=${NATIVE_SIGNING_POLICY.bundleIdentifier}`,
          `PROVISIONING_PROFILE_SPECIFIER=${NATIVE_SIGNING_POLICY.ios.profileUuid}`,
          'COMPILER_INDEX_STORE_ENABLE=NO',
          'clean',
          'archive',
        ],
        command: PINNED_TOOLS.xcodebuild,
        cwd: sourceRoot,
        environment,
      },
      'xcodebuild archive local',
    );
    const symbols = await preserveIosSymbols({
      archivePath,
      environment,
      outputPath: symbolsPath,
      workRoot,
    });
    const exportOptionsPath = join(workRoot, 'ExportOptions.plist');
    const exportPath = join(workRoot, 'export');
    mkdirSync(exportPath, { mode: 0o700 });
    writePrivateFile(exportOptionsPath, exportOptionsPlist());
    await requireManagedSuccess(
      {
        arguments_: [
          '-exportArchive',
          '-archivePath',
          archivePath,
          '-exportPath',
          exportPath,
          '-exportOptionsPlist',
          exportOptionsPath,
        ],
        command: PINNED_TOOLS.xcodebuild,
        cwd: sourceRoot,
        environment,
      },
      'xcodebuild exportArchive local',
    );
    const candidates = readdirSync(exportPath)
      .filter((name) => extname(name).toLowerCase() === '.ipa')
      .map((name) => join(exportPath, name));
    if (candidates.length !== 1 || !lstatSync(candidates[0]).isFile()) {
      fail('Export nativo não produziu exatamente uma IPA.');
    }
    const attestation = attestIosArtifact({
      buildVersion,
      environment,
      ipaPath: candidates[0],
      workRoot,
    });
    try {
      const artifact = attestation.stable.copyTo(outputPath);
      return Object.freeze({
        artifact,
        signedBundleCount: attestation.signedBundleCount,
        signingCertificateSha1: NATIVE_SIGNING_POLICY.ios.certificateSha1,
        symbols,
      });
    } finally {
      attestation.stable.close();
    }
  } finally {
    if (installedProfile.created) {
      if (!lstatExists(installedProfile.destination)) {
        fail('Provisioning profile temporário desapareceu antes da limpeza.');
      }
      const installedMetadata = lstatSync(installedProfile.destination);
      if (
        !installedMetadata.isFile() ||
        installedMetadata.isSymbolicLink() ||
        installedMetadata.nlink !== 1 ||
        installedMetadata.dev !== installedProfile.dev ||
        installedMetadata.ino !== installedProfile.ino
      ) {
        fail('Provisioning profile temporário trocou de inode antes da limpeza.');
      }
      unlinkSync(installedProfile.destination);
    }
  }
};

const buildAndroid = async ({ buildVersion, environment, outputPath, sourceRoot, workRoot }) => {
  assertAndroidKeychainItems(environment);
  const keystorePath = resolve(APP_ROOT, NATIVE_SIGNING_POLICY.android.keystoreRelativePath);
  readApprovedSigningFile({
    expectedSha256: NATIVE_SIGNING_POLICY.android.keystoreSha256,
    filePath: keystorePath,
    label: 'Upload keystore Android',
  });
  const stableKeystore = openStableArtifact({
    filePath: keystorePath,
    label: 'Upload keystore Android',
    maximumBytes: 1024 * 1024,
  });
  if (stableKeystore.sha256 !== NATIVE_SIGNING_POLICY.android.keystoreSha256) {
    stableKeystore.close();
    fail('Upload keystore Android divergiu do hash aprovado.');
  }
  try {
    const googleServicesBytes = readApprovedSigningFile({
      expectedSha256: NATIVE_SIGNING_POLICY.firebase.configurationSha256,
      filePath: NATIVE_SIGNING_POLICY.firebase.configurationPath,
      label: 'google-services.json Android',
    });
    validateGoogleServicesConfiguration(googleServicesBytes);
    const firebaseRoot = join(workRoot, 'firebase');
    mkdirSync(firebaseRoot, { mode: 0o700 });
    const googleServicesSnapshot = join(firebaseRoot, 'google-services.json');
    writePrivateFile(googleServicesSnapshot, googleServicesBytes);
    const androidEnvironment = { ...environment, GOOGLE_SERVICES_JSON: googleServicesSnapshot };
    await runPrebuild({ environment: androidEnvironment, platform: 'android', sourceRoot });
    pinGeneratedGradleWrapper(sourceRoot);
    const generatedGoogleServices = join(sourceRoot, 'android', 'app', 'google-services.json');
    const generatedGoogleMetadata = lstatSync(generatedGoogleServices);
    if (
      !generatedGoogleMetadata.isFile() ||
      generatedGoogleMetadata.isSymbolicLink() ||
      generatedGoogleMetadata.nlink !== 1
    ) {
      fail('google-services.json gerado não é arquivo regular único.');
    }
    chmodSync(generatedGoogleServices, 0o600);
    const generatedBytes = readApprovedSigningFile({
      expectedSha256: NATIVE_SIGNING_POLICY.firebase.configurationSha256,
      filePath: generatedGoogleServices,
      label: 'google-services.json gerado',
    });
    validateGoogleServicesConfiguration(generatedBytes);

    const initScriptPath = join(workRoot, 'secure-android-signing.init.gradle');
    writePrivateFile(
      initScriptPath,
      createAndroidSigningInitScript({ buildVersion, keystorePath }),
    );
    const gradleWrapper = join(sourceRoot, 'android', 'gradlew');
    chmodSync(gradleWrapper, 0o700);
    stableKeystore.assertUnchanged({ rehash: true });
    await requireManagedSuccess(
      {
        arguments_: [
          '--no-daemon',
          '--no-configuration-cache',
          '--console=plain',
          '--init-script',
          initScriptPath,
          ':app:bundleRelease',
        ],
        command: gradleWrapper,
        cwd: join(sourceRoot, 'android'),
        environment: androidEnvironment,
      },
      'Gradle bundleRelease local',
    );
    stableKeystore.assertUnchanged({ rehash: true });
    const aabPath = join(
      sourceRoot,
      'android',
      'app',
      'build',
      'outputs',
      'bundle',
      'release',
      'app-release.aab',
    );
    const attestation = attestAndroidArtifact({
      aabPath,
      buildVersion,
      environment: androidEnvironment,
    });
    try {
      const artifact = attestation.stable.copyTo(outputPath);
      stableKeystore.assertUnchanged({ rehash: true });
      return Object.freeze({
        artifact,
        firebase: validateGoogleServicesConfiguration(googleServicesBytes),
        signingCertificateSha1: NATIVE_SIGNING_POLICY.android.certificateSha1,
        signingCertificateSha256: NATIVE_SIGNING_POLICY.android.certificateSha256,
      });
    } finally {
      attestation.stable.close();
    }
  } finally {
    stableKeystore.close();
  }
};

const findFilesWithExtension = (directory, extension, matches = []) => {
  if (!lstatExists(directory)) return matches;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) findFilesWithExtension(entryPath, extension, matches);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension))
      matches.push(entryPath);
  }
  return matches;
};

const removeCreatedOutputs = (paths) => {
  for (const path of [...paths].reverse()) {
    if (!lstatExists(path)) continue;
    const relativePath = relative(ARTIFACTS_ROOT, path);
    const metadata = lstatSync(path);
    if (
      !relativePath ||
      relativePath.startsWith('..') ||
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1
    ) {
      continue;
    }
    unlinkSync(path);
  }
};

const appendSafeStatus = ({
  artifactSha256,
  buildVersion,
  commit,
  manifestSha256,
  statusLogPath,
}) => {
  const metadata = lstatSync(statusLogPath);
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    metadata.mode & 0o077 ||
    (expectedUid !== undefined && metadata.uid !== expectedUid)
  ) {
    fail('Log seguro mudou antes do registro final.');
  }
  const descriptor = openSync(
    statusLogPath,
    fsConstants.O_WRONLY | fsConstants.O_APPEND | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const pathname = lstatSync(statusLogPath);
    const opened = fstatSync(descriptor);
    if (
      !pathname.isFile() ||
      pathname.isSymbolicLink() ||
      !opened.isFile() ||
      pathname.dev !== metadata.dev ||
      pathname.ino !== metadata.ino ||
      pathname.nlink !== 1 ||
      pathname.size !== metadata.size ||
      pathname.mtimeMs !== metadata.mtimeMs ||
      opened.dev !== metadata.dev ||
      opened.ino !== metadata.ino ||
      opened.nlink !== 1 ||
      opened.size !== metadata.size ||
      opened.mtimeMs !== metadata.mtimeMs ||
      opened.mode & 0o077
    ) {
      fail('Log seguro trocou de inode durante a abertura.');
    }
    const payload = Buffer.from(
      [
        `Commit SHA: ${commit}`,
        `Build nativo: ${buildVersion}`,
        `SHA-256 do artefato: ${artifactSha256}`,
        `SHA-256 do manifesto: ${manifestSha256}`,
        '',
      ].join('\n'),
    );
    writeFileSync(descriptor, payload);
    fsyncSync(descriptor);
    const completed = fstatSync(descriptor);
    if (
      completed.dev !== opened.dev ||
      completed.ino !== opened.ino ||
      completed.nlink !== 1 ||
      completed.size !== opened.size + payload.length
    ) {
      fail('Log seguro divergiu durante o registro final.');
    }
  } finally {
    closeSync(descriptor);
  }
};

const scrubCurrentProcessEnvironment = (approvedEnvironment) => {
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, approvedEnvironment);
};

export const nativeLocalProductionBuild = async ({ outputPath, platform, statusLogPath }) => {
  registerSignalHandlers();
  const candidateCommit = String(process.env.RUMO_NATIVE_CANDIDATE_COMMIT ?? '').trim();
  const easExecutor = resolve(String(process.env.RUMO_EAS_EXECUTOR ?? ''));
  if (
    process.env.RUMO_NATIVE_BOOTSTRAP !== '1' ||
    APP_ROOT !== EXPECTED_APP_ROOT ||
    !/^[0-9a-f]{40}$/.test(candidateCommit) ||
    easExecutor !== EXPECTED_EAS_EXECUTOR
  ) {
    fail('Bootstrap nativo commitado não recebeu contexto local aprovado.');
  }
  ensurePrivateArtifactsRoot();
  const expectedExtension = platform === 'ios' ? '.ipa' : '.aab';
  const absoluteOutput = assertDirectArtifactPath(outputPath, expectedExtension);
  const absoluteStatusLog = assertDirectArtifactPath(statusLogPath, '.log', { mustExist: true });
  const manifestPath = `${absoluteOutput}.manifest.json`;
  const symbolsPath = platform === 'ios' ? `${absoluteOutput}.symbols.tar.gz` : '';
  for (const path of [manifestPath, ...(symbolsPath ? [symbolsPath] : [])]) {
    if (lstatExists(path)) fail('Saída auxiliar do build já existe.');
  }

  const initialEnvironment = sanitizeNativeBuildEnvironment(process.env, {
    buildOnly: true,
    javaHome: NATIVE_SIGNING_POLICY.toolchain.java.home,
    path: SAFE_SYSTEM_PATH,
  });
  scrubCurrentProcessEnvironment(initialEnvironment);
  const toolchain = verifyToolchain(platform, initialEnvironment);
  const candidate = assertCleanCommittedCandidate(initialEnvironment, platform, candidateCommit);
  const createdOutputs = new Set();
  const workRoot = mkdtempSync(join(ARTIFACTS_ROOT, '.native-work-'));
  chmodSync(workRoot, 0o700);
  const startedAt = new Date().toISOString();
  let failure;
  try {
    const remoteEnvironment = await pullProductionEnvironment({
      baseEnvironment: initialEnvironment,
      easExecutor,
    });
    const environment = sanitizeNativeBuildEnvironment(remoteEnvironment, {
      buildOnly: true,
      gradleUserHome: join(workRoot, 'gradle-home'),
      javaHome: NATIVE_SIGNING_POLICY.toolchain.java.home,
      path: SAFE_SYSTEM_PATH,
    });
    Object.assign(environment, {
      ANDROID_HOME: ANDROID_SDK_ROOT,
      ANDROID_SDK_ROOT,
      EXPO_NO_DOTENV: '1',
    });
    validateReleaseEnvironment(environment);
    const googleOAuth = validateGoogleOAuthEnvironment({ environment, platform });
    const source = await createCommittedSource({
      commit: candidate.commit,
      environment,
      workRoot,
    });
    const result =
      platform === 'ios'
        ? await buildIos({
            buildVersion: candidate.buildVersion,
            environment,
            outputPath: absoluteOutput,
            sourceRoot: source.sourceRoot,
            symbolsPath,
            workRoot,
          })
        : await buildAndroid({
            buildVersion: candidate.buildVersion,
            environment,
            outputPath: absoluteOutput,
            sourceRoot: source.sourceRoot,
            workRoot,
          });
    createdOutputs.add(absoluteOutput);
    if (symbolsPath) createdOutputs.add(symbolsPath);
    const stableArtifact = openStableArtifact({
      filePath: absoluteOutput,
      label: 'Artefato final do build',
    });
    let stableSymbols;
    try {
      if (
        stableArtifact.sha256 !== result.artifact.sha256 ||
        stableArtifact.size !== result.artifact.size
      ) {
        fail('Artefato final divergiu da cópia atestada.');
      }
      if (symbolsPath) {
        stableSymbols = openStableArtifact({
          filePath: symbolsPath,
          label: 'Símbolos finais do build',
        });
        if (
          stableSymbols.sha256 !== result.symbols.sha256 ||
          stableSymbols.size !== result.symbols.size
        ) {
          fail('Símbolos finais divergiram da cópia atestada.');
        }
      }
      const manifest = {
        schemaVersion: 1,
        appVersion: NATIVE_SIGNING_POLICY.appVersion,
        artifact: {
          fileName: basename(absoluteOutput),
          sha256: result.artifact.sha256,
          size: result.artifact.size,
        },
        buildVersion: candidate.buildVersion,
        candidateCommit: candidate.commit,
        candidateCommitTimestamp: candidate.commitTimestamp,
        completedAt: new Date().toISOString(),
        firebase: platform === 'android' ? result.firebase : null,
        googleOAuth,
        platform,
        signing: {
          certificateSha1: result.signingCertificateSha1,
          certificateSha256: result.signingCertificateSha256 ?? null,
          signedBundleCount: result.signedBundleCount ?? null,
        },
        source: {
          bootstrapSha256: candidate.bootstrapSha256,
          packageLockSha256: source.packageLockSha256,
        },
        startedAt,
        symbols:
          platform === 'ios'
            ? {
                fileName: basename(symbolsPath),
                included: result.symbols.included,
                sha256: result.symbols.sha256,
                size: result.symbols.size,
              }
            : null,
        toolchain,
      };
      writePrivateFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      createdOutputs.add(manifestPath);
      const stableManifest = openStableArtifact({
        filePath: manifestPath,
        label: 'Manifesto final do build',
        maximumBytes: 1024 * 1024,
      });
      try {
        appendSafeStatus({
          artifactSha256: result.artifact.sha256,
          buildVersion: candidate.buildVersion,
          commit: candidate.commit,
          manifestSha256: stableManifest.sha256,
          statusLogPath: absoluteStatusLog,
        });
        stableManifest.assertUnchanged({ rehash: true });
        stableArtifact.assertUnchanged({ rehash: true });
        stableSymbols?.assertUnchanged({ rehash: true });
      } finally {
        stableManifest.close();
      }
    } finally {
      stableSymbols?.close();
      stableArtifact.close();
    }
  } catch (error) {
    failure = error;
  } finally {
    const residualJks = findFilesWithExtension(workRoot, '.jks');
    try {
      rmSync(workRoot, { recursive: true });
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
    if (lstatExists(workRoot)) failure ??= new Error('Workspace nativo não foi removido.');
    if (residualJks.length > 0) failure ??= new Error('Runner materializou JKS no workspace.');
  }
  if (failure) {
    removeCreatedOutputs(
      new Set([
        ...createdOutputs,
        absoluteOutput,
        manifestPath,
        ...(symbolsPath ? [symbolsPath] : []),
      ]),
    );
    throw failure;
  }
};

const mainEntry = process.argv[1];
const isMain = Boolean(
  mainEntry && existsSync(mainEntry) && realpathSync(mainEntry) === fileURLToPath(import.meta.url),
);

if (isMain) {
  try {
    await nativeLocalProductionBuild(parseArguments(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(
      `ERRO: ${error instanceof Error ? error.message : 'build nativo local falhou'}\n`,
    );
    process.exitCode =
      interruptedSignal === 'SIGHUP'
        ? 129
        : interruptedSignal === 'SIGINT'
          ? 130
          : interruptedSignal === 'SIGTERM'
            ? 143
            : 1;
  }
}
