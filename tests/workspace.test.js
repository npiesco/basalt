import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

test('root workspace exposes apps and packages', () => {
  const pkg = readJson('../package.json');
  assert.equal(pkg.workspaces.includes('apps/pwa'), true);
  assert.equal(pkg.workspaces.includes('apps/desktop'), true);
  assert.equal(pkg.workspaces.includes('packages/*'), true);
});

test('pwa package is configured for Next.js app dir', () => {
  const pkg = readJson('../apps/pwa/package.json');
  assert.equal(pkg.name, '@basalt/pwa');
  assert.equal(pkg.scripts.dev, 'next dev');
});

test('desktop package exposes tauri commands', () => {
  const pkg = readJson('../apps/desktop/package.json');
  assert.equal(pkg.name, '@basalt/desktop');
  assert.equal(pkg.scripts['tauri dev'], 'tauri dev');
});
