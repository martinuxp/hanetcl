// Keeps the Android release build inside the memory of an EAS worker
// (4 vCPUs, 16 GB). With every ABI and unlimited parallel tasks, Gradle runs
// the CMake builds of worklets, reanimated and screens for 4 ABIs next to R8,
// and the system kills the Gradle daemon ("Gradle build daemon disappeared
// unexpectedly").
// - Only ARM ABIs: every Android phone runs one of them; x86 and x86_64 are
//   only for emulators.
// - At most 2 Gradle workers, so only two native builds run at once.
const { withGradleProperties } = require('expo/config-plugins');

const PROPERTIES = {
  reactNativeArchitectures: 'armeabi-v7a,arm64-v8a',
  'org.gradle.workers.max': '2',
};

module.exports = config =>
  withGradleProperties(config, config => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = config.modResults.find(item => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else config.modResults.push({ type: 'property', key, value });
    }
    return config;
  });
