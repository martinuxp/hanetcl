// app.json is the source of truth. This file only exists so an EAS Update can
// be opened in Expo Go: Expo Go runs updates whose runtime is its own SDK
// ("exposdk:57.0.0"), while native builds keep the appVersion policy.
// Publish for Expo Go with: EXPO_GO_UPDATE=1 npx eas-cli update --branch expo-go
const { version: sdkVersion } = require('expo/package.json');

module.exports = ({ config }) => {
  if (process.env.EXPO_GO_UPDATE !== '1') return config;
  const [major] = sdkVersion.split('.');
  return { ...config, runtimeVersion: `exposdk:${major}.0.0` };
};
