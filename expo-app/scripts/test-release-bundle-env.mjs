#!/usr/bin/env node

// The filename intentionally avoids Jest's *.test glob; this suite uses node:test.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  readReleaseBundle,
  validateReleaseEnvironment,
  verifyReleaseBundleEnvironment,
} from './verify-release-bundle-env.mjs';

const productionUrl = 'https://jxcnfyeemdltdfqtgbcl.supabase.co';
const makeSyntheticAnonKey = (claims = {}, signature = 'Ab9_'.repeat(11).slice(0, 43)) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'supabase',
      ref: 'jxcnfyeemdltdfqtgbcl',
      role: 'anon',
      iat: 1,
      exp: 4_102_444_800,
      ...claims,
    }),
  ).toString('base64url');
  return `${header}.${payload}.${signature}`;
};
const syntheticAnonKey = makeSyntheticAnonKey();
const policyFor = (key) => ({
  version: 1,
  supabasePublicKeySha256: createHash('sha256').update(key, 'utf8').digest('hex'),
});
const syntheticPolicy = policyFor(syntheticAnonKey);
const validEnvironment = {
  EXPO_PUBLIC_SUPABASE_URL: productionUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: syntheticAnonKey,
};

const crc32 = (data) => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeZip = (file, entries) => {
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
};

const withFixture = (run) => {
  const directory = mkdtempSync(join(tmpdir(), 'rumo-release-bundle-'));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const compileHermesFixture = (directory, strings, outputName = 'index.android.bundle') => {
  const compilerParts = {
    darwin: ['osx-bin', 'hermesc'],
    linux: ['linux64-bin', 'hermesc'],
    win32: ['win64-bin', 'hermesc.exe'],
  }[process.platform];
  assert.ok(compilerParts, `unsupported Hermes fixture host: ${process.platform}`);
  const compiler = fileURLToPath(
    new URL(`../node_modules/hermes-compiler/hermesc/${compilerParts.join('/')}`, import.meta.url),
  );
  const sourcePath = join(directory, `${outputName}.js`);
  const outputPath = join(directory, outputName);
  writeFileSync(sourcePath, `globalThis.__releaseFixture = ${JSON.stringify(strings)};\n`);
  const result = spawnSync(compiler, ['-emit-binary', '-O', '-out', outputPath, sourcePath], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  return outputPath;
};

const withBuildWrapperFixture = (run) =>
  withFixture((directory) => {
    const appRoot = join(directory, 'expo-app');
    const scripts = join(appRoot, 'scripts');
    mkdirSync(scripts, { recursive: true });
    const wrapper = join(scripts, 'eas-local-production-build.sh');
    copyFileSync(new URL('./eas-local-production-build.sh', import.meta.url), wrapper);
    chmodSync(wrapper, 0o755);
    writeFileSync(join(scripts, 'validate-prod-env.sh'), '#!/usr/bin/env bash\nexit 0\n', {
      mode: 0o755,
    });
    writeFileSync(join(scripts, 'verify-release-bundle-env.mjs'), 'process.exit(0);\n', {
      mode: 0o755,
    });
    return run({ appRoot, scripts, wrapper });
  });

test('rejects a release environment without the approved production project', () => {
  assert.throws(
    () =>
      validateReleaseEnvironment(
        {
          ...validEnvironment,
          EXPO_PUBLIC_SUPABASE_URL: 'https://wrong-project.supabase.co',
        },
        syntheticPolicy,
      ),
    /approved production project/,
  );
});

test('rejects a missing or placeholder anonymous key', () => {
  for (const value of ['', 'change-me', 'short', `random-${'k'.repeat(64)}`]) {
    assert.throws(
      () =>
        validateReleaseEnvironment(
          {
            ...validEnvironment,
            EXPO_PUBLIC_SUPABASE_ANON_KEY: value,
          },
          syntheticPolicy,
        ),
      /anonymous key|ANON_KEY/i,
    );
  }
});

test('rejects an anonymous key for another project, role, or validity window', () => {
  for (const claims of [
    { ref: 'another-project' },
    { role: 'service_role' },
    { exp: 1 },
    { iat: 4_102_444_800 },
  ]) {
    const candidate = makeSyntheticAnonKey(claims);
    assert.throws(
      () =>
        validateReleaseEnvironment(
          {
            ...validEnvironment,
            EXPO_PUBLIC_SUPABASE_ANON_KEY: candidate,
          },
          policyFor(candidate),
        ),
      /anonymous project key|ANON_KEY/i,
    );
  }
});

test('default policy rejects independently forged JWT signatures with otherwise valid claims', () => {
  for (const signature of ['Aa1_'.repeat(11).slice(0, 43), 'Bb2-'.repeat(11).slice(0, 43)]) {
    const forgedKey = makeSyntheticAnonKey({}, signature);
    assert.throws(
      () =>
        validateReleaseEnvironment({
          ...validEnvironment,
          EXPO_PUBLIC_SUPABASE_ANON_KEY: forgedKey,
        }),
      /approved production key fingerprint/,
    );
  }
});

test('synthetic keys are accepted only with an explicit function-level fingerprint policy', () => {
  assert.throws(() => validateReleaseEnvironment(validEnvironment), /fingerprint/);
  assert.equal(
    validateReleaseEnvironment(validEnvironment, syntheticPolicy).supabaseAnonKey,
    syntheticAnonKey,
  );
});

test('publishable keys require an explicit matching pin; secret and service-role keys stay forbidden', () => {
  const publishable = `sb_publishable_${'Aa1_'.repeat(12)}`;
  const publishableEnvironment = {
    ...validEnvironment,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: publishable,
  };
  assert.throws(() => validateReleaseEnvironment(publishableEnvironment), /fingerprint/);
  assert.equal(
    validateReleaseEnvironment(publishableEnvironment, policyFor(publishable)).supabaseAnonKey,
    publishable,
  );

  withFixture((directory) => {
    const bundlePath = compileHermesFixture(directory, [
      productionUrl,
      publishable,
      'commitCallback',
    ]);
    assert.doesNotThrow(() =>
      verifyReleaseBundleEnvironment({
        platform: 'android',
        artifactPath: bundlePath,
        environment: publishableEnvironment,
        policy: policyFor(publishable),
      }),
    );
  });

  const secret = `sb_secret_${'Cc3_'.repeat(12)}`;
  assert.throws(
    () =>
      validateReleaseEnvironment(
        { ...validEnvironment, EXPO_PUBLIC_SUPABASE_ANON_KEY: secret },
        policyFor(secret),
      ),
    /privileged Supabase secret key/,
  );

  const serviceRole = makeSyntheticAnonKey({ role: 'service_role' });
  assert.throws(
    () =>
      validateReleaseEnvironment(
        { ...validEnvironment, EXPO_PUBLIC_SUPABASE_ANON_KEY: serviceRole },
        policyFor(serviceRole),
      ),
    /approved anonymous project key/,
  );
});

test('accepts an iOS release bundle only when both exact values are embedded', () =>
  withFixture((directory) => {
    const appPath = join(directory, 'RumoPragasIA.app');
    mkdirSync(appPath);
    writeFileSync(
      join(appPath, 'main.jsbundle'),
      Buffer.from(`prefix\0${productionUrl}\0${syntheticAnonKey}\0suffix`, 'utf8'),
    );

    const result = verifyReleaseBundleEnvironment({
      platform: 'ios',
      artifactPath: appPath,
      environment: validEnvironment,
      policy: syntheticPolicy,
    });

    assert.equal(result.platform, 'ios');
    assert.ok(result.bundleBytes > 0);
  }));

test('detects exact values in UTF-16LE Hermes string storage', () =>
  withFixture((directory) => {
    const bundlePath = join(directory, 'index.android.bundle');
    writeFileSync(bundlePath, Buffer.from(`${productionUrl}\0${syntheticAnonKey}`, 'utf16le'));

    const result = verifyReleaseBundleEnvironment({
      platform: 'android',
      artifactPath: bundlePath,
      environment: validEnvironment,
      policy: syntheticPolicy,
    });

    assert.equal(result.platform, 'android');
  }));

test('rejects a bundle that contains the URL but omitted the anonymous key', () =>
  withFixture((directory) => {
    const bundlePath = join(directory, 'main.jsbundle');
    writeFileSync(bundlePath, productionUrl);

    assert.throws(
      () =>
        verifyReleaseBundleEnvironment({
          platform: 'ios',
          artifactPath: bundlePath,
          environment: validEnvironment,
          policy: syntheticPolicy,
        }),
      /anonymous key|ANON_KEY/i,
    );
  }));

test('requires the exact configured production URL instead of a case-variant lookalike', () =>
  withFixture((directory) => {
    const bundlePath = join(directory, 'index.android.bundle');
    writeFileSync(bundlePath, `HTTPS://JXCNFYEEMDLTDFQTGBCL.SUPABASE.CO\n${syntheticAnonKey}`);
    assert.throws(
      () =>
        verifyReleaseBundleEnvironment({
          platform: 'android',
          artifactPath: bundlePath,
          environment: validEnvironment,
          policy: syntheticPolicy,
        }),
      /configured production Supabase URL|competing Supabase project URL/,
    );
  }));

test('extracts and verifies the Android bundle from an AAB', () =>
  withFixture((directory) => {
    const archiveRoot = join(directory, 'archive');
    const assetsDirectory = join(archiveRoot, 'base', 'assets');
    const aabPath = join(directory, 'candidate.aab');
    mkdirSync(assetsDirectory, { recursive: true });
    writeFileSync(
      join(assetsDirectory, 'index.android.bundle'),
      `${productionUrl}\0${syntheticAnonKey}`,
    );
    const zip = spawnSync('/usr/bin/zip', ['-q', '-r', aabPath, 'base'], {
      cwd: archiveRoot,
      stdio: 'ignore',
    });
    assert.equal(zip.status, 0);

    const result = verifyReleaseBundleEnvironment({
      platform: 'android',
      artifactPath: aabPath,
      environment: validEnvironment,
      policy: syntheticPolicy,
    });

    assert.equal(result.platform, 'android');
  }));

for (const [platform, entryPath, extension] of [
  ['android', 'base/assets/index.android.bundle', 'aab'],
  ['android', 'assets/index.android.bundle', 'apk'],
]) {
  test(`${extension.toUpperCase()} rejects duplicate canonical JavaScript bundles`, () =>
    withFixture((directory) => {
      const artifact = join(directory, `duplicate.${extension}`);
      const bundle = `${productionUrl}\n${syntheticAnonKey}`;
      writeZip(artifact, [
        [entryPath, bundle],
        [entryPath, `${bundle}\ndecoy`],
      ]);

      assert.throws(
        () =>
          verifyReleaseBundleEnvironment({
            platform,
            artifactPath: artifact,
            environment: validEnvironment,
            policy: syntheticPolicy,
          }),
        /exactly one canonical app JavaScript bundle/,
      );
    }));
}

test('rejects competing Supabase project URLs in UTF-8, UTF-16 and escaped literals', () => {
  for (const [encoding, competingUrl] of [
    ['utf8', 'https://another-project.supabase.co'],
    ['utf16le', 'HTTPS://ANOTHER-PROJECT.SUPABASE.CO/path'],
    ['utf8', 'https:\\/\\/another-project.supabase.co'],
    ['utf8', 'http://another-project.supabase.co'],
  ]) {
    withFixture((directory) => {
      const bundlePath = join(directory, 'index.android.bundle');
      writeFileSync(
        bundlePath,
        Buffer.from(`${productionUrl}\n${syntheticAnonKey}\n${competingUrl}`, encoding),
      );
      assert.throws(
        () =>
          verifyReleaseBundleEnvironment({
            platform: 'android',
            artifactPath: bundlePath,
            environment: validEnvironment,
            policy: syntheticPolicy,
          }),
        /competing Supabase project URL/,
      );
    });
  }
});

test('rejects Supabase host suffixes, userinfo, explicit ports and escaped lookalikes', () => {
  for (const [encoding, lookalike] of [
    ['utf8', `${productionUrl}.evil.example`],
    ['utf16le', `${productionUrl}.evil.example`],
    ['utf8', `${productionUrl}:443`],
    ['utf8', `https://user@jxcnfyeemdltdfqtgbcl.supabase.co`],
    ['utf8', `https://jxcnfyeemdltdfqtgbcl.supabase.co@evil.example`],
    ['utf8', `https://evil.example/jxcnfyeemdltdfqtgbcl.supabase.co`],
    ['utf8', `https:\\/\\/jxcnfyeemdltdfqtgbcl.supabase.co.evil.example`],
    ['utf8', `https\\u003a\\u002f\\u002fjxcnfyeemdltdfqtgbcl.supabase.co.evil.example`],
    [
      'utf8',
      String.raw`\x5Cu0068ttps\u003a\u002f\u002fjxcnfyeemdltdfqtgbcl.supabase.co.evil.example`,
    ],
  ]) {
    withFixture((directory) => {
      const bundlePath = join(directory, 'index.android.bundle');
      writeFileSync(
        bundlePath,
        Buffer.from(`${productionUrl}\n${syntheticAnonKey}\n${lookalike}`, encoding),
      );
      assert.throws(
        () =>
          verifyReleaseBundleEnvironment({
            platform: 'android',
            artifactPath: bundlePath,
            environment: validEnvironment,
            policy: syntheticPolicy,
          }),
        /competing Supabase project URL/,
      );
    });
  }
});

test('rejects URL host suffixes hidden behind raw controls or BOM escapes in UTF-8 and UTF-16', () => {
  const attacks = [
    '\t',
    '\n',
    '\r',
    ' ',
    '\ufeff',
    '"',
    "'",
    '`',
    '<',
    '>',
    '{',
    '}',
    '\\',
    String.raw`\uFEFF`,
    String.raw`\u{FEFF}`,
    String.raw`\\uFEFF`,
    String.raw`\\u{FEFF}`,
  ];
  for (const encoding of ['utf8', 'utf16le']) {
    for (const attack of attacks) {
      withFixture((directory) => {
        const bundlePath = join(directory, 'index.android.bundle');
        const maliciousUrl = `${productionUrl}${attack}.evil.example`;
        writeFileSync(
          bundlePath,
          Buffer.from(`${productionUrl}\0${syntheticAnonKey}\0${maliciousUrl}`, encoding),
        );
        assert.throws(
          () =>
            verifyReleaseBundleEnvironment({
              platform: 'android',
              artifactPath: bundlePath,
              environment: validEnvironment,
              policy: syntheticPolicy,
            }),
          /obfuscated Supabase project URL|competing Supabase project URL/,
        );
      });
    }
  }
});

test('candidate-delimiter sweep is fail-closed and records WHATWG hostname behavior', () => {
  const approvedHostname = new URL(productionUrl).hostname;
  const parserChangingCodePoints = new Set([9, 10, 13, 34, 39, 96, 123, 125, 0xfeff]);
  const delimiterCodePoints = [9, 10, 13, 32, 34, 39, 60, 62, 92, 96, 123, 125, 0xfeff];

  for (const codePoint of delimiterCodePoints) {
    const delimiter = String.fromCodePoint(codePoint);
    const maliciousUrl = `${productionUrl}${delimiter}.evil.example`;
    let runtimeHostname = null;
    try {
      runtimeHostname = new URL(maliciousUrl).hostname;
    } catch {
      // A URL that currently throws is still rejected so a parser change cannot
      // silently turn this scanner delimiter into an accepted host suffix.
    }
    if (parserChangingCodePoints.has(codePoint)) {
      assert.notEqual(runtimeHostname, approvedHostname);
    }

    for (const encoding of ['utf8', 'utf16le']) {
      withFixture((directory) => {
        const bundlePath = join(directory, 'main.jsbundle');
        writeFileSync(
          bundlePath,
          Buffer.from(
            [
              JSON.stringify(productionUrl),
              JSON.stringify(syntheticAnonKey),
              JSON.stringify(maliciousUrl),
            ].join(';'),
            encoding,
          ),
        );
        assert.throws(
          () =>
            verifyReleaseBundleEnvironment({
              platform: 'ios',
              artifactPath: bundlePath,
              environment: validEnvironment,
              policy: syntheticPolicy,
            }),
          /obfuscated Supabase project URL|competing Supabase project URL/,
        );
      });
    }
  }
});

test('rejects quoted JavaScript control escapes, double encoding and line continuations', () => {
  const attacks = [
    String.raw`\t`,
    String.raw`\n`,
    String.raw`\r`,
    String.raw`\x09`,
    String.raw`\x0a`,
    String.raw`\x0d`,
    String.raw`\u0009`,
    String.raw`\u000a`,
    String.raw`\u000d`,
    String.raw`\uFEFF`,
    String.raw`\u{FEFF}`,
    String.raw`\\t`,
    String.raw`\\n`,
    String.raw`\\r`,
    String.raw`\\x0a`,
    String.raw`\\u000a`,
    String.raw`\\uFEFF`,
    String.raw`\\u{FEFF}`,
    '\\\n',
    '\\\r\n',
  ];

  for (const encoding of ['utf8', 'utf16le']) {
    for (const attack of attacks) {
      withFixture((directory) => {
        const bundlePath = join(directory, 'index.android.bundle');
        const source = [
          `const base = ${JSON.stringify(productionUrl)};`,
          `const key = ${JSON.stringify(syntheticAnonKey)};`,
          `const malicious = "${productionUrl}${attack}.evil.example";`,
        ].join('\n');
        writeFileSync(bundlePath, Buffer.from(source, encoding));
        assert.throws(
          () =>
            verifyReleaseBundleEnvironment({
              platform: 'android',
              artifactPath: bundlePath,
              environment: validEnvironment,
              policy: syntheticPolicy,
            }),
          /obfuscated Supabase project URL|competing Supabase project URL/,
        );
      });
    }
  }
});

test('rejects every C0/C1 control and ECMAScript Unicode whitespace in a quoted URL value', () => {
  const controls = [
    ...Array.from({ length: 0x21 }, (_, codePoint) => String.fromCodePoint(codePoint)),
    ...Array.from({ length: 0x21 }, (_, offset) => String.fromCodePoint(0x7f + offset)),
    ...[
      0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
      0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
    ].map((codePoint) => String.fromCodePoint(codePoint)),
  ];

  for (const control of controls) {
    withFixture((directory) => {
      const bundlePath = join(directory, 'main.jsbundle');
      const source = [
        JSON.stringify(productionUrl),
        JSON.stringify(syntheticAnonKey),
        JSON.stringify(`${productionUrl}${control}.evil.example`),
      ].join(';');
      writeFileSync(bundlePath, source);
      assert.throws(
        () =>
          verifyReleaseBundleEnvironment({
            platform: 'ios',
            artifactPath: bundlePath,
            environment: validEnvironment,
            policy: syntheticPolicy,
          }),
        /obfuscated Supabase project URL|competing Supabase project URL/,
        `Quoted control U+${control.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      );
    });
  }
});

test('real Hermes bytecode rejects URL suffixes hidden behind controls, BOM, or delimiters', () => {
  for (const control of [
    '\t',
    '\n',
    '\r',
    '\ufeff',
    String.raw`\uFEFF`,
    '"',
    "'",
    '`',
    '<',
    '>',
    '{',
    '}',
    '\\',
  ]) {
    withFixture((directory) => {
      const bundlePath = compileHermesFixture(directory, [
        productionUrl,
        syntheticAnonKey,
        `${productionUrl}${control}.evil.example`,
      ]);
      assert.throws(
        () =>
          verifyReleaseBundleEnvironment({
            platform: 'android',
            artifactPath: bundlePath,
            environment: validEnvironment,
            policy: syntheticPolicy,
          }),
        /obfuscated Supabase project URL|competing Supabase project URL/,
        `Hermes delimiter U+${control.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      );
    });
  }
});

test('Hermes UTF-16 string-table bytes reconstruct U+FEFF before URL validation', () =>
  withFixture((directory) => {
    const maliciousUrl = `${productionUrl}\ufeff.evil.example`;
    const bundlePath = compileHermesFixture(directory, [
      productionUrl,
      syntheticAnonKey,
      maliciousUrl,
    ]);

    assert.throws(
      () =>
        verifyReleaseBundleEnvironment({
          platform: 'android',
          artifactPath: bundlePath,
          environment: validEnvironment,
          policy: syntheticPolicy,
        }),
      /obfuscated or competing Supabase project URL/,
    );
  }));

test('allows approved-host endpoints but still requires the exact configured base literal', () => {
  withFixture((directory) => {
    const bundlePath = join(directory, 'index.android.bundle');
    writeFileSync(
      bundlePath,
      `${productionUrl}\0${productionUrl}/auth/v1/token?grant_type=password\0${syntheticAnonKey}`,
    );
    assert.doesNotThrow(() =>
      verifyReleaseBundleEnvironment({
        platform: 'android',
        artifactPath: bundlePath,
        environment: validEnvironment,
        policy: syntheticPolicy,
      }),
    );

    writeFileSync(bundlePath, `${productionUrl}/auth/v1/token\0${syntheticAnonKey}`);
    assert.throws(
      () =>
        verifyReleaseBundleEnvironment({
          platform: 'android',
          artifactPath: bundlePath,
          environment: validEnvironment,
          policy: syntheticPolicy,
        }),
      /configured production Supabase URL/,
    );
  });
});

test('extracts exact URL and key values from quoted JavaScript literals', () =>
  withFixture((directory) => {
    const bundlePath = join(directory, 'index.android.bundle');
    writeFileSync(
      bundlePath,
      `const endpoint = ${JSON.stringify(productionUrl)}; const publicKey = ${JSON.stringify(syntheticAnonKey)};`,
    );
    assert.doesNotThrow(() =>
      verifyReleaseBundleEnvironment({
        platform: 'android',
        artifactPath: bundlePath,
        environment: validEnvironment,
        policy: syntheticPolicy,
      }),
    );
  }));

test('rejects configured publishable and JWT keys when they are only prefixes of larger tokens', () => {
  const publishable = `sb_publishable_${'A'.repeat(32)}`;
  const publishableEnvironment = {
    ...validEnvironment,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: publishable,
  };
  for (const [configuredKey, environment, policy, suffix] of [
    [publishable, publishableEnvironment, policyFor(publishable), 'EVILSUFFIX'],
    [syntheticAnonKey, validEnvironment, syntheticPolicy, 'A'],
    [syntheticAnonKey, validEnvironment, syntheticPolicy, '_'],
  ]) {
    withFixture((directory) => {
      const bundlePath = join(directory, 'index.android.bundle');
      writeFileSync(bundlePath, `${productionUrl}\n${configuredKey}${suffix}`);
      assert.throws(
        () =>
          verifyReleaseBundleEnvironment({
            platform: 'android',
            artifactPath: bundlePath,
            environment,
            policy,
          }),
        /competing Supabase public key|configured Supabase anonymous key/,
      );
    });
  }
});

test('real Hermes bytecode independently rejects malicious URL and key strings', () => {
  const publishable = `sb_publishable_${'A'.repeat(32)}`;
  const publishableEnvironment = {
    ...validEnvironment,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: publishable,
  };
  for (const [strings, environment, policy, error] of [
    [
      [productionUrl, syntheticAnonKey, `${productionUrl}.evil.example`],
      validEnvironment,
      syntheticPolicy,
      /competing Supabase project URL/,
    ],
    [
      [productionUrl, `${syntheticAnonKey}A`],
      validEnvironment,
      syntheticPolicy,
      /competing Supabase public key/,
    ],
    [
      [productionUrl, `${publishable}EVILSUFFIX`],
      publishableEnvironment,
      policyFor(publishable),
      /competing Supabase public key/,
    ],
  ]) {
    withFixture((directory) => {
      const bundlePath = compileHermesFixture(directory, strings);
      assert.throws(
        () =>
          verifyReleaseBundleEnvironment({
            platform: 'android',
            artifactPath: bundlePath,
            environment,
            policy,
          }),
        error,
      );
    });
  }
});

test('allows only the deliberate invalid.supabase.co fallback beside production', () =>
  withFixture((directory) => {
    const bundlePath = join(directory, 'main.jsbundle');
    writeFileSync(bundlePath, `${productionUrl}\0https://invalid.supabase.co\0${syntheticAnonKey}`);
    assert.doesNotThrow(() =>
      verifyReleaseBundleEnvironment({
        platform: 'ios',
        artifactPath: bundlePath,
        environment: validEnvironment,
        policy: syntheticPolicy,
      }),
    );
  }));

test('real Hermes string-table boundaries do not become false URL or key suffixes', () =>
  withFixture((directory) => {
    const bundlePath = compileHermesFixture(directory, [
      productionUrl,
      'commitCallback',
      'https://invalid.supabase.co',
      'lon-list-separator',
      syntheticAnonKey,
      'nextHermesSymbol',
    ]);
    assert.doesNotThrow(() =>
      verifyReleaseBundleEnvironment({
        platform: 'android',
        artifactPath: bundlePath,
        environment: validEnvironment,
        policy: syntheticPolicy,
      }),
    );
  }));

test('a second pinned-shape Supabase anonymous key remains forbidden', () =>
  withFixture((directory) => {
    const bundlePath = join(directory, 'index.android.bundle');
    const competingKey = makeSyntheticAnonKey({}, 'Zz9_'.repeat(11).slice(0, 43));
    writeFileSync(bundlePath, `${productionUrl}\n${syntheticAnonKey}\n${competingKey}`);
    assert.throws(
      () =>
        verifyReleaseBundleEnvironment({
          platform: 'android',
          artifactPath: bundlePath,
          environment: validEnvironment,
          policy: syntheticPolicy,
        }),
      /competing Supabase public key/,
    );
  }));

test('raw bundles reject symlinks, directories, FIFOs, empty files and files over 64 MiB', () =>
  withFixture((directory) => {
    const validTarget = join(directory, 'valid-target');
    writeFileSync(validTarget, `${productionUrl}\n${syntheticAnonKey}`);

    const symlink = join(directory, 'main.jsbundle');
    symlinkSync(validTarget, symlink);
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: symlink }),
      /Symbolic-link artifacts/,
    );
    rmSync(symlink);

    mkdirSync(symlink);
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: symlink }),
      /bounded regular file/,
    );
    rmSync(symlink, { recursive: true });

    const fifo = spawnSync('/usr/bin/mkfifo', [symlink]);
    assert.equal(fifo.status, 0);
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: symlink }),
      /bounded regular file/,
    );
    rmSync(symlink);

    writeFileSync(symlink, '');
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: symlink }),
      /bounded regular file/,
    );

    const descriptor = openSync(symlink, 'w');
    ftruncateSync(descriptor, 64 * 1024 * 1024 + 1);
    closeSync(descriptor);
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: symlink }),
      /bounded regular file/,
    );
  }));

test('iOS .app bundles reject symlinks, directories, FIFOs, empty files and files over 64 MiB', () =>
  withFixture((directory) => {
    const appPath = join(directory, 'RumoPragasIA.app');
    const bundlePath = join(appPath, 'main.jsbundle');
    const target = join(directory, 'target-bundle');
    mkdirSync(appPath);
    writeFileSync(target, `${productionUrl}\n${syntheticAnonKey}`);

    symlinkSync(target, bundlePath);
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: appPath }),
      /bounded regular main.jsbundle/,
    );
    rmSync(bundlePath);

    mkdirSync(bundlePath);
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: appPath }),
      /bounded regular main.jsbundle/,
    );
    rmSync(bundlePath, { recursive: true });

    const fifo = spawnSync('/usr/bin/mkfifo', [bundlePath]);
    assert.equal(fifo.status, 0);
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: appPath }),
      /bounded regular main.jsbundle/,
    );
    rmSync(bundlePath);

    writeFileSync(bundlePath, '');
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: appPath }),
      /bounded regular main.jsbundle/,
    );
    const descriptor = openSync(bundlePath, 'w');
    ftruncateSync(descriptor, 64 * 1024 * 1024 + 1);
    closeSync(descriptor);
    assert.throws(
      () => readReleaseBundle({ platform: 'ios', artifactPath: appPath }),
      /bounded regular main.jsbundle/,
    );
  }));

test('CLI failure never prints configured values', () =>
  withFixture((directory) => {
    const bundlePath = join(directory, 'main.jsbundle');
    writeFileSync(bundlePath, 'bundle-without-production-environment');
    const scriptPath = fileURLToPath(new URL('./verify-release-bundle-env.mjs', import.meta.url));
    const result = spawnSync(
      process.execPath,
      [scriptPath, '--platform', 'ios', '--artifact', bundlePath],
      {
        encoding: 'utf8',
        env: { ...process.env, ...validEnvironment },
      },
    );
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.equal(output.includes(productionUrl), false);
    assert.equal(output.includes(syntheticAnonKey), false);
    assert.match(output, /approved production key fingerprint/);
  }));

test('production EAS wrapper verifies the finished artifact and quarantines failures', () => {
  const wrapper = readFileSync(new URL('./eas-local-production-build.sh', import.meta.url), 'utf8');

  assert.match(wrapper, /verify-release-bundle-env\.mjs/);
  assert.match(wrapper, /env:exec production "\$VERIFY_COMMAND" --non-interactive/);
  assert.match(wrapper, /<\/dev\/null >\/dev\/null 2>&1/);
  assert.match(wrapper, /REJECTED_PATH="\$\{ARTIFACT_PATH\}\.rejected"/);
  assert.match(wrapper, /mv "\$ARTIFACT_PATH" "\$REJECTED_PATH"/);
  assert.doesNotMatch(wrapper, /echo.*EXPO_PUBLIC_SUPABASE_ANON_KEY/);
});

test('all external artifact inspection subprocesses have a fail-closed timeout', () => {
  const verifier = readFileSync(
    new URL('./verify-release-bundle-env.mjs', import.meta.url),
    'utf8',
  );
  assert.match(verifier, /const ARTIFACT_INSPECTION_TIMEOUT_MS = 60_000;/);
  assert.equal((verifier.match(/timeout: ARTIFACT_INSPECTION_TIMEOUT_MS/g) ?? []).length, 3);
});

test('release environment suite is wired into package scripts and both CI workflows', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts['test:release-bundle-env'],
    'node --test scripts/test-release-bundle-env.mjs',
  );
  for (const workflow of ['ci.yml', 'pr-check.yml']) {
    const source = readFileSync(
      new URL(`../../.github/workflows/${workflow}`, import.meta.url),
      'utf8',
    );
    assert.match(source, /run: npm run test:release-bundle-env/);
  }
});

test('production EAS profile pins the SDK 55 toolchain and never defines an empty public Sentry DSN', () => {
  const easConfig = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  const production = easConfig.build?.production ?? {};
  const productionEnvironment = easConfig.build?.production?.env ?? {};
  assert.equal(production.node, '22.22.3');
  assert.equal(production.ios?.image, 'macos-sequoia-15.6-xcode-26.2');
  assert.equal(production.android?.image, 'ubuntu-24.04-jdk-17-ndk-r27b-sdk-55');
  assert.notEqual(production.ios?.image, 'latest');
  assert.notEqual(production.android?.image, 'latest');
  assert.equal(Object.hasOwn(productionEnvironment, 'EXPO_PUBLIC_SENTRY_DSN'), false);
  assert.equal(productionEnvironment.NODE_ENV, 'production');
});

test('production EAS wrapper quarantines a partial artifact when the build executor fails', () =>
  withBuildWrapperFixture(({ appRoot, scripts, wrapper }) => {
    writeFileSync(
      join(scripts, 'eas-pinned.sh'),
      `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == build ]]
shift
output=""
while (($# > 0)); do
  if [[ "$1" == --output && $# -ge 2 ]]; then
    output="$2"
    shift 2
  else
    shift
  fi
done
[[ -n "$output" ]]
printf 'partial-build-output' > "$output"
exit 17
`,
      { mode: 0o755 },
    );

    const result = spawnSync('bash', [wrapper, '--platform', 'android'], {
      cwd: appRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 17, `${result.stdout}${result.stderr}`);
    const artifacts = readdirSync(join(appRoot, '.artifacts'));
    assert.equal(artifacts.filter((name) => name.endsWith('.aab')).length, 0);
    const rejected = artifacts.filter((name) => name.endsWith('.aab.rejected'));
    assert.equal(rejected.length, 1);
    assert.equal(
      readFileSync(join(appRoot, '.artifacts', rejected[0]), 'utf8'),
      'partial-build-output',
    );
  }));

test('production EAS wrapper quarantines the artifact when bundle verification fails', () =>
  withBuildWrapperFixture(({ appRoot, scripts, wrapper }) => {
    writeFileSync(
      join(scripts, 'eas-pinned.sh'),
      `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  build)
    shift
    output=""
    while (($# > 0)); do
      if [[ "$1" == --output && $# -ge 2 ]]; then
        output="$2"
        shift 2
      else
        shift
      fi
    done
    [[ -n "$output" ]]
    printf 'finished-but-invalid-build' > "$output"
    ;;
  env:exec)
    exit 23
    ;;
  *)
    exit 99
    ;;
esac
`,
      { mode: 0o755 },
    );

    const result = spawnSync('bash', [wrapper, '--platform', 'android'], {
      cwd: appRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
    const artifacts = readdirSync(join(appRoot, '.artifacts'));
    assert.equal(artifacts.filter((name) => name.endsWith('.aab')).length, 0);
    assert.equal(artifacts.filter((name) => name.endsWith('.aab.rejected')).length, 1);
  }));

test('release simulator build can isolate Metro from the machine-wide Watchman daemon', () => {
  const script = `
    process.env.RUMO_RELEASE_DISABLE_WATCHMAN = '1';
    const config = require('./metro.config.js');
    if (config.resolver.useWatchman !== false) process.exit(1);
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: new URL('../', import.meta.url),
    stdio: 'ignore',
  });

  assert.equal(result.status, 0);
});

test('release modules are import-safe when Node uses stdin as argv[1]', () => {
  const input = `
    await import('./scripts/verify-release-bundle-env.mjs');
    await import('./scripts/build-ios-release-simulator.mjs');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    input,
  });

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
