/**
 * Expo config plugin for react-native-nexconn (development builds only; Expo Go
 * cannot load the native SDK).
 *
 * Usage in app.json:
 *   "plugins": [["@subramanyarao11/react-native-nexconn", {
 *     "android": { "fcm": true, "notificationIntentFilters": true },
 *     "ios": { "pushNotifications": true, "apsEnvironment": "development" },
 *     "sdkVersion": "26.4.2"
 *   }]]
 *
 * Every modification is idempotent so repeated `expo prebuild` runs are stable.
 * The plugin never writes App Keys, secrets or tokens into native projects.
 *
 * @typedef {{
 *   sdkVersion?: string,
 *   android?: { fcm?: boolean, notificationIntentFilters?: boolean },
 *   ios?: { pushNotifications?: boolean, apsEnvironment?: 'development' | 'production' }
 * }} NexconnPluginOptions
 */
'use strict';

const NEXCONN_MAVEN = 'https://maven.nexconn.ai/repository/maven-releases/';
const MARKER = '// @react-native-nexconn';

/**
 * Resolves Expo's config-plugin helpers from the app project first (prebuild
 * runs with the app as working directory), then next to this package. The
 * library itself does not depend on Expo.
 */
function loadConfigPlugins() {
  const paths = [process.cwd(), __dirname];
  for (const id of ['expo/config-plugins', '@expo/config-plugins']) {
    try {
      return require(require.resolve(id, { paths }));
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    'react-native-nexconn config plugin requires the "expo" package in the app project.'
  );
}

const {
  AndroidConfig,
  createRunOncePlugin,
  withAppBuildGradle,
  withAndroidManifest,
  withEntitlementsPlist,
  withInfoPlist,
  withProjectBuildGradle,
  withPodfileProperties,
} = loadConfigPlugins();

const pkg = require('../package.json');

/** Adds the Nexconn Maven repository to allprojects { repositories { } }. */
function addMavenRepository(contents) {
  if (contents.includes(NEXCONN_MAVEN)) return contents;
  const snippet = `        maven { url "${NEXCONN_MAVEN}" } ${MARKER}`;
  if (/allprojects\s*\{\s*repositories\s*\{/.test(contents)) {
    return contents.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      (match) => `${match}\n${snippet}`
    );
  }
  return `${contents}\nallprojects {\n    repositories {\n${snippet}\n    }\n}\n`;
}

function addGoogleServicesClasspath(contents) {
  if (contents.includes('com.google.gms:google-services')) return contents;
  return contents.replace(
    /dependencies\s*\{/,
    (match) =>
      `${match}\n        classpath('com.google.gms:google-services:4.4.2') ${MARKER}`
  );
}

function addAppDependencies(contents, sdkVersion, fcm) {
  let out = contents;
  if (fcm) {
    if (!out.includes('ai.nexconn.chat:push-fcm')) {
      out = out.replace(
        /dependencies\s*\{/,
        (match) =>
          `${match}\n    implementation("ai.nexconn.chat:push-fcm:${sdkVersion}") ${MARKER}`
      );
    }
    if (!out.includes('FCM_PUSH_ENABLE')) {
      out = out.replace(
        /defaultConfig\s*\{/,
        (match) =>
          `${match}\n        manifestPlaceholders += [FCM_PUSH_ENABLE: "true"] ${MARKER}`
      );
    }
    if (!out.includes('com.google.gms.google-services')) {
      out = `${out}\napply plugin: "com.google.gms.google-services" ${MARKER}\n`;
    }
  }
  return out;
}

/**
 * Adds the implicit-intent filters the Nexconn SDK fires when a remote push
 * notification is tapped (rong://<applicationId>/conversation[list]) to the
 * main activity so the app opens and JS can route via Linking.
 */
function addNotificationIntentFilters(manifest, packageName) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  activity['intent-filter'] = activity['intent-filter'] ?? [];
  for (const pathPrefix of ['/conversation', '/conversationlist']) {
    const exists = activity['intent-filter'].some((filter) =>
      (filter.data ?? []).some(
        (d) =>
          d.$['android:scheme'] === 'rong' &&
          d.$['android:pathPrefix'] === pathPrefix
      )
    );
    if (exists) continue;
    activity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [
        {
          $: {
            'android:scheme': 'rong',
            'android:host': packageName,
            'android:pathPrefix': pathPrefix,
          },
        },
      ],
    });
  }
  return manifest;
}

/** @type {import('expo/config-plugins').ConfigPlugin<NexconnPluginOptions | void>} */
const withNexconn = (config, options) => {
  const opts = options ?? {};
  const sdkVersion = opts.sdkVersion ?? '26.4.2';
  const android = opts.android ?? {};
  const ios = opts.ios ?? {};

  config = withProjectBuildGradle(config, (cfg) => {
    let contents = addMavenRepository(cfg.modResults.contents);
    if (android.fcm) contents = addGoogleServicesClasspath(contents);
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addAppDependencies(
      cfg.modResults.contents,
      sdkVersion,
      android.fcm === true
    );
    return cfg;
  });

  if (android.notificationIntentFilters !== false) {
    config = withAndroidManifest(config, (cfg) => {
      const packageName =
        cfg.android?.package ?? AndroidConfig.Package.getPackage(cfg) ?? '';
      if (packageName)
        addNotificationIntentFilters(cfg.modResults, packageName);
      return cfg;
    });
  }

  if (opts.sdkVersion) {
    // Read by Nexconn.podspec to pin the NexconnChat pod version.
    config = withPodfileProperties(config, (cfg) => {
      cfg.modResults['nexconn.chatVersion'] = sdkVersion;
      return cfg;
    });
  }

  if (ios.pushNotifications) {
    config = withEntitlementsPlist(config, (cfg) => {
      cfg.modResults['aps-environment'] = ios.apsEnvironment ?? 'development';
      return cfg;
    });
    config = withInfoPlist(config, (cfg) => {
      const modes = new Set(cfg.modResults.UIBackgroundModes ?? []);
      modes.add('remote-notification');
      cfg.modResults.UIBackgroundModes = [...modes];
      return cfg;
    });
  }

  return config;
};

module.exports = createRunOncePlugin(withNexconn, pkg.name, pkg.version);
module.exports.withNexconn = withNexconn;
module.exports._internal = {
  addMavenRepository,
  addGoogleServicesClasspath,
  addAppDependencies,
  addNotificationIntentFilters,
};
