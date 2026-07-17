#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_SUPABASE_PROJECT_REF = 'jxcnfyeemdltdfqtgbcl';
const EXPECTED_SUPABASE_URL = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;
const PRODUCTION_RELEASE_POLICY = Object.freeze({
  version: 1,
  supabasePublicKeySha256: 'ff16561668de543735e78b2f82a949aebbf08abed8a75e92505427ef77644bd4',
});
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAX_HERMES_DUMP_BYTES = 128 * 1024 * 1024;
const ARTIFACT_INSPECTION_TIMEOUT_MS = 60_000;
const HERMES_BYTECODE_MAGIC = Buffer.from('c61fbc03c103191f', 'hex');
const APPROVED_SUPABASE_HOSTS = new Set([
  `${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`,
  'invalid.supabase.co',
]);

const fail = (message) => {
  const error = new Error(message);
  error.name = 'ReleaseBundleVerificationError';
  throw error;
};

const isPlaceholder = (value) =>
  /(?:change[-_ ]?me|example|invalid|placeholder|your[-_ ]|xxxxx|^test$)/i.test(value);

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

const validateReleasePolicy = (policy) => {
  const fingerprint = policy?.supabasePublicKeySha256;
  if (
    policy?.version !== 1 ||
    typeof fingerprint !== 'string' ||
    !/^[0-9a-f]{64}$/.test(fingerprint)
  ) {
    fail('The release environment policy does not contain an approved public-key fingerprint.');
  }
  return fingerprint;
};

const parseLegacySupabaseKey = (value) => {
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is not a valid project anonymous key.');
  }

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is not a valid project anonymous key.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    header?.alg !== 'HS256' ||
    header?.typ !== 'JWT' ||
    payload?.iss !== 'supabase' ||
    payload?.ref !== EXPECTED_SUPABASE_PROJECT_REF ||
    payload?.role !== 'anon' ||
    !Number.isSafeInteger(payload?.iat) ||
    payload.iat > now + 300 ||
    !Number.isSafeInteger(payload?.exp) ||
    payload.exp <= now ||
    parts[2].length !== 43
  ) {
    fail('EXPO_PUBLIC_SUPABASE_ANON_KEY does not identify the approved anonymous project key.');
  }
};

const validatePublicSupabaseKeyShape = (value) => {
  if (value.startsWith('sb_secret_')) {
    fail('EXPO_PUBLIC_SUPABASE_ANON_KEY cannot use a privileged Supabase secret key.');
  }
  if (value.startsWith('sb_publishable_')) {
    if (!/^sb_publishable_[A-Za-z0-9_-]{16,512}$/.test(value)) {
      fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is not a valid Supabase publishable key.');
    }
    return;
  }
  if (value.startsWith('sb_')) {
    fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is not an approved public Supabase key type.');
  }
  parseLegacySupabaseKey(value);
};

export const validateReleaseEnvironment = (
  environment = process.env,
  policy = PRODUCTION_RELEASE_POLICY,
) => {
  const supabaseUrl = (environment.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const supabaseAnonKey = (environment.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    fail('EXPO_PUBLIC_SUPABASE_URL is missing or invalid.');
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.port ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.href !== `${EXPECTED_SUPABASE_URL}/`
  ) {
    fail('EXPO_PUBLIC_SUPABASE_URL does not target the approved production project.');
  }

  if (supabaseAnonKey.length < 24 || /\s/.test(supabaseAnonKey) || isPlaceholder(supabaseAnonKey)) {
    fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing or invalid.');
  }
  validatePublicSupabaseKeyShape(supabaseAnonKey);
  if (sha256(supabaseAnonKey) !== validateReleasePolicy(policy)) {
    fail('EXPO_PUBLIC_SUPABASE_ANON_KEY does not match the approved production key fingerprint.');
  }

  return { supabaseUrl, supabaseAnonKey };
};

const readBoundedRegularFile = (filePath, invalidMessage) => {
  let initialStats;
  try {
    initialStats = lstatSync(filePath);
  } catch {
    fail(invalidMessage);
  }
  if (!initialStats.isFile() || initialStats.size <= 0 || initialStats.size > MAX_BUNDLE_BYTES) {
    fail(invalidMessage);
  }

  let descriptor;
  try {
    descriptor = openSync(
      filePath,
      fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | (fsConstants.O_NOFOLLOW ?? 0),
    );
  } catch {
    fail(invalidMessage);
  }

  try {
    const openedStats = fstatSync(descriptor);
    if (
      !openedStats.isFile() ||
      openedStats.size <= 0 ||
      openedStats.size > MAX_BUNDLE_BYTES ||
      openedStats.dev !== initialStats.dev ||
      openedStats.ino !== initialStats.ino
    ) {
      fail(invalidMessage);
    }

    const bundle = Buffer.allocUnsafe(openedStats.size);
    let offset = 0;
    while (offset < bundle.length) {
      const bytesRead = readSync(descriptor, bundle, offset, bundle.length - offset, offset);
      if (bytesRead === 0) fail(invalidMessage);
      offset += bytesRead;
    }
    if (readSync(descriptor, Buffer.allocUnsafe(1), 0, 1, offset) !== 0) fail(invalidMessage);

    const finalStats = fstatSync(descriptor);
    if (finalStats.size !== openedStats.size) fail(invalidMessage);
    return bundle;
  } finally {
    closeSync(descriptor);
  }
};

const archiveInspectionSource = (archivePath, artifactDescriptor) => {
  if (artifactDescriptor === undefined) {
    return { archiveOperand: archivePath, stdio: ['ignore', 'pipe', 'ignore'] };
  }
  if (!Number.isSafeInteger(artifactDescriptor) || artifactDescriptor < 0) {
    fail('The release artifact descriptor is invalid.');
  }
  try {
    if (!fstatSync(artifactDescriptor).isFile()) {
      fail('The release artifact descriptor is invalid.');
    }
  } catch (error) {
    if (error?.name === 'ReleaseBundleVerificationError') throw error;
    fail('The release artifact descriptor is invalid.');
  }
  return {
    archiveOperand: '/dev/fd/3',
    stdio: ['ignore', 'pipe', 'ignore', artifactDescriptor],
  };
};

const readArchiveEntry = (archivePath, entryPath, artifactDescriptor) => {
  const { archiveOperand, stdio } = archiveInspectionSource(archivePath, artifactDescriptor);
  const result = spawnSync('/usr/bin/unzip', ['-p', archiveOperand, entryPath], {
    encoding: null,
    maxBuffer: MAX_BUNDLE_BYTES,
    timeout: ARTIFACT_INSPECTION_TIMEOUT_MS,
    stdio,
  });

  if (result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length === 0) {
    fail('The JavaScript bundle could not be extracted from the release artifact.');
  }
  if (result.stdout.length > MAX_BUNDLE_BYTES) fail('The JavaScript bundle is unexpectedly large.');
  return result.stdout;
};

const listArchiveEntries = (archivePath, artifactDescriptor) => {
  const { archiveOperand, stdio } = archiveInspectionSource(archivePath, artifactDescriptor);
  const result = spawnSync('/usr/bin/unzip', ['-Z1', archiveOperand], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: ARTIFACT_INSPECTION_TIMEOUT_MS,
    stdio,
  });
  if (result.status !== 0) fail('The release archive could not be inspected.');
  return result.stdout.split(/\r?\n/).filter(Boolean);
};

const readUniqueArchiveEntry = (archivePath, entryPath, invalidMessage, artifactDescriptor) => {
  const candidates = listArchiveEntries(archivePath, artifactDescriptor).filter(
    (entry) => entry === entryPath,
  );
  if (candidates.length !== 1) fail(invalidMessage);
  return readArchiveEntry(archivePath, entryPath, artifactDescriptor);
};

const resolveArtifact = (artifactPath) => {
  const absolutePath = resolve(artifactPath);
  if (!existsSync(absolutePath)) fail('The release artifact does not exist.');
  if (lstatSync(absolutePath).isSymbolicLink()) fail('Symbolic-link artifacts are not accepted.');
  return realpathSync(absolutePath);
};

export const readReleaseBundle = ({ platform, artifactPath, artifactDescriptor }) => {
  const resolvedArtifact = resolveArtifact(artifactPath);
  const extension = extname(resolvedArtifact).toLowerCase();

  if (
    artifactDescriptor !== undefined &&
    (platform !== 'android' || !['.aab', '.apk'].includes(extension))
  ) {
    fail('Artifact descriptors are accepted only for Android AAB or APK archives.');
  }

  if (platform === 'ios') {
    if (extension === '.app') {
      if (!lstatSync(resolvedArtifact).isDirectory()) fail('The iOS .app artifact is invalid.');
      const bundlePath = join(resolvedArtifact, 'main.jsbundle');
      return readBoundedRegularFile(
        bundlePath,
        'The iOS app does not contain a bounded regular main.jsbundle.',
      );
    }
    if (extension === '.ipa') {
      if (!lstatSync(resolvedArtifact).isFile()) fail('The IPA release artifact is invalid.');
      const candidates = listArchiveEntries(resolvedArtifact).filter((entry) =>
        /^Payload\/[^/]+\.app\/main\.jsbundle$/.test(entry),
      );
      if (candidates.length !== 1)
        fail('The IPA does not contain exactly one app JavaScript bundle.');
      return readArchiveEntry(resolvedArtifact, candidates[0]);
    }
    if (basename(resolvedArtifact) === 'main.jsbundle') {
      return readBoundedRegularFile(
        resolvedArtifact,
        'The iOS JavaScript bundle must be a bounded regular file.',
      );
    }
    fail('Unsupported iOS release artifact.');
  }

  if (platform === 'android') {
    if (extension === '.aab') {
      if (!lstatSync(resolvedArtifact).isFile()) fail('The AAB release artifact is invalid.');
      return readUniqueArchiveEntry(
        resolvedArtifact,
        'base/assets/index.android.bundle',
        'The AAB does not contain exactly one canonical app JavaScript bundle.',
        artifactDescriptor,
      );
    }
    if (extension === '.apk') {
      if (!lstatSync(resolvedArtifact).isFile()) fail('The APK release artifact is invalid.');
      return readUniqueArchiveEntry(
        resolvedArtifact,
        'assets/index.android.bundle',
        'The APK does not contain exactly one canonical app JavaScript bundle.',
        artifactDescriptor,
      );
    }
    if (basename(resolvedArtifact) === 'index.android.bundle') {
      return readBoundedRegularFile(
        resolvedArtifact,
        'The Android JavaScript bundle must be a bounded regular file.',
      );
    }
    fail('Unsupported Android release artifact.');
  }

  fail('Platform must be ios or android.');
};

const isHermesBytecode = (bundle) =>
  bundle.length >= HERMES_BYTECODE_MAGIC.length &&
  bundle.subarray(0, HERMES_BYTECODE_MAGIC.length).equals(HERMES_BYTECODE_MAGIC);

const hermesCompilerPath = () => {
  const platformDirectory = {
    darwin: ['osx-bin', 'hermesc'],
    linux: ['linux64-bin', 'hermesc'],
    win32: ['win64-bin', 'hermesc.exe'],
  }[process.platform];
  if (!platformDirectory) fail('Hermes release bundle inspection is unsupported on this host.');

  const compiler = fileURLToPath(
    new URL(
      `../node_modules/hermes-compiler/hermesc/${platformDirectory.join('/')}`,
      import.meta.url,
    ),
  );
  if (!existsSync(compiler) || !lstatSync(compiler).isFile()) {
    fail('The pinned Hermes compiler required for release inspection is unavailable.');
  }
  return compiler;
};

const decodeHermesUtf16Entry = (dumpValue, expectedByteLength) => {
  if (!Number.isSafeInteger(expectedByteLength) || expectedByteLength < 0) {
    fail('The Hermes UTF-16 string table entry has an invalid byte range.');
  }

  const bytes = [];
  let offset = 0;
  for (const match of dumpValue.matchAll(/\\x([0-9A-Fa-f]{2})/g)) {
    if (match.index !== offset) {
      fail('The Hermes UTF-16 string table entry has an unsupported representation.');
    }
    bytes.push(Number.parseInt(match[1], 16));
    offset += match[0].length;
  }

  if (
    offset !== dumpValue.length ||
    bytes.length !== expectedByteLength ||
    bytes.length % 2 !== 0
  ) {
    fail('The Hermes UTF-16 string table entry is malformed.');
  }
  return Buffer.from(bytes).toString('utf16le');
};

const extractHermesStrings = (bundle) => {
  const directory = mkdtempSync(join(tmpdir(), 'rumo-hermes-release-'));
  const bundlePath = join(directory, 'bundle.hbc');
  try {
    writeFileSync(bundlePath, bundle, { flag: 'wx', mode: 0o600 });
    const result = spawnSync(hermesCompilerPath(), ['-b', '-dump-bytecode', bundlePath], {
      encoding: 'utf8',
      maxBuffer: MAX_HERMES_DUMP_BYTES,
      timeout: ARTIFACT_INSPECTION_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status !== 0 || typeof result.stdout !== 'string') {
      fail('The Hermes string table could not be inspected safely.');
    }

    const dump = result.stdout.replaceAll('\r\n', '\n');
    const countMatch = dump.match(/^  String count: (\d+)$/m);
    const expectedCount = Number(countMatch?.[1]);
    if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0) {
      fail('The Hermes string table is malformed.');
    }

    const marker = 'Global String Table:\n';
    const tableOffset = dump.indexOf(marker);
    if (tableOffset < 0) fail('The Hermes string table is missing.');
    const table = dump.slice(tableOffset + marker.length);
    const strings = [];
    const entryPattern =
      /^[is]\d+\[(ASCII|UTF-16), (\d+)\.\.(-?\d+)\](?: #[A-Fa-f0-9]{8})?: (.*)$/gm;
    for (const match of table.matchAll(entryPattern)) {
      const encoding = match[1];
      const start = Number(match[2]);
      const end = Number(match[3]);
      const expectedByteLength = end >= start ? end - start + 1 : end === -1 ? 0 : Number.NaN;
      strings.push(
        encoding === 'UTF-16' ? decodeHermesUtf16Entry(match[4], expectedByteLength) : match[4],
      );
      if (strings.length === expectedCount) break;
    }
    if (strings.length !== expectedCount) fail('The Hermes string table is incomplete.');
    return strings;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const decodeLiteralEscapes = (value) => {
  let decoded = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = decoded
      // JavaScript line continuations disappear at runtime. Decode them before
      // URL inspection so a quoted host cannot hide a suffix after the newline.
      .replace(/\\(?:\r\n|[\n\r\u2028\u2029])/g, '')
      .replace(/\\u\{([0-9A-Fa-f]{1,6})\}/g, (escape, codePoint) => {
        const numericCodePoint = Number.parseInt(codePoint, 16);
        return numericCodePoint <= 0x10ffff ? String.fromCodePoint(numericCodePoint) : escape;
      })
      .replace(/\\u([0-9A-Fa-f]{4})/g, (_, codePoint) =>
        String.fromCharCode(Number.parseInt(codePoint, 16)),
      )
      .replace(/\\x([0-9A-Fa-f]{2})/g, (_, codePoint) =>
        String.fromCharCode(Number.parseInt(codePoint, 16)),
      )
      .replace(/\\([bfnrtv])/g, (_, escape) => {
        const controls = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
        return controls[escape];
      })
      .replace(/\\0(?![0-9])/g, '\0')
      .replaceAll('\\/', '/');
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
};

const extractPlainStrings = (bundle) => {
  const strings = new Set();
  const urlSafetyStrings = new Set();
  const add = (collection, value) => {
    const decoded = decodeLiteralEscapes(value.trim());
    if (decoded) collection.add(decoded);
  };

  for (const text of [bundle.toString('utf8'), bundle.toString('utf16le')]) {
    for (const segment of text.split(/[\0\r\n]+/)) {
      if (!/["'`]/.test(segment)) add(strings, segment);
    }

    let unquotedOffset = 0;
    for (const match of text.matchAll(/(["'`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g)) {
      for (const segment of text.slice(unquotedOffset, match.index).split(/\0+/)) {
        add(urlSafetyStrings, segment);
      }
      add(strings, match[2]);
      unquotedOffset = match.index + match[0].length;
    }
    for (const segment of text.slice(unquotedOffset).split(/\0+/)) {
      add(urlSafetyStrings, segment);
    }
  }
  return { strings: [...strings], urlSafetyStrings: [...urlSafetyStrings] };
};

const extractSemanticStrings = (bundle) =>
  isHermesBytecode(bundle)
    ? { strings: extractHermesStrings(bundle), urlSafetyStrings: [] }
    : extractPlainStrings(bundle);

const validateObservedSupabaseUrl = (candidate) => {
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    fail('The release bundle contains a competing Supabase project URL.');
  }

  const authority = candidate.match(/^https?:\/\/([^/?#]+)/i)?.[1] ?? '';
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    authority.toLowerCase() !== parsed.hostname.toLowerCase() ||
    !APPROVED_SUPABASE_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    fail('The release bundle contains a competing Supabase project URL.');
  }
};

const validateSupabaseUrls = (rawValue) => {
  const value = decodeLiteralEscapes(rawValue);
  if (!/\.supabase\.co/i.test(value)) return;

  // WHATWG/IDNA parsing removes or normalizes controls and some Unicode
  // whitespace (including U+FEFF) inside a URL. Reject the complete ECMAScript
  // whitespace set, every C0/C1 control, and every delimiter excluded by the
  // candidate scanner in a Supabase-bearing semantic value rather than
  // validating a harmless-looking prefix before a hidden suffix. Outer source
  // quotes are removed by semantic extraction before this check.
  if (/[\s\u0000-\u001f\u007f-\u009f\\"'`<>{}]/u.test(value)) {
    fail('The release bundle contains an obfuscated or competing Supabase project URL.');
  }

  for (const match of value.matchAll(/https?:\/\/[^\s"'`<>{}\\]+/gi)) {
    const candidate = match[0];
    if (/\.supabase\.co/i.test(candidate)) validateObservedSupabaseUrl(candidate);
  }
};

const validateSupabaseLiterals = ({ strings, urlSafetyStrings }, configuredUrl, configuredKey) => {
  let configuredUrlFound = false;
  let configuredKeyFound = false;

  for (const rawValue of strings) {
    const value = decodeLiteralEscapes(rawValue);
    if (value === configuredUrl) configuredUrlFound = true;
    if (value === configuredKey) configuredKeyFound = true;
    validateSupabaseUrls(value);

    if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(value)) {
      fail('The release bundle contains a privileged Supabase secret key.');
    }
    for (const match of value.matchAll(/sb_publishable_[A-Za-z0-9_-]{16,}/g)) {
      if (value !== configuredKey || match[0] !== configuredKey) {
        fail('The release bundle contains a competing Supabase public key.');
      }
    }
    for (const match of value.matchAll(
      /eyJ[A-Za-z0-9_-]{2,2048}\.[A-Za-z0-9_-]{2,8192}\.[A-Za-z0-9_-]+/g,
    )) {
      const token = match[0];
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        if (payload?.iss !== 'supabase') continue;
        if (payload?.role === 'service_role') {
          fail('The release bundle contains a privileged Supabase service-role key.');
        }
        if (payload?.role === 'anon' && (value !== configuredKey || token !== configuredKey)) {
          fail('The release bundle contains a competing Supabase public key.');
        }
      } catch (error) {
        if (error?.name === 'ReleaseBundleVerificationError') throw error;
      }
    }
  }

  for (const rawValue of urlSafetyStrings) validateSupabaseUrls(rawValue);

  if (!configuredUrlFound) {
    fail('The release bundle does not contain the configured production Supabase URL.');
  }
  if (!configuredKeyFound) {
    fail('The release bundle does not contain the configured Supabase anonymous key.');
  }
};

export const verifyReleaseBundleEnvironment = ({
  platform,
  artifactPath,
  artifactDescriptor,
  environment = process.env,
  policy = PRODUCTION_RELEASE_POLICY,
}) => {
  const { supabaseUrl, supabaseAnonKey } = validateReleaseEnvironment(environment, policy);
  const bundle = readReleaseBundle({ platform, artifactPath, artifactDescriptor });

  validateSupabaseLiterals(extractSemanticStrings(bundle), supabaseUrl, supabaseAnonKey);

  return { platform, artifactPath: resolve(artifactPath), bundleBytes: bundle.length };
};

const parseArguments = (arguments_) => {
  let platform = '';
  let artifactPath = '';
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--platform') platform = arguments_[++index] ?? '';
    else if (argument === '--artifact') artifactPath = arguments_[++index] ?? '';
    else fail('Unknown or incomplete command-line option.');
  }
  if (!platform || !artifactPath) fail('Both --platform and --artifact are required.');
  return { platform, artifactPath };
};

const mainEntry = process.argv[1];
const isMain = Boolean(
  mainEntry && existsSync(mainEntry) && realpathSync(mainEntry) === fileURLToPath(import.meta.url),
);

if (isMain) {
  try {
    const result = verifyReleaseBundleEnvironment(parseArguments(process.argv.slice(2)));
    console.log(
      `OK: bundle ${result.platform} validado (${result.bundleBytes} bytes); valores não exibidos.`,
    );
  } catch (error) {
    console.error(
      `ERRO: ${error instanceof Error ? error.message : 'release bundle verification failed'}`,
    );
    process.exit(1);
  }
}
