#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appRoot, '..');
const errors = [];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(
      `${relative(repoRoot, path)}: JSON inválido (${
        error instanceof Error ? error.message : 'erro desconhecido'
      }).`,
    );
    return {};
  }
}

function listFiles(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    listFiles(join(path, entry.name)),
  );
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

const packageJson = readJson(join(appRoot, 'package.json'));
const appJson = readJson(join(appRoot, 'app.json'));
const expo = appJson.expo ?? {};
const semver = /^\d+\.\d+\.\d+$/;

if (!semver.test(packageJson.version ?? '')) {
  errors.push('expo-app/package.json: version deve ser semver X.Y.Z.');
}
if (packageJson.version !== expo.version) {
  errors.push(
    `Versões divergentes: package.json=${packageJson.version ?? 'ausente'} e app.json=${
      expo.version ?? 'ausente'
    }.`,
  );
}
if (packageJson.engines?.node !== '22.22.3' || packageJson.engines?.npm !== '10.9.8') {
  errors.push('package.json: engines deve fixar Node 22.22.3 e npm 10.9.8.');
}
if (packageJson.packageManager !== 'npm@10.9.8') {
  errors.push('package.json: packageManager deve ser npm@10.9.8.');
}
if (readFileSync(join(appRoot, '.nvmrc'), 'utf8').trim() !== packageJson.engines?.node) {
  errors.push('.nvmrc e package.json engines.node estão divergentes.');
}
if (expo.ios?.bundleIdentifier !== 'com.agrorumo.rumopragas') {
  errors.push('app.json: bundleIdentifier iOS inesperado.');
}
if (expo.android?.package !== 'com.agrorumo.rumopragas') {
  errors.push('app.json: package Android inesperado.');
}
if (expo.runtimeVersion?.policy !== 'appVersion') {
  errors.push('app.json: runtimeVersion deve usar policy appVersion.');
}

const paidSdkNames = [
  'react-native-iap',
  'react-native-purchases',
  '@revenuecat/purchases-typescript-internal',
  '@stripe/stripe-react-native',
];
const allDependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};
for (const sdk of paidSdkNames) {
  if (sdk in allDependencies) {
    errors.push(`package.json: SDK de compra/cobrança não aplicável presente: ${sdk}.`);
  }
}

const releaseRoots = [
  join(appRoot, 'store-assets', 'metadata'),
  join(repoRoot, 'marketing', 'launch-content'),
  join(repoRoot, 'marketing', 'meta-ads-copy.md'),
  join(repoRoot, 'marketing', 'meta-ads'),
];
const textExtensions = new Set(['.md', '.txt', '.json', '.csv', '.sh']);
const releaseFiles = releaseRoots
  .flatMap(listFiles)
  .filter((path) => textExtensions.has(extname(path).toLowerCase()));

// Accessibility labels are release copy too. Scan the locale sources with a
// deliberately narrow rule: professional disclaimers such as “consulte um
// agrônomo” remain valid, while presenting the AI itself as that regulated
// professional is blocked in every shipped language.
const localeFiles = listFiles(join(appRoot, 'i18n', 'locales')).filter(
  (path) => extname(path).toLowerCase() === '.ts',
);
const aiProfessionalEquivalence = /\b(?:IA\s+Agr[oóô]nom[oa]|AI\s+Agronomist)\b/giu;
for (const file of localeFiles) {
  const content = readFileSync(file, 'utf8');
  aiProfessionalEquivalence.lastIndex = 0;
  for (const match of content.matchAll(aiProfessionalEquivalence)) {
    errors.push(
      `${relative(repoRoot, file)}:${lineNumber(content, match.index ?? 0)}: equivalência profissional da IA.`,
    );
  }
}

const placeholders = [
  { label: 'TODO', regex: /\bTODO\b/gu },
  { label: 'FIXME', regex: /\bFIXME\b/gu },
  { label: 'TBD', regex: /\bTBD\b/gu },
  { label: 'placeholder', regex: /\bPLACEHOLDER\b/giu },
  {
    label: 'campo não preenchido',
    regex: /\[(?:INSERIR|PREENCHER|DEFINIR|SUBSTITUIR)[^\]]*\]/giu,
  },
];

const forbiddenClaims = [
  {
    label: 'acurácia legada',
    regex: /\b82(?:[,.]5)?\s*%\s*(?:de\s+)?(?:acurácia|accuracy)/giu,
  },
  {
    label: 'tempo fixo de cinco segundos',
    regex: /\b(?:5|cinco)\s*(?:segundos|seconds)\b/giu,
  },
  { label: 'trial inexistente', regex: /\b7\s+dias\s+grátis\b/giu },
  { label: 'preço inexistente', regex: /R\$\s*49[,.]90/giu },
  {
    label: 'catálogo não provado',
    regex: /\+\s*500\s+(?:pragas|pests)|30\+\s+culturas/giu,
  },
  {
    label: 'treino de campo não provado',
    regex: /(?:treinad[oa]|trained)[^\n]{0,80}(?:lavoura|campo|field)/giu,
  },
  {
    label: 'inferência offline falsa',
    regex: /(?:funciona|identifica|diagnostica)[^\n]{0,60}sem\s+(?:internet|sinal)/giu,
  },
  {
    label: 'equivalência profissional',
    regex: /(?:seu|uma?)\s+agrônom[oa]\s+(?:no bolso|ia)|ai agronomist/giu,
  },
  {
    label: 'prescrição química',
    regex:
      /triazol|aplicar\s+fungicida|fungicida[^\n]{0,50}(?:dose|janela)|dose\s+de\s+fungicida/giu,
  },
  {
    label: 'resultado econômico inventado',
    regex: /salv(?:ou|ei|amos)\s+\d+\s*(?:ha|hectares)|perdeu\s+30\s*%/giu,
  },
  { label: 'pioneirismo não provado', regex: /primeiro\s+app\s+brasileiro/giu },
  {
    label: 'base de usuários não provada',
    regex: /\b5\s+milhões\s+de\s+produtores\b/giu,
  },
];

for (const file of releaseFiles) {
  const content = readFileSync(file, 'utf8');
  for (const rule of [...placeholders, ...forbiddenClaims]) {
    rule.regex.lastIndex = 0;
    for (const match of content.matchAll(rule.regex)) {
      errors.push(
        `${relative(repoRoot, file)}:${lineNumber(content, match.index ?? 0)}: ${rule.label}.`,
      );
    }
  }
}

const metadataLimits = new Map([
  ['expo-app/store-assets/metadata/ios/pt-BR/name.txt', 30],
  ['expo-app/store-assets/metadata/ios/pt-BR/subtitle.txt', 30],
  ['expo-app/store-assets/metadata/ios/pt-BR/promotional_text.txt', 170],
  ['expo-app/store-assets/metadata/ios/pt-BR/keywords.txt', 100],
  ['expo-app/store-assets/metadata/ios/pt-BR/description.txt', 4000],
  ['expo-app/store-assets/metadata/ios/pt-BR/whats_new.txt', 4000],
  ['expo-app/store-assets/metadata/android/pt-BR/title.txt', 30],
  ['expo-app/store-assets/metadata/android/pt-BR/short_description.txt', 80],
  ['expo-app/store-assets/metadata/android/pt-BR/full_description.txt', 4000],
  ['expo-app/store-assets/metadata/android/pt-BR/whats_new.txt', 500],
]);

for (const [path, limit] of metadataLimits) {
  const absolute = join(repoRoot, path);
  if (!existsSync(absolute)) {
    errors.push(`${path}: metadata obrigatório ausente.`);
    continue;
  }
  const value = readFileSync(absolute, 'utf8').trim();
  if (!value) errors.push(`${path}: metadata vazio.`);
  if ([...value].length > limit) {
    errors.push(`${path}: ${[...value].length} caracteres; limite ${limit}.`);
  }
}

if (errors.length > 0) {
  console.error('BLOQUEADO: superfícies de release inconsistentes:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Release surfaces validadas: versão ${expo.version}, configuração, metadata e marketing.`,
);
