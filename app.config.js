// app.json is the source of truth. This file only adjusts it for two cases:
// - EXPO_GO_UPDATE=1: an EAS Update that Expo Go can open. Expo Go runs
//   updates whose runtime is its own SDK (e.g. "exposdk:58.0.0"), while
//   native builds keep the appVersion policy.
//   Publish for Expo Go with: EXPO_GO_UPDATE=1 npx eas-cli update --branch expo-go
// - HANET_APP_GROUP=group.x.y: the App Group of the certificate that signs
//   the build (Build LiveContainer IPA). The widget and the Live Activity get
//   their data through it, so it must be one that certificate's profile has.
const { version: sdkVersion } = require('expo/package.json');

module.exports = ({ config }) => {
  let next = config;
  const appGroup = process.env.HANET_APP_GROUP;
  if (appGroup) {
    next = {
      ...next,
      plugins: next.plugins.map(plugin => (
        Array.isArray(plugin) && plugin[0] === 'expo-widgets'
          ? [plugin[0], { ...plugin[1], groupIdentifier: appGroup }]
          : plugin
      )),
    };
  }
  if (process.env.EXPO_GO_UPDATE === '1') {
    const [major] = sdkVersion.split('.');
    next = { ...next, runtimeVersion: `exposdk:${major}.0.0` };
  }
  return next;
};
