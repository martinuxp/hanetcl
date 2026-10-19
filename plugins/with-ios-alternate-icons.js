// Alternate iOS app icons made in Icon Composer (.icon folders).
//
// expo-alternate-app-icons only takes PNGs on iOS, so there it is given no
// iOS image and only names the alternates (ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES).
// This plugin copies each .icon into the native project and adds it to the
// app target, the same way Expo does for the main `ios.icon`. Xcode 26 then
// compiles them as Liquid Glass icons. The folder name is the icon's name.
//
// The .icon files come from a newer Icon Composer format ("features":
// refractivity, specular-location) that Xcode 26.5's actool can't read: it
// crashes with "isn't in the correct format". Once every .icon is in place,
// the native copies (never the originals in assets/) are lowered to the
// format Xcode 26 knows: specular "inside" becomes on, refractivity goes.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withFinalizedMod, withXcodeProject } = require('expo/config-plugins');

function lowerIconFormat(iconJsonPath) {
  const icon = JSON.parse(fs.readFileSync(iconJsonPath, 'utf8'));
  delete icon.features;
  for (const group of icon.groups ?? []) {
    if (typeof group.specular === 'string') group.specular = true;
    delete group.refractivity;
  }
  fs.writeFileSync(iconJsonPath, JSON.stringify(icon, null, 2));
}

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

  // Finalized mods run after Expo has copied the main `ios.icon` too.
  config = withFinalizedMod(config, [
    'ios',
    async config => {
      const { platformProjectRoot, projectName } = config.modRequest;
      const dir = path.join(platformProjectRoot, projectName);
      for (const entry of fs.readdirSync(dir)) {
        const iconJson = path.join(dir, entry, 'icon.json');
        if (entry.endsWith('.icon') && fs.existsSync(iconJson)) lowerIconFormat(iconJson);
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
