// Alternate iOS app icons made in Icon Composer (.icon folders).
//
// expo-alternate-app-icons only takes PNGs on iOS, so there it is given no
// iOS image and only names the alternates (ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES).
// This plugin copies each .icon into the native project and adds it to the
// app target, the same way Expo does for the main `ios.icon`. Xcode 26 then
// compiles them as Liquid Glass icons. The folder name is the icon's name.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const withIosAlternateIcons = (config, icons = []) => {
  config = withDangerousMod(config, [
    'ios',
    async config => {
      const { projectRoot, platformProjectRoot, projectName } = config.modRequest;
      for (const icon of icons) {
        const source = path.join(projectRoot, icon);
        if (!fs.existsSync(source)) throw new Error(`No existe el ícono alternativo ${icon}`);
        await fs.promises.cp(source, path.join(platformProjectRoot, projectName, path.basename(icon)), { recursive: true });
      }
      return config;
    },
  ]);

  return withXcodeProject(config, config => {
    const { projectName } = config.modRequest;
    for (const icon of icons) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: `${projectName}/${path.basename(icon)}`,
        groupName: projectName,
        project: config.modResults,
        isBuildFile: true,
      });
    }
    return config;
  });
};

module.exports = withIosAlternateIcons;
