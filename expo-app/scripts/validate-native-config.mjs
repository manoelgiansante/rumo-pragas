#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(appRoot, name), 'utf8'));
const app = readJson('app.json').expo;
const eas = readJson('eas.json');
const pkg = readJson('package.json');
const configSource = fs.readFileSync(path.join(appRoot, 'constants/config.ts'), 'utf8');
const googleAuthSource = fs.readFileSync(path.join(appRoot, 'services/googleAuth.ts'), 'utf8');
const notificationsSource = fs.readFileSync(
  path.join(appRoot, 'services/notifications.ts'),
  'utf8',
);
const dynamicConfigSource = fs.readFileSync(path.join(appRoot, 'app.config.js'), 'utf8');
const sentryXcodePluginSource = fs.readFileSync(
  path.join(appRoot, 'plugins/withQuotedSentryXcodeScripts.js'),
  'utf8',
);
const envExample = fs.readFileSync(path.join(appRoot, '.env.example'), 'utf8');
const rootLayoutSource = fs.readFileSync(path.join(appRoot, 'app/_layout.tsx'), 'utf8');
const recoverySource = fs.readFileSync(path.join(appRoot, 'services/passwordRecovery.ts'), 'utf8');
const featureGraphicSource = fs.readFileSync(
  path.join(appRoot, 'store-assets/android/_src/feature-graphic.svg'),
  'utf8',
);
const failures = [];
const requireCondition = (condition, message) => {
  if (!condition) failures.push(message);
};
const readPngHeader = (relativePath) => {
  const absolutePath = path.join(appRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  const png = fs.readFileSync(absolutePath);
  const isPng = png.length > 26 && png.subarray(1, 4).toString('ascii') === 'PNG';
  if (!isPng) return null;
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25],
  };
};

requireCondition(app.version === pkg.version, 'app.json e package.json devem ter a mesma versão');
requireCondition(/^\d+\.\d+\.\d+$/.test(app.version), 'expo.version deve ser SemVer estável');
requireCondition(eas.cli?.version === '>= 20.0.0', 'EAS CLI mínimo deve ser >= 20.0.0');
requireCondition(eas.cli?.appVersionSource === 'remote', 'appVersionSource deve permanecer remote');
requireCondition(eas.build?.production?.autoIncrement === true, 'produção deve usar autoIncrement');
requireCondition(
  app.ios?.buildNumber === undefined,
  'buildNumber local conflita com versionamento remoto',
);
requireCondition(
  app.android?.versionCode === undefined,
  'versionCode local conflita com versionamento remoto',
);
requireCondition(
  app.ios?.bundleIdentifier === 'com.agrorumo.rumopragas' &&
    app.android?.package === 'com.agrorumo.rumopragas',
  'bundle/package ID divergente de com.agrorumo.rumopragas',
);
requireCondition(app.scheme === 'rumopragas', 'scheme de recuperação rumopragas ausente');
requireCondition(
  app.ios?.infoPlist?.RCTNewArchEnabled === true,
  'Info.plist deve declarar New Architecture explicitamente em caminhos locais com espaços',
);
requireCondition(
  !app.ios?.associatedDomains,
  'Universal Links sem contrato não podem ser publicados',
);
requireCondition(!app.android?.intentFilters, 'App Links sem contrato não podem ser publicados');
requireCondition(
  app.userInterfaceStyle === 'light',
  'release atual deve declarar tema claro até todas as rotas suportarem dark mode',
);
requireCondition(
  app.androidNavigationBar === undefined,
  'androidNavigationBar depreciado não pode voltar; use o plugin expo-navigation-bar',
);
requireCondition(
  app.android?.adaptiveIcon?.foregroundImage === './assets/android-icon-monochrome.png',
  'adaptive icon deve usar a camada transparente canônica folha+inseto',
);
requireCondition(
  app.android?.adaptiveIcon?.monochromeImage === './assets/android-icon-monochrome.png',
  'themed icon deve usar a camada monocromática canônica folha+inseto',
);
requireCondition(
  app.android?.adaptiveIcon?.backgroundColor === '#022822',
  'adaptive icon deve manter o fundo verde canônico',
);
const adaptiveForeground = readPngHeader('assets/android-icon-monochrome.png');
requireCondition(
  adaptiveForeground?.width === 1024 && adaptiveForeground?.height === 1024,
  'camada foreground do adaptive icon deve ser PNG 1024x1024',
);
requireCondition(
  adaptiveForeground?.colorType === 4 || adaptiveForeground?.colorType === 6,
  'camada foreground do adaptive icon precisa de transparência real',
);
requireCondition(
  !app.assetBundlePatterns?.includes('assets/android-icon-foreground.png'),
  'foreground legado com marca R não deve entrar no bundle',
);

for (const profile of ['development', 'preview', 'production']) {
  requireCondition(
    eas.build?.[profile]?.environment === profile,
    `perfil ${profile} deve selecionar explicitamente o EAS Environment correspondente`,
  );
}

const permissionCopy = [
  app.ios?.infoPlist?.NSCameraUsageDescription,
  app.ios?.infoPlist?.NSPhotoLibraryUsageDescription,
]
  .filter(Boolean)
  .join(' ')
  .toLowerCase();
requireCondition(
  permissionCopy.includes('probabilística'),
  'permissões de foto devem declarar incerteza',
);
requireCondition(
  !permissionCopy.includes('diagnóstico imediato'),
  'copy determinística de câmera é proibida',
);

const notifications = app.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
);
const notificationConfig = Array.isArray(notifications) ? notifications[1] : null;
requireCondition(
  notificationConfig?.defaultChannel === 'climate-risk',
  'canal padrão deve ser climate-risk',
);
requireCondition(
  notificationConfig?.icon === './assets/android-icon-monochrome.png',
  'notificação Android deve usar o ativo monocromático',
);

const navigationBar = app.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-navigation-bar',
);
const navigationBarConfig = Array.isArray(navigationBar) ? navigationBar[1] : null;
requireCondition(
  pkg.dependencies?.['expo-navigation-bar'] === '~55.0.14' &&
    navigationBarConfig?.enforceContrast === true &&
    navigationBarConfig?.barStyle === 'dark' &&
    navigationBarConfig?.visibility === 'visible',
  'plugin expo-navigation-bar deve manter botões escuros, contraste e visibilidade',
);

const buildProperties = app.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
);
const buildPropertiesConfig = Array.isArray(buildProperties) ? buildProperties[1] : null;
requireCondition(
  buildPropertiesConfig?.ios?.buildReactNativeFromSource === true,
  'iOS deve compilar React Native do fonte para suportar o caminho local com espaços',
);
requireCondition(
  app.plugins?.includes('./plugins/withQuotedSentryXcodeScripts') &&
    sentryXcodePluginSource.includes(
      '/bin/sh "$SENTRY_XCODE_SCRIPT" "$REACT_NATIVE_XCODE_SCRIPT"',
    ) &&
    sentryXcodePluginSource.includes('/bin/sh "$SENTRY_DEBUG_FILES_SCRIPT"') &&
    sentryXcodePluginSource.includes('path_safe_expo_scripts') &&
    sentryXcodePluginSource.includes('PROJECT_DIR=Pods bash -l') &&
    sentryXcodePluginSource.includes('create-updates-resources-ios.sh'),
  'scripts Xcode do Sentry/Expo devem preservar caminhos locais com espaços',
);

const notificationIconPath = path.join(appRoot, 'assets/android-icon-monochrome.png');
if (fs.existsSync(notificationIconPath)) {
  const notificationIcon = readPngHeader('assets/android-icon-monochrome.png');
  requireCondition(
    !!notificationIcon && notificationIcon.width >= 96 && notificationIcon.height >= 96,
    'ícone de notificação PNG inválido ou pequeno',
  );
  requireCondition(
    notificationIcon?.colorType === 4 || notificationIcon?.colorType === 6,
    'ícone de notificação precisa de canal alpha',
  );
} else {
  failures.push('ícone de notificação não encontrado');
}

const collected = app.ios?.privacyManifests?.NSPrivacyCollectedDataTypes ?? [];
for (const type of [
  'NSPrivacyCollectedDataTypeCrashData',
  'NSPrivacyCollectedDataTypePerformanceData',
]) {
  const item = collected.find((candidate) => candidate.NSPrivacyCollectedDataType === type);
  requireCondition(
    item?.NSPrivacyCollectedDataTypeLinked === false,
    `${type} deve ser não vinculado`,
  );
}

const productionEnv = eas.build?.production?.env ?? {};
requireCondition(
  productionEnv.NODE_ENV === 'production',
  'build EAS de produção deve declarar NODE_ENV=production',
);
for (const key of [
  'SENTRY_ALLOW_FAILURE',
  'SENTRY_DISABLE_AUTO_UPLOAD',
  'SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD',
]) {
  requireCondition(!(key in productionEnv), `${key} não pode enfraquecer o build de produção`);
}
requireCondition(!pkg.dependencies?.['lucide-react-native'], 'lucide-react-native ficou sem uso');
requireCondition(!pkg.dependencies?.['react-native-svg'], 'react-native-svg direto ficou sem uso');
requireCondition(
  !fs.existsSync(path.join(appRoot, 'app/paywall.tsx')),
  'rota paywall deve permanecer removida',
);
for (const name of [
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
]) {
  requireCondition(
    configSource.includes(name) && envExample.includes(name),
    `OAuth Google deve documentar credencial específica ${name}`,
  );
}
requireCondition(
  !/EXPO_PUBLIC_GOOGLE_CLIENT_ID\b/.test(`${configSource}\n${envExample}`),
  'client ID Google genérico não pode voltar ao app nativo',
);
requireCondition(
  googleAuthSource.includes('webClientId:') &&
    googleAuthSource.includes('iosClientId:') &&
    googleAuthSource.includes('androidClientId:'),
  'Google Auth deve selecionar credencial por plataforma',
);
requireCondition(
  dynamicConfigSource.includes('process.env.GOOGLE_SERVICES_JSON') &&
    dynamicConfigSource.includes('androidConfigured: Boolean(googleServicesFile)'),
  'app.config.js deve injetar o file secret FCM e publicar apenas a capability booleana',
);
requireCondition(
  notificationsSource.includes('isRemotePushBuildConfigured()') &&
    !notificationsSource.includes("if (Platform.OS === 'android') {\n      return null;"),
  'registro remoto Android deve depender da capability de build, não de bloqueio hardcoded',
);
requireCondition(
  rootLayoutSource.includes('<StatusBar style="dark"') &&
    !rootLayoutSource.includes('<StatusBar style="auto"'),
  'StatusBar deve declarar ícones escuros coerentes com o tema claro',
);

const directSentryImports = [];
const visitSources = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) visitSources(absolute);
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) continue;
    const relative = path.relative(appRoot, absolute);
    const source = fs.readFileSync(absolute, 'utf8');
    if (
      source.includes("from '@sentry/react-native'") &&
      relative !== 'app/_layout.tsx' &&
      relative !== 'services/sentry-shim.ts'
    ) {
      directSentryImports.push(relative);
    }
  }
};
for (const directory of ['app', 'components', 'hooks', 'services']) {
  visitSources(path.join(appRoot, directory));
}
requireCondition(
  directSentryImports.length === 0,
  `somente _layout pode importar Sentry nativo: ${directSentryImports.join(', ')}`,
);
requireCondition(
  recoverySource.includes('password recovery deep-link exchange failed') &&
    !recoverySource.includes('captureException(err'),
  'recuperação de senha deve emitir somente código sintético sem erro/URL raw',
);

const embeddedCanonicalIcon = featureGraphicSource.match(
  /href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/,
)?.[1];
const canonicalIcon = fs.readFileSync(path.join(appRoot, 'assets/android-icon-monochrome.png'));
requireCondition(
  !!embeddedCanonicalIcon && Buffer.from(embeddedCanonicalIcon, 'base64').equals(canonicalIcon),
  'feature graphic deve embutir exatamente a marca canônica folha+inseto',
);

if (failures.length > 0) {
  console.error('Configuração nativa inválida:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Configuração nativa validada para ${app.name} ${app.version}.`);
