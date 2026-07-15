/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const googleServicesFile = (process.env.GOOGLE_SERVICES_JSON || '').trim();

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
    },
  };
};
