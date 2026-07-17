#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { inflateSync } from 'node:zlib';

import { validateDataSafetyFiles } from './validate-data-safety.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const storeAssetsRoot = join(projectRoot, 'store-assets');
const manifestFile = join(storeAssetsRoot, 'screenshots-manifest.json');
const externalCommandTimeoutMs = 60_000;
const gitTopLevelResult = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024,
  timeout: externalCommandTimeoutMs,
});
const repositoryRoot =
  gitTopLevelResult.status === 0 && gitTopLevelResult.stdout.trim()
    ? resolve(gitTopLevelResult.stdout.trim())
    : projectRoot;
const platform = process.argv[2];
const errors = [];
const maximumPngFileBytes = 16 * 1024 * 1024;
const maximumInflatedPngBytes = 160 * 1024 * 1024;
const maximumPngDimension = 7680;
const maximumPngPixels = 7680 * 4320;
const maximumManifestBytes = 256 * 1024;
const maximumManifestScreenshotEntries = 36;
const pngInfoCache = new Map();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const canonicalScenes = new Set([
  'home',
  'capture-and-crop',
  'result',
  'history',
  'library',
  'ai-assistant',
  'settings',
]);

if (!['ios', 'android'].includes(platform)) {
  console.error('Uso: node scripts/validate-store-assets.mjs <ios|android> [--artifact CAMINHO]');
  process.exit(2);
}

const submissionContext = { artifact: null };
for (let index = 3; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--build-id') {
    console.error('ERRO: --build-id não é aceito; informe um artefato local com --artifact.');
    process.exit(2);
  }
  if (argument === '--artifact' && index + 1 < process.argv.length) {
    submissionContext.artifact = process.argv[index + 1];
    index += 1;
  } else {
    console.error(`ERRO: argumento de vínculo de submissão inválido: ${argument}`);
    process.exit(2);
  }
}

function describe(file) {
  return relative(projectRoot, file);
}

function toStorePath(file) {
  return relative(storeAssetsRoot, file).split(sep).join('/');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256File(file) {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = openSync(file, 'r');
  try {
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return hash.digest('hex');
}

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

function scanlineLayout(width, height, bitsPerPixel, interlace) {
  const passes =
    interlace === 0
      ? [[0, 0, 1, 1]]
      : [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ];
  const rows = [];
  let expectedBytes = 0;

  for (const [startX, startY, stepX, stepY] of passes) {
    if (width <= startX || height <= startY) continue;
    const passWidth = Math.ceil((width - startX) / stepX);
    const passHeight = Math.ceil((height - startY) / stepY);
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
    rows.push({ height: passHeight, rowBytes });
    expectedBytes += passHeight * (rowBytes + 1);
  }

  return { expectedBytes, rows };
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function unfilterScanline(filtered, previous, filterType, bytesPerPixel) {
  const result = Buffer.allocUnsafe(filtered.length);
  for (let index = 0; index < filtered.length; index += 1) {
    const left = index >= bytesPerPixel ? result[index - bytesPerPixel] : 0;
    const above = previous?.[index] ?? 0;
    const upperLeft = index >= bytesPerPixel ? (previous?.[index - bytesPerPixel] ?? 0) : 0;
    let predictor = 0;
    if (filterType === 1) predictor = left;
    else if (filterType === 2) predictor = above;
    else if (filterType === 3) predictor = Math.floor((left + above) / 2);
    else if (filterType === 4) predictor = paethPredictor(left, above, upperLeft);
    result[index] = (filtered[index] + predictor) & 0xff;
  }
  return result;
}

function readSample(row, sampleIndex, bitDepth) {
  if (bitDepth === 16) return row.readUInt16BE(sampleIndex * 2);
  if (bitDepth === 8) return row[sampleIndex];
  const bitOffset = sampleIndex * bitDepth;
  const shift = 8 - bitDepth - (bitOffset % 8);
  return (row[Math.floor(bitOffset / 8)] >>> shift) & (2 ** bitDepth - 1);
}

function scaleSample(sample, bitDepth) {
  if (bitDepth === 16) return sample;
  return Math.round((sample * 65535) / (2 ** bitDepth - 1));
}

function packedPixelLookup({ bitDepth, colorType, palette, transparency }) {
  if (bitDepth >= 8 || ![0, 3].includes(colorType)) return null;
  const pixelsPerByte = 8 / bitDepth;
  return Array.from({ length: 256 }, (_, byte) => {
    const expanded = Buffer.allocUnsafe(pixelsPerByte * 8);
    const valid = Array.from({ length: pixelsPerByte }, () => true);
    for (let pixel = 0; pixel < pixelsPerByte; pixel += 1) {
      const shift = 8 - bitDepth * (pixel + 1);
      const sample = (byte >>> shift) & (2 ** bitDepth - 1);
      let red;
      let green;
      let blue;
      let alpha = 65535;
      if (colorType === 0) {
        red = green = blue = scaleSample(sample, bitDepth);
        if (transparency && sample === transparency.readUInt16BE(0)) alpha = 0;
      } else {
        const paletteOffset = sample * 3;
        if (!palette || paletteOffset + 2 >= palette.length) {
          valid[pixel] = false;
          red = green = blue = 0;
        } else {
          red = palette[paletteOffset] * 257;
          green = palette[paletteOffset + 1] * 257;
          blue = palette[paletteOffset + 2] * 257;
          if (transparency && sample < transparency.length) alpha = transparency[sample] * 257;
        }
      }
      const target = pixel * 8;
      expanded.writeUInt16BE(red, target);
      expanded.writeUInt16BE(green, target + 2);
      expanded.writeUInt16BE(blue, target + 4);
      expanded.writeUInt16BE(alpha, target + 6);
    }
    return { expanded, valid };
  });
}

function canonicalPixelHash({ ihdr, inflated, palette, transparency }) {
  const { width, height, bitDepth, colorType } = ihdr;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bitsPerPixel = channels[colorType] * bitDepth;
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const hash = createHash('sha256');
  hash.update(`rgba16be:${width}x${height}:`);
  const packedLookup = packedPixelLookup({ bitDepth, colorType, palette, transparency });

  let offset = 0;
  let previous = null;
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filterType = inflated[offset];
    const filtered = inflated.subarray(offset + 1, offset + 1 + rowBytes);
    const row = unfilterScanline(filtered, previous, filterType, bytesPerPixel);
    const canonical = Buffer.allocUnsafe(width * 8);

    if (packedLookup) {
      const pixelsPerByte = 8 / bitDepth;
      let writtenPixels = 0;
      for (const byte of row) {
        const pixelsToCopy = Math.min(pixelsPerByte, width - writtenPixels);
        const expandedPixels = packedLookup[byte];
        const invalidPixel = expandedPixels.valid.indexOf(false);
        if (invalidPixel >= 0 && invalidPixel < pixelsToCopy) {
          throw new Error('PNG indexado referencia entrada ausente da paleta');
        }
        expandedPixels.expanded.copy(canonical, writtenPixels * 8, 0, pixelsToCopy * 8);
        writtenPixels += pixelsToCopy;
        if (writtenPixels === width) break;
      }
      hash.update(canonical);
      previous = row;
      offset += rowBytes + 1;
      continue;
    }

    for (let column = 0; column < width; column += 1) {
      let red;
      let green;
      let blue;
      let alpha = 65535;
      if (colorType === 0) {
        const graySample = readSample(row, column, bitDepth);
        red = green = blue = scaleSample(graySample, bitDepth);
        if (transparency && graySample === transparency.readUInt16BE(0)) alpha = 0;
      } else if (colorType === 2) {
        const sampleOffset = column * 3;
        const redSample = readSample(row, sampleOffset, bitDepth);
        const greenSample = readSample(row, sampleOffset + 1, bitDepth);
        const blueSample = readSample(row, sampleOffset + 2, bitDepth);
        red = scaleSample(redSample, bitDepth);
        green = scaleSample(greenSample, bitDepth);
        blue = scaleSample(blueSample, bitDepth);
        if (
          transparency &&
          redSample === transparency.readUInt16BE(0) &&
          greenSample === transparency.readUInt16BE(2) &&
          blueSample === transparency.readUInt16BE(4)
        ) {
          alpha = 0;
        }
      } else if (colorType === 3) {
        const paletteIndex = readSample(row, column, bitDepth);
        const paletteOffset = paletteIndex * 3;
        if (!palette || paletteOffset + 2 >= palette.length) {
          throw new Error('PNG indexado referencia entrada ausente da paleta');
        }
        red = palette[paletteOffset] * 257;
        green = palette[paletteOffset + 1] * 257;
        blue = palette[paletteOffset + 2] * 257;
        if (transparency && paletteIndex < transparency.length) {
          alpha = transparency[paletteIndex] * 257;
        }
      } else if (colorType === 4) {
        const sampleOffset = column * 2;
        const gray = scaleSample(readSample(row, sampleOffset, bitDepth), bitDepth);
        red = green = blue = gray;
        alpha = scaleSample(readSample(row, sampleOffset + 1, bitDepth), bitDepth);
      } else {
        const sampleOffset = column * 4;
        red = scaleSample(readSample(row, sampleOffset, bitDepth), bitDepth);
        green = scaleSample(readSample(row, sampleOffset + 1, bitDepth), bitDepth);
        blue = scaleSample(readSample(row, sampleOffset + 2, bitDepth), bitDepth);
        alpha = scaleSample(readSample(row, sampleOffset + 3, bitDepth), bitDepth);
      }

      const canonicalOffset = column * 8;
      canonical.writeUInt16BE(red, canonicalOffset);
      canonical.writeUInt16BE(green, canonicalOffset + 2);
      canonical.writeUInt16BE(blue, canonicalOffset + 4);
      canonical.writeUInt16BE(alpha, canonicalOffset + 6);
    }

    hash.update(canonical);
    previous = row;
    offset += rowBytes + 1;
  }
  return hash.digest('hex');
}

function validatePngGeometry(info, constraints = {}) {
  const width = info.width;
  const height = info.height;
  const pixels = width * height;
  if (
    width > maximumPngDimension ||
    height > maximumPngDimension ||
    !Number.isSafeInteger(pixels) ||
    pixels > maximumPngPixels
  ) {
    throw new Error(
      `PNG ${width}x${height} excede o limite estrutural de dimensão/área antes da descompressão`,
    );
  }

  if (constraints.dimensions && !constraints.dimensions.has(`${width}x${height}`)) {
    throw new Error(`PNG ${width}x${height} não é uma dimensão aceita para ${constraints.label}`);
  }
  if (constraints.exactWidth && constraints.exactHeight) {
    if (width !== constraints.exactWidth || height !== constraints.exactHeight) {
      throw new Error(
        `PNG ${width}x${height}; esperado ${constraints.exactWidth}x${constraints.exactHeight} antes da descompressão`,
      );
    }
  }
  if (constraints.minimumSide || constraints.maximumSide || constraints.maximumRatio) {
    const minimumSide = Math.min(width, height);
    const maximumSide = Math.max(width, height);
    if (
      (constraints.minimumSide && minimumSide < constraints.minimumSide) ||
      (constraints.maximumSide && maximumSide > constraints.maximumSide) ||
      (constraints.maximumRatio && maximumSide > minimumSide * constraints.maximumRatio)
    ) {
      throw new Error(
        `PNG ${width}x${height} viola a geometria permitida para ${constraints.label} antes da descompressão`,
      );
    }
  }
  if (constraints.requiredRatio) {
    const minimumSide = Math.min(width, height);
    const maximumSide = Math.max(width, height);
    if (
      (constraints.minimumSide && minimumSide < constraints.minimumSide) ||
      (constraints.maximumSide && maximumSide > constraints.maximumSide) ||
      Math.abs(maximumSide / minimumSide - constraints.requiredRatio) >
        (constraints.ratioTolerance ?? 0)
    ) {
      throw new Error(
        `PNG ${width}x${height} viola a geometria permitida para ${constraints.label} antes da descompressão`,
      );
    }
  }
  if (constraints.maximumPixels && pixels > constraints.maximumPixels) {
    throw new Error(
      `PNG ${width}x${height} excede a área permitida para ${constraints.label} antes da descompressão`,
    );
  }
}

function pngInfo(file, constraints = {}) {
  const cached = pngInfoCache.get(file);
  if (cached) {
    validatePngGeometry(cached, constraints);
    return cached;
  }
  const fileBytes = statSync(file).size;
  if (fileBytes > maximumPngFileBytes) {
    throw new Error('PNG excede o limite estrutural pré-leitura de 16 MB');
  }
  const data = readFileSync(file);
  const signature = '89504e470d0a1a0a';
  if (data.length < 33 || data.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('arquivo não é PNG válido');
  }

  let offset = 8;
  let previousType = '';
  let ihdr = null;
  let palette = null;
  let paletteEntries = 0;
  let transparency = null;
  let sawPlte = false;
  let sawTransparency = false;
  let sawIdat = false;
  let sawIend = false;
  let hasTransparencyChunk = false;
  const idatParts = [];

  while (offset < data.length) {
    if (data.length - offset < 12) {
      throw new Error('PNG truncado no cabeçalho de chunk');
    }

    const length = data.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > data.length) {
      throw new Error('PNG truncado no conteúdo de chunk');
    }

    const typeBuffer = data.subarray(offset + 4, offset + 8);
    const type = typeBuffer.toString('ascii');
    if (!/^[A-Za-z]{4}$/.test(type) || (typeBuffer[2] & 0x20) !== 0) {
      throw new Error('PNG contém tipo de chunk inválido');
    }

    const chunkData = data.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = data.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(Buffer.concat([typeBuffer, chunkData]));
    if (actualCrc !== expectedCrc) {
      throw new Error(`PNG com CRC inválido no chunk ${type}`);
    }

    if (sawIend) {
      throw new Error('PNG contém dados após IEND');
    }
    if (offset === 8 && type !== 'IHDR') {
      throw new Error('PNG sem IHDR como primeiro chunk');
    }

    if (type === 'IHDR') {
      if (ihdr !== null || length !== 13) {
        throw new Error('PNG com IHDR inválido ou duplicado');
      }
      const width = chunkData.readUInt32BE(0);
      const height = chunkData.readUInt32BE(4);
      const bitDepth = chunkData[8];
      const colorType = chunkData[9];
      const compression = chunkData[10];
      const filter = chunkData[11];
      const interlace = chunkData[12];
      const validDepths = {
        0: new Set([1, 2, 4, 8, 16]),
        2: new Set([8, 16]),
        3: new Set([1, 2, 4, 8]),
        4: new Set([8, 16]),
        6: new Set([8, 16]),
      };
      if (
        width === 0 ||
        height === 0 ||
        !validDepths[colorType]?.has(bitDepth) ||
        compression !== 0 ||
        filter !== 0 ||
        interlace !== 0
      ) {
        throw new Error('PNG contém parâmetros IHDR inválidos');
      }
      ihdr = { width, height, bitDepth, colorType, interlace };
      validatePngGeometry(ihdr, constraints);
    } else if (type === 'PLTE') {
      if (ihdr === null || sawPlte || sawIdat || length < 3 || length > 768 || length % 3 !== 0) {
        throw new Error('PNG contém PLTE inválido ou fora de ordem');
      }
      if ([0, 4].includes(ihdr.colorType)) {
        throw new Error('PNG contém PLTE proibido para o tipo de cor');
      }
      sawPlte = true;
      palette = Buffer.from(chunkData);
      paletteEntries = length / 3;
    } else if (type === 'tRNS') {
      if (ihdr === null || sawTransparency || sawIdat || [4, 6].includes(ihdr.colorType)) {
        throw new Error('PNG contém tRNS inválido, duplicado ou fora de ordem');
      }
      if (
        (ihdr.colorType === 0 && length !== 2) ||
        (ihdr.colorType === 2 && length !== 6) ||
        (ihdr.colorType === 3 && (!sawPlte || length === 0 || length > paletteEntries))
      ) {
        throw new Error('PNG contém tRNS incompatível com o tipo de cor');
      }
      sawTransparency = true;
      hasTransparencyChunk = true;
      transparency = Buffer.from(chunkData);
    } else if (type === 'IDAT') {
      if (ihdr === null || (sawIdat && previousType !== 'IDAT')) {
        throw new Error('PNG contém IDAT inválido ou não consecutivo');
      }
      sawIdat = true;
      idatParts.push(chunkData);
    } else if (type === 'IEND') {
      if (!sawIdat || length !== 0) {
        throw new Error('PNG contém IEND inválido');
      }
      sawIend = true;
    } else {
      if ((typeBuffer[0] & 0x20) === 0) {
        throw new Error(`PNG contém chunk crítico desconhecido ${type}`);
      }
    }

    previousType = type;
    offset = chunkEnd;
  }

  if (ihdr === null || !sawIdat || !sawIend || offset !== data.length) {
    throw new Error('PNG sem sequência completa IHDR/IDAT/IEND');
  }
  if (ihdr.colorType === 3) {
    if (paletteEntries === 0 || paletteEntries > 2 ** ihdr.bitDepth) {
      throw new Error('PNG indexado sem paleta válida');
    }
  }
  if (transparency && ihdr.colorType === 0 && transparency.readUInt16BE(0) >= 2 ** ihdr.bitDepth) {
    throw new Error('PNG contém amostra tRNS fora da profundidade declarada');
  }
  if (transparency && ihdr.colorType === 2 && ihdr.bitDepth === 8) {
    if (
      transparency.readUInt16BE(0) > 255 ||
      transparency.readUInt16BE(2) > 255 ||
      transparency.readUInt16BE(4) > 255
    ) {
      throw new Error('PNG contém amostra RGB tRNS fora da profundidade declarada');
    }
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const layout = scanlineLayout(
    ihdr.width,
    ihdr.height,
    channels[ihdr.colorType] * ihdr.bitDepth,
    ihdr.interlace,
  );
  if (
    !Number.isSafeInteger(layout.expectedBytes) ||
    layout.expectedBytes > maximumInflatedPngBytes
  ) {
    throw new Error('PNG excede o limite estrutural de descompressão');
  }

  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idatParts), {
      maxOutputLength: maximumInflatedPngBytes,
    });
  } catch {
    throw new Error('PNG contém IDAT inválido ou não descompactável');
  }
  if (inflated.length !== layout.expectedBytes) {
    throw new Error('PNG contém dados de pixels truncados ou excedentes');
  }

  let scanlineOffset = 0;
  for (const rowGroup of layout.rows) {
    for (let row = 0; row < rowGroup.height; row += 1) {
      if (inflated[scanlineOffset] > 4) {
        throw new Error('PNG contém filtro de scanline inválido');
      }
      scanlineOffset += rowGroup.rowBytes + 1;
    }
  }

  const info = {
    width: ihdr.width,
    height: ihdr.height,
    colorType: ihdr.colorType,
    hasTransparencyChunk,
    bytes: fileBytes,
    sha256: createHash('sha256').update(data).digest('hex'),
    pixelSha256: canonicalPixelHash({ ihdr, inflated, palette, transparency }),
  };
  pngInfoCache.set(file, info);
  return info;
}

function listDirectPngs(directory, label, { rejectDirectories = true } = {}) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory() && rejectDirectories) {
      errors.push(`${describe(absolute)}: subdiretório inesperado em ${label}.`);
    } else if (entry.isSymbolicLink()) {
      errors.push(`${describe(absolute)}: link simbólico não é aceito em ativos de submissão.`);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function validateRootDirectories(root, allowedDirectories) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      errors.push(`${describe(absolute)}: link simbólico não é aceito na raiz de ativos.`);
    } else if (entry.isDirectory() && !allowedDirectories.has(entry.name)) {
      errors.push(`${describe(absolute)}: subdiretório de ativos inesperado.`);
    }
  }
}

function validateOpaquePng(file, constraints = {}) {
  try {
    const info = pngInfo(file, constraints);
    if (info.colorType === 4 || info.colorType === 6 || info.hasTransparencyChunk) {
      errors.push(
        `${describe(file)}: PNG contém canal/transparência; as lojas exigem imagem opaca.`,
      );
    }
    return info;
  } catch (error) {
    errors.push(`${describe(file)}: ${error instanceof Error ? error.message : 'PNG inválido'}.`);
    return null;
  }
}

function validateSet({
  name,
  label,
  directory,
  minimum,
  maximum,
  maximumFileBytes,
  dimensions,
  pngConstraints = {},
}) {
  const files = listDirectPngs(directory, label);
  const assets = [];
  if (files.length < minimum) {
    errors.push(`${label}: ${files.length} captura(s); mínimo operacional ${minimum}.`);
  }
  if (files.length > maximum) {
    errors.push(`${label}: ${files.length} captura(s); máximo oficial ${maximum}.`);
  }

  let firstDimensions = null;
  for (const file of files) {
    if (maximumFileBytes && statSync(file).size > maximumFileBytes) {
      errors.push(`${describe(file)}: captura excede ${maximumFileBytes / (1024 * 1024)} MB.`);
      continue;
    }
    const info = validateOpaquePng(file, {
      ...pngConstraints,
      dimensions,
      label,
    });
    if (!info) continue;
    const currentDimensions = `${info.width}x${info.height}`;
    if (firstDimensions === null) {
      firstDimensions = currentDimensions;
    } else if (currentDimensions !== firstDimensions) {
      errors.push(
        `${describe(file)}: ${currentDimensions} diverge de ${firstDimensions}; um conjunto deve usar dimensões consistentes.`,
      );
    }

    assets.push({ file, sha256: info.sha256 });
  }
  return { name, files, assets };
}

function validateGlobalScreenshotUniqueness() {
  const seenPixelHashes = new Map();
  const forbiddenPixelHashes = new Map();
  const screenshotDirectories = [
    join(storeAssetsRoot, 'ios', 'iphone-6.9'),
    join(storeAssetsRoot, 'ios', 'ipad-13'),
    join(storeAssetsRoot, 'android', 'phone'),
    join(storeAssetsRoot, 'android', 'tablet-10'),
  ];
  const forbiddenSourceDirectories = [
    ...['archive', 'qa-source', 'fixture', 'fixtures', 'mock', 'mocks', 'historical'].map(
      (directory) => join(storeAssetsRoot, directory),
    ),
    join(repositoryRoot, 'store-assets', 'archive'),
  ];

  function collectForbiddenPngs(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        collectForbiddenPngs(file);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        try {
          const { pixelSha256 } = pngInfo(file);
          if (!forbiddenPixelHashes.has(pixelSha256)) {
            forbiddenPixelHashes.set(pixelSha256, file);
          }
        } catch {
          // Uma fonte inválida não pode tornar um screenshot estruturalmente válido elegível.
        }
      }
    }
  }

  for (const directory of new Set(forbiddenSourceDirectories.map((entry) => resolve(entry)))) {
    collectForbiddenPngs(directory);
  }
  for (const directory of screenshotDirectories) {
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.png')) continue;
      const file = join(directory, entry.name);
      let pixelSha256;
      try {
        ({ pixelSha256 } = pngInfo(file));
      } catch {
        continue;
      }
      const forbiddenFile = forbiddenPixelHashes.get(pixelSha256);
      if (forbiddenFile) {
        errors.push(
          `${describe(file)}: pixels idênticos à fonte não elegível ${describe(forbiddenFile)}; recompressão não promove fixture/mock/historical.`,
        );
      }
      const priorFile = seenPixelHashes.get(pixelSha256);
      if (priorFile) {
        errors.push(
          `${describe(file)}: hash visual SHA-256 duplicado de ${describe(priorFile)}; recompressão não torna captura repetida elegível.`,
        );
      } else {
        seenPixelHashes.set(pixelSha256, file);
      }
    }
  }

  const featureGraphic = join(storeAssetsRoot, 'android', 'feature-graphic.png');
  if (existsSync(featureGraphic)) {
    try {
      const { pixelSha256 } = pngInfo(featureGraphic);
      const forbiddenFile = forbiddenPixelHashes.get(pixelSha256);
      if (forbiddenFile) {
        errors.push(
          `${describe(featureGraphic)}: pixels idênticos à fonte não elegível ${describe(forbiddenFile)}; feature graphic histórico/mock não pode ser promovido.`,
        );
      }
    } catch {
      // A validação estrutural do feature graphic já produz o erro canônico no gate Android.
    }
  }
}

function manifestError(message) {
  errors.push(`store-assets/screenshots-manifest.json: ${message}`);
}

function checkObjectKeys(value, context, requiredKeys, allowedKeys = requiredKeys) {
  if (!isPlainObject(value)) {
    manifestError(`${context} deve ser um objeto.`);
    return false;
  }
  for (const key of requiredKeys) {
    if (!(key in value)) manifestError(`${context}.${key} é obrigatório.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) manifestError(`${context}.${key} não é permitido.`);
  }
  return true;
}

function parseIsoDate(value, context) {
  const match =
    typeof value === 'string'
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/.exec(value)
      : null;
  if (!match) {
    manifestError(`${context} deve ser uma data ISO-8601 UTC.`);
    return null;
  }

  const [, year, month, day, hour, minute, second, millisecond = '000'] = match;
  const parts = [year, month, day, hour, minute, second, millisecond].map(Number);
  const parsed = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5], parts[6]);
  const normalized = new Date(parsed);
  if (
    !Number.isFinite(parsed) ||
    normalized.getUTCFullYear() !== parts[0] ||
    normalized.getUTCMonth() !== parts[1] - 1 ||
    normalized.getUTCDate() !== parts[2] ||
    normalized.getUTCHours() !== parts[3] ||
    normalized.getUTCMinutes() !== parts[4] ||
    normalized.getUTCSeconds() !== parts[5] ||
    normalized.getUTCMilliseconds() !== parts[6]
  ) {
    manifestError(`${context} contém uma data inválida.`);
    return null;
  }
  if (parsed > Date.now() + 5 * 60 * 1000) {
    manifestError(`${context} não pode estar no futuro.`);
    return null;
  }
  return parsed;
}

function validReviewerIdentity(value, context) {
  if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 120) {
    manifestError(`${context} deve identificar uma pessoa ou agente revisor.`);
    return false;
  }
  if (
    /(?:^|[\s_-])(mock|fixture|historical|archive|example|placeholder|todo|tbd|unknown)(?:$|[\s_-])/i.test(
      value,
    )
  ) {
    manifestError(`${context} não pode usar identidade provisória ou histórica.`);
    return false;
  }
  return true;
}

function hasPlaceholderEntropy(value) {
  return new Set(value.replaceAll('-', '')).size < 6;
}

function readManifestSafely() {
  let initial;
  try {
    initial = lstatSync(manifestFile);
  } catch {
    manifestError('não foi possível abrir o arquivo obrigatório com segurança.');
    return null;
  }
  if (initial.isSymbolicLink()) {
    manifestError('link simbólico não é aceito; o manifesto deve ser um arquivo regular local.');
    return null;
  }
  if (!initial.isFile()) {
    manifestError('deve ser um arquivo regular, não diretório, socket, FIFO ou dispositivo.');
    return null;
  }
  if (initial.nlink !== 1) {
    manifestError('hard link não é aceito; o manifesto deve ter vínculo local único.');
    return null;
  }
  if (initial.size > maximumManifestBytes) {
    manifestError(`excede o limite pré-leitura de ${maximumManifestBytes / 1024} KiB.`);
    return null;
  }

  try {
    const manifestRealPath = realpathSync(manifestFile);
    const storeRealPath = realpathSync(storeAssetsRoot);
    if (dirname(manifestRealPath) !== storeRealPath || manifestRealPath !== resolve(manifestFile)) {
      manifestError('deve residir diretamente em store-assets e não pode apontar para fora dele.');
      return null;
    }
  } catch {
    manifestError('não foi possível comprovar o caminho local do manifesto.');
    return null;
  }

  let descriptor;
  try {
    descriptor = openSync(
      manifestFile,
      constants.O_RDONLY | (typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0),
    );
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.dev !== initial.dev ||
      opened.ino !== initial.ino ||
      opened.size > maximumManifestBytes
    ) {
      manifestError('foi alterado ou deixou de ser um arquivo regular local durante a leitura.');
      return null;
    }
    const contents = readFileSync(descriptor);
    if (contents.length > maximumManifestBytes) {
      manifestError(`excede o limite pré-leitura de ${maximumManifestBytes / 1024} KiB.`);
      return null;
    }
    return contents.toString('utf8');
  } catch {
    manifestError('não foi possível ler o arquivo regular sem seguir links.');
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateCandidateCommit(candidateCommit) {
  const commitObject = spawnSync(
    'git',
    ['-C', projectRoot, 'cat-file', '-e', `${candidateCommit}^{commit}`],
    { stdio: 'ignore', timeout: externalCommandTimeoutMs },
  );
  if (commitObject.error || commitObject.status !== 0) {
    manifestError(
      'candidateCommit não existe no repositório Git local; histórico raso não é evidência suficiente.',
    );
    return false;
  }

  const ancestor = spawnSync(
    'git',
    ['-C', projectRoot, 'merge-base', '--is-ancestor', candidateCommit, 'HEAD'],
    { stdio: 'ignore', timeout: externalCommandTimeoutMs },
  );
  if (ancestor.error || ancestor.status !== 0) {
    manifestError('candidateCommit deve ser o candidato real ou um ancestral do HEAD validado.');
    return false;
  }
  return true;
}

function jsonVersion(text, source, selector) {
  try {
    const parsed = JSON.parse(text);
    const version = selector(parsed);
    if (typeof version !== 'string' || version.length === 0 || version.length > 64) {
      throw new Error('invalid version');
    }
    return version;
  } catch {
    manifestError(`não foi possível obter uma versão válida de ${source}.`);
    return null;
  }
}

function currentJsonVersion(file, source, selector) {
  try {
    const contents = readFileSync(file, 'utf8');
    if (Buffer.byteLength(contents) > 1024 * 1024) throw new Error('oversized JSON');
    return jsonVersion(contents, source, selector);
  } catch {
    manifestError(`não foi possível ler ${source} do checkout atual.`);
    return null;
  }
}

function candidateJsonVersion(candidateCommit, file, source, selector) {
  const projectPrefix = relative(repositoryRoot, projectRoot).split(sep).join('/');
  if (projectPrefix === '..' || projectPrefix.startsWith('../')) {
    manifestError('diretório do aplicativo não pertence ao repositório Git validado.');
    return null;
  }
  const repositoryPath = projectPrefix ? `${projectPrefix}/${file}` : file;
  const result = spawnSync(
    'git',
    ['-C', repositoryRoot, 'show', `${candidateCommit}:${repositoryPath}`],
    { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: externalCommandTimeoutMs },
  );
  if (result.error || result.status !== 0) {
    manifestError(`${source} não existe ou não pôde ser lido no candidateCommit.`);
    return null;
  }
  return jsonVersion(result.stdout, `${source} no candidateCommit`, selector);
}

function validateAppVersions(manifest) {
  const selectors = {
    package: (value) => value.version,
    expo: (value) => value.expo?.version,
  };
  const versions = [
    [
      'package.json do checkout atual',
      currentJsonVersion(join(projectRoot, 'package.json'), 'package.json', selectors.package),
    ],
    [
      'app.json do checkout atual',
      currentJsonVersion(join(projectRoot, 'app.json'), 'app.json', selectors.expo),
    ],
    [
      'package.json do candidateCommit',
      candidateJsonVersion(
        manifest.candidateCommit,
        'package.json',
        'package.json',
        selectors.package,
      ),
    ],
    [
      'app.json do candidateCommit',
      candidateJsonVersion(manifest.candidateCommit, 'app.json', 'app.json', selectors.expo),
    ],
  ];
  for (const [source, version] of versions) {
    if (version !== null && version !== manifest.appVersion) {
      manifestError(`appVersion ${manifest.appVersion} diverge de ${source} (${version}).`);
    }
  }
}

function archiveListing(artifact) {
  const result = spawnSync('unzip', ['-Z1', artifact], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: externalCommandTimeoutMs,
  });
  if (result.error || result.status !== 0) {
    throw new Error('artefato não é um arquivo ZIP íntegro e inspecionável');
  }
  const entries = result.stdout.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0 || entries.length > 20_000) {
    throw new Error('artefato contém quantidade inválida de entradas ZIP');
  }
  return entries;
}

function archiveEntry(artifact, entry) {
  const result = spawnSync('unzip', ['-p', artifact, entry], {
    encoding: null,
    maxBuffer: 2 * 1024 * 1024,
    timeout: externalCommandTimeoutMs,
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error('metadado de versão do artefato não pôde ser extraído com segurança');
  }
  return result.stdout;
}

function plistVersion(contents) {
  const versionPattern =
    /<key>\s*CFBundleShortVersionString\s*<\/key>\s*<string>\s*([^<\s][^<]*)\s*<\/string>/;
  let xml = contents.toString('utf8');
  let match = versionPattern.exec(xml);
  if (!match) {
    const converted = spawnSync('plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], {
      input: contents,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: externalCommandTimeoutMs,
    });
    if (converted.error || converted.status !== 0) {
      throw new Error('Info.plist não pôde ser convertido para inspeção de versão');
    }
    xml = converted.stdout;
    match = versionPattern.exec(xml);
  }
  if (!match) throw new Error('Info.plist não declara CFBundleShortVersionString');
  return match[1].trim();
}

function inspectArtifactVersion(artifact, kind) {
  const entries = archiveListing(artifact);
  if (kind === 'ipa') {
    const infoPlists = entries.filter((entry) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(entry));
    if (infoPlists.length !== 1) {
      throw new Error('IPA deve conter exatamente um Payload/*.app/Info.plist principal');
    }
    return plistVersion(archiveEntry(artifact, infoPlists[0]));
  }

  const manifestEntry = 'base/manifest/AndroidManifest.xml';
  const canonicalManifests = entries.filter((entry) => entry === manifestEntry);
  if (canonicalManifests.length !== 1) {
    throw new Error(
      'AAB deve conter exatamente uma entrada canônica base/manifest/AndroidManifest.xml',
    );
  }
  const manifestContents = archiveEntry(artifact, manifestEntry);
  const xmlMatch = /(?:android:)?versionName\s*=\s*["']([^"']+)["']/.exec(
    manifestContents.toString('utf8'),
  );
  if (xmlMatch) return xmlMatch[1];

  const bundletool = spawnSync(
    'bundletool',
    ['dump', 'manifest', `--bundle=${artifact}`, '--xpath=/manifest/@android:versionName'],
    { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: externalCommandTimeoutMs },
  );
  if (bundletool.error || bundletool.status !== 0 || bundletool.stdout.trim().length === 0) {
    throw new Error('AndroidManifest binário não pôde ser inspecionado com bundletool');
  }
  return bundletool.stdout.trim();
}

function validateManifest(requestedPlatform, sets) {
  if (sets.every((set) => set.files.length === 0)) return;
  if (!existsSync(manifestFile)) {
    manifestError('obrigatório quando existe qualquer screenshot de submissão.');
    return;
  }

  const manifestContents = readManifestSafely();
  if (manifestContents === null) return;
  let manifest;
  try {
    manifest = JSON.parse(manifestContents);
  } catch {
    manifestError('JSON ausente ou inválido.');
    return;
  }

  const rootKeys = [
    'schemaVersion',
    'appVersion',
    'candidateCommit',
    'environment',
    'captureSource',
    'capturedAt',
    'capturedBy',
    'platforms',
  ];
  if (!checkObjectKeys(manifest, 'raiz', rootKeys)) return;

  if (manifest.schemaVersion !== 1) manifestError('schemaVersion deve ser 1.');
  if (
    typeof manifest.appVersion !== 'string' ||
    manifest.appVersion.length === 0 ||
    manifest.appVersion.length > 64
  ) {
    manifestError('appVersion deve ser uma versão não vazia com no máximo 64 caracteres.');
  }

  let candidateCommitValid = false;
  if (
    typeof manifest.candidateCommit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(manifest.candidateCommit)
  ) {
    manifestError('candidateCommit deve ser um SHA Git completo, minúsculo e com 40 caracteres.');
  } else if (/^([0-9a-f])\1{39}$/.test(manifest.candidateCommit)) {
    manifestError('candidateCommit não pode ser um valor sentinela.');
  } else {
    candidateCommitValid = validateCandidateCommit(manifest.candidateCommit);
  }
  if (candidateCommitValid && typeof manifest.appVersion === 'string')
    validateAppVersions(manifest);
  if (!['qa', 'staging', 'production'].includes(manifest.environment)) {
    manifestError(
      'environment deve ser qa, staging ou production; fixture/mock/historical nunca é elegível.',
    );
  }
  if (manifest.captureSource !== 'release-candidate') {
    manifestError(
      'captureSource deve ser release-candidate; fixture/mock/historical nunca é elegível.',
    );
  }
  const capturedAt = parseIsoDate(manifest.capturedAt, 'capturedAt');
  validReviewerIdentity(manifest.capturedBy, 'capturedBy');

  let manifestScreenshotEntries = 0;
  if (isPlainObject(manifest.platforms)) {
    for (const platformValue of Object.values(manifest.platforms)) {
      if (!isPlainObject(platformValue?.sets)) continue;
      for (const setValue of Object.values(platformValue.sets)) {
        if (Array.isArray(setValue)) manifestScreenshotEntries += setValue.length;
      }
    }
  }
  if (manifestScreenshotEntries > maximumManifestScreenshotEntries) {
    manifestError(
      `declara ${manifestScreenshotEntries} screenshots; limite global ${maximumManifestScreenshotEntries}.`,
    );
  }

  if (!checkObjectKeys(manifest.platforms, 'platforms', [requestedPlatform], ['ios', 'android'])) {
    return;
  }
  const platformManifest = manifest.platforms[requestedPlatform];
  const requiredPlatformKeys =
    requestedPlatform === 'android'
      ? ['sets', 'featureGraphic', 'candidateArtifact', 'secondReview']
      : ['sets', 'candidateArtifact', 'secondReview'];
  if (!checkObjectKeys(platformManifest, `platforms.${requestedPlatform}`, requiredPlatformKeys)) {
    return;
  }

  const setNames = sets.map((set) => set.name);
  if (!checkObjectKeys(platformManifest.sets, `platforms.${requestedPlatform}.sets`, setNames)) {
    return;
  }

  const declaredScenes = new Set();
  for (const set of sets) {
    const manifestEntries = platformManifest.sets[set.name];
    const context = `platforms.${requestedPlatform}.sets.${set.name}`;
    if (!Array.isArray(manifestEntries)) {
      manifestError(`${context} deve ser uma lista.`);
      continue;
    }

    const expectedAssets = new Map(
      set.assets.map((asset) => [toStorePath(asset.file), asset.sha256]),
    );
    const declaredFiles = new Set();
    for (const [index, entry] of manifestEntries.entries()) {
      const entryContext = `${context}[${index}]`;
      if (!checkObjectKeys(entry, entryContext, ['file', 'scene', 'sha256'])) continue;

      if (
        typeof entry.file !== 'string' ||
        entry.file.length > 240 ||
        !entry.file.startsWith(`${requestedPlatform}/${set.name}/`)
      ) {
        manifestError(`${entryContext}.file deve apontar para o conjunto de submissão atual.`);
      } else if (declaredFiles.has(entry.file)) {
        manifestError(`${entryContext}.file está duplicado no manifesto.`);
      } else {
        declaredFiles.add(entry.file);
      }
      if (!canonicalScenes.has(entry.scene)) {
        manifestError(`${entryContext}.scene não é uma cena canônica da checklist.`);
      } else {
        declaredScenes.add(entry.scene);
      }
      if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
        manifestError(`${entryContext}.sha256 deve ser um hash SHA-256 minúsculo.`);
      }

      const actualHash = expectedAssets.get(entry.file);
      if (!actualHash) {
        manifestError(`${entryContext}.file não corresponde a um screenshot PNG elegível.`);
      } else if (entry.sha256 !== actualHash) {
        manifestError(`${entryContext}.sha256 não corresponde ao conteúdo do arquivo.`);
      }
    }

    for (const file of expectedAssets.keys()) {
      if (!declaredFiles.has(file)) manifestError(`${context} não declara ${file}.`);
    }
    if (manifestEntries.length !== set.files.length) {
      manifestError(
        `${context} deve mapear exatamente os ${set.files.length} screenshot(s) do diretório.`,
      );
    }
  }

  const missingScenes = [...canonicalScenes].filter((scene) => !declaredScenes.has(scene));
  if (missingScenes.length > 0) {
    manifestError(
      `platforms.${requestedPlatform} não comprova todas as cenas canônicas; faltam: ${missingScenes.join(', ')}.`,
    );
  }

  if (requestedPlatform === 'android') {
    const featureGraphic = platformManifest.featureGraphic;
    const context = 'platforms.android.featureGraphic';
    if (checkObjectKeys(featureGraphic, context, ['file', 'sha256'])) {
      if (featureGraphic.file !== 'android/feature-graphic.png') {
        manifestError(`${context}.file deve ser android/feature-graphic.png.`);
      }
      const featureGraphicFile = join(storeAssetsRoot, 'android', 'feature-graphic.png');
      if (!existsSync(featureGraphicFile)) {
        manifestError(`${context}.file não existe no candidato.`);
      } else {
        const actualHash = sha256File(featureGraphicFile);
        if (
          typeof featureGraphic.sha256 !== 'string' ||
          !/^[0-9a-f]{64}$/.test(featureGraphic.sha256)
        ) {
          manifestError(`${context}.sha256 deve ser um hash SHA-256 minúsculo.`);
        } else if (featureGraphic.sha256 !== actualHash) {
          manifestError(`${context}.sha256 não corresponde ao conteúdo do arquivo.`);
        }
      }
    }
  }

  const candidateArtifact = platformManifest.candidateArtifact;
  const artifactContext = `platforms.${requestedPlatform}.candidateArtifact`;
  if (
    checkObjectKeys(candidateArtifact, artifactContext, [
      'kind',
      'appVersion',
      'candidateCommit',
      'buildId',
      'sha256',
    ])
  ) {
    const expectedKind = requestedPlatform === 'ios' ? 'ipa' : 'aab';
    if (candidateArtifact.kind !== expectedKind) {
      manifestError(`${artifactContext}.kind deve ser ${expectedKind}.`);
    }
    if (candidateArtifact.appVersion !== manifest.appVersion) {
      manifestError(`${artifactContext}.appVersion deve repetir a versão do candidato validado.`);
    }
    if (candidateArtifact.candidateCommit !== manifest.candidateCommit) {
      manifestError(`${artifactContext}.candidateCommit deve repetir o candidato Git validado.`);
    }
    if (
      candidateArtifact.buildId !== null &&
      (!uuidPattern.test(candidateArtifact.buildId) ||
        hasPlaceholderEntropy(candidateArtifact.buildId))
    ) {
      manifestError(
        `${artifactContext}.buildId deve ser null ou UUID canônico minúsculo não provisório.`,
      );
    }
    if (
      typeof candidateArtifact.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(candidateArtifact.sha256) ||
      hasPlaceholderEntropy(candidateArtifact.sha256)
    ) {
      manifestError(
        `${artifactContext}.sha256 deve ser o SHA-256 minúsculo não provisório do artefato local.`,
      );
    }
    if (submissionContext.artifact !== null) {
      let selectedArtifactHash = null;
      try {
        const expectedExtension = requestedPlatform === 'ios' ? '.ipa' : '.aab';
        if (!submissionContext.artifact.endsWith(expectedExtension)) {
          throw new Error('extensão inválida');
        }
        const selectedArtifact = lstatSync(submissionContext.artifact);
        if (selectedArtifact.isSymbolicLink() || !selectedArtifact.isFile()) {
          throw new Error('artefato não regular');
        }
        selectedArtifactHash = sha256File(submissionContext.artifact);
      } catch {
        manifestError(`${artifactContext}.sha256 não pôde validar o artefato selecionado.`);
      }
      if (selectedArtifactHash !== null && candidateArtifact.sha256 !== selectedArtifactHash) {
        manifestError(`${artifactContext}.sha256 não corresponde ao artefato selecionado.`);
      }
      if (selectedArtifactHash !== null) {
        try {
          const artifactVersion = inspectArtifactVersion(
            submissionContext.artifact,
            requestedPlatform === 'ios' ? 'ipa' : 'aab',
          );
          if (artifactVersion !== manifest.appVersion) {
            manifestError(
              `${artifactContext}.appVersion ${manifest.appVersion} diverge do pacote selecionado (${artifactVersion}).`,
            );
          }
        } catch (error) {
          manifestError(
            `${artifactContext}.appVersion não pôde ser comprovada no pacote selecionado: ${
              error instanceof Error ? error.message : 'artefato não inspecionável'
            }.`,
          );
        }
      }
    }
  }

  const review = platformManifest.secondReview;
  if (
    !checkObjectKeys(review, `platforms.${requestedPlatform}.secondReview`, [
      'reviewer',
      'reviewedAt',
      'candidateCommit',
      'attestation',
      'verdict',
    ])
  ) {
    return;
  }
  const reviewerValid = validReviewerIdentity(
    review.reviewer,
    `platforms.${requestedPlatform}.secondReview.reviewer`,
  );
  if (
    reviewerValid &&
    typeof manifest.capturedBy === 'string' &&
    review.reviewer.trim().toLowerCase() === manifest.capturedBy.trim().toLowerCase()
  ) {
    manifestError(
      `platforms.${requestedPlatform}.secondReview.reviewer deve ser independente do capturador.`,
    );
  }
  const reviewedAt = parseIsoDate(
    review.reviewedAt,
    `platforms.${requestedPlatform}.secondReview.reviewedAt`,
  );
  if (capturedAt !== null && reviewedAt !== null && reviewedAt < capturedAt) {
    manifestError(
      `platforms.${requestedPlatform}.secondReview.reviewedAt não pode preceder a captura.`,
    );
  }
  if (review.candidateCommit !== manifest.candidateCommit) {
    manifestError(
      `platforms.${requestedPlatform}.secondReview.candidateCommit deve repetir o candidato.`,
    );
  }
  if (review.attestation !== 'screenshots-and-artifact-match-release-candidate') {
    manifestError(
      `platforms.${requestedPlatform}.secondReview.attestation deve confirmar screenshots e artefato do candidato.`,
    );
  }
  if (review.verdict !== 'approved') {
    manifestError(`platforms.${requestedPlatform}.secondReview.verdict deve ser approved.`);
  }
}

if (platform === 'ios') {
  const root = join(storeAssetsRoot, 'ios');
  const phoneDir = join(root, 'iphone-6.9');
  const tabletDir = join(root, 'ipad-13');
  validateRootDirectories(root, new Set(['iphone-6.9', 'ipad-13']));

  const phoneDimensions = new Set([
    '1260x2736',
    '2736x1260',
    '1290x2796',
    '2796x1290',
    '1320x2868',
    '2868x1320',
  ]);
  const tabletDimensions = new Set(['2064x2752', '2752x2064', '2048x2732', '2732x2048']);
  const sets = [
    validateSet({
      name: 'iphone-6.9',
      label: 'iPhone 6.9″',
      directory: phoneDir,
      minimum: 5,
      maximum: 10,
      dimensions: phoneDimensions,
    }),
    validateSet({
      name: 'ipad-13',
      label: 'iPad 13″',
      directory: tabletDir,
      minimum: 5,
      maximum: 10,
      dimensions: tabletDimensions,
    }),
  ];

  for (const file of listDirectPngs(root, 'raiz iOS', { rejectDirectories: false })) {
    errors.push(`${describe(file)}: captura fora de ios/iphone-6.9 ou ios/ipad-13.`);
  }
  validateManifest(platform, sets);
}

if (platform === 'android') {
  const root = join(storeAssetsRoot, 'android');
  const phoneDir = join(root, 'phone');
  const tabletDir = join(root, 'tablet-10');
  const featureGraphic = join(root, 'feature-graphic.png');
  const accountDeletionBlocker = join(storeAssetsRoot, 'ACCOUNT_DELETION_BLOCKER.md');
  const accountDeletionResolution = join(storeAssetsRoot, 'ACCOUNT_DELETION_RESOLUTION.json');
  if (existsSync(accountDeletionBlocker) === existsSync(accountDeletionResolution)) {
    errors.push(
      'Data Safety: informe exatamente um estado de exclusão — blocker vigente ou resolução positiva versionada.',
    );
  }
  // The Data Safety declaration is state-bound: while the blocker exists the account URL must be
  // blank; after a positive resolution it becomes mandatory. Reading the blocker here also keeps
  // a malformed replacement from silently changing that state during a store command.
  const dataSafety = validateDataSafetyFiles({
    blockerPath: existsSync(accountDeletionBlocker) ? accountDeletionBlocker : null,
  });
  for (const error of dataSafety.errors) errors.push(`Data Safety: ${error}`);
  validateRootDirectories(root, new Set(['phone', 'tablet-10', '_src']));

  const sets = [
    validateSet({
      name: 'phone',
      label: 'Android phone',
      directory: phoneDir,
      minimum: 5,
      maximum: 8,
      maximumFileBytes: 8 * 1024 * 1024,
      pngConstraints: {
        minimumSide: 320,
        maximumSide: 3840,
        maximumRatio: 2,
        maximumPixels: 3840 * 3840,
      },
    }),
    validateSet({
      name: 'tablet-10',
      label: 'Android tablet 10″',
      directory: tabletDir,
      minimum: 4,
      maximum: 8,
      maximumFileBytes: 8 * 1024 * 1024,
      pngConstraints: {
        minimumSide: 1080,
        maximumSide: 7680,
        requiredRatio: 16 / 9,
        ratioTolerance: 0.01,
        maximumPixels: 7680 * 4320,
      },
    }),
  ];

  if (!existsSync(featureGraphic)) {
    errors.push('Android feature graphic: arquivo ausente.');
  } else {
    validateOpaquePng(featureGraphic, {
      label: 'feature graphic Android',
      exactWidth: 1024,
      exactHeight: 500,
      maximumPixels: 1024 * 500,
    });
  }

  for (const file of listDirectPngs(root, 'raiz Android', { rejectDirectories: false })) {
    if (file !== featureGraphic) {
      errors.push(`${describe(file)}: captura fora de android/phone ou android/tablet-10.`);
    }
  }
  validateManifest(platform, sets);
}

validateGlobalScreenshotUniqueness();

if (errors.length > 0) {
  console.error('BLOQUEADO: ativos de loja ainda não atendem ao candidato:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(3);
}

console.log(
  `Ativos ${platform} validados: limites, caminhos, PNG opaco/íntegro, dimensões, unicidade e proveniência.`,
);
