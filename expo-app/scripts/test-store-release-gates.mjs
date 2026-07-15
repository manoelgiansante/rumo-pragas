#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  ftruncateSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const sourceScripts = dirname(fileURLToPath(import.meta.url));
const sourceAppRoot = dirname(sourceScripts);
const sourceRepositoryRoot = dirname(sourceAppRoot);
const canonicalScenes = [
  'home',
  'capture-and-crop',
  'result',
  'history',
  'library',
  'ai-assistant',
  'settings',
];

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function indexedPng(width, height, seed, { compressionLevel = 6 } = {}) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1;
  ihdr[9] = 3;
  const palette = Buffer.from([0, 0, 0, (seed * 29) % 256, (seed * 71) % 256, (seed * 113) % 256]);
  const rowBytes = Math.ceil(width / 8);
  const pixels = Buffer.alloc(height * (rowBytes + 1));
  for (let row = 0; row < height; row += 1) {
    pixels[row * (rowBytes + 1)] = 0;
  }
  pixels[(seed % height) * (rowBytes + 1) + 1 + (seed % rowBytes)] = 1 << (seed % 8);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', palette),
    pngChunk('IDAT', deflateSync(pixels, { level: compressionLevel })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function indexedPngWithMissingPaletteEntry(width, height) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 2;
  ihdr[9] = 3;
  const rowBytes = Math.ceil((width * 2) / 8);
  const pixels = Buffer.alloc(height * (rowBytes + 1));
  pixels[1] = 0x80;
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', Buffer.from([0, 0, 0, 255, 255, 255])),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function invalidCompressedPng(width, height) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', Buffer.from('not-a-zlib-stream')),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function writeZip(file, entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const contents = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const checksum = crc32(contents);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contents.length, 18);
    localHeader.writeUInt32LE(contents.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    const localRecord = Buffer.concat([localHeader, nameBytes, contents]);
    localRecords.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contents.length, 20);
    centralHeader.writeUInt32LE(contents.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralRecords.push(Buffer.concat([centralHeader, nameBytes]));
    localOffset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  writeFileSync(file, Buffer.concat([...localRecords, centralDirectory, end]));
}

function createIpaArtifact(file, version = '1.0.11', marker = 'reviewed-candidate') {
  writeZip(file, [
    [
      'Payload/RumoPragas.app/Info.plist',
      `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>\n`,
    ],
    ['Payload/RumoPragas.app/fixture-marker.txt', `${marker}\n`],
  ]);
}

function createAabArtifact(file, version = '1.0.11', marker = 'reviewed-candidate') {
  writeZip(file, [
    [
      'base/manifest/AndroidManifest.xml',
      `<manifest xmlns:android="http://schemas.android.com/apk/res/android" android:versionName="${version}" package="br.com.agrorumo.pragas"/>\n`,
    ],
    ['BundleConfig.pb', `${marker}\n`],
  ]);
}

function createArtifact(file, platform, version = '1.0.11', marker = 'reviewed-candidate') {
  if (platform === 'ios') createIpaArtifact(file, version, marker);
  else createAabArtifact(file, version, marker);
}

function createFixture(
  t,
  scripts = ['validate-store-assets.mjs'],
  { initialVersion = '1.0.11' } = {},
) {
  const repository = mkdtempSync(join(tmpdir(), 'rumo-store-gates-'));
  const root = join(repository, 'expo-app');
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'store-assets', 'ios'), { recursive: true });
  mkdirSync(join(root, 'store-assets', 'android', '_src'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: initialVersion }));
  writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { version: initialVersion } }));
  for (const script of scripts) {
    copyFileSync(join(sourceScripts, script), join(root, 'scripts', script));
    chmodSync(join(root, 'scripts', script), 0o755);
  }
  const gitInit = spawnSync(
    'git',
    [
      '-c',
      'user.name=Store Gate Test',
      '-c',
      'user.email=store-gate@example.invalid',
      'init',
      '--quiet',
    ],
    { cwd: repository, encoding: 'utf8' },
  );
  assert.equal(gitInit.status, 0, outputOf(gitInit));
  const gitAdd = spawnSync('git', ['add', 'expo-app/package.json', 'expo-app/app.json'], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(gitAdd.status, 0, outputOf(gitAdd));
  const gitCommit = spawnSync(
    'git',
    [
      '-c',
      'user.name=Store Gate Test',
      '-c',
      'user.email=store-gate@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture candidate',
    ],
    { cwd: repository, encoding: 'utf8' },
  );
  assert.equal(gitCommit.status, 0, outputOf(gitCommit));
  return root;
}

function commitFixture(root, message) {
  const add = spawnSync('git', ['add', 'package.json', 'app.json'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(add.status, 0, outputOf(add));
  const commit = spawnSync(
    'git',
    [
      '-c',
      'user.name=Store Gate Test',
      '-c',
      'user.email=store-gate@example.invalid',
      'commit',
      '--quiet',
      '-m',
      message,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(commit.status, 0, outputOf(commit));
}

function candidateCommitFor(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, outputOf(result));
  return result.stdout.trim();
}

function writePng(file, width, height, seed, options) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, indexedPng(width, height, seed, options));
}

function populateValidAssets(root) {
  const sets = [
    ['ios/iphone-6.9', 5, 1260, 2736, 10],
    ['ios/ipad-13', 5, 2064, 2752, 30],
    ['android/phone', 5, 1080, 1920, 50],
    ['android/tablet-10', 4, 1080, 1920, 70],
  ];
  for (const [directory, count, width, height, seedStart] of sets) {
    for (let index = 0; index < count; index += 1) {
      writePng(
        join(root, 'store-assets', directory, `${String(index + 1).padStart(2, '0')}.png`),
        width,
        height,
        seedStart + index,
      );
    }
  }
  writePng(join(root, 'store-assets/android/feature-graphic.png'), 1024, 500, 90);
  writeManifest(root);
}

function entriesFor(root, directory, sceneOffset = 0) {
  const absolute = join(root, 'store-assets', directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute)
    .filter((file) => file.endsWith('.png'))
    .sort()
    .map((file, index) => ({
      file: `${directory}/${file}`,
      scene: canonicalScenes[(index + sceneOffset) % canonicalScenes.length],
      sha256: sha256(join(absolute, file)),
    }));
}

function baseManifest(root) {
  const candidateCommit = candidateCommitFor(root);
  return {
    schemaVersion: 1,
    appVersion: '1.0.11',
    candidateCommit,
    environment: 'qa',
    captureSource: 'release-candidate',
    capturedAt: '2026-07-15T12:00:00.000Z',
    capturedBy: 'Release Capture Agent',
    platforms: {
      ios: {
        sets: {
          'iphone-6.9': entriesFor(root, 'ios/iphone-6.9'),
          'ipad-13': entriesFor(root, 'ios/ipad-13', 5),
        },
        candidateArtifact: {
          kind: 'ipa',
          appVersion: '1.0.11',
          candidateCommit,
          buildId: '6f7c2a10-6bd2-4bb9-9c21-2d04a8cb31ef',
          sha256: createHash('sha256').update('ios fixture artifact').digest('hex'),
        },
        secondReview: {
          reviewer: 'Independent Release Reviewer',
          reviewedAt: '2026-07-15T13:00:00.000Z',
          candidateCommit,
          attestation: 'screenshots-and-artifact-match-release-candidate',
          verdict: 'approved',
        },
      },
      android: {
        sets: {
          phone: entriesFor(root, 'android/phone'),
          'tablet-10': entriesFor(root, 'android/tablet-10', 5),
        },
        featureGraphic: {
          file: 'android/feature-graphic.png',
          sha256: sha256(join(root, 'store-assets/android/feature-graphic.png')),
        },
        candidateArtifact: {
          kind: 'aab',
          appVersion: '1.0.11',
          candidateCommit,
          buildId: '83bd741e-4f5a-42cd-a4bb-67d0ec95fe12',
          sha256: createHash('sha256').update('android fixture artifact').digest('hex'),
        },
        secondReview: {
          reviewer: 'Independent Release Reviewer',
          reviewedAt: '2026-07-15T13:00:00.000Z',
          candidateCommit,
          attestation: 'screenshots-and-artifact-match-release-candidate',
          verdict: 'approved',
        },
      },
    },
  };
}

function writeManifest(root, mutate = () => {}) {
  const manifest = baseManifest(root);
  mutate(manifest);
  writeFileSync(
    join(root, 'store-assets', 'screenshots-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function runNode(root, script, args = []) {
  return spawnSync(process.execPath, [join(root, 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

function outputOf(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function installUnreachableReleaseCommands(root) {
  const easMarker = join(root, 'eas-was-executed');
  const envMarker = join(root, 'env-was-validated');
  writeFileSync(
    join(root, 'scripts/eas-pinned.sh'),
    `#!/usr/bin/env bash\nprintf 'called' > '${easMarker}'\nexit 99\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(root, 'scripts/validate-prod-env.sh'),
    `#!/usr/bin/env bash\nprintf 'called' > '${envMarker}'\nexit 0\n`,
    { mode: 0o755 },
  );
  return { easMarker, envMarker };
}

test('versioned store validator remains directly executable', () => {
  const mode = statSync(join(sourceScripts, 'validate-store-assets.mjs')).mode;
  assert.notEqual(mode & 0o111, 0, 'validate-store-assets.mjs must keep executable mode');
});

test('every external store-validator subprocess has a fail-closed timeout', () => {
  const source = readFileSync(join(sourceScripts, 'validate-store-assets.mjs'), 'utf8');
  const subprocessCount = (source.match(/spawnSync\(/g) ?? []).length;
  assert.equal(subprocessCount, 8);
  assert.match(source, /const externalCommandTimeoutMs = 60_000;/);
  assert.equal((source.match(/timeout: externalCommandTimeoutMs/g) ?? []).length, subprocessCount);
});

test('store release regression suite is wired into package scripts and both CI paths', () => {
  const packageJson = JSON.parse(readFileSync(join(sourceAppRoot, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['test:store-release-gates'],
    'node --test scripts/test-store-release-gates.mjs',
  );
  for (const workflow of ['ci.yml', 'pr-check.yml']) {
    const source = readFileSync(
      join(sourceRepositoryRoot, '.github', 'workflows', workflow),
      'utf8',
    );
    assert.match(source, /run: npm run test:store-release-gates/);
    assert.match(source, /persist-credentials: false\s+fetch-depth: 0/);
  }
});

test('valid release-candidate assets and provenance pass for both stores', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  for (const platform of ['ios', 'android']) {
    const result = runNode(root, 'validate-store-assets.mjs', [platform]);
    assert.equal(result.status, 0, outputOf(result));
    assert.match(result.stdout, /proveniência/);
  }
});

test('empty submission directories remain clearly fail-closed without demanding a manifest', (t) => {
  const root = createFixture(t);
  const ios = runNode(root, 'validate-store-assets.mjs', ['ios']);
  const android = runNode(root, 'validate-store-assets.mjs', ['android']);
  assert.equal(ios.status, 3);
  assert.match(ios.stderr, /0 captura\(s\); mínimo operacional 5/);
  assert.doesNotMatch(ios.stderr, /screenshots-manifest/);
  assert.equal(android.status, 3);
  assert.match(android.stderr, /0 captura\(s\); mínimo operacional 4/);
  assert.match(android.stderr, /feature graphic: arquivo ausente/i);
  assert.doesNotMatch(android.stderr, /screenshots-manifest/);
});

test('duplicate hashes are rejected within and across screenshot sets', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const phoneOne = join(root, 'store-assets/android/phone/01.png');
  copyFileSync(phoneOne, join(root, 'store-assets/android/phone/02.png'));
  copyFileSync(phoneOne, join(root, 'store-assets/android/tablet-10/01.png'));
  writeManifest(root);

  const result = runNode(root, 'validate-store-assets.mjs', ['android']);
  assert.equal(result.status, 3);
  assert.ok(
    (result.stderr.match(/hash visual SHA-256 duplicado/g) ?? []).length >= 2,
    result.stderr,
  );
  assert.match(result.stderr, /android\/phone\/01\.png/);
  assert.match(result.stderr, /android\/tablet-10\/01\.png/);
});

test('duplicate hashes are rejected across Apple and Google platform sets', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  for (let index = 1; index <= 5; index += 1) {
    writePng(
      join(root, `store-assets/android/phone/${String(index).padStart(2, '0')}.png`),
      2048,
      2732,
      210 + index,
    );
  }
  copyFileSync(
    join(root, 'store-assets/ios/ipad-13/01.png'),
    join(root, 'store-assets/android/phone/01.png'),
  );
  writeManifest(root);

  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(
    result.stderr,
    /android\/phone\/01\.png: hash visual SHA-256 duplicado de.*ios\/ipad-13\/01\.png/,
  );
});

test('visual duplicates remain blocked after lossless PNG recompression', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const original = join(root, 'store-assets/android/phone/01.png');
  const recompressed = join(root, 'store-assets/android/phone/02.png');
  writePng(recompressed, 1080, 1920, 50, { compressionLevel: 0 });
  assert.notEqual(sha256(original), sha256(recompressed), 'fixture must differ at byte level');
  writeManifest(root);

  const result = runNode(root, 'validate-store-assets.mjs', ['android']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /hash visual SHA-256 duplicado/);
  assert.match(result.stderr, /recompressão não torna captura repetida elegível/);
});

test('official maxima, consistent dimensions and unexpected subdirectories are enforced', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  for (let index = 6; index <= 11; index += 1) {
    writePng(join(root, `store-assets/ios/iphone-6.9/${index}.png`), 1260, 2736, 100 + index);
  }
  writePng(join(root, 'store-assets/ios/ipad-13/05.png'), 2048, 2732, 130);
  mkdirSync(join(root, 'store-assets/ios/ipad-13/nested'));
  writeManifest(root);

  const ios = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(ios.status, 3);
  assert.match(ios.stderr, /11 captura\(s\); máximo oficial 10/);
  assert.match(ios.stderr, /diverge de 2064x2752/);
  assert.match(ios.stderr, /subdiretório inesperado/);

  for (let index = 6; index <= 9; index += 1) {
    writePng(join(root, `store-assets/android/phone/${index}.png`), 1080, 1920, 150 + index);
  }
  writeManifest(root);
  const android = runNode(root, 'validate-store-assets.mjs', ['android']);
  assert.equal(android.status, 3);
  assert.match(android.stderr, /9 captura\(s\); máximo oficial 8/);
});

test('truncated, CRC-corrupt and pixel-truncated PNGs are rejected structurally', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const crcFile = join(root, 'store-assets/ios/iphone-6.9/01.png');
  const crcBytes = readFileSync(crcFile);
  crcBytes[crcBytes.length - 1] ^= 0xff;
  writeFileSync(crcFile, crcBytes);

  const truncatedFile = join(root, 'store-assets/ios/iphone-6.9/02.png');
  const truncatedBytes = readFileSync(truncatedFile);
  writeFileSync(truncatedFile, truncatedBytes.subarray(0, truncatedBytes.length - 7));

  const pixelFile = join(root, 'store-assets/ios/iphone-6.9/03.png');
  writeFileSync(pixelFile, indexedPng(1260, 2735, 203));
  const pixelBytes = readFileSync(pixelFile);
  pixelBytes.writeUInt32BE(2736, 20);
  const ihdrCrc = crc32(pixelBytes.subarray(12, 29));
  pixelBytes.writeUInt32BE(ihdrCrc, 29);
  writeFileSync(pixelFile, pixelBytes);
  writeManifest(root);

  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /CRC inválido/);
  assert.match(result.stderr, /truncado|dados após IEND/);
  assert.match(result.stderr, /dados de pixels truncados ou excedentes/);
});

test('duplicate PLTE and missing palette indices are rejected structurally', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const duplicatePaletteFile = join(root, 'store-assets/ios/iphone-6.9/01.png');
  const original = readFileSync(duplicatePaletteFile);
  const duplicatePalette = pngChunk('PLTE', Buffer.from([0, 0, 0, 255, 255, 255]));
  writeFileSync(
    duplicatePaletteFile,
    Buffer.concat([original.subarray(0, 51), duplicatePalette, original.subarray(51)]),
  );
  writeFileSync(
    join(root, 'store-assets/ios/iphone-6.9/02.png'),
    indexedPngWithMissingPaletteEntry(1260, 2736),
  );
  writeManifest(root);

  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /PLTE inválido ou fora de ordem/);
  assert.match(result.stderr, /entrada ausente da paleta/);
});

test('manifest is mandatory for screenshots and binds version, commit, scenes, hashes and independent review', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  rmSync(join(root, 'store-assets/screenshots-manifest.json'));
  let result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /manifest.*obrigatório/s);

  writeManifest(root, (manifest) => {
    manifest.appVersion = '1.0.10';
    manifest.candidateCommit = '0000000000000000000000000000000000000000';
    manifest.platforms.ios.sets['iphone-6.9'][0].scene = 'unverified-scene';
    manifest.platforms.ios.sets['iphone-6.9'][1].sha256 = 'f'.repeat(64);
    manifest.platforms.ios.secondReview.reviewer = manifest.capturedBy;
    manifest.platforms.ios.secondReview.candidateCommit = manifest.candidateCommit;
  });
  result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /candidateArtifact\.appVersion deve repetir/);
  assert.match(result.stderr, /candidateCommit não pode ser um valor sentinela/);
  assert.match(result.stderr, /não é uma cena canônica/);
  assert.match(result.stderr, /não corresponde ao conteúdo/);
  assert.match(result.stderr, /reviewer deve ser independente do capturador/);
});

for (const manifestLinkType of ['symbolic', 'hard']) {
  test(`manifest rejects ${manifestLinkType} links to an external file`, (t) => {
    const root = createFixture(t);
    populateValidAssets(root);
    const manifest = join(root, 'store-assets/screenshots-manifest.json');
    const external = join(dirname(root), `external-${manifestLinkType}-manifest.json`);
    copyFileSync(manifest, external);
    rmSync(manifest);
    if (manifestLinkType === 'symbolic') symlinkSync(external, manifest);
    else linkSync(external, manifest);

    const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
    assert.equal(result.status, 3);
    assert.match(result.stderr, manifestLinkType === 'symbolic' ? /link simbólico/ : /hard link/);
  });
}

test('manifest rejects nonregular paths and bounds bytes before reading', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const manifest = join(root, 'store-assets/screenshots-manifest.json');
  rmSync(manifest);
  mkdirSync(manifest);
  let result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /deve ser um arquivo regular/);

  rmSync(manifest, { recursive: true });
  writeFileSync(manifest, Buffer.alloc(256 * 1024 + 1, 0x20));
  result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /excede o limite pré-leitura de 256 KiB/);
});

test('manifest bounds screenshot entry count across both platforms', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  writeManifest(root, (manifest) => {
    const template = manifest.platforms.android.sets.phone[0];
    manifest.platforms.android.sets.phone = Array.from({ length: 37 }, () => ({ ...template }));
  });
  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /limite global 36/);
});

test('candidate commit must exist in Git and be an ancestor of the validated checkout', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const tree = spawnSync('git', ['write-tree'], { cwd: root, encoding: 'utf8' });
  assert.equal(tree.status, 0, outputOf(tree));
  const orphan = spawnSync(
    'git',
    [
      '-c',
      'user.name=Store Gate Test',
      '-c',
      'user.email=store-gate@example.invalid',
      'commit-tree',
      tree.stdout.trim(),
      '-m',
      'unrelated candidate',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(orphan.status, 0, outputOf(orphan));
  const unrelatedCommit = orphan.stdout.trim();
  writeManifest(root, (manifest) => {
    manifest.candidateCommit = unrelatedCommit;
    manifest.platforms.ios.candidateArtifact.candidateCommit = unrelatedCommit;
    manifest.platforms.ios.secondReview.candidateCommit = unrelatedCommit;
  });

  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /candidateCommit deve ser o candidato real ou um ancestral/);
});

for (const versionFile of ['package.json', 'app.json']) {
  test(`manifest appVersion is bound to current ${versionFile}`, (t) => {
    const root = createFixture(t);
    populateValidAssets(root);
    if (versionFile === 'package.json') {
      writeFileSync(join(root, versionFile), JSON.stringify({ version: '1.0.12' }));
    } else {
      writeFileSync(join(root, versionFile), JSON.stringify({ expo: { version: '1.0.12' } }));
    }
    const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
    assert.equal(result.status, 3);
    assert.match(result.stderr, new RegExp(`diverge de ${versionFile} do checkout atual`));
  });
}

test('manifest appVersion is bound to package.json and app.json at candidateCommit', (t) => {
  const root = createFixture(t, ['validate-store-assets.mjs'], { initialVersion: '1.0.10' });
  const olderCandidateCommit = candidateCommitFor(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.11' }));
  writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { version: '1.0.11' } }));
  commitFixture(root, 'current validated version');
  populateValidAssets(root);
  writeManifest(root, (manifest) => {
    manifest.candidateCommit = olderCandidateCommit;
    for (const platform of ['ios', 'android']) {
      manifest.platforms[platform].candidateArtifact.candidateCommit = olderCandidateCommit;
      manifest.platforms[platform].secondReview.candidateCommit = olderCandidateCommit;
    }
  });

  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /diverge de package\.json do candidateCommit \(1\.0\.10\)/);
  assert.match(result.stderr, /diverge de app\.json do candidateCommit \(1\.0\.10\)/);
});

test('candidateArtifact appVersion must repeat the fully validated candidate version', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  writeManifest(root, (manifest) => {
    manifest.platforms.ios.candidateArtifact.appVersion = '1.0.10';
  });
  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /candidateArtifact\.appVersion deve repetir/);
});

test('manifest dates must be real, ordered and not in the future', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  writeManifest(root, (manifest) => {
    manifest.capturedAt = '2026-02-31T12:00:00.000Z';
    manifest.platforms.ios.secondReview.reviewedAt = '2026-02-31T13:00:00.000Z';
  });
  let result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /contém uma data inválida/);

  writeManifest(root, (manifest) => {
    manifest.capturedAt = '2999-01-01T00:00:00.000Z';
    manifest.platforms.ios.secondReview.reviewedAt = '2999-01-01T01:00:00.000Z';
  });
  result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /não pode estar no futuro/);
});

test('second review requires an explicit candidate screenshot and artifact attestation', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  writeManifest(root, (manifest) => {
    manifest.platforms.ios.secondReview.attestation = 'screenshots-only';
  });
  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /attestation deve confirmar screenshots e artefato/);
});

test('candidate artifact identifiers cannot be placeholder UUIDs or hashes', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  writeManifest(root, (manifest) => {
    manifest.platforms.ios.candidateArtifact.buildId = '11111111-1111-4111-8111-111111111111';
    manifest.platforms.ios.candidateArtifact.sha256 = 'a'.repeat(64);
  });
  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /buildId deve ser.*não provisório/);
  assert.match(result.stderr, /sha256 deve ser.*não provisório/);
});

test('selected artifact hash and EAS build UUID must match the reviewed manifest', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const artifact = join(root, 'reviewed-candidate.ipa');
  createIpaArtifact(artifact, '1.0.11', 'immutable signed candidate bytes');
  writeManifest(root, (manifest) => {
    manifest.platforms.ios.candidateArtifact.sha256 = sha256(artifact);
  });

  let result = runNode(root, 'validate-store-assets.mjs', ['ios', '--artifact', artifact]);
  assert.equal(result.status, 0, outputOf(result));
  rmSync(artifact);
  createIpaArtifact(artifact, '1.0.11', 'different signed candidate bytes');
  result = runNode(root, 'validate-store-assets.mjs', ['ios', '--artifact', artifact]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /candidateArtifact\.sha256 não corresponde ao artefato selecionado/);

  result = runNode(root, 'validate-store-assets.mjs', [
    'ios',
    '--build-id',
    '6f7c2a10-6bd2-4bb9-9c21-2d04a8cb31ef',
  ]);
  assert.equal(result.status, 0, outputOf(result));

  result = runNode(root, 'validate-store-assets.mjs', [
    'ios',
    '--build-id',
    '33333333-3333-4333-8333-333333333333',
  ]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /candidateArtifact\.buildId não corresponde ao artefato selecionado/);
});

for (const selectedPlatform of ['ios', 'android']) {
  test(`selected ${selectedPlatform} package embeds the manifest appVersion`, (t) => {
    const root = createFixture(t);
    populateValidAssets(root);
    const artifact = join(root, selectedPlatform === 'ios' ? 'candidate.ipa' : 'candidate.aab');
    createArtifact(artifact, selectedPlatform, '1.0.12', 'wrong embedded version');
    writeManifest(root, (manifest) => {
      manifest.platforms[selectedPlatform].candidateArtifact.sha256 = sha256(artifact);
    });

    const result = runNode(root, 'validate-store-assets.mjs', [
      selectedPlatform,
      '--artifact',
      artifact,
    ]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /appVersion 1\.0\.11 diverge do pacote selecionado \(1\.0\.12\)/);
  });
}

test('AAB rejects duplicate canonical manifests before version extraction', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const artifact = join(root, 'duplicate-manifest-candidate.aab');
  writeZip(artifact, [
    [
      'base/manifest/AndroidManifest.xml',
      '<manifest android:versionName="1.0.11" package="br.com.agrorumo.pragas"/>\n',
    ],
    [
      'base/manifest/AndroidManifest.xml',
      '<manifest android:versionName="9.9.9" package="br.com.attacker.decoy"/>\n',
    ],
    ['BundleConfig.pb', 'duplicate manifest adversarial fixture\n'],
  ]);
  writeManifest(root, (manifest) => {
    manifest.platforms.android.candidateArtifact.sha256 = sha256(artifact);
  });

  const result = runNode(root, 'validate-store-assets.mjs', ['android', '--artifact', artifact]);
  assert.equal(result.status, 3);
  assert.match(
    result.stderr,
    /AAB deve conter exatamente uma entrada canônica base\/manifest\/AndroidManifest\.xml/,
  );
});

test('PNG size gates reject before whole-file reads or decompression', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const iosFile = join(root, 'store-assets/ios/iphone-6.9/01.png');
  let descriptor = openSync(iosFile, 'w');
  ftruncateSync(descriptor, 16 * 1024 * 1024 + 1);
  closeSync(descriptor);
  let result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /limite estrutural pré-leitura de 16 MB/);

  const androidFile = join(root, 'store-assets/android/phone/01.png');
  descriptor = openSync(androidFile, 'w');
  ftruncateSync(descriptor, 8 * 1024 * 1024 + 1);
  closeSync(descriptor);
  result = runNode(root, 'validate-store-assets.mjs', ['android']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /captura excede 8 MB/);
});

test('IHDR dimension, area and store geometry are rejected before decompression', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const oversizedArea = join(root, 'store-assets/ios/iphone-6.9/01.png');
  writeFileSync(oversizedArea, invalidCompressedPng(7680, 5000));
  let result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /limite estrutural de dimensão\/área antes da descompressão/);
  assert.doesNotMatch(
    result.stderr.split('\n').find((line) => line.includes('ios/iphone-6.9/01.png')) ?? '',
    /IDAT inválido/,
  );

  const invalidPhoneGeometry = join(root, 'store-assets/android/phone/01.png');
  writeFileSync(invalidPhoneGeometry, invalidCompressedPng(4000, 1000));
  result = runNode(root, 'validate-store-assets.mjs', ['android']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /geometria permitida para Android phone antes da descompressão/);
});

test('each platform manifest must prove every canonical checklist scene', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  writeManifest(root, (manifest) => {
    for (const entries of Object.values(manifest.platforms.ios.sets)) {
      for (const entry of entries) entry.scene = 'home';
    }
  });
  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /não comprova todas as cenas canônicas/);
  assert.match(result.stderr, /ai-assistant, settings/);
});

test('Android provenance binds feature graphic bytes to the independent review', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  writeManifest(root, (manifest) => {
    manifest.platforms.android.featureGraphic.sha256 = 'a'.repeat(64);
  });
  const result = runNode(root, 'validate-store-assets.mjs', ['android']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /featureGraphic\.sha256 não corresponde ao conteúdo/);
});

test('Android feature graphic cannot reuse forbidden historical pixels', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const historical = join(root, 'store-assets/archive/feature-graphic.png');
  mkdirSync(dirname(historical), { recursive: true });
  copyFileSync(join(root, 'store-assets/android/feature-graphic.png'), historical);
  const result = runNode(root, 'validate-store-assets.mjs', ['android']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /feature graphic histórico\/mock não pode ser promovido/);
});

for (const forbiddenSource of ['fixture', 'mock', 'historical']) {
  test(`manifest never makes ${forbiddenSource} capture source eligible`, (t) => {
    const root = createFixture(t);
    populateValidAssets(root);
    writeManifest(root, (manifest) => {
      manifest.captureSource = forbiddenSource;
    });
    const result = runNode(root, 'validate-store-assets.mjs', ['android']);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /fixture\/mock\/historical nunca é elegível/);
  });
}

test('manifest cannot promote archive paths or content changed after review', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  writeManifest(root, (manifest) => {
    manifest.platforms.ios.sets['iphone-6.9'][0].file =
      'archive/screenshots-legacy-2026-07-14/ios/6.9/01.png';
  });
  let result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /deve apontar para o conjunto de submissão atual/);

  writeManifest(root);
  writePng(join(root, 'store-assets/ios/iphone-6.9/01.png'), 1260, 2736, 240);
  result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /sha256 não corresponde ao conteúdo/);
});

for (const forbiddenDirectory of ['archive', 'qa-source', 'fixtures', 'mock', 'historical']) {
  test(`bytes copied from ${forbiddenDirectory} never become eligible`, (t) => {
    const root = createFixture(t);
    populateValidAssets(root);
    const eligible = join(root, 'store-assets/ios/iphone-6.9/01.png');
    const forbidden = join(root, 'store-assets', forbiddenDirectory, 'source.png');
    mkdirSync(dirname(forbidden), { recursive: true });
    copyFileSync(eligible, forbidden);

    const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /fonte não elegível/);
    assert.match(result.stderr, /recompressão não promove fixture\/mock\/historical/);
  });
}

test('repository-root archive is audited in addition to expo-app/store-assets/archive', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const eligible = join(root, 'store-assets/ios/iphone-6.9/01.png');
  const repositoryArchive = join(dirname(root), 'store-assets/archive/legacy-root-source.png');
  mkdirSync(dirname(repositoryArchive), { recursive: true });
  copyFileSync(eligible, repositoryArchive);

  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /\.\.\/store-assets\/archive\/legacy-root-source\.png/);
  assert.match(result.stderr, /pixels idênticos à fonte não elegível/);
});

test('recompressing archived pixels cannot promote them to an eligible set', (t) => {
  const root = createFixture(t);
  populateValidAssets(root);
  const eligible = join(root, 'store-assets/ios/iphone-6.9/01.png');
  const archived = join(root, 'store-assets/archive/source.png');
  mkdirSync(dirname(archived), { recursive: true });
  copyFileSync(eligible, archived);
  writePng(eligible, 1260, 2736, 10, { compressionLevel: 0 });
  assert.notEqual(sha256(eligible), sha256(archived), 'fixture must differ at byte level');
  writeManifest(root);

  const result = runNode(root, 'validate-store-assets.mjs', ['ios']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /pixels idênticos à fonte não elegível/);
});

test('global submission status blocks account deletion even when every asset is valid', (t) => {
  const root = createFixture(t, ['validate-store-assets.mjs', 'store-submission-status.mjs']);
  populateValidAssets(root);
  writeFileSync(join(root, 'store-assets/ACCOUNT_DELETION_BLOCKER.md'), '# blocker\n');

  let result = runNode(root, 'store-submission-status.mjs');
  assert.equal(result.status, 3, outputOf(result));
  assert.match(result.stderr, /STORE_SUBMISSION_STATUS=BLOCKED_EXTERNALLY/);
  assert.match(result.stderr, /\[account-deletion\]/);
  assert.doesNotMatch(result.stdout, /ASSETS_READY/);

  rmSync(join(root, 'store-assets/ACCOUNT_DELETION_BLOCKER.md'));
  result = runNode(root, 'store-submission-status.mjs');
  assert.equal(result.status, 0, outputOf(result));
  assert.match(result.stdout, /STORE_SUBMISSION_STATUS=ASSETS_READY/);
});

test('versioned Apple signing rotation blocker is machine-enforced consistently with runbook', (t) => {
  const root = createFixture(t, ['validate-store-assets.mjs', 'store-submission-status.mjs']);
  populateValidAssets(root);
  writeFileSync(
    join(root, 'store-assets/APPLE_SIGNING_ROTATION_BLOCKER.md'),
    '# external Apple rotation evidence required\n',
  );
  const result = runNode(root, 'store-submission-status.mjs');
  assert.equal(result.status, 3, outputOf(result));
  assert.match(result.stderr, /STORE_SUBMISSION_STATUS=BLOCKED_EXTERNALLY/);
  assert.match(result.stderr, /\[apple-signing-rotation\]/);
  assert.match(result.stderr, /certificado Apple Distribution, provisioning profile e senha/);

  const runbook = readFileSync(join(sourceRepositoryRoot, 'docs/launch-runbook.md'), 'utf8');
  assert.match(runbook, /APPLE_SIGNING_ROTATION_BLOCKER\.md/);
  assert.equal(
    existsSync(join(sourceAppRoot, 'store-assets/APPLE_SIGNING_ROTATION_BLOCKER.md')),
    true,
  );
});

test('submit rejects every remote build ID before any release command', (t) => {
  const root = createFixture(t, ['submit.sh']);
  const { easMarker, envMarker } = installUnreachableReleaseCommands(root);
  for (const buildId of [
    '--latest',
    'latest',
    'not-a-uuid',
    'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
  ]) {
    const result = spawnSync(
      'bash',
      [
        join(root, 'scripts/submit.sh'),
        '--platform',
        'ios',
        '--build-id',
        buildId,
        '--confirm-authorized-submission',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(result.status, 2, outputOf(result));
    assert.match(result.stderr, /--build-id não é aceito/);
  }
  assert.equal(existsSync(envMarker), false);
  assert.equal(existsSync(easMarker), false);
  const submitSource = readFileSync(join(sourceScripts, 'submit.sh'), 'utf8');
  assert.doesNotMatch(submitSource, /--id=/);
  assert.match(submitSource, /--artifact CAMINHO/);
});

test('submit validates and submits the same private artifact snapshot despite source replacement', (t) => {
  const root = createFixture(t, [
    'validate-store-assets.mjs',
    'store-submission-status.mjs',
    'submit.sh',
  ]);
  populateValidAssets(root);
  const original = join(root, 'reviewed-candidate.ipa');
  const replacement = join(root, 'replacement-after-gate.ipa');
  const captured = join(root, 'artifact-received-by-eas.ipa');
  const verified = join(root, 'artifact-received-by-verifier.ipa');
  const pathRecord = join(root, 'artifact-path-received-by-eas.txt');
  const verifiedPathRecord = join(root, 'artifact-path-received-by-verifier.txt');
  const sequenceRecord = join(root, 'release-command-sequence.txt');
  createIpaArtifact(original, '1.0.11', 'independently reviewed bytes');
  createIpaArtifact(replacement, '1.0.11', 'replacement bytes');
  const reviewedHash = sha256(original);
  const replacementHash = sha256(replacement);
  assert.notEqual(reviewedHash, replacementHash);
  writeManifest(root, (manifest) => {
    manifest.platforms.ios.candidateArtifact.sha256 = reviewedHash;
  });

  writeFileSync(
    join(root, 'scripts/validate-prod-env.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\ncp "$TEST_REPLACEMENT_ARTIFACT" "$TEST_ORIGINAL_ARTIFACT"\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(root, 'scripts/eas-pinned.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  env:exec)
    [[ "$2" == production ]]
    bash -c "$3"
    ;;
  submit)
    [[ "$(tail -n 1 "$TEST_SEQUENCE_RECORD")" == verify ]]
    printf 'submit\n' >> "$TEST_SEQUENCE_RECORD"
    for argument in "$@"; do
      case "$argument" in
        --path=*)
          candidate="\${argument#--path=}"
          printf '%s' "$candidate" > "$TEST_PATH_RECORD"
          cp "$candidate" "$TEST_CAPTURED_ARTIFACT"
          ;;
      esac
    done
    [[ -f "$TEST_CAPTURED_ARTIFACT" ]]
    ;;
  *)
    exit 99
    ;;
esac
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(root, 'scripts/verify-release-bundle-env.mjs'),
    `import { appendFileSync, copyFileSync, writeFileSync } from 'node:fs';
const artifactIndex = process.argv.indexOf('--artifact');
if (artifactIndex < 0 || !process.argv[artifactIndex + 1]) process.exit(2);
const artifact = process.argv[artifactIndex + 1];
writeFileSync(process.env.TEST_VERIFIED_PATH_RECORD, artifact);
copyFileSync(artifact, process.env.TEST_VERIFIED_ARTIFACT);
appendFileSync(process.env.TEST_SEQUENCE_RECORD, 'verify\\n');
`,
    { mode: 0o755 },
  );

  const result = spawnSync(
    'bash',
    [
      join(root, 'scripts/submit.sh'),
      '--platform',
      'ios',
      '--artifact',
      original,
      '--confirm-authorized-submission',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        NO_COLOR: '1',
        TEST_REPLACEMENT_ARTIFACT: replacement,
        TEST_ORIGINAL_ARTIFACT: original,
        TEST_CAPTURED_ARTIFACT: captured,
        TEST_VERIFIED_ARTIFACT: verified,
        TEST_PATH_RECORD: pathRecord,
        TEST_VERIFIED_PATH_RECORD: verifiedPathRecord,
        TEST_SEQUENCE_RECORD: sequenceRecord,
      },
    },
  );
  assert.equal(result.status, 0, outputOf(result));
  assert.equal(sha256(original), replacementHash, 'source path must actually have been replaced');
  assert.equal(
    sha256(captured),
    reviewedHash,
    'EAS must receive the exact bytes validated earlier',
  );
  assert.equal(
    sha256(verified),
    reviewedHash,
    'the environment verifier must inspect the exact reviewed snapshot',
  );
  const submittedPath = readFileSync(pathRecord, 'utf8');
  assert.equal(readFileSync(verifiedPathRecord, 'utf8'), submittedPath);
  assert.equal(readFileSync(sequenceRecord, 'utf8'), 'verify\nsubmit\n');
  assert.notEqual(submittedPath, original);
  assert.match(submittedPath, /rumo-pragas-submit\.[^/]+\/candidate\.ipa$/);
  assert.equal(
    existsSync(submittedPath),
    false,
    'private snapshot must be removed after submission',
  );
});

test('submit cancels before EAS submit when the exact snapshot fails its environment gate', (t) => {
  const root = createFixture(t, [
    'validate-store-assets.mjs',
    'store-submission-status.mjs',
    'submit.sh',
  ]);
  populateValidAssets(root);
  const artifact = join(root, 'reviewed-candidate.ipa');
  const submitMarker = join(root, 'submit-was-executed');
  const secretSentinel = 'synthetic-verifier-secret-must-not-leak';
  createIpaArtifact(artifact, '1.0.11', 'independently reviewed bytes');
  writeManifest(root, (manifest) => {
    manifest.platforms.ios.candidateArtifact.sha256 = sha256(artifact);
  });
  writeFileSync(join(root, 'scripts/validate-prod-env.sh'), '#!/usr/bin/env bash\nexit 0\n', {
    mode: 0o755,
  });
  writeFileSync(
    join(root, 'scripts/verify-release-bundle-env.mjs'),
    `console.error('${secretSentinel}'); process.exit(1);\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(root, 'scripts/eas-pinned.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == env:exec ]]; then
  bash -c "$3"
  exit $?
fi
printf 'called' > '${submitMarker}'
exit 99
`,
    { mode: 0o755 },
  );

  const result = spawnSync(
    'bash',
    [
      join(root, 'scripts/submit.sh'),
      '--platform',
      'ios',
      '--artifact',
      artifact,
      '--confirm-authorized-submission',
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
  );
  const output = outputOf(result);
  assert.equal(result.status, 1, output);
  assert.match(output, /snapshot local não comprovou o ambiente de produção/);
  assert.equal(existsSync(submitMarker), false);
  assert.equal(output.includes(secretSentinel), false);
});

test('submit cannot bypass an incomplete opposite-platform screenshot set', (t) => {
  for (const selectedPlatform of ['ios', 'android']) {
    const root = createFixture(t, [
      'validate-store-assets.mjs',
      'store-submission-status.mjs',
      'submit.sh',
    ]);
    populateValidAssets(root);
    const { easMarker, envMarker } = installUnreachableReleaseCommands(root);
    const artifact = join(root, selectedPlatform === 'ios' ? 'candidate.ipa' : 'candidate.aab');
    createArtifact(artifact, selectedPlatform);

    if (selectedPlatform === 'ios') {
      rmSync(join(root, 'store-assets/android/tablet-10/04.png'));
    } else {
      rmSync(join(root, 'store-assets/ios/iphone-6.9/05.png'));
    }
    writeManifest(root, (manifest) => {
      manifest.platforms[selectedPlatform].candidateArtifact.sha256 = sha256(artifact);
    });

    const result = spawnSync(
      'bash',
      [
        join(root, 'scripts/submit.sh'),
        '--platform',
        selectedPlatform,
        '--artifact',
        artifact,
        '--confirm-authorized-submission',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(result.status, 3, outputOf(result));
    assert.match(outputOf(result), selectedPlatform === 'ios' ? /\[android\]/ : /\[ios\]/);
    assert.equal(existsSync(envMarker), false);
    assert.equal(existsSync(easMarker), false);
  }
});

test('submit blocks on global account deletion before env validation or EAS', (t) => {
  const root = createFixture(t, [
    'validate-store-assets.mjs',
    'store-submission-status.mjs',
    'submit.sh',
  ]);
  populateValidAssets(root);
  writeFileSync(join(root, 'store-assets/ACCOUNT_DELETION_BLOCKER.md'), '# blocker\n');
  const easMarker = join(root, 'eas-was-executed');
  const envMarker = join(root, 'env-was-validated');
  const secretSentinel = 'synthetic-eas-secret-must-not-leak';
  writeFileSync(
    join(root, 'scripts/eas-pinned.sh'),
    `#!/usr/bin/env bash\nprintf '%s' '${secretSentinel}' >&2\nprintf 'called' > '${easMarker}'\nexit 99\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(root, 'scripts/validate-prod-env.sh'),
    `#!/usr/bin/env bash\nprintf 'called' > '${envMarker}'\nexit 0\n`,
    { mode: 0o755 },
  );
  const artifact = join(root, 'synthetic-reviewed-artifact.ipa');
  createIpaArtifact(artifact, '1.0.11', 'synthetic fixture used only in a temp directory');
  writeManifest(root, (manifest) => {
    manifest.platforms.ios.candidateArtifact.sha256 = sha256(artifact);
  });

  const result = spawnSync(
    'bash',
    [
      join(root, 'scripts/submit.sh'),
      '--platform',
      'ios',
      '--artifact',
      artifact,
      '--confirm-authorized-submission',
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
  );
  const output = outputOf(result);
  assert.equal(result.status, 3, output);
  assert.match(output, /\[account-deletion\]/);
  assert.equal(existsSync(envMarker), false, 'production env validation must not run');
  assert.equal(existsSync(easMarker), false, 'EAS must not run');
  assert.equal(output.includes(secretSentinel), false, 'unreached EAS output must not leak');
  assert.equal(
    output.includes(basename(artifact)),
    false,
    'artifact path must not leak on the blocker',
  );
});
