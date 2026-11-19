/**
 * Turns off R8 minification for Android release builds.
 *
 * Why: with R8 on, the release APK crashed on launch before any app code ran:
 *   "Unable to get provider androidx.startup.InitializationProvider …
 *    Failed to create an instance of class androidx.work.impl.WorkDatabase"
 * R8 strips/renames WorkManager's Room database class (pulled in by expo-notifications /
 * background location). Without minification the APK is a few MB larger but starts correctly.
 */
const { withGradleProperties } = require('expo/config-plugins');

const set = (props, key, value) => {
  const existing = props.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: 'property', key, value });
};

module.exports = function withNoR8Minify(config) {
  return withGradleProperties(config, (cfg) => {
    set(cfg.modResults, 'android.enableMinifyInReleaseBuilds', 'false');
    set(cfg.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'false');
    return cfg;
  });
};
