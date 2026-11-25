import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');

test('account and admin navigation/action controls reserve 44px touch targets', () => {
  const adminNav = readFileSync(path.join(root, 'src/components/admin/admin-navigation.tsx'), 'utf8');
  const adminProducts = readFileSync(path.join(root, 'src/components/admin/admin-products.tsx'), 'utf8');
  const resources = readFileSync(path.join(root, 'src/components/account/account-resources.tsx'), 'utf8');
  const orders = readFileSync(path.join(root, 'src/components/account/order-history.tsx'), 'utf8');

  assert.match(adminNav, /function linkClass[\s\S]*?min-h-11/);
  assert.match(adminNav, /aria-label=\{open \? "Close admin navigation"[\s\S]*?size-11/);
  assert.match(adminNav, /aria-label="Admin navigation" className="hidden items-center gap-1 xl:flex"/);
  assert.match(adminNav, /className="relative flex items-center gap-2 xl:hidden"/);
  assert.match(adminNav, /id="admin-mobile-navigation"[\s\S]*?<SignOutButton compact redirectTo="\/" \/>/);
  assert.match(resources, /onClick=\{\(\) => void download\([\s\S]*?min-h-11/);
  assert.match(resources, /onSubmit=\{\(event\) => void requestAvailability\([\s\S]*?min-h-11/);
  for (const [name, source] of [['admin product actions', adminProducts], ['account order actions', orders]]) {
    assert.doesNotMatch(source, /\b(?:min-h-(?:9|10)|size-10)\b/, `${name} contains an undersized touch target`);
  }
});
