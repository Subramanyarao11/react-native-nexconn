import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('the Expo plugin adds the Nexconn Maven repository exactly once', () => {
  const { addNexconnRepository } = require('../app.plugin.js');
  const once = addNexconnRepository('buildscript {}\n');
  assert.match(once, /maven\.nexconn\.ai\/repository\/maven-releases/);
  assert.equal(addNexconnRepository(once), once);
});
