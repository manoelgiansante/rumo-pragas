#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const platform = process.argv[2];
const errors = [];

if (!['ios', 'android'].includes(platform)) {
  console.error('Uso: node scripts/validate-store-assets.mjs <ios|android>');
  process.exit(2);
}

function listPngs(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return listPngs(absolute);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.png') ? [absolute] : [];
  });
}

function pngInfo(file) {
  const data = readFileSync(file);
  const signature = '89504e470d0a1a0a';
  if (data.length < 33 || data.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('arquivo não é PNG válido');
  }
  if (data.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('PNG sem IHDR válido');
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
    hasTransparencyChunk: data.includes(Buffer.from('tRNS')),
    bytes: statSync(file).size,
  };
}

function describe(file) {
  return relative(projectRoot, file);
}

function validateOpaquePng(file) {
  try {
    const info = pngInfo(file);
    if (info.colorType === 4 || info.colorType === 6 || info.hasTransparencyChunk) {
      errors.push(`${describe(file)}: PNG contém canal/transparência; as lojas exigem imagem opaca.`);
    }
    return info;
  } catch (error) {
    errors.push(`${describe(file)}: ${error instanceof Error ? error.message : 'PNG inválido'}.`);
    return null;
  }
}

function validateSet({ label, directory, minimum, dimensions, validate }) {
  const files = listPngs(directory);
  if (files.length < minimum) {
    errors.push(`${label}: ${files.length} captura(s); mínimo operacional ${minimum}.`);
  }
  for (const file of files) {
    const info = validateOpaquePng(file);
    if (!info) continue;
    if (dimensions && !dimensions.has(`${info.width}x${info.height}`)) {
      errors.push(`${describe(file)}: ${info.width}x${info.height} não é uma dimensão aceita para ${label}.`);
    }
    validate?.(file, info);
  }
  return files;
}

if (platform === 'ios') {
  const root = join(projectRoot, 'store-assets', 'ios');
  const phoneDir = join(root, 'iphone-6.9');
  const tabletDir = join(root, 'ipad-13');
  const phoneDimensions = new Set([
    '1260x2736', '2736x1260',
    '1290x2796', '2796x1290',
    '1320x2868', '2868x1320',
  ]);
  const tabletDimensions = new Set([
    '2064x2752', '2752x2064',
    '2048x2732', '2732x2048',
  ]);

  const accepted = new Set([
    ...validateSet({ label: 'iPhone 6.9″', directory: phoneDir, minimum: 5, dimensions: phoneDimensions }),
    ...validateSet({ label: 'iPad 13″', directory: tabletDir, minimum: 5, dimensions: tabletDimensions }),
  ]);
  const unexpected = listPngs(root).filter(
    (file) => !file.includes(`${join(root, 'archive')}/`) && !accepted.has(file),
  );
  for (const file of unexpected) {
    errors.push(`${describe(file)}: captura fora de ios/iphone-6.9 ou ios/ipad-13.`);
  }
}

if (platform === 'android') {
  const root = join(projectRoot, 'store-assets', 'android');
  const phoneDir = join(root, 'phone');
  const tabletDir = join(root, 'tablet-10');
  const featureGraphic = join(root, 'feature-graphic.png');

  const phoneFiles = validateSet({
    label: 'Android phone',
    directory: phoneDir,
    minimum: 5,
    validate(file, info) {
      const min = Math.min(info.width, info.height);
      const max = Math.max(info.width, info.height);
      if (min < 320 || max > 3840 || max > min * 2) {
        errors.push(`${describe(file)}: ${info.width}x${info.height} viola 320–3840 px e proporção máxima 2:1.`);
      }
      if (info.bytes > 8 * 1024 * 1024) {
        errors.push(`${describe(file)}: captura excede 8 MB.`);
      }
    },
  });

  const tabletFiles = validateSet({
    label: 'Android tablet 10″',
    directory: tabletDir,
    minimum: 4,
    validate(file, info) {
      const min = Math.min(info.width, info.height);
      const max = Math.max(info.width, info.height);
      const ratio = max / min;
      if (min < 1080 || max > 7680 || Math.abs(ratio - 16 / 9) > 0.01) {
        errors.push(`${describe(file)}: ${info.width}x${info.height} deve ter 1080–7680 px e proporção 9:16/16:9.`);
      }
      if (info.bytes > 8 * 1024 * 1024) {
        errors.push(`${describe(file)}: captura excede 8 MB.`);
      }
    },
  });

  if (!existsSync(featureGraphic)) {
    errors.push('Android feature graphic: arquivo ausente.');
  } else {
    const info = validateOpaquePng(featureGraphic);
    if (info && (info.width !== 1024 || info.height !== 500)) {
      errors.push(`store-assets/android/feature-graphic.png: ${info.width}x${info.height}; esperado 1024x500.`);
    }
  }

  const accepted = new Set([...phoneFiles, ...tabletFiles, featureGraphic]);
  const unexpected = listPngs(root).filter(
    (file) =>
      !file.includes(`${join(root, 'archive')}/`) &&
      !file.includes(`${join(root, '_src')}/`) &&
      !accepted.has(file),
  );
  for (const file of unexpected) {
    errors.push(`${describe(file)}: captura fora de android/phone ou android/tablet-10.`);
  }
}

if (errors.length > 0) {
  console.error('BLOQUEADO: ativos de loja ainda não atendem ao candidato:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(3);
}

console.log(`Ativos ${platform} validados: quantidade, caminho, PNG opaco e dimensões.`);
