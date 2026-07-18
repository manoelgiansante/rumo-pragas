#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const html = fs.readFileSync(path.join(root, 'app/+html.tsx'), 'utf8');
const onboarding = fs.readFileSync(path.join(root, 'app/onboarding.tsx'), 'utf8');
const login = fs.readFileSync(path.join(root, 'app/(auth)/login.tsx'), 'utf8');
const rootLayout = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
const legalSources = ['terms', 'privacy'].map((route) => ({
  route,
  source: fs.readFileSync(path.join(root, `app/${route}.tsx`), 'utf8'),
}));
const failures = [];
const requireCondition = (condition, message) => {
  if (!condition) failures.push(message);
};

requireCondition(
  config.installCommand === 'npm ci',
  'deploy web deve instalar exatamente o package-lock com npm ci',
);

requireCondition(
  html.includes('noindex,nofollow,noarchive,nosnippet'),
  'o app web autenticado deve usar robots noindex',
);
requireCondition(html.includes('name="color-scheme"'), 'color-scheme ausente do HTML');

const expoRouter = app.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-router',
);
const expoRouterConfig = Array.isArray(expoRouter) ? expoRouter[1] : null;
requireCondition(
  expoRouterConfig?.asyncRoutes?.web === 'development' &&
    expoRouterConfig?.asyncRoutes?.default === 'development',
  'rotas assíncronas devem ficar restritas ao desenvolvimento para preservar navegação offline',
);

const broadIconImports = [];
const visitSources = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) visitSources(absolute);
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    if (source.includes("from '@expo/vector-icons'")) {
      broadIconImports.push(path.relative(root, absolute));
    }
  }
};
for (const directory of ['app', 'components']) visitSources(path.join(root, directory));
requireCondition(
  broadIconImports.length === 0,
  `imports amplos de ícones reintroduzem todas as fontes no web export: ${broadIconImports.join(', ')}`,
);
requireCondition(
  !rootLayout.includes("from '@expo-google-fonts/poppins'"),
  'layout raiz deve importar somente os pesos Poppins usados',
);
requireCondition(
  onboarding.includes('aria-hidden={!isCurrentPage}') &&
    onboarding.includes("? ({ role: 'group' } as const)") &&
    onboarding.includes("({ accessibilityRole: 'adjustable' } as const)"),
  'onboarding deve ocultar slides inativos e rotular o carrossel por plataforma',
);
for (const route of ['/terms', '/privacy']) {
  requireCondition(
    login.includes(`<Link href="${route}" asChild>`),
    `link legal sem semântica navegável no login: ${route}`,
  );
}
for (const { route, source } of legalSources) {
  requireCondition(
    source.includes("? ({ lang: 'pt-BR' } as const)") &&
      source.includes("({ accessibilityLanguage: 'pt-BR' } as const)") &&
      source.includes('aria-level={1}') &&
      source.includes('aria-level={2}'),
    `documento legal sem idioma ou hierarquia de títulos acessível: /${route}`,
  );
}

const rewrite = config.rewrites?.find((candidate) => candidate.destination === '/index.html');
requireCondition(!!rewrite, 'fallback SPA ausente');
if (rewrite?.source) {
  try {
    const matcher = new RegExp(`^${rewrite.source.slice(1)}$`);
    requireCondition(matcher.test('diagnosis/result'), 'fallback SPA não cobre rotas do app');
    requireCondition(!matcher.test('api/mcp'), 'fallback SPA não pode capturar /api');
    requireCondition(!matcher.test('api'), 'fallback SPA não pode capturar /api exato');
    requireCondition(
      !matcher.test('.well-known/assetlinks.json'),
      'fallback não pode capturar .well-known',
    );
    requireCondition(!matcher.test('.well-known'), 'fallback não pode capturar .well-known exato');
  } catch {
    failures.push('regex do fallback SPA é inválida');
  }
}

const headers = new Map(
  (config.headers?.find((rule) => rule.source === '/(.*)')?.headers ?? []).map((item) => [
    item.key.toLowerCase(),
    item.value,
  ]),
);
for (const key of [
  'content-security-policy',
  'strict-transport-security',
  'permissions-policy',
  'referrer-policy',
  'x-content-type-options',
  'x-frame-options',
  'x-robots-tag',
]) {
  requireCondition(headers.has(key), `header obrigatório ausente: ${key}`);
}
const csp = headers.get('content-security-policy') ?? '';
for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
  requireCondition(csp.includes(directive), `diretiva CSP ausente: ${directive}`);
}
requireCondition(
  !csp.includes('iahub.agrorumo.com'),
  'origem IA Hub removida ainda aparece na CSP',
);
requireCondition(fs.existsSync(path.join(root, 'api/mcp/server.ts')), 'função /api/mcp ausente');

if (failures.length > 0) {
  console.error('Configuração web inválida:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  'Configuração web validada: noindex, headers, roteamento offline-safe e semântica acessível.',
);
