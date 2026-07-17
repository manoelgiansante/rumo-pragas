#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  NATIVE_SIGNING_POLICY,
  createAndroidSigningInitScript,
  createEasEnvPullArguments,
  deriveNativeBuildVersion,
  openStableArtifact,
  parseCanonicalZipCentralDirectory,
  readApprovedSigningFile,
  sanitizeNativeBuildEnvironment,
  sha256,
  validateAndroidArtifactMetadata,
  validateGoogleOAuthEnvironment,
  validateGoogleOAuthPolicyEvidence,
  validateGoogleServicesConfiguration,
  validateIosArtifactMetadata,
  validateIosProvisioningProfile,
  validateIosSignedEntitlements,
  validateJarsignerCoverage,
  validateNativeBuildVersion,
  validateStrictJarsignerResult,
} from './native-signing-policy.mjs';

const syntheticCertificate = Buffer.from('synthetic-certificate-der');
const syntheticCertificateSha1 = createHash('sha1')
  .update(syntheticCertificate)
  .digest('hex')
  .toUpperCase();
const syntheticPolicy = Object.freeze({
  ...NATIVE_SIGNING_POLICY,
  appVersion: '7.8.9',
  bundleIdentifier: 'com.example.approved',
  teamId: 'TEAM123456',
  ios: Object.freeze({
    ...NATIVE_SIGNING_POLICY.ios,
    certificateSha1: syntheticCertificateSha1,
    latestStoreBuildNumber: 100,
    profileSha256: 'a'.repeat(64),
    profileUuid: 'fixture-profile',
  }),
  android: Object.freeze({
    ...NATIVE_SIGNING_POLICY.android,
    certificateSha1: 'AA'.repeat(20),
    certificateSha256: 'BB'.repeat(32),
    latestStoreVersionCode: 100,
  }),
  firebase: Object.freeze({
    ...NATIVE_SIGNING_POLICY.firebase,
    appId: '1:123:android:fixture',
    packageName: 'com.example.approved',
    projectId: 'fixture-project',
    projectNumber: '123',
  }),
  googleOAuth: Object.freeze({
    androidClientId: '123456789000-androidproduction.apps.googleusercontent.com',
    androidLocalQaClientId: '123456789000-androidlocalqa.apps.googleusercontent.com',
    androidPackageName: 'com.example.approved',
    androidPlaySigningSha1: 'CC'.repeat(20),
    androidUploadSigningSha1: 'AA'.repeat(20),
    iosAppStoreId: '1234567890',
    iosBundleIdentifier: 'com.example.approved',
    iosClientId: '123456789000-iosproduction.apps.googleusercontent.com',
    iosTeamId: 'TEAM123456',
    projectNumber: '123456789000',
    rejectedGenericClientId: '123456789000-rejectedgeneric.apps.googleusercontent.com',
    webClientId: '123456789000-webproduction.apps.googleusercontent.com',
  }),
});

const syntheticProfile = (overrides = {}) => ({
  DeveloperCertificates: [syntheticCertificate.toString('base64')],
  Entitlements: {
    'application-identifier': 'TEAM123456.com.example.approved',
    'aps-environment': 'production',
    'com.apple.developer.team-identifier': 'TEAM123456',
    'get-task-allow': false,
    'keychain-access-groups': ['TEAM123456.com.example.*'],
  },
  ExpirationDate: '2099-01-01T00:00:00.000Z',
  Name: 'fixture app store profile',
  TeamIdentifier: ['TEAM123456'],
  UUID: 'fixture-profile',
  ...overrides,
});

const syntheticKeytoolOutput = ({ issuer = 'CN=Fixture Upload', owner = issuer } = {}) =>
  [
    'Signer #1:',
    '',
    'Certificate #1:',
    `Owner: ${owner}`,
    `Issuer: ${issuer}`,
    'Serial number: 1',
    'Certificate fingerprints:',
    `\t SHA1: ${'AA:'.repeat(19)}AA`,
    `\t SHA256: ${'BB:'.repeat(31)}BB`,
    'Signature algorithm name: SHA256withRSA',
  ].join('\n');

const createStoredZip = (
  entries,
  { eocdComment = Buffer.alloc(0), eocdCount, extraEocdSignature = false } = {},
) => {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data ?? 'fixture');
    const flags = entry.flags ?? 0;
    const method = entry.method ?? 0;
    const externalAttributes = entry.externalAttributes ?? 0o100644 * 0x10000;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(entry.crc32 ?? 0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(entry.crc32 ?? 0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(externalAttributes, 38);
    central.writeUInt32LE(entry.localOffset ?? localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + data.length;
  }

  const localBytes = Buffer.concat(localParts);
  const centralBytes = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  const count = eocdCount ?? entries.length;
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  eocd.writeUInt16LE(eocdComment.length, 20);
  return Buffer.concat([
    ...(extraEocdSignature ? [Buffer.from([0x50, 0x4b, 0x05, 0x06])] : []),
    localBytes,
    centralBytes,
    eocd,
    eocdComment,
  ]);
};

const parseZipBuffer = (archive) =>
  parseCanonicalZipCentralDirectory({
    fileSize: archive.length,
    readRange: (offset, length) => archive.subarray(offset, offset + length),
  });

test('derives one reproducible native build value and enforces store baselines', () => {
  const buildVersion = deriveNativeBuildVersion(1_800_000_000);
  assert.equal(buildVersion, '222163200');
  assert.equal(
    validateNativeBuildVersion({ buildVersion, platform: 'ios', policy: syntheticPolicy }),
    buildVersion,
  );
  assert.equal(
    validateNativeBuildVersion({ buildVersion, platform: 'android', policy: syntheticPolicy }),
    buildVersion,
  );
  assert.throws(
    () =>
      validateNativeBuildVersion({ buildVersion: '100', platform: 'ios', policy: syntheticPolicy }),
    /maior que 100/,
  );
  assert.throws(() => deriveNativeBuildVersion(Number.NaN), /timestamp/);
});

test('approved credential reader rejects symlinks, hardlinks, permissive modes and swaps', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rumo-native-credential-')));
  const credentialRoot = join(root, 'credentials');
  mkdirSync(credentialRoot, { mode: 0o700 });
  const credential = join(credentialRoot, 'credential.bin');
  const contents = Buffer.from('approved-private-credential');
  const expectedSha256 = sha256(contents);
  try {
    writeFileSync(credential, contents, { mode: 0o600 });
    assert.deepEqual(
      readApprovedSigningFile({ filePath: credential, expectedSha256, label: 'fixture' }),
      contents,
    );
    chmodSync(credential, 0o644);
    assert.throws(
      () => readApprovedSigningFile({ filePath: credential, expectedSha256, label: 'fixture' }),
      /privado/,
    );
    chmodSync(credential, 0o600);
    const hardlink = join(credentialRoot, 'hardlink.bin');
    linkSync(credential, hardlink);
    assert.throws(
      () => readApprovedSigningFile({ filePath: credential, expectedSha256, label: 'fixture' }),
      /hardlinks/,
    );
    rmSync(hardlink);
    const symlink = join(credentialRoot, 'symlink.bin');
    symlinkSync(credential, symlink);
    assert.throws(
      () => readApprovedSigningFile({ filePath: symlink, expectedSha256, label: 'fixture' }),
      /privado/,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('stable artifact keeps the attested inode through copy and rejects pathname swaps', () => {
  const root = mkdtempSync(join(tmpdir(), 'rumo-native-stable-artifact-'));
  const source = join(root, 'candidate.aab');
  const replacement = join(root, 'replacement.aab');
  const originalRenamed = join(root, 'candidate-original.aab');
  const accepted = join(root, 'accepted.aab');
  try {
    writeFileSync(source, Buffer.from('attested-aab-bytes'), { mode: 0o600 });
    const stable = openStableArtifact({ filePath: source, label: 'fixture artifact' });
    const evidence = stable.copyTo(accepted);
    assert.equal(evidence.sha256, sha256(Buffer.from('attested-aab-bytes')));
    assert.equal(readFileSync(accepted, 'utf8'), 'attested-aab-bytes');
    stable.close();

    writeFileSync(replacement, Buffer.from('replacement-bytes'), { mode: 0o600 });
    const swapped = openStableArtifact({ filePath: source, label: 'swapped artifact' });
    renameSync(source, originalRenamed);
    renameSync(replacement, source);
    assert.throws(() => swapped.assertUnchanged({ rehash: true }), /inode\/pathname/);
    assert.throws(() => swapped.copyTo(join(root, 'must-not-exist.aab')), /inode\/pathname/);
    swapped.close();
    assert.equal(existsSync(join(root, 'must-not-exist.aab')), false);

    const linked = join(root, 'linked.aab');
    linkSync(source, linked);
    assert.throws(
      () => openStableArtifact({ filePath: source, label: 'hardlinked artifact' }),
      /regular, único/,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('stable artifact lends the attested descriptor to children across a transient pathname swap', () => {
  const root = mkdtempSync(join(tmpdir(), 'rumo-native-stable-fd-'));
  const source = join(root, 'candidate.aab');
  const originalRenamed = join(root, 'candidate-original.aab');
  const accepted = join(root, 'accepted.aab');
  try {
    writeFileSync(source, Buffer.from('original-attested-inode'), { mode: 0o600 });
    const stable = openStableArtifact({ filePath: source, label: 'fd fixture' });
    try {
      assert.equal(
        stable.readRange(9, 8).toString('utf8'),
        'attested',
        'raw inspection must read the already-open descriptor',
      );
      renameSync(source, originalRenamed);
      writeFileSync(source, Buffer.from('replacement-pathname'), { mode: 0o600 });
      const child = spawnSync('/bin/cat', ['/dev/fd/3'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe', stable.childDescriptor],
      });
      assert.equal(child.status, 0);
      assert.equal(child.stdout, 'original-attested-inode');

      unlinkSync(source);
      renameSync(originalRenamed, source);
      stable.copyTo(accepted);
      assert.equal(readFileSync(accepted, 'utf8'), 'original-attested-inode');
    } finally {
      stable.close();
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('raw ZIP parser accepts only canonical Unix regular files and directories', () => {
  const archive = createStoredZip([
    { name: 'base/', data: Buffer.alloc(0), externalAttributes: 0o040755 * 0x10000 + 0x10 },
    { name: 'base/assets/index.android.bundle', data: 'bundle' },
  ]);
  assert.deepEqual(parseZipBuffer(archive).entries, ['base/', 'base/assets/index.android.bundle']);

  for (const [label, invalidArchive] of [
    [
      'symlink',
      createStoredZip([
        { name: 'base/link', externalAttributes: 0o120777 * 0x10000, data: 'target' },
      ]),
    ],
    [
      'special file',
      createStoredZip([{ name: 'base/fifo', externalAttributes: 0o010644 * 0x10000 }]),
    ],
    [
      'type mismatch',
      createStoredZip([
        { name: 'base/not-a-directory', externalAttributes: 0o040755 * 0x10000 + 0x10 },
      ]),
    ],
    ['case collision', createStoredZip([{ name: 'base/File' }, { name: 'base/file' }])],
    ['traversal', createStoredZip([{ name: 'base/../escape' }])],
    ['whitespace', createStoredZip([{ name: 'base/bad name' }])],
    ['EOCD count', createStoredZip([{ name: 'base/file' }], { eocdCount: 2 })],
    ['EOCD comment', createStoredZip([{ name: 'base/file' }], { eocdComment: Buffer.from('x') })],
    [
      'duplicate EOCD signature',
      createStoredZip([{ name: 'base/file', data: Buffer.from([0x50, 0x4b, 0x05, 0x06]) }]),
    ],
    [
      'local offset outside body',
      createStoredZip([{ name: 'base/file', localOffset: 0xfffffff0 }]),
    ],
  ]) {
    assert.throws(() => parseZipBuffer(invalidArchive), Error, label);
  }
});

test('validates Firebase file by hash-independent schema, project, app and package', () => {
  const valid = Buffer.from(
    JSON.stringify({
      project_info: { project_id: 'fixture-project', project_number: '123' },
      client: [
        {
          api_key: [{ current_key: 'public-firebase-api-key-with-enough-length' }],
          client_info: {
            android_client_info: { package_name: 'com.example.approved' },
            mobilesdk_app_id: '1:123:android:fixture',
          },
        },
      ],
    }),
  );
  assert.deepEqual(validateGoogleServicesConfiguration(valid, syntheticPolicy), {
    appId: '1:123:android:fixture',
    configurationSha256: sha256(valid),
    packageName: 'com.example.approved',
    projectId: 'fixture-project',
    projectNumber: '123',
  });
  const wrongPackage = Buffer.from(valid.toString().replace('com.example.approved', 'com.bad.app'));
  assert.throws(
    () => validateGoogleServicesConfiguration(wrongPackage, syntheticPolicy),
    /outro projeto\/app/,
  );
  const unrelatedOauth = Buffer.from(
    valid.toString().replace('"api_key"', '"oauth_client":[{"client_id":"unrelated"}],"api_key"'),
  );
  assert.deepEqual(validateGoogleServicesConfiguration(unrelatedOauth, syntheticPolicy), {
    appId: '1:123:android:fixture',
    configurationSha256: sha256(unrelatedOauth),
    packageName: 'com.example.approved',
    projectId: 'fixture-project',
    projectNumber: '123',
  });
});

test('Google OAuth preflight validates approved clients and separate package/SHA evidence', () => {
  const base = {
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID:
      '123456789000-androidproduction.apps.googleusercontent.com',
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '123456789000-iosproduction.apps.googleusercontent.com',
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '123456789000-webproduction.apps.googleusercontent.com',
  };
  assert.equal(
    validateGoogleOAuthPolicyEvidence(syntheticPolicy).androidUploadSigningSha1,
    syntheticPolicy.android.certificateSha1,
  );
  assert.equal(
    validateGoogleOAuthEnvironment({ environment: base, platform: 'ios', policy: syntheticPolicy })
      .iosClientId,
    base.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  );
  assert.equal(
    validateGoogleOAuthEnvironment({
      environment: base,
      platform: 'android',
      policy: syntheticPolicy,
    }).androidClientId,
    base.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  );
  assert.throws(
    () =>
      validateGoogleOAuthEnvironment({
        environment: {
          ...base,
          EXPO_PUBLIC_GOOGLE_CLIENT_ID: 'any-generic.apps.googleusercontent.com',
        },
        platform: 'ios',
        policy: syntheticPolicy,
      }),
    /genérico/,
  );
  assert.throws(
    () =>
      validateGoogleOAuthEnvironment({
        environment: { ...base, EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: 'wrong' },
        platform: 'android',
        policy: syntheticPolicy,
      }),
    /Android OAuth/,
  );
  assert.throws(
    () =>
      validateGoogleOAuthPolicyEvidence({
        ...syntheticPolicy,
        googleOAuth: {
          ...syntheticPolicy.googleOAuth,
          androidUploadSigningSha1: 'DD'.repeat(20),
        },
      }),
    /SHA-1 Play\/upload/,
  );
});

test('validates the exact App Store profile and every signed capability', () => {
  const profile = syntheticProfile();
  validateIosProvisioningProfile(profile, syntheticPolicy, new Date('2030-01-01T00:00:00Z'));
  const signedEntitlements = {
    'application-identifier': 'TEAM123456.com.example.approved',
    'aps-environment': 'production',
    'com.apple.developer.team-identifier': 'TEAM123456',
    'get-task-allow': false,
    'keychain-access-groups': ['TEAM123456.com.example.approved'],
  };
  assert.equal(
    validateIosSignedEntitlements({
      bundleIdentifier: 'com.example.approved',
      isMainApp: true,
      policy: syntheticPolicy,
      profile,
      signedEntitlements,
    }).applicationIdentifier,
    'TEAM123456.com.example.approved',
  );
  assert.throws(
    () =>
      validateIosSignedEntitlements({
        bundleIdentifier: 'com.example.approved',
        isMainApp: true,
        policy: syntheticPolicy,
        profile,
        signedEntitlements: { ...signedEntitlements, 'get-task-allow': true },
      }),
    /produção/,
  );
  assert.throws(
    () =>
      validateIosSignedEntitlements({
        bundleIdentifier: 'com.example.approved',
        isMainApp: true,
        policy: syntheticPolicy,
        profile,
        signedEntitlements: { ...signedEntitlements, 'com.apple.developer.healthkit': true },
      }),
    /Capability/,
  );
  assert.throws(
    () =>
      validateIosProvisioningProfile(
        { ...profile, ProvisionedDevices: ['device'] },
        syntheticPolicy,
      ),
    /App Store Connect/,
  );
});

test('validates signed IPA metadata and Android certificate/version metadata', () => {
  validateIosArtifactMetadata({
    buildVersion: '222163200',
    codesignDisplay: 'Identifier=com.example.approved\nTeamIdentifier=TEAM123456\n',
    embeddedProfileSha256: syntheticPolicy.ios.profileSha256,
    infoPlist: {
      CFBundleIdentifier: 'com.example.approved',
      CFBundleShortVersionString: '7.8.9',
      CFBundleVersion: '222163200',
    },
    policy: syntheticPolicy,
    signingCertificateSha1: syntheticCertificateSha1,
  });
  const keytoolOutput = syntheticKeytoolOutput();
  validateAndroidArtifactMetadata({
    applicationId: 'com.example.approved',
    buildVersion: '222163200',
    keytoolOutput,
    policy: syntheticPolicy,
    versionCode: '222163200',
    versionName: '7.8.9',
  });
  assert.throws(
    () =>
      validateAndroidArtifactMetadata({
        applicationId: 'com.bad',
        buildVersion: '222163200',
        keytoolOutput,
        policy: syntheticPolicy,
        versionCode: '222163200',
        versionName: '7.8.9',
      }),
    /applicationId/,
  );
});

test('Android certificate evidence binds exactly one self-signed certificate to one signer', () => {
  const valid = syntheticKeytoolOutput();
  assert.doesNotThrow(() =>
    validateAndroidArtifactMetadata({
      applicationId: 'com.example.approved',
      buildVersion: '222163200',
      keytoolOutput: valid,
      policy: syntheticPolicy,
      versionCode: '222163200',
      versionName: '7.8.9',
    }),
  );
  for (const invalid of [
    `${valid}\nSigner #2:\nCertificate #1:`,
    `${valid}\nCertificate #2:`,
    `${valid}\nSHA1: ${'AA:'.repeat(19)}AA`,
    syntheticKeytoolOutput({ issuer: 'CN=Different Issuer', owner: 'CN=Fixture Upload' }),
  ]) {
    assert.throws(
      () =>
        validateAndroidArtifactMetadata({
          applicationId: 'com.example.approved',
          buildVersion: '222163200',
          keytoolOutput: invalid,
          policy: syntheticPolicy,
          versionCode: '222163200',
          versionName: '7.8.9',
        }),
      /Certificado|signer|certificate|autoassinado/i,
    );
  }
});

test('jarsigner coverage requires every non-signature AAB entry to be signed and in manifest', () => {
  const entries = [
    'META-INF/MANIFEST.MF',
    'META-INF/UPLOAD.SF',
    'META-INF/UPLOAD.RSA',
    'base/manifest/AndroidManifest.xml',
    'base/assets/index.android.bundle',
  ];
  const validOutput = [
    'sm       42 Thu Jan 01 00:00:00 UTC 1970 base/manifest/AndroidManifest.xml',
    'sm      128 Thu Jan 01 00:00:00 UTC 1970 base/assets/index.android.bundle',
    'jar verified.',
  ].join('\n');
  validateJarsignerCoverage({ entries, output: validOutput });
  assert.throws(
    () =>
      validateJarsignerCoverage({
        entries,
        output: validOutput.replace(/^sm      128/m, ' m      128'),
      }),
    /sem cobertura integral/,
  );
  assert.throws(
    () => validateJarsignerCoverage({ entries: [...entries, entries[3]], output: validOutput }),
    /duplicada/,
  );
});

test('strict jarsigner accepts only clean status 0 or the exact self-signed PKIX status 4', () => {
  const entries = [
    'base/manifest/AndroidManifest.xml',
    'META-INF/UPLOAD.SF',
    'META-INF/UPLOAD.RSA',
    'META-INF/MANIFEST.MF',
  ];
  const expectedOutput = [
    'sm       42 Thu Jan 01 00:00:00 UTC 1970 base/manifest/AndroidManifest.xml',
    'jar verified, with signer errors.',
    '',
    'Error: ',
    'This jar contains entries whose certificate chain is invalid. Reason: PKIX path building failed: sun.security.provider.certpath.SunCertPathBuilderException: unable to find valid certification path to requested target',
    'This jar contains entries whose signer certificate is self-signed.',
    '',
    'Warning: ',
    'This jar contains signatures that do not include a timestamp. Without a timestamp, users may not be able to validate this jar after any of the signer certificates expire (as early as 2053-08-25).',
    'POSIX file permission and/or symlink attributes detected. These attributes are ignored when signing and are not protected by the signature.',
    'This JAR file contains internal inconsistencies that may result in different contents when reading via JarFile and JarInputStream:',
    '- Manifest is missing when reading via JarInputStream',
    '- Entry base/manifest/AndroidManifest.xml is signed in JarFile but is not signed in JarInputStream',
    '- Entry META-INF/MANIFEST.MF is signed in JarFile but is not signed in JarInputStream',
    'The signer certificate will expire on 2053-08-25.',
  ].join('\n');

  assert.doesNotThrow(() =>
    validateStrictJarsignerResult({ entries, status: 0, stderr: '', stdout: 'jar verified.\n' }),
  );
  assert.doesNotThrow(() =>
    validateStrictJarsignerResult({ entries, status: 4, stderr: '', stdout: expectedOutput }),
  );
  const fdCrossCheckOutput = expectedOutput.replace(
    '- Entry base/manifest/AndroidManifest.xml is signed in JarFile but is not signed in JarInputStream\n- Entry META-INF/MANIFEST.MF is signed in JarFile but is not signed in JarInputStream',
    [
      '- Entry base/manifest/AndroidManifest.xml is present when reading via JarFile but missing when reading via JarInputStream',
      '- Entry META-INF/UPLOAD.SF is present when reading via JarFile but missing when reading via JarInputStream',
      '- Entry META-INF/UPLOAD.RSA is present when reading via JarFile but missing when reading via JarInputStream',
    ].join('\n'),
  );
  assert.doesNotThrow(() =>
    validateStrictJarsignerResult({
      entries,
      status: 4,
      stderr: '',
      stdout: fdCrossCheckOutput,
    }),
  );
  assert.doesNotThrow(() => validateJarsignerCoverage({ entries, output: expectedOutput }));
  assert.throws(
    () =>
      validateStrictJarsignerResult({
        entries,
        status: 4,
        stderr: '',
        stdout: `${expectedOutput}\nUnexpected signer warning.`,
      }),
    /diagnóstico inesperado/,
  );
  assert.throws(
    () =>
      validateStrictJarsignerResult({
        entries,
        status: 4,
        stderr: '',
        stdout: expectedOutput.replace(
          '- Entry META-INF/MANIFEST.MF is signed in JarFile but is not signed in JarInputStream\n',
          '',
        ),
      }),
    /conjunto de cross-check/,
  );
  assert.throws(
    () =>
      validateStrictJarsignerResult({
        entries,
        status: 4,
        stderr: '',
        stdout: expectedOutput.replace(
          'This jar contains entries whose signer certificate is self-signed.',
          'This jar contains unsigned entries which have not been integrity-checked.\nThis jar contains entries whose signer certificate is self-signed.',
        ),
      }),
    /signer errors inesperados/,
  );
  assert.throws(
    () => validateStrictJarsignerResult({ entries, status: 8, stderr: '', stdout: expectedOutput }),
    /status inesperado/,
  );
  assert.throws(
    () =>
      validateStrictJarsignerResult({
        entries,
        status: 0,
        stderr: '',
        stdout:
          'jar verified.\nThis JAR file contains internal inconsistencies that may result in different contents when reading via JarFile and JarInputStream:',
      }),
    /cross-check/,
  );
  assert.throws(
    () =>
      validateStrictJarsignerResult({
        entries,
        status: 0,
        stderr: 'unexpected stderr',
        stdout: 'jar verified.\n',
      }),
    /stderr inesperado/,
  );
  assert.throws(
    () =>
      validateStrictJarsignerResult({
        entries,
        status: 4,
        stderr: '',
        stdout: expectedOutput.replace(
          'The signer certificate will expire on 2053-08-25.',
          '- Entry base/extra.bin is signed in JarFile but is not signed in JarInputStream\nThe signer certificate will expire on 2053-08-25.',
        ),
      }),
    /conjunto de cross-check/,
  );
  assert.throws(
    () =>
      validateStrictJarsignerResult({
        entries: [
          'base/manifest/AndroidManifest.xml',
          'META-INF/MANIFEST.MF',
          'META-INF/UPLOAD.SF',
          'META-INF/UPLOAD.RSA',
        ],
        status: 4,
        stderr: '',
        stdout: expectedOutput,
      }),
    /última entrada/,
  );
});

test('Android Gradle init script keeps secrets out of argv/files and reads Keychain lazily', () => {
  const script = createAndroidSigningInitScript({
    buildVersion: '222163200',
    keystorePath: '/approved/keystore.jks',
    policy: syntheticPolicy,
  });
  assert.match(script, /providers\.exec/);
  assert.match(script, /\/usr\/bin\/security/);
  assert.match(script, /find-generic-password/);
  assert.match(script, /signing\.storePassword = readKeychain/);
  assert.match(script, /signing\.keyPassword = readKeychain/);
  assert.doesNotMatch(script, /password-from-test|credentials\.json/);
});

test('native environment strips command injection, plugin paths and ambient credentials', () => {
  const sanitized = sanitizeNativeBuildEnvironment(
    {
      BASH_ENV: '/tmp/execute-me',
      DYLD_INSERT_LIBRARIES: '/tmp/inject.dylib',
      EAS_LOCAL_BUILD_PLUGIN_PATH: '/tmp/plugin',
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid',
      EXPO_TOKEN: 'must-not-propagate',
      NODE_OPTIONS: '--require=/tmp/inject.js',
      NPM_CONFIG_USERCONFIG: '/tmp/evil-npmrc',
      ORG_GRADLE_PROJECT_secret: 'must-not-propagate',
      SENTRY_AUTH_TOKEN: 'must-not-propagate',
      UNRELATED_SECRET: 'must-not-propagate',
    },
    { buildOnly: true, path: '/usr/bin:/bin' },
  );
  for (const name of [
    'BASH_ENV',
    'DYLD_INSERT_LIBRARIES',
    'EAS_LOCAL_BUILD_PLUGIN_PATH',
    'EXPO_TOKEN',
    'NODE_OPTIONS',
    'NPM_CONFIG_USERCONFIG',
    'ORG_GRADLE_PROJECT_secret',
    'SENTRY_AUTH_TOKEN',
    'UNRELATED_SECRET',
  ]) {
    assert.equal(Object.hasOwn(sanitized, name), false, `${name} must be removed`);
  }
  assert.equal(sanitized.EXPO_PUBLIC_SUPABASE_URL, 'https://example.invalid');
  assert.equal(sanitized.PATH, '/usr/bin:/bin');
});

test('release shell entrypoints clear BASH_ENV before Bash can evaluate it', () => {
  const root = mkdtempSync(join(tmpdir(), 'rumo-native-shell-bootstrap-'));
  const marker = join(root, 'ambient-code-ran');
  const bashEnvironment = join(root, 'ambient.sh');
  try {
    writeFileSync(bashEnvironment, `printf compromised >${JSON.stringify(marker)}\n`, {
      mode: 0o600,
    });
    for (const [script, arguments_, expectedStatus] of [
      ['./eas-local-production-build.sh', ['--help'], 0],
      ['./eas-pinned.sh', ['build'], 2],
      ['./launch.sh', ['--help'], 0],
    ]) {
      const result = spawnSync(fileURLToPath(new URL(script, import.meta.url)), arguments_, {
        encoding: 'utf8',
        env: { ...process.env, BASH_ENV: bashEnvironment, ENV: bashEnvironment },
      });
      assert.equal(result.status, expectedStatus, `${script}\n${result.stdout}${result.stderr}`);
      assert.equal(existsSync(marker), false, `${script} evaluated ambient shell startup code`);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('EAS Environment pull can materialize only on the approved encrypted volume', () => {
  assert.deepEqual(
    createEasEnvPullArguments('/Volumes/RumoPragasProdBackup/native-build-environment/p.env'),
    [
      'env:pull',
      'production',
      '--path',
      '/Volumes/RumoPragasProdBackup/native-build-environment/p.env',
      '--non-interactive',
    ],
  );
  assert.throws(() => createEasEnvPullArguments('/tmp/production.env'), /volume privado/);
});

test('native runner is commit-bound, dependency-isolated and uses pinned local attestors', () => {
  const runner = readFileSync(
    new URL('./native-local-production-build.mjs', import.meta.url),
    'utf8',
  );
  const wrapper = readFileSync(new URL('./eas-local-production-build.sh', import.meta.url), 'utf8');
  const eas = readFileSync(new URL('./eas-pinned.sh', import.meta.url), 'utf8');
  const launch = readFileSync(new URL('./launch.sh', import.meta.url), 'utf8');
  const easConfig = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));

  assert.match(wrapper, /\/usr\/bin\/env -i/);
  assert.match(wrapper, /^#!\/usr\/bin\/env -S -i /);
  assert.match(wrapper, /git archive --format=tar "\$CANDIDATE_COMMIT"/);
  assert.match(wrapper, /CURRENT_WRAPPER_BLOB/);
  assert.match(wrapper, /native-production-build\.lock/);
  assert.match(wrapper, /recovered-native-lock/);
  assert.match(wrapper, /assert_no_external_native_build/);
  assert.match(wrapper, /RUMO_NATIVE_CANDIDATE_COMMIT/);
  assert.match(wrapper, /--status-log "\$LOG_PATH"/);
  assert.doesNotMatch(
    wrapper,
    /eas-pinned\.sh build|--auto-submit|credentials\.json\.materializing/,
  );

  assert.match(runner, /assertBootstrapBoundToCommit/);
  assert.match(runner, /'archive'/);
  assert.match(runner, /'ci'/);
  assert.match(runner, /'--ignore-scripts'/);
  assert.match(runner, /packageLockSha256/);
  assert.doesNotMatch(runner, /symlinkSync\([^)]*node_modules/);
  assert.match(runner, /createEasEnvPullArguments/);
  assert.doesNotMatch(runner, /env:exec/);
  assert.match(runner, /bundletool\.jarPath/);
  assert.match(runner, /parseCanonicalZipCentralDirectory/);
  assert.match(runner, /'validate'/);
  const androidAttestation = runner.slice(runner.indexOf('const attestAndroidArtifact'));
  assert.ok(
    androidAttestation.indexOf("'validate'") < androidAttestation.indexOf('dumpAabManifestValue'),
    'bundletool validate must execute before manifest dumps',
  );
  assert.match(runner, /\/dev\/fd\/3/);
  assert.match(runner, /childDescriptor/);
  assert.match(runner, /-J-Duser\.language=en/);
  assert.match(runner, /-J-Duser\.country=US/);
  assert.match(runner, /'-strict'/);
  assert.match(runner, /validateJarsignerCoverage/);
  assert.doesNotMatch(runner, /apkanalyzer/);
  assert.match(runner, /--entitlements', ':-'/);
  assert.match(runner, /findSignedBundles/);
  assert.match(runner, /required\('DeveloperCertificates', 'raw'\)/);
  assert.doesNotMatch(runner, /parsePlistFile\(decodedPath/);
  assert.match(runner, /BCSymbolMaps/);
  assert.match(runner, /symbols\.tar\.gz/);
  assert.match(runner, /Runner materializou JKS/);
  assert.match(runner, /distributionSha256Sum/);

  assert.match(eas, /case "\$COMMAND" in/);
  assert.match(eas, /^#!\/usr\/bin\/env -S -i /);
  assert.match(eas, /build\|build:\*\|workflow\|workflow:\*\|cloud\|cloud:\*/);
  assert.match(eas, /comando EAS não pertence à allowlist/);
  assert.match(eas, /exec \/usr\/bin\/env -i/);
  assert.match(launch, /BLOQUEADO: perfil '\$PROFILE' ainda não possui executor nativo local/);
  assert.doesNotMatch(launch, /eas-pinned\.sh build/);
  assert.equal(easConfig.cli.appVersionSource, 'local');
  assert.equal(Object.hasOwn(easConfig.build.production, 'autoIncrement'), false);
  assert.equal(Object.hasOwn(easConfig.build.production.ios, 'image'), false);
  assert.equal(Object.hasOwn(easConfig.build.production.android, 'image'), false);
});

test('pinned EAS executor blocks every cloud/build/workflow alias before tool execution', () => {
  const easPath = fileURLToPath(new URL('./eas-pinned.sh', import.meta.url));
  for (const arguments_ of [
    ['build'],
    ['build', '--local', '--platform', 'ios'],
    ['build:dev', '--platform', 'android'],
    ['build:internal', '--platform', 'ios'],
    ['build:list'],
    ['workflow:run', 'release.yml'],
    ['workflow:list'],
    ['cloud:build', 'android'],
    ['env:create', 'production', '--name', 'X'],
    ['env:pull', 'production', '--path', '/tmp/secret.env', '--non-interactive'],
  ]) {
    const result = spawnSync('/bin/bash', [easPath, ...arguments_], {
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', SENTINEL: 'must-not-matter' },
    });
    assert.equal(result.status, 2, `${arguments_.join(' ')}\n${result.stdout}${result.stderr}`);
  }
});

test('preview and storeQa fail honestly without reaching any build executor', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'rumo-native-launch-profiles-'));
  const scripts = join(fixture, 'scripts');
  try {
    mkdirSync(scripts);
    writeFileSync(
      join(scripts, 'launch.sh'),
      readFileSync(new URL('./launch.sh', import.meta.url)),
      {
        mode: 0o700,
      },
    );
    writeFileSync(
      join(scripts, 'eas-local-production-build.sh'),
      '#!/bin/bash\nprintf reached >"${TRACE:?}"\n',
      { mode: 0o700 },
    );
    for (const profile of ['preview', 'development', 'storeQa']) {
      const trace = join(fixture, `${profile}.trace`);
      const result = spawnSync(
        '/bin/bash',
        [join(scripts, 'launch.sh'), '--platform', 'ios', '--profile', profile],
        { cwd: fixture, encoding: 'utf8', env: { ...process.env, TRACE: trace } },
      );
      assert.equal(result.status, 3);
      assert.match(result.stderr, /ainda não possui executor nativo local/);
      assert.equal(existsSync(trace), false);
    }
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
});
