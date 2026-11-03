// Lets Android redraw the home screen widget on its own. expo-widgets writes
// every widget with updatePeriodMillis="0", so Android never asks for a new
// draw and "HaNet hoy" would stay on the class it showed when the app was last
// open. With 30 minutes (the least Android allows) the widget picks the moment
// that applies from the day the app handed it (widgets/home-widget.android.tsx).
// It runs after every other mod, once expo-widgets has written its XML.
const fs = require('fs');
const path = require('path');
const { withFinalizedMod } = require('expo/config-plugins');

const PERIOD_MS = 30 * 60 * 1000;

module.exports = config =>
  withFinalizedMod(config, [
    'android',
    async config => {
      const xmlDirectory = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      if (!fs.existsSync(xmlDirectory)) return config;
      for (const file of fs.readdirSync(xmlDirectory)) {
        const filePath = path.join(xmlDirectory, file);
        const xml = fs.readFileSync(filePath, 'utf8');
        if (!xml.includes('@layout/expo_widgets_initial_layout')) continue;
        fs.writeFileSync(filePath, xml.replace(/android:updatePeriodMillis="\d+"/, `android:updatePeriodMillis="${PERIOD_MS}"`));
      }
      return config;
    },
  ]);
