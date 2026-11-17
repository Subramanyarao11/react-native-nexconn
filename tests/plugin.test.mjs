import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const exampleDir = fileURLToPath(new URL('../example', import.meta.url));

function loadPlugin() {
  // Expo's helpers are resolved from the app project, as during prebuild.
  const previous = process.cwd();
  process.chdir(exampleDir);
  try {
    return require('../app.plugin.js');
  } finally {
    process.chdir(previous);
  }
}

const plugin = loadPlugin();
const { addMavenRepository, addAppDependencies, addNotificationIntentFilters } = plugin._internal;

test('adds the Nexconn Maven repository exactly once', () => {
  const gradle = 'allprojects {\n  repositories {\n    google()\n  }\n}\n';
  const once = addMavenRepository(gradle);
  assert.match(once, /maven\.nexconn\.ai/);
  assert.equal(addMavenRepository(once), once);
});

test('FCM wiring is opt-in and idempotent', () => {
  const app = 'android {\n  defaultConfig {\n  }\n}\ndependencies {\n}\n';
  assert.equal(addAppDependencies(app, '26.4.2', false), app);
  const withFcm = addAppDependencies(app, '26.4.2', true);
  assert.match(withFcm, /ai\.nexconn\.chat:push-fcm:26\.4\.2/);
  assert.match(withFcm, /FCM_PUSH_ENABLE/);
  assert.equal(addAppDependencies(withFcm, '26.4.2', true), withFcm);
});

test('notification tap intent filters are added once per path', () => {
  const manifest = {
    manifest: {
      application: [
        {
          activity: [
            {
              '$': { 'android:name': '.MainActivity' },
              'intent-filter': [
                {
                  action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                  category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  addNotificationIntentFilters(manifest, 'com.example');
  addNotificationIntentFilters(manifest, 'com.example');
  const filters = manifest.manifest.application[0].activity[0]['intent-filter'];
  assert.equal(filters.length, 3);
  assert.deepEqual(
    filters.slice(1).map((f) => f.data[0].$['android:pathPrefix']),
    ['/conversation', '/conversationlist']
  );
});

test('exports a run-once Expo plugin function', () => {
  assert.equal(typeof plugin, 'function');
  assert.equal(typeof plugin.withNexconn, 'function');
});
