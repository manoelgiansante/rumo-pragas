const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Release automation can opt out of the machine-wide Watchman daemon. This
// keeps an overloaded global watch list from stalling a deterministic bundle.
if (process.env.RUMO_RELEASE_DISABLE_WATCHMAN === '1') {
  config.resolver.useWatchman = false;
}

module.exports = config;
