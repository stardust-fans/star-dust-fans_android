import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(await readFile(path.join(root, 'packages/site-contract/site.json'), 'utf8'));
const routeFixture = JSON.parse(await readFile(path.join(root, 'test/site-routes.fixture.json'), 'utf8'));
const adminRouteFixture = JSON.parse(await readFile(path.join(root, 'test/admin-routes.fixture.json'), 'utf8'));

test('contract records the trusted website and pinned source', () => {
  assert.equal(contract.version, 1);
  assert.equal(new URL(contract.origin).origin, 'https://stardustinfinity.top');
  assert.equal(contract.webSource.repository, 'https://github.com/stardust-fans/star-dust-fans');
  assert.match(contract.webSource.commit, /^[a-f0-9]{40}$/);
});

test('native tabs are the five intended public entry points', () => {
  assert.deepEqual(contract.tabs.map(({ id }) => id), ['videos', 'fanart', 'shop', 'omew', 'user']);
  for (const tab of contract.tabs) {
    assert.ok(contract.pages.some((page) => page.path === tab.path && page.entry));
    assert.match(tab.symbol, /^[a-z][a-z0-9.]*(?:[.-][a-z0-9]+)*$/);
  }
});

test('contract route snapshot covers every registered public route except catch-all', async () => {
  const actual = contract.pages.filter(({ id }) => id !== 'admin').map(({ path: route }) => route).sort();
  assert.deepEqual(actual, [...routeFixture].sort());
  const source = process.env.WEB_REFERENCE;
  if (source) {
    const router = await readFile(path.join(source, 'src/public/router/index.js'), 'utf8');
    const registered = [...router.matchAll(/\bpath:\s*["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((route) => !route.includes('pathMatch'))
      .sort();
    assert.deepEqual(actual, registered);
  }
});

test('admin entry exposes all concrete hash modules without redirects or catch-all routes', async () => {
  const routes = contract.adminPages.map(({ path: route }) => route);
  assert.deepEqual(routes, adminRouteFixture.map((route) => `/admin/index.html#${route}`));
  assert.ok(contract.pages.some(({ id, path: route, entry }) => id === 'admin' && route === '/admin/index.html' && entry));
  const source = process.env.WEB_REFERENCE;
  if (source) {
    const router = await readFile(path.join(source, 'src/admin/router/index.js'), 'utf8');
    const registered = [...router.matchAll(/\{\s*path:\s*["']([^"']+)["'],\s*name:/g)]
      .map((match) => match[1])
      .filter((route) => !route.includes('pathMatch'))
      .sort();
    assert.deepEqual([...adminRouteFixture].sort(), registered);
    const vite = await readFile(path.join(source, 'vite.config.mjs'), 'utf8');
    assert.match(vite, /admin:\s*resolve\(import\.meta\.dirname,\s*["']admin\/index\.html["']\)/);
  }
});

test('all pages have stable identifiers, known sections, and honest entry flags', () => {
  const ids = contract.pages.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  for (const page of contract.pages) {
    assert.ok(['discover', 'account', 'content', 'system'].includes(page.section));
    assert.equal(typeof page.entry, 'boolean');
    if (page.path.includes(':id')) assert.equal(page.entry, false);
  }
  assert.equal(contract.pages.find(({ id }) => id === 'fallback').entry, false);
});

test('notification feeds and search endpoints stay same-origin paths', () => {
  const paths = [
    ...contract.notificationFeeds.flatMap(({ path: feed, detailPath }) => [feed, detailPath]),
    ...Object.values(contract.search),
  ];
  for (const candidate of paths) {
    assert.ok(candidate.startsWith('/') && !candidate.startsWith('//'));
    assert.equal(new URL(candidate, contract.origin).origin, contract.origin);
  }
  assert.deepEqual(contract.notificationFeeds.map(({ id }) => id), ['fanart', 'shop']);
});

test('WebView chrome rules are scoped and let the forum fill the viewport', () => {
  assert.match(contract.chromeCSS, /\.navbar\s*,\s*\.live2d-companion\s*\{\s*display:\s*none\s*!important/);
  assert.match(contract.chromeCSS, /\.omew-stage\s*\{\s*top:\s*0\s*!important/);
  assert.match(contract.chromeCSS, /#app\s*\{\s*padding-top:\s*0\s*!important/);
  assert.doesNotMatch(contract.chromeCSS, /(?:^|[},\s])(?:body|main)\s*\{/);
});
