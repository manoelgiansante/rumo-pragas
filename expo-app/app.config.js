const STORE_QA_PROFILE = 'storeQa';
const STORE_QA_MODE = 'draft-screenshots';

function requireStoreQaValue(env, name, expected) {
  const value = (env[name] || '').trim();
  if (value !== expected) {
    throw new Error(`storeQa requires ${name}=${expected}`);
  }
  return value;
}

function validateStoreQaBuildEnvironment(env) {
  requireStoreQaValue(env, 'NODE_ENV', 'development');
  requireStoreQaValue(env, 'STORE_QA_MODE', STORE_QA_MODE);
  requireStoreQaValue(env, 'EXPO_PUBLIC_ENABLE_ANALYTICS', 'false');
  requireStoreQaValue(env, 'SENTRY_DISABLE_AUTO_UPLOAD', 'true');

  if ((env.EXPO_PUBLIC_SENTRY_DSN || '').trim() || (env.SENTRY_AUTH_TOKEN || '').trim()) {
    throw new Error('storeQa requires Sentry DSN and auth token to be empty');
  }

  const rawPort = (env.STORE_QA_LISTEN_PORT || '').trim();
  if (!/^\d+$/.test(rawPort)) {
    throw new Error('storeQa requires a valid STORE_QA_LISTEN_PORT');
  }
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('storeQa requires a valid STORE_QA_LISTEN_PORT');
  }

  let clientUrl;
  try {
    clientUrl = new URL((env.EXPO_PUBLIC_SUPABASE_URL || '').trim());
  } catch {
    throw new Error('storeQa requires EXPO_PUBLIC_SUPABASE_URL on loopback HTTPS');
  }
  if (
    clientUrl.protocol !== 'https:' ||
    clientUrl.hostname !== '127.0.0.1' ||
    Number(clientUrl.port) !== port ||
    clientUrl.pathname !== '/' ||
    clientUrl.username ||
    clientUrl.password ||
    clientUrl.search ||
    clientUrl.hash
  ) {
    throw new Error('storeQa requires EXPO_PUBLIC_SUPABASE_URL on loopback HTTPS');
  }

  const serverAnonKey = (env.STORE_QA_ANON_KEY || '').trim();
  const publicAnonKey = (env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (serverAnonKey.length < 20 || /\s/.test(serverAnonKey) || publicAnonKey !== serverAnonKey) {
    throw new Error('storeQa requires matching local Supabase anon keys');
  }
}

function buildExpoConfig(config, env = process.env) {
  const rawGoogleServicesFile =
    env === process.env ? process.env.GOOGLE_SERVICES_JSON : env.GOOGLE_SERVICES_JSON;
  const googleServicesFile = (rawGoogleServicesFile || '').trim();
  const buildProfile = (env.EAS_BUILD_PROFILE || '').trim();
  const isStoreQa = buildProfile === STORE_QA_PROFILE;

  if (isStoreQa) validateStoreQaBuildEnvironment(env);

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    extra: {
      ...config.extra,
      remotePush: {
        androidConfigured: Boolean(googleServicesFile),
      },
      ...(isStoreQa
        ? {
            storeQa: {
              draftOnly: true,
              profile: STORE_QA_PROFILE,
              telemetryDisabled: true,
              updatesDisabled: true,
            },
          }
        : {}),
    },
    ...(isStoreQa
      ? {
          updates: {
            ...config.updates,
            enabled: false,
            checkAutomatically: 'NEVER',
          },
        }
      : {}),
  };
}

/** @type {import('expo/config').ConfigContext['config'] extends infer T ? (args: { config: T }) => T : never} */
module.exports = ({ config }) => buildExpoConfig(config, process.env);
module.exports.buildExpoConfig = buildExpoConfig;
module.exports.STORE_QA_PROFILE = STORE_QA_PROFILE;
module.exports.validateStoreQaBuildEnvironment = validateStoreQaBuildEnvironment;
