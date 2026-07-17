#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

export const NATIVE_SIGNING_POLICY = Object.freeze({
  appVersion: '1.0.11',
  bundleIdentifier: 'com.agrorumo.rumopragas',
  teamId: '5YW9UY5LXP',
  ios: Object.freeze({
    certificateSha1: '283C8FEEF7676CFA28D890B5DD5B353CC8649662',
    keychainPath: '/Users/manoelnascimento/Library/Keychains/login.keychain-db',
    latestStoreBuildNumber: 63,
    profileRelativePath: 'credentials/rumo-pragas-app-store-20260716.mobileprovision',
    profileSha256: '61c019cac8aad6244c35f4527d1fc533791707f6ddc7665fe36e1274c4dc1837',
    profileUuid: 'e125e54a-b334-4823-a761-0da43861fe7e',
  }),
  android: Object.freeze({
    certificateSha1: 'C5D7D8AB96AF704D407714CC4B93825DA306BBFF',
    certificateSha256: '0A2C41DD9B7606FFC88D5CAC3214C587F97E5F28C398D70F3B904E51558018B8',
    keyAlias: 'e46d2e3eaa2bef01d4ef8ce3a9b79765',
    keyAliasAccount: 'upload-key-alias-4d6573a6',
    keyPasswordAccount: 'upload-key-password-4d6573a6',
    keychainPath: '/Users/manoelnascimento/Library/Keychains/login.keychain-db',
    keychainService: 'agrorumo-rumo-pragas-android-signing',
    keystorePasswordAccount: 'upload-keystore-password-4d6573a6',
    keystoreRelativePath: 'credentials/rumo-pragas-upload-20260716.jks',
    keystoreSha256: '2c6eb6aa795f8d9344393cf8e24b42efc6c8308425cf3973702a5648dceeeda3',
    latestStoreVersionCode: 54,
  }),
  firebase: Object.freeze({
    appId: '1:599510455577:android:e80fa19b86b10e36cb6188',
    configurationPath:
      '/Volumes/RumoPragasProdBackup/credentials/firebase/google-services-rumo-pragas.json',
    configurationSha256: '74f588319d25dfaf509d1a5b07c61fe1134e0d81add44d8cffc06df5a8b93e5a',
    packageName: 'com.agrorumo.rumopragas',
    projectId: 'agrorumo',
    projectNumber: '599510455577',
  }),
  googleOAuth: Object.freeze({
    androidClientId: '659275180000-ia63f1ljuvauje1nhr80d7sb2ckpdoek.apps.googleusercontent.com',
    androidLocalQaClientId:
      '659275180000-ssutfrel9qaa2eekh7l9kgnna84i3u1s.apps.googleusercontent.com',
    androidPackageName: 'com.agrorumo.rumopragas',
    androidPlaySigningSha1: 'E2D4501C6BC8C25B7BE326F75A26710FEDC0DEE5',
    androidUploadSigningSha1: 'C5D7D8AB96AF704D407714CC4B93825DA306BBFF',
    iosAppStoreId: '6762232682',
    iosBundleIdentifier: 'com.agrorumo.rumopragas',
    rejectedGenericClientId:
      '659275180000-ml49nmjebmc6m4a1e75a5e7merpcsghv.apps.googleusercontent.com',
    iosClientId: '659275180000-ahqeg21li7m32ul5mkno3n5ubpov98cv.apps.googleusercontent.com',
    iosTeamId: '5YW9UY5LXP',
    projectNumber: '659275180000',
    webClientId: '659275180000-ikts8m3ofk9poejbkps5o01vfnedg1b4.apps.googleusercontent.com',
  }),
  toolchain: Object.freeze({
    android: Object.freeze({
      aapt2Path: '/Users/manoelnascimento/Library/Android/sdk/build-tools/36.0.0/aapt2',
      aapt2Sha256: 'a8844d4089b442b034aed8953deee1893253053c900e03141ae7173e3edd8157',
      androidJarPath:
        '/Users/manoelnascimento/Library/Android/sdk/platforms/android-36/android.jar',
      androidJarSha256: 'd9eb9da824d9e247a352f570f01e1169e725b2954bca9e283a71786c59b59f9a',
      buildToolsVersion: '36.0.0',
      commandLineToolsSourcePath:
        '/Users/manoelnascimento/Library/Android/sdk/cmdline-tools/latest/source.properties',
      commandLineToolsSourceSha256:
        '215e11e90893196549e86dfd6a024f20848322dc7a3d694bc4847b8e6d849ad1',
      commandLineToolsVersion: '20.0',
      compileSdkVersion: 36,
      gradleDistributionSha256: '8fad3d78296ca518113f3d29016617c7f9367dc005f932bd9d93bf45ba46072b',
      gradleVersion: '9.0.0',
      gradleWrapperJarSha256: '76805e32c009c0cf0dd5d206bddc9fb22ea42e84db904b764f3047de095493f3',
      ndkSourcePath:
        '/Users/manoelnascimento/Library/Android/sdk/ndk/27.1.12297006/source.properties',
      ndkSourceSha256: 'e9b907b9c90bc2f0aaa87049580cc0c3ee0bb6aff50b58e4d1a8876ba3aeb026',
      ndkVersion: '27.1.12297006',
      sdkManagerPath:
        '/Users/manoelnascimento/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager',
      sdkManagerSha256: '6decd5850a052dbba93ae735cef7aa839328bbf26a2a29bfa9dbf95e74a3f81f',
    }),
    bundletool: Object.freeze({
      jarPath: '/opt/homebrew/Cellar/bundletool/1.18.3/libexec/bundletool-all.jar',
      sha256: 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29',
      version: '1.18.3',
    }),
    fnm: Object.freeze({
      path: '/opt/homebrew/Cellar/fnm/1.39.0/bin/fnm',
      sha256: 'dee5acc82725a109d74989219b9adf2ec22f7bd58e8cf043b043a127ffe2c9b3',
      version: '1.39.0',
    }),
    java: Object.freeze({
      home: '/opt/homebrew/Cellar/openjdk@21/21.0.11/libexec/openjdk.jdk/Contents/Home',
      jarsignerPath:
        '/opt/homebrew/Cellar/openjdk@21/21.0.11/libexec/openjdk.jdk/Contents/Home/bin/jarsigner',
      jarsignerSha256: '87877295e690ee8b09ae9398cf572f4a357b2ac90a32b3875faee4f39663eec6',
      keytoolPath:
        '/opt/homebrew/Cellar/openjdk@21/21.0.11/libexec/openjdk.jdk/Contents/Home/bin/keytool',
      keytoolSha256: '1ee2f76502dea0fbfcdf4a2b18526904228281e6b88933db2f09685e8e3621c5',
      path: '/opt/homebrew/Cellar/openjdk@21/21.0.11/libexec/openjdk.jdk/Contents/Home/bin/java',
      sha256: '04005388bac0c272ea914210ca519ce94b2f873ea3962b9874a6859f74d7f279',
      version: '21.0.11',
    }),
    node: Object.freeze({
      npmCliPath:
        '/Users/manoelnascimento/.local/share/fnm/node-versions/v22.22.3/installation/lib/node_modules/npm/bin/npm-cli.js',
      npmCliSha256: '8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7',
      npmVersion: '10.9.8',
      path: '/Users/manoelnascimento/.local/share/fnm/node-versions/v22.22.3/installation/bin/node',
      sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c',
      version: '22.22.3',
    }),
    pod: Object.freeze({
      path: '/Users/manoelnascimento/.rbenv/versions/3.2.2/bin/pod',
      podfileLockSha256: 'cbef4387509a90de703c1c4764e99cde69239118e541501bf53b1fbe28cab327',
      sha256: '8535e6d9fa8d16c82ed1f8733ec8c7c9bb87fbdfb009a32d109a07e660d583bb',
      version: '1.16.2',
    }),
    xcode: Object.freeze({
      buildVersion: '17C52',
      developerDirectory: '/Applications/Xcode.app/Contents/Developer',
      executablePath: '/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild',
      executableSha256: 'd8601086e5c80e9f46664d884ce1f661f8b6fbdf5523b24050bbae792dc15d82',
      sdkVersion: '26.2',
      version: '26.2',
    }),
  }),
});

const BUILD_VERSION_EPOCH_SECONDS = 1_577_836_800;
const MAX_ANDROID_VERSION_CODE = 2_100_000_000;
const MAX_SIGNING_FILE_BYTES = 1024 * 1024;
const FILE_COPY_BUFFER_BYTES = 1024 * 1024;
const MAX_ZIP_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 100_000;
const MAX_ZIP_NAME_BYTES = 4096;
const ZIP_EOCD_MAX_BYTES = 65_557;

const fail = (message) => {
  const error = new Error(message);
  error.name = 'NativeSigningPolicyError';
  throw error;
};

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const hashDescriptor = (descriptor, size) => {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(Math.min(FILE_COPY_BUFFER_BYTES, Math.max(size, 1)));
  let offset = 0;
  while (offset < size) {
    const bytesRead = readSync(
      descriptor,
      buffer,
      0,
      Math.min(buffer.length, size - offset),
      offset,
    );
    if (bytesRead <= 0) fail('Arquivo estável terminou antes do tamanho atestado.');
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  if (readSync(descriptor, buffer, 0, 1, offset) !== 0) {
    fail('Arquivo estável cresceu durante a leitura.');
  }
  return hash.digest('hex');
};

/** Mantém o inode atestado aberto para inspeção, ferramentas-filhas e cópia final. */
export const openStableArtifact = ({ filePath, label, maximumBytes = 2_100_000_000 }) => {
  const absolutePath = resolve(filePath);
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  let initial;
  try {
    initial = lstatSync(absolutePath);
  } catch {
    fail(`${label}: artefato ausente.`);
  }
  if (
    !initial.isFile() ||
    initial.isSymbolicLink() ||
    initial.nlink !== 1 ||
    initial.size <= 0 ||
    initial.size > maximumBytes ||
    (expectedUid !== undefined && initial.uid !== expectedUid)
  ) {
    fail(`${label}: artefato precisa ser regular, único e limitado.`);
  }

  let descriptor;
  try {
    descriptor = openSync(
      absolutePath,
      fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.dev !== initial.dev ||
      opened.ino !== initial.ino ||
      opened.nlink !== 1 ||
      opened.size !== initial.size
    ) {
      fail(`${label}: inode mudou durante a abertura.`);
    }
    const approvedHash = hashDescriptor(descriptor, opened.size);

    const readRange = (offset, length) => {
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset + length > opened.size
      ) {
        fail(`${label}: faixa de leitura fora do inode atestado.`);
      }
      const current = fstatSync(descriptor);
      if (
        !current.isFile() ||
        current.dev !== opened.dev ||
        current.ino !== opened.ino ||
        current.nlink !== 1 ||
        current.size !== opened.size ||
        current.mtimeMs !== opened.mtimeMs
      ) {
        fail(`${label}: inode mudou durante a leitura estruturada.`);
      }
      const value = Buffer.allocUnsafe(length);
      let cursor = 0;
      while (cursor < length) {
        const bytesRead = readSync(descriptor, value, cursor, length - cursor, offset + cursor);
        if (bytesRead <= 0) fail(`${label}: faixa estruturada foi truncada.`);
        cursor += bytesRead;
      }
      return value;
    };

    const assertUnchanged = ({ rehash = false } = {}) => {
      let pathname;
      try {
        pathname = lstatSync(absolutePath);
      } catch {
        fail(`${label}: pathname desapareceu durante a atestação.`);
      }
      const current = fstatSync(descriptor);
      if (
        !pathname.isFile() ||
        pathname.isSymbolicLink() ||
        pathname.dev !== opened.dev ||
        pathname.ino !== opened.ino ||
        pathname.nlink !== 1 ||
        pathname.size !== opened.size ||
        pathname.mtimeMs !== opened.mtimeMs ||
        current.dev !== opened.dev ||
        current.ino !== opened.ino ||
        current.nlink !== 1 ||
        current.size !== opened.size ||
        current.mtimeMs !== opened.mtimeMs
      ) {
        fail(`${label}: inode/pathname mudou durante a atestação.`);
      }
      if (rehash && hashDescriptor(descriptor, opened.size) !== approvedHash) {
        fail(`${label}: bytes mudaram durante a atestação.`);
      }
    };

    const copyTo = (destinationPath) => {
      assertUnchanged({ rehash: true });
      let destination;
      try {
        destination = openSync(
          destinationPath,
          fsConstants.O_WRONLY |
            fsConstants.O_CREAT |
            fsConstants.O_EXCL |
            (fsConstants.O_NOFOLLOW ?? 0),
          0o600,
        );
        const buffer = Buffer.allocUnsafe(Math.min(FILE_COPY_BUFFER_BYTES, opened.size));
        const copiedHash = createHash('sha256');
        let offset = 0;
        while (offset < opened.size) {
          const bytesRead = readSync(
            descriptor,
            buffer,
            0,
            Math.min(buffer.length, opened.size - offset),
            offset,
          );
          if (bytesRead <= 0) fail(`${label}: cópia final foi truncada.`);
          let written = 0;
          while (written < bytesRead) {
            const bytesWritten = writeSync(
              destination,
              buffer,
              written,
              bytesRead - written,
              offset + written,
            );
            if (bytesWritten <= 0) fail(`${label}: destino final recusou a escrita.`);
            written += bytesWritten;
          }
          copiedHash.update(buffer.subarray(0, bytesRead));
          offset += bytesRead;
        }
        fchmodSync(destination, 0o600);
        fsyncSync(destination);
        const destinationMetadata = fstatSync(destination);
        const destinationPathMetadata = lstatSync(destinationPath);
        if (
          !destinationMetadata.isFile() ||
          destinationMetadata.nlink !== 1 ||
          destinationMetadata.size !== opened.size ||
          (destinationMetadata.mode & 0o077) !== 0 ||
          !destinationPathMetadata.isFile() ||
          destinationPathMetadata.isSymbolicLink() ||
          destinationPathMetadata.dev !== destinationMetadata.dev ||
          destinationPathMetadata.ino !== destinationMetadata.ino ||
          destinationPathMetadata.nlink !== 1 ||
          destinationPathMetadata.size !== opened.size ||
          copiedHash.digest('hex') !== approvedHash
        ) {
          fail(`${label}: destino final divergiu do inode atestado.`);
        }
        assertUnchanged({ rehash: true });
      } catch (error) {
        try {
          unlinkSync(destinationPath);
        } catch {
          // O destino pode não ter sido criado.
        }
        throw error;
      } finally {
        if (destination !== undefined) closeSync(destination);
      }
      return Object.freeze({ sha256: approvedHash, size: opened.size });
    };

    return Object.freeze({
      assertUnchanged,
      childDescriptor: descriptor,
      close: () => closeSync(descriptor),
      copyTo,
      dev: opened.dev,
      ino: opened.ino,
      path: absolutePath,
      readRange,
      sha256: approvedHash,
      size: opened.size,
    });
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    throw error;
  }
};

const readZipExtraFields = (extra, label) => {
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) fail(`${label}: campo extra ZIP truncado.`);
    const identifier = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + size > extra.length) fail(`${label}: campo extra ZIP fora dos limites.`);
    if (identifier === 0x0001) fail(`${label}: ZIP64 não é aceito.`);
    cursor += size;
  }
};

const decodeCanonicalZipName = ({ flags, nameBytes }) => {
  if (nameBytes.length === 0 || nameBytes.length > MAX_ZIP_NAME_BYTES) {
    fail('ZIP contém nome vazio ou excessivo.');
  }
  let name;
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
  } catch {
    fail('ZIP contém nome que não é UTF-8 canônico.');
  }
  if (!Buffer.from(name, 'utf8').equals(nameBytes) || name.normalize('NFC') !== name) {
    fail('ZIP contém nome que não é UTF-8 canônico.');
  }
  if ([...nameBytes].some((value) => value >= 0x80) && (flags & 0x0800) === 0) {
    fail('ZIP contém nome UTF-8 sem a flag canônica.');
  }
  const segments = name.split('/');
  const directory = name.endsWith('/');
  const pathSegments = directory ? segments.slice(0, -1) : segments;
  if (
    name.startsWith('/') ||
    name.includes('\\') ||
    /[\x00-\x1f\x7f\s]/u.test(name) ||
    pathSegments.length === 0 ||
    pathSegments.some((segment) => !segment || segment === '.' || segment === '..') ||
    (directory && segments.at(-1) !== '')
  ) {
    fail('ZIP contém caminho não canônico ou inseguro.');
  }
  return Object.freeze({ directory, name });
};

/**
 * Lê somente o descritor já atestado e valida a estrutura ZIP que jarsigner não protege:
 * nomes, offsets, tipos Unix e a relação exata entre headers locais, central directory e EOCD.
 */
export const parseCanonicalZipCentralDirectory = ({ fileSize, readRange }) => {
  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize < 22 ||
    fileSize > 2_100_000_000 ||
    typeof readRange !== 'function'
  ) {
    fail('ZIP não possui tamanho ou leitor atestado válido.');
  }
  const readExact = (offset, length) => {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset + length > fileSize
    ) {
      fail('ZIP solicitou faixa fora do artefato atestado.');
    }
    const value = readRange(offset, length);
    if (!Buffer.isBuffer(value) || value.length !== length) {
      fail('ZIP recebeu uma faixa truncada do artefato atestado.');
    }
    return value;
  };

  const tailSize = Math.min(fileSize, ZIP_EOCD_MAX_BYTES);
  const tailOffset = fileSize - tailSize;
  const tail = readExact(tailOffset, tailSize);
  const eocdOffsets = [];
  for (let index = 0; index <= tail.length - 4; index += 1) {
    const signature = tail.readUInt32LE(index);
    if (signature === 0x06054b50) eocdOffsets.push(index);
    if (signature === 0x06064b50 || signature === 0x07064b50) {
      fail('ZIP64 não é aceito.');
    }
  }
  if (eocdOffsets.length !== 1 || eocdOffsets[0] !== tail.length - 22) {
    fail('ZIP precisa conter um EOCD único, final e sem comentário.');
  }
  const eocd = tail.subarray(eocdOffsets[0]);
  const diskNumber = eocd.readUInt16LE(4);
  const centralDisk = eocd.readUInt16LE(6);
  const diskEntryCount = eocd.readUInt16LE(8);
  const entryCount = eocd.readUInt16LE(10);
  const centralSize = eocd.readUInt32LE(12);
  const centralOffset = eocd.readUInt32LE(16);
  const commentLength = eocd.readUInt16LE(20);
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    diskEntryCount !== entryCount ||
    entryCount < 1 ||
    entryCount > MAX_ZIP_ENTRIES ||
    entryCount === 0xffff ||
    centralSize < 46 ||
    centralSize > MAX_ZIP_CENTRAL_DIRECTORY_BYTES ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    commentLength !== 0 ||
    centralOffset + centralSize !== fileSize - 22
  ) {
    fail('ZIP possui EOCD, discos, contagem ou limites não canônicos.');
  }

  const central = readExact(centralOffset, centralSize);
  const records = [];
  const names = new Set();
  const foldedNames = new Set();
  let cursor = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== 0x02014b50) {
      fail('ZIP contém central directory truncado ou divergente.');
    }
    const versionMadeBy = central.readUInt16LE(cursor + 4);
    const flags = central.readUInt16LE(cursor + 8);
    const method = central.readUInt16LE(cursor + 10);
    const crc32 = central.readUInt32LE(cursor + 16);
    const compressedSize = central.readUInt32LE(cursor + 20);
    const uncompressedSize = central.readUInt32LE(cursor + 24);
    const nameLength = central.readUInt16LE(cursor + 28);
    const extraLength = central.readUInt16LE(cursor + 30);
    const entryCommentLength = central.readUInt16LE(cursor + 32);
    const diskStart = central.readUInt16LE(cursor + 34);
    const internalAttributes = central.readUInt16LE(cursor + 36);
    const externalAttributes = central.readUInt32LE(cursor + 38);
    const localOffset = central.readUInt32LE(cursor + 42);
    const recordEnd = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (
      versionMadeBy >>> 8 !== 3 ||
      (flags & ~0x0800) !== 0 ||
      ![0, 8].includes(method) ||
      [compressedSize, uncompressedSize, localOffset].includes(0xffffffff) ||
      entryCommentLength !== 0 ||
      diskStart !== 0 ||
      internalAttributes !== 0 ||
      recordEnd > central.length
    ) {
      fail('ZIP contém header central não canônico.');
    }
    const nameBytes = central.subarray(cursor + 46, cursor + 46 + nameLength);
    const extra = central.subarray(
      cursor + 46 + nameLength,
      cursor + 46 + nameLength + extraLength,
    );
    readZipExtraFields(extra, 'Central directory');
    const { directory, name } = decodeCanonicalZipName({ flags, nameBytes });
    const expectedUnixMode = directory ? 0o040755 : 0o100644;
    const expectedDosAttributes = directory ? 0x10 : 0;
    if (
      externalAttributes >>> 16 !== expectedUnixMode ||
      (externalAttributes & 0xffff) !== expectedDosAttributes ||
      (directory && (compressedSize !== 0 || uncompressedSize !== 0 || method !== 0))
    ) {
      fail('ZIP contém symlink, tipo especial, permissão ou tipo de entrada divergente.');
    }
    const foldedName = name.toLocaleLowerCase('en-US');
    if (names.has(name) || foldedNames.has(foldedName)) {
      fail('ZIP contém nome duplicado ou colisão por caixa.');
    }
    names.add(name);
    foldedNames.add(foldedName);
    records.push({
      compressedSize,
      crc32,
      directory,
      flags,
      localOffset,
      method,
      name,
      nameBytes: Buffer.from(nameBytes),
      uncompressedSize,
    });
    cursor = recordEnd;
  }
  if (cursor !== central.length || records.length !== entryCount) {
    fail('ZIP contém bytes ou contagem excedentes no central directory.');
  }

  const ranges = [];
  for (const record of records) {
    if (record.localOffset + 30 > centralOffset) {
      fail('ZIP contém offset local fora do corpo do arquivo.');
    }
    const local = readExact(record.localOffset, 30);
    if (local.readUInt32LE(0) !== 0x04034b50) fail('ZIP contém header local divergente.');
    const flags = local.readUInt16LE(6);
    const method = local.readUInt16LE(8);
    const crc32 = local.readUInt32LE(14);
    const compressedSize = local.readUInt32LE(18);
    const uncompressedSize = local.readUInt32LE(22);
    const nameLength = local.readUInt16LE(26);
    const extraLength = local.readUInt16LE(28);
    const headerEnd = record.localOffset + 30 + nameLength + extraLength;
    const dataEnd = headerEnd + record.compressedSize;
    if (
      flags !== record.flags ||
      method !== record.method ||
      crc32 !== record.crc32 ||
      compressedSize !== record.compressedSize ||
      uncompressedSize !== record.uncompressedSize ||
      nameLength !== record.nameBytes.length ||
      headerEnd > centralOffset ||
      dataEnd > centralOffset
    ) {
      fail('ZIP contém header local, tamanho ou faixa divergente.');
    }
    const localVariable = readExact(record.localOffset + 30, nameLength + extraLength);
    if (!localVariable.subarray(0, nameLength).equals(record.nameBytes)) {
      fail('ZIP contém nome local divergente do central directory.');
    }
    readZipExtraFields(localVariable.subarray(nameLength), 'Header local');
    ranges.push({ end: dataEnd, offset: record.localOffset });
  }
  ranges.sort((left, right) => left.offset - right.offset);
  let expectedOffset = 0;
  for (const range of ranges) {
    if (range.offset !== expectedOffset || range.end <= range.offset) {
      fail('ZIP contém sobreposição, lacuna ou ordem local não canônica.');
    }
    expectedOffset = range.end;
  }
  if (expectedOffset !== centralOffset) {
    fail('ZIP contém bytes não explicados antes do central directory.');
  }

  return Object.freeze({
    centralOffset,
    centralSize,
    entries: Object.freeze(records.map(({ name }) => name)),
    entryCount,
  });
};

export const normalizeFingerprint = (value) =>
  String(value ?? '')
    .replaceAll(':', '')
    .trim()
    .toUpperCase();

export const deriveNativeBuildVersion = (commitTimestampSeconds) => {
  if (!Number.isSafeInteger(commitTimestampSeconds)) {
    fail('O timestamp do commit candidato é inválido.');
  }
  const buildVersion = commitTimestampSeconds - BUILD_VERSION_EPOCH_SECONDS;
  if (buildVersion <= 0 || buildVersion > MAX_ANDROID_VERSION_CODE) {
    fail('O timestamp do commit não gera uma versão nativa aprovada.');
  }
  return String(buildVersion);
};

export const validateNativeBuildVersion = ({
  buildVersion,
  platform,
  policy = NATIVE_SIGNING_POLICY,
}) => {
  if (!/^[1-9]\d{0,9}$/.test(String(buildVersion))) {
    fail('A versão nativa candidata não é um inteiro canônico positivo.');
  }
  const numericVersion = Number(buildVersion);
  if (!Number.isSafeInteger(numericVersion) || numericVersion > MAX_ANDROID_VERSION_CODE) {
    fail('A versão nativa candidata excede o limite aprovado.');
  }
  const latestStoreVersion =
    platform === 'ios'
      ? policy.ios.latestStoreBuildNumber
      : platform === 'android'
        ? policy.android.latestStoreVersionCode
        : undefined;
  if (!Number.isSafeInteger(latestStoreVersion) || latestStoreVersion < 1) {
    fail('A plataforma ou o baseline remoto da loja é inválido.');
  }
  if (numericVersion <= latestStoreVersion) {
    fail(
      platform === 'ios'
        ? `O build number iOS precisa ser maior que ${latestStoreVersion}.`
        : `O versionCode Android precisa ser maior que ${latestStoreVersion}.`,
    );
  }
  return String(numericVersion);
};

export const readApprovedSigningFile = ({
  filePath,
  expectedSha256,
  label,
  maximumBytes = MAX_SIGNING_FILE_BYTES,
}) => {
  const absolutePath = resolve(filePath);
  const parentPath = dirname(absolutePath);
  let parentMetadata;
  let initialMetadata;
  try {
    if (realpathSync(parentPath) !== parentPath)
      fail(`${label}: diretório ancestral não aprovado.`);
    parentMetadata = lstatSync(parentPath);
    initialMetadata = lstatSync(absolutePath);
  } catch (error) {
    if (error?.name === 'NativeSigningPolicyError') throw error;
    fail(`${label}: arquivo aprovado ausente.`);
  }

  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (
    !parentMetadata.isDirectory() ||
    parentMetadata.isSymbolicLink() ||
    (parentMetadata.mode & 0o022) !== 0 ||
    (expectedUid !== undefined && parentMetadata.uid !== expectedUid)
  ) {
    fail(`${label}: diretório de credenciais inseguro.`);
  }
  if (
    !initialMetadata.isFile() ||
    initialMetadata.isSymbolicLink() ||
    initialMetadata.nlink !== 1 ||
    (initialMetadata.mode & 0o077) !== 0 ||
    initialMetadata.size <= 0 ||
    initialMetadata.size > maximumBytes ||
    (expectedUid !== undefined && initialMetadata.uid !== expectedUid)
  ) {
    fail(`${label}: arquivo deve ser privado, regular e sem hardlinks.`);
  }

  let descriptor;
  try {
    descriptor = openSync(
      absolutePath,
      fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const openedMetadata = fstatSync(descriptor);
    if (
      !openedMetadata.isFile() ||
      openedMetadata.dev !== initialMetadata.dev ||
      openedMetadata.ino !== initialMetadata.ino ||
      openedMetadata.nlink !== 1 ||
      openedMetadata.size !== initialMetadata.size
    ) {
      fail(`${label}: arquivo mudou durante a abertura.`);
    }

    const contents = Buffer.allocUnsafe(openedMetadata.size);
    let offset = 0;
    while (offset < contents.length) {
      const bytesRead = readSync(descriptor, contents, offset, contents.length - offset, offset);
      if (bytesRead === 0) fail(`${label}: leitura incompleta.`);
      offset += bytesRead;
    }
    if (readSync(descriptor, Buffer.allocUnsafe(1), 0, 1, offset) !== 0) {
      fail(`${label}: arquivo cresceu durante a leitura.`);
    }
    const finalMetadata = fstatSync(descriptor);
    if (
      finalMetadata.dev !== openedMetadata.dev ||
      finalMetadata.ino !== openedMetadata.ino ||
      finalMetadata.nlink !== 1 ||
      finalMetadata.size !== openedMetadata.size ||
      finalMetadata.mtimeMs !== openedMetadata.mtimeMs
    ) {
      fail(`${label}: arquivo mudou durante a leitura.`);
    }
    if (sha256(contents) !== expectedSha256) fail(`${label}: hash SHA-256 não aprovado.`);
    return contents;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

export const validateIosProvisioningProfile = (
  profile,
  policy = NATIVE_SIGNING_POLICY,
  now = new Date(),
) => {
  const entitlements = profile?.Entitlements ?? {};
  const teamIdentifiers = profile?.TeamIdentifier;
  const developerCertificates = profile?.DeveloperCertificates;
  const certificateFingerprints = Array.isArray(developerCertificates)
    ? developerCertificates.map((certificate) =>
        createHash('sha1').update(Buffer.from(certificate, 'base64')).digest('hex').toUpperCase(),
      )
    : [];
  const expiration = new Date(profile?.ExpirationDate ?? Number.NaN);

  if (profile?.UUID !== policy.ios.profileUuid) fail('Provisioning profile UUID divergente.');
  if (!Array.isArray(teamIdentifiers) || !teamIdentifiers.includes(policy.teamId)) {
    fail('Provisioning profile pertence a outro time Apple.');
  }
  if (entitlements['application-identifier'] !== `${policy.teamId}.${policy.bundleIdentifier}`) {
    fail('Provisioning profile pertence a outro bundle identifier.');
  }
  if (entitlements['com.apple.developer.team-identifier'] !== policy.teamId) {
    fail('Provisioning profile não fixa o time nos entitlements.');
  }
  if (
    entitlements['get-task-allow'] !== false ||
    entitlements['aps-environment'] !== 'production'
  ) {
    fail('Provisioning profile não é uma distribuição de produção.');
  }
  if (profile?.ProvisionsAllDevices || profile?.ProvisionedDevices !== undefined) {
    fail('Provisioning profile não é do tipo App Store Connect.');
  }
  if (!Number.isFinite(expiration.getTime()) || expiration <= now) {
    fail('Provisioning profile expirado ou inválido.');
  }
  if (!certificateFingerprints.includes(policy.ios.certificateSha1)) {
    fail('Provisioning profile não contém o certificado Apple aprovado.');
  }
  return Object.freeze({ expiration, certificateFingerprints });
};

export const validateIosArtifactMetadata = ({
  infoPlist,
  codesignDisplay,
  embeddedProfileSha256,
  signingCertificateSha1,
  buildVersion,
  policy = NATIVE_SIGNING_POLICY,
}) => {
  validateNativeBuildVersion({ buildVersion, platform: 'ios', policy });
  if (infoPlist?.CFBundleIdentifier !== policy.bundleIdentifier) fail('IPA com bundle divergente.');
  if (infoPlist?.CFBundleShortVersionString !== policy.appVersion) {
    fail('IPA com versão pública divergente.');
  }
  if (String(infoPlist?.CFBundleVersion ?? '') !== buildVersion) {
    fail('IPA com build number divergente.');
  }
  if (embeddedProfileSha256 !== policy.ios.profileSha256) {
    fail('IPA não incorporou o provisioning profile aprovado.');
  }
  if (normalizeFingerprint(signingCertificateSha1) !== policy.ios.certificateSha1) {
    fail('IPA não foi assinada pelo certificado Apple aprovado.');
  }
  const fields = Object.fromEntries(
    String(codesignDisplay ?? '')
      .split(/\r?\n/)
      .map((line) => line.split(/=(.*)/s).slice(0, 2))
      .filter(([key, value]) => key && value !== undefined),
  );
  if (fields.Identifier !== policy.bundleIdentifier || fields.TeamIdentifier !== policy.teamId) {
    fail('Assinatura da IPA diverge de bundle ou time aprovado.');
  }
};

export const parseAndroidCertificateFingerprints = (keytoolOutput) => {
  const output = String(keytoolOutput ?? '').replaceAll('\r', '');
  const signerMarkers = [...output.matchAll(/^Signer #(\d+):\s*$/gm)];
  const certificateMarkers = [...output.matchAll(/^Certificate #(\d+):\s*$/gm)];
  const owners = [...output.matchAll(/^Owner:\s*(\S.*)$/gm)];
  const issuers = [...output.matchAll(/^Issuer:\s*(\S.*)$/gm)];
  const sha1Matches = [...output.matchAll(/^\s*SHA1:\s*([0-9A-Fa-f:]+)\s*$/gm)];
  const sha256Matches = [...output.matchAll(/^\s*SHA256:\s*([0-9A-Fa-f:]+)\s*$/gm)];
  if (
    signerMarkers.length !== 1 ||
    signerMarkers[0][1] !== '1' ||
    certificateMarkers.length !== 1 ||
    certificateMarkers[0][1] !== '1' ||
    owners.length !== 1 ||
    issuers.length !== 1 ||
    owners[0][1].trim() !== issuers[0][1].trim() ||
    sha1Matches.length !== 1 ||
    sha256Matches.length !== 1
  ) {
    fail('Certificado do AAB precisa conter exatamente um signer e um certificado autoassinado.');
  }
  const sha1 = normalizeFingerprint(sha1Matches[0][1]);
  const sha256Value = normalizeFingerprint(sha256Matches[0][1]);
  if (!/^[0-9A-F]{40}$/.test(sha1) || !/^[0-9A-F]{64}$/.test(sha256Value)) {
    fail('Certificado do AAB não pôde ser atestado.');
  }
  return Object.freeze({
    owner: owners[0][1].trim(),
    sha1,
    sha256: sha256Value,
  });
};

export const validateAndroidArtifactMetadata = ({
  applicationId,
  versionName,
  versionCode,
  keytoolOutput,
  buildVersion,
  policy = NATIVE_SIGNING_POLICY,
}) => {
  validateNativeBuildVersion({ buildVersion, platform: 'android', policy });
  if (String(applicationId).trim() !== policy.bundleIdentifier)
    fail('AAB com applicationId divergente.');
  if (String(versionName).trim() !== policy.appVersion) fail('AAB com versionName divergente.');
  if (String(versionCode).trim() !== buildVersion) fail('AAB com versionCode divergente.');
  const fingerprints = parseAndroidCertificateFingerprints(keytoolOutput);
  if (
    fingerprints.sha1 !== policy.android.certificateSha1 ||
    fingerprints.sha256 !== policy.android.certificateSha256
  ) {
    fail('AAB não foi assinado pelo upload certificate aprovado.');
  }
};

export const validateGoogleServicesConfiguration = (contents, policy = NATIVE_SIGNING_POLICY) => {
  let configuration;
  try {
    configuration = JSON.parse(Buffer.from(contents).toString('utf8'));
  } catch {
    fail('google-services.json não contém JSON válido.');
  }
  const project = configuration?.project_info;
  const clients = Array.isArray(configuration?.client) ? configuration.client : [];
  const matchingClients = clients.filter(
    (client) =>
      client?.client_info?.android_client_info?.package_name === policy.firebase.packageName &&
      client?.client_info?.mobilesdk_app_id === policy.firebase.appId,
  );
  if (
    project?.project_number !== policy.firebase.projectNumber ||
    project?.project_id !== policy.firebase.projectId ||
    matchingClients.length !== 1
  ) {
    fail('google-services.json pertence a outro projeto/app Firebase.');
  }
  const apiKeys = matchingClients[0]?.api_key;
  if (
    !Array.isArray(apiKeys) ||
    apiKeys.length < 1 ||
    apiKeys.some(
      ({ current_key: currentKey }) =>
        typeof currentKey !== 'string' || currentKey.length < 20 || /\s/.test(currentKey),
    )
  ) {
    fail('google-services.json não contém uma configuração Firebase completa.');
  }
  return Object.freeze({
    appId: policy.firebase.appId,
    configurationSha256: sha256(contents),
    packageName: policy.firebase.packageName,
    projectId: policy.firebase.projectId,
    projectNumber: policy.firebase.projectNumber,
  });
};

export const validateGoogleOAuthPolicyEvidence = (policy = NATIVE_SIGNING_POLICY) => {
  const evidence = policy?.googleOAuth ?? {};
  const clientIds = [
    evidence.webClientId,
    evidence.iosClientId,
    evidence.androidClientId,
    evidence.androidLocalQaClientId,
  ];
  const clientIdPattern = new RegExp(
    `^${String(evidence.projectNumber ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[a-z0-9]+\\.apps\\.googleusercontent\\.com$`,
  );
  if (
    !/^\d{6,20}$/.test(String(evidence.projectNumber ?? '')) ||
    clientIds.some((clientId) => !clientIdPattern.test(String(clientId ?? ''))) ||
    new Set(clientIds).size !== clientIds.length
  ) {
    fail('Evidência dos Google OAuth clients aprovados é inválida ou ambígua.');
  }
  if (
    evidence.androidPackageName !== policy.bundleIdentifier ||
    evidence.androidPackageName !== policy.firebase.packageName ||
    evidence.iosBundleIdentifier !== policy.bundleIdentifier ||
    evidence.iosTeamId !== policy.teamId ||
    !/^\d{6,15}$/.test(String(evidence.iosAppStoreId ?? ''))
  ) {
    fail('Evidência de package/bundle/time dos Google OAuth clients divergiu.');
  }
  const playSha1 = normalizeFingerprint(evidence.androidPlaySigningSha1);
  const uploadSha1 = normalizeFingerprint(evidence.androidUploadSigningSha1);
  if (
    !/^[0-9A-F]{40}$/.test(playSha1) ||
    !/^[0-9A-F]{40}$/.test(uploadSha1) ||
    playSha1 === uploadSha1 ||
    uploadSha1 !== policy.android.certificateSha1
  ) {
    fail('Evidência SHA-1 Play/upload dos Google OAuth clients divergiu.');
  }
  return Object.freeze({
    androidClientId: evidence.androidClientId,
    androidLocalQaClientId: evidence.androidLocalQaClientId,
    androidPackageName: evidence.androidPackageName,
    androidPlaySigningSha1: playSha1,
    androidUploadSigningSha1: uploadSha1,
    iosAppStoreId: evidence.iosAppStoreId,
    iosBundleIdentifier: evidence.iosBundleIdentifier,
    iosClientId: evidence.iosClientId,
    iosTeamId: evidence.iosTeamId,
    projectNumber: evidence.projectNumber,
    webClientId: evidence.webClientId,
  });
};

export const validateGoogleOAuthEnvironment = ({
  environment,
  platform,
  policy = NATIVE_SIGNING_POLICY,
}) => {
  if (!['ios', 'android'].includes(platform)) fail('Plataforma OAuth Google inválida.');
  const evidence = validateGoogleOAuthPolicyEvidence(policy);
  const webClientId = String(environment?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();
  const iosClientId = String(environment?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();
  const androidClientId = String(environment?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '').trim();
  const genericClientId = String(environment?.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
  if (genericClientId) {
    fail('Google OAuth genérico é proibido; use somente os clients específicos allowlisted.');
  }
  if (webClientId !== evidence.webClientId) {
    fail('Google Web OAuth client de produção ausente ou divergente.');
  }
  if (iosClientId !== evidence.iosClientId) {
    fail('Google iOS OAuth client de produção ausente ou divergente.');
  }
  if (androidClientId !== evidence.androidClientId) {
    fail('Google Android OAuth client de produção ausente ou divergente.');
  }
  return Object.freeze({ ...evidence, androidClientId, iosClientId, webClientId });
};

const isJarSignatureMetadata = (entry) =>
  /^META-INF\/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$/i.test(entry);

const STRICT_JARSIGNER_CLEAN_RESULT = 'jar verified.';
const STRICT_JARSIGNER_SELF_SIGNED_RESULT = 'jar verified, with signer errors.';
const STRICT_JARSIGNER_PKIX_ERROR =
  'This jar contains entries whose certificate chain is invalid. Reason: PKIX path building failed: sun.security.provider.certpath.SunCertPathBuilderException: unable to find valid certification path to requested target';
const STRICT_JARSIGNER_SELF_SIGNED_ERROR =
  'This jar contains entries whose signer certificate is self-signed.';
const STRICT_JARSIGNER_EXTRA_ATTRIBUTES_WARNING =
  'POSIX file permission and/or symlink attributes detected. These attributes are ignored when signing and are not protected by the signature.';
const STRICT_JARSIGNER_NO_TIMESTAMP_WARNING =
  /^This jar contains signatures that do not include a timestamp\. Without a timestamp, users may not be able to validate this jar after any of the signer certificates expire \(as early as \d{4}-\d{2}-\d{2}\)\.$/;
const STRICT_JARSIGNER_EXPIRY_INFO = /^The signer certificate will expire on \d{4}-\d{2}-\d{2}\.$/;
const STRICT_JARSIGNER_CROSS_CHECK_HEADER =
  'This JAR file contains internal inconsistencies that may result in different contents when reading via JarFile and JarInputStream:';
const STRICT_JARSIGNER_MISSING_STREAM_MANIFEST =
  '- Manifest is missing when reading via JarInputStream';
const STRICT_JARSIGNER_STREAM_SIGNER_PREFIX = '- Entry ';
const STRICT_JARSIGNER_STREAM_SIGNER_SUFFIX =
  ' is signed in JarFile but is not signed in JarInputStream';
const STRICT_JARSIGNER_STREAM_FD_SUFFIX =
  ' is present when reading via JarFile but missing when reading via JarInputStream';
const isJarSignatureBlock = (entry) => /^META-INF\/[^/]+\.(?:SF|RSA|DSA|EC)$/i.test(entry);

const consumeStrictJarsignerCrossCheck = ({ cursor, entries, trailing }) => {
  if (trailing[cursor] !== STRICT_JARSIGNER_CROSS_CHECK_HEADER) return cursor;
  if (
    entries.filter((entry) => entry === 'META-INF/MANIFEST.MF').length !== 1 ||
    entries.at(-1) !== 'META-INF/MANIFEST.MF'
  ) {
    fail('jarsigner cross-check exige META-INF/MANIFEST.MF como última entrada única.');
  }
  cursor += 1;
  if (trailing[cursor] !== STRICT_JARSIGNER_MISSING_STREAM_MANIFEST) {
    fail('jarsigner cross-check não explicou o manifest final via JarInputStream.');
  }
  cursor += 1;

  const expectedSignedEntries = new Set(
    entries.filter((entry) => entry && !entry.endsWith('/') && !isJarSignatureBlock(entry)),
  );
  const expectedFdEntries = new Set(
    entries.filter((entry) => entry && !entry.endsWith('/') && entry !== 'META-INF/MANIFEST.MF'),
  );
  const observedEntries = new Set();
  let diagnosticKind = '';
  while (cursor < trailing.length && trailing[cursor].startsWith('- ')) {
    const detail = trailing[cursor];
    if (!detail.startsWith(STRICT_JARSIGNER_STREAM_SIGNER_PREFIX)) {
      fail('jarsigner cross-check contém detalhe estrutural inesperado.');
    }
    const currentKind = detail.endsWith(STRICT_JARSIGNER_STREAM_SIGNER_SUFFIX)
      ? 'signed'
      : detail.endsWith(STRICT_JARSIGNER_STREAM_FD_SUFFIX)
        ? 'fd'
        : '';
    if (!currentKind || (diagnosticKind && currentKind !== diagnosticKind)) {
      fail('jarsigner cross-check contém detalhe estrutural inesperado.');
    }
    diagnosticKind = currentKind;
    const suffix =
      currentKind === 'signed'
        ? STRICT_JARSIGNER_STREAM_SIGNER_SUFFIX
        : STRICT_JARSIGNER_STREAM_FD_SUFFIX;
    const entry = detail.slice(STRICT_JARSIGNER_STREAM_SIGNER_PREFIX.length, -suffix.length);
    const expectedEntries = currentKind === 'signed' ? expectedSignedEntries : expectedFdEntries;
    if (!expectedEntries.has(entry) || observedEntries.has(entry)) {
      fail('jarsigner retornou conjunto de cross-check extra ou duplicado.');
    }
    observedEntries.add(entry);
    cursor += 1;
  }
  const expectedEntries = diagnosticKind === 'fd' ? expectedFdEntries : expectedSignedEntries;
  if (
    !diagnosticKind ||
    observedEntries.size !== expectedEntries.size ||
    [...expectedEntries].some((entry) => !observedEntries.has(entry))
  ) {
    fail('jarsigner retornou conjunto de cross-check parcial ou divergente.');
  }
  return cursor;
};

/**
 * `jarsigner -strict` returns bit 4 for an upload certificate whose only trust
 * failure is the expected self-signed PKIX chain. Cross-check diagnostics are
 * not represented in that bitmask, so stdout/stderr must be classified too.
 */
export const validateStrictJarsignerResult = ({ entries, status, stdout, stderr }) => {
  if (![0, 4].includes(status)) fail('jarsigner strict retornou status inesperado.');
  if (!Array.isArray(entries) || entries.length === 0 || new Set(entries).size !== entries.length) {
    fail('jarsigner strict recebeu entradas inválidas ou duplicadas.');
  }
  if (typeof stdout !== 'string' || typeof stderr !== 'string') {
    fail('jarsigner strict retornou streams inválidos.');
  }
  if (stderr.trim()) fail('jarsigner strict retornou stderr inesperado.');

  const normalizedOutput = stdout.replaceAll('\r', '');
  if (
    status === 0 &&
    (/\bJarInputStream\b/i.test(normalizedOutput) ||
      /internal inconsistencies/i.test(normalizedOutput))
  ) {
    fail('jarsigner strict detectou warning de cross-check JarFile/JarInputStream.');
  }
  if (
    /^WARNING:/m.test(normalizedOutput) ||
    /jar (?:is|will be treated as) unsigned/i.test(normalizedOutput)
  ) {
    fail('jarsigner strict tratou o AAB como não assinado.');
  }

  const lines = normalizedOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const resultMarkers = lines.filter(
    (line) =>
      line === STRICT_JARSIGNER_CLEAN_RESULT || line === STRICT_JARSIGNER_SELF_SIGNED_RESULT,
  );
  if (resultMarkers.length !== 1) fail('jarsigner strict não retornou resultado canônico único.');
  const resultIndex = lines.indexOf(resultMarkers[0]);
  if (
    lines
      .slice(0, resultIndex)
      .some((line) => line === 'Error:' || line === 'Warning:' || /^jar verified/.test(line))
  ) {
    fail('jarsigner strict retornou diagnóstico antes do resultado final.');
  }

  const trailing = lines.slice(resultIndex + 1);
  if (status === 0) {
    if (resultMarkers[0] !== STRICT_JARSIGNER_CLEAN_RESULT) {
      fail('jarsigner strict status 0 não retornou resultado limpo.');
    }
    if (
      trailing.length > 1 ||
      (trailing.length === 1 && !STRICT_JARSIGNER_EXPIRY_INFO.test(trailing[0]))
    ) {
      fail('jarsigner strict status 0 retornou diagnóstico inesperado.');
    }
    return normalizedOutput;
  }

  if (resultMarkers[0] !== STRICT_JARSIGNER_SELF_SIGNED_RESULT) {
    fail('jarsigner strict status 4 não retornou signer errors canônicos.');
  }
  if (
    trailing[0] !== 'Error:' ||
    trailing[1] !== STRICT_JARSIGNER_PKIX_ERROR ||
    trailing[2] !== STRICT_JARSIGNER_SELF_SIGNED_ERROR
  ) {
    fail('jarsigner strict status 4 contém signer errors inesperados.');
  }

  let cursor = 3;
  if (trailing[cursor] === 'Warning:') {
    cursor += 1;
    const observedWarnings = new Set();
    while (
      cursor < trailing.length &&
      trailing[cursor] !== STRICT_JARSIGNER_CROSS_CHECK_HEADER &&
      !STRICT_JARSIGNER_EXPIRY_INFO.test(trailing[cursor])
    ) {
      const warning = trailing[cursor];
      const warningKind = STRICT_JARSIGNER_NO_TIMESTAMP_WARNING.test(warning)
        ? 'no-timestamp'
        : warning === STRICT_JARSIGNER_EXTRA_ATTRIBUTES_WARNING
          ? 'extra-attributes'
          : '';
      if (!warningKind || observedWarnings.has(warningKind)) {
        fail('jarsigner strict status 4 retornou diagnóstico inesperado.');
      }
      observedWarnings.add(warningKind);
      cursor += 1;
    }
    if (observedWarnings.size === 0) {
      fail('jarsigner strict status 4 retornou bloco Warning vazio.');
    }
  }
  cursor = consumeStrictJarsignerCrossCheck({ cursor, entries, trailing });
  if (cursor < trailing.length && STRICT_JARSIGNER_EXPIRY_INFO.test(trailing[cursor])) {
    cursor += 1;
  }
  if (cursor !== trailing.length) {
    fail('jarsigner strict status 4 retornou diagnóstico inesperado.');
  }
  return normalizedOutput;
};

export const validateJarsignerCoverage = ({ entries, output }) => {
  if (!Array.isArray(entries) || entries.length === 0 || new Set(entries).size !== entries.length) {
    fail('AAB contém uma lista de entradas inválida ou duplicada.');
  }
  const normalizedOutput = String(output ?? '').replaceAll('\r', '');
  if (!/(?:^|\n)jar verified(?:, with signer errors)?\.(?:\n|$)/.test(normalizedOutput)) {
    fail('jarsigner não confirmou integralmente o AAB.');
  }
  for (const entry of entries.filter(
    (candidate) => candidate && !candidate.endsWith('/') && !isJarSignatureMetadata(candidate),
  )) {
    const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = normalizedOutput
      .split('\n')
      .find((candidate) => new RegExp(`^.{1,8}\\s+\\d+\\s+.*\\s${escaped}$`).test(candidate));
    const flags = line?.slice(0, 8) ?? '';
    if (!line || !flags.includes('s') || !flags.includes('m')) {
      fail(`AAB contém entrada sem cobertura integral da assinatura: ${entry}.`);
    }
  }
};

const entitlementValueAllowed = (signedValue, profileValue) => {
  if (typeof profileValue === 'string' && profileValue.endsWith('*')) {
    return typeof signedValue === 'string' && signedValue.startsWith(profileValue.slice(0, -1));
  }
  if (Array.isArray(signedValue)) {
    return (
      Array.isArray(profileValue) &&
      signedValue.every((item) =>
        profileValue.some((allowed) => entitlementValueAllowed(item, allowed)),
      )
    );
  }
  if (signedValue && typeof signedValue === 'object') {
    return (
      profileValue &&
      typeof profileValue === 'object' &&
      !Array.isArray(profileValue) &&
      Object.entries(signedValue).every(([key, value]) =>
        entitlementValueAllowed(value, profileValue[key]),
      )
    );
  }
  return Object.is(signedValue, profileValue);
};

export const validateIosSignedEntitlements = ({
  bundleIdentifier,
  isMainApp = false,
  profile,
  signedEntitlements,
  policy = NATIVE_SIGNING_POLICY,
}) => {
  const profileEntitlements = profile?.Entitlements ?? {};
  const expectedApplicationIdentifier = `${policy.teamId}.${bundleIdentifier}`;
  if (
    signedEntitlements?.['application-identifier'] !== expectedApplicationIdentifier ||
    signedEntitlements?.['com.apple.developer.team-identifier'] !== policy.teamId ||
    signedEntitlements?.['get-task-allow'] !== false ||
    profileEntitlements['application-identifier'] !== expectedApplicationIdentifier ||
    profileEntitlements['com.apple.developer.team-identifier'] !== policy.teamId ||
    profileEntitlements['get-task-allow'] !== false
  ) {
    fail('Entitlements assinados divergem de app, time ou distribuição de produção.');
  }
  if (
    (isMainApp && signedEntitlements['aps-environment'] !== 'production') ||
    (signedEntitlements['aps-environment'] !== undefined &&
      signedEntitlements['aps-environment'] !== 'production')
  ) {
    fail('Entitlements assinados não fixam APNs de produção.');
  }
  for (const [key, value] of Object.entries(signedEntitlements)) {
    if (!entitlementValueAllowed(value, profileEntitlements[key])) {
      fail(`Capability assinada não é concedida pelo profile: ${key}.`);
    }
  }
  return Object.freeze({ applicationIdentifier: expectedApplicationIdentifier, bundleIdentifier });
};

const quoteGroovy = (value) => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

export const createAndroidSigningInitScript = ({
  keystorePath,
  buildVersion,
  policy = NATIVE_SIGNING_POLICY,
}) => {
  validateNativeBuildVersion({ buildVersion, platform: 'android', policy });
  for (const value of [
    policy.android.keyAlias,
    policy.android.keyAliasAccount,
    policy.android.keyPasswordAccount,
    policy.android.keystorePasswordAccount,
    policy.android.keychainService,
  ]) {
    if (!/^[A-Za-z0-9-]+$/.test(value)) fail('Identificador de assinatura Android inválido.');
  }

  return `gradle.afterProject { project, state ->
  if (project.path != ':app' || state.failure != null) return

  def readKeychain = { account ->
    def invocation = project.providers.exec {
      commandLine('/usr/bin/security', 'find-generic-password', '-a', account,
        '-s', ${quoteGroovy(policy.android.keychainService)}, '-w',
        ${quoteGroovy(policy.android.keychainPath)})
    }
    def value = invocation.standardOutput.asText.get().replaceFirst(/\\r?\\n\\z/, '')
    if (value.length() < 8 || value.length() > 128 || value.contains('\\n') || value.contains('\\r')) {
      throw new GradleException('Android signing secret from Keychain has an invalid format.')
    }
    return value
  }

  def signing = project.android.signingConfigs.findByName('rumoRelease') ?:
    project.android.signingConfigs.create('rumoRelease')
  signing.storeFile = project.file(${quoteGroovy(keystorePath)})
  signing.storePassword = readKeychain(${quoteGroovy(policy.android.keystorePasswordAccount)})
  def approvedAlias = readKeychain(${quoteGroovy(policy.android.keyAliasAccount)})
  if (approvedAlias != ${quoteGroovy(policy.android.keyAlias)}) {
    throw new GradleException('Android signing alias from Keychain is not approved.')
  }
  signing.keyAlias = approvedAlias
  signing.keyPassword = readKeychain(${quoteGroovy(policy.android.keyPasswordAccount)})
  project.android.defaultConfig.versionName = ${quoteGroovy(policy.appVersion)}
  project.android.defaultConfig.versionCode = ${Number(buildVersion)}
  project.android.buildTypes.release.signingConfig = signing
}
`;
};

const AMBIENT_BUILD_VARIABLES = [
  'BASH_ENV',
  'BUNDLE_GEMFILE',
  'CDPATH',
  'CFLAGS',
  'CXX',
  'CXXFLAGS',
  'DEVELOPER_DIR',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'ENV',
  'EAS_LOCAL_BUILD_ARTIFACT_PATH',
  'EAS_LOCAL_BUILD_ARTIFACTS_DIR',
  'EAS_LOCAL_BUILD_LOGGER_LEVEL',
  'EAS_LOCAL_BUILD_PLUGIN_PATH',
  'EAS_LOCAL_BUILD_SKIP_CLEANUP',
  'EAS_LOCAL_BUILD_SKIP_NATIVE_BUILD',
  'EAS_LOCAL_BUILD_WORKINGDIR',
  'EAS_ACCESS_TOKEN',
  'EAS_TOKEN',
  'FNM_DIR',
  'FNM_MULTISHELL_PATH',
  'FNM_NODE_DIST_MIRROR',
  'GEM_HOME',
  'GEM_PATH',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_WORK_TREE',
  'GRADLE_OPTS',
  'JAVA_TOOL_OPTIONS',
  'LD_PRELOAD',
  'LDFLAGS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NPM_TOKEN',
  'PERL5LIB',
  'PERL5OPT',
  'PYTHONHOME',
  'PYTHONPATH',
  'RUBYLIB',
  'RUBYOPT',
  'SDKROOT',
  'XCODE_XCCONFIG_FILE',
  'EXPO_TOKEN',
  '_JAVA_OPTIONS',
  '__API_SERVER_URL',
];

const AMBIENT_BUILD_PREFIXES = [
  'DYLD_',
  'GIT_CONFIG_',
  'NPM_CONFIG_',
  'ORG_GRADLE_PROJECT_',
  'npm_config_',
  'EXPO_INTERNAL_',
];

const NATIVE_BUILD_INPUT_NAMES = new Set([
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
]);

export const sanitizeNativeBuildEnvironment = (
  environment,
  { buildOnly = false, path, gradleUserHome, javaHome } = {},
) => {
  const sanitized = { ...environment };
  for (const name of AMBIENT_BUILD_VARIABLES) delete sanitized[name];
  for (const name of Object.keys(sanitized)) {
    if (AMBIENT_BUILD_PREFIXES.some((prefix) => name.startsWith(prefix))) delete sanitized[name];
  }
  if (buildOnly) {
    for (const name of Object.keys(sanitized)) {
      if (!NATIVE_BUILD_INPUT_NAMES.has(name)) delete sanitized[name];
    }
  }
  Object.assign(sanitized, {
    CI: '1',
    COCOAPODS_DISABLE_STATS: 'true',
    DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
    DISABLE_EAS_ANALYTICS: '1',
    EAS_BUILD_PROFILE: 'production',
    EXPO_NO_TELEMETRY: '1',
    FORCE_COLOR: '0',
    HOME: '/Users/manoelnascimento',
    HOMEBREW_NO_AUTO_UPDATE: '1',
    LANG: 'C',
    LC_ALL: 'C',
    LOGNAME: 'manoelnascimento',
    NO_COLOR: '1',
    NODE_ENV: 'production',
    PATH: path,
    RCT_NO_LAUNCH_PACKAGER: '1',
    RUMO_RELEASE_DISABLE_WATCHMAN: '1',
    SENTRY_DISABLE_AUTO_UPLOAD: 'true',
    TMPDIR: '/private/tmp',
    USER: 'manoelnascimento',
  });
  if (gradleUserHome) sanitized.GRADLE_USER_HOME = gradleUserHome;
  else delete sanitized.GRADLE_USER_HOME;
  if (javaHome) sanitized.JAVA_HOME = javaHome;
  return sanitized;
};

export const createEasEnvPullArguments = (destinationPath) => {
  const absolutePath = resolve(destinationPath);
  if (!absolutePath.startsWith('/Volumes/RumoPragasProdBackup/')) {
    fail('EAS Environment só pode ser materializado no volume privado aprovado.');
  }
  return Object.freeze(['env:pull', 'production', '--path', absolutePath, '--non-interactive']);
};
