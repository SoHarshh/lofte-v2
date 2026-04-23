// Sentry's `withSentryConfig` is Expo-aware; we wrap the default Expo Metro
// config (not @react-native/metro-config — that's the bare-RN snippet the
// wizard offers). This gives Sentry the hooks it needs to upload sourcemaps
// during EAS builds so stack traces in the dashboard deobfuscate cleanly.
const { getDefaultConfig } = require('expo/metro-config');
const { withSentryConfig } = require('@sentry/react-native/metro');

const config = getDefaultConfig(__dirname);

module.exports = withSentryConfig(config);
