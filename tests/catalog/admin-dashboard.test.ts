import assert from "node:assert/strict";
import { test } from "node:test";
import { getAdminDashboardCounts } from "../../src/lib/catalog/admin-dashboard-service";

test("admin dashboard returns current aggregate counts without exposing records", async () => {
  const statuses: string[] = [];
  const counts = await getAdminDashboardCounts({
    connect: async () => undefined,
    queries: {
      async productsByStatus(status) { statuses.push(status); return { published: 3, draft: 2, archived: 1 }[status]; },
      async categories() { return 4; },
      async orders() { return 8; },
      async customers() { return 7; },
      async pendingBookings() { return 2; },
    },
  });
  assert.deepEqual(statuses.sort(), ["archived", "draft", "published"]);
  assert.deepEqual(counts, { products: 6, publishedProducts: 3, draftProducts: 2, archivedProducts: 1, categories: 4, orders: 8, customers: 7, pendingBookings: 2 });
});

test("admin dashboard reports a real empty database as zero counts", async () => {
  const zero = async () => 0;
  const counts = await getAdminDashboardCounts({
    connect: async () => undefined,
    queries: { productsByStatus: zero, categories: zero, orders: zero, customers: zero, pendingBookings: zero },
  });
  assert.deepEqual(counts, { products: 0, publishedProducts: 0, draftProducts: 0, archivedProducts: 0, categories: 0, orders: 0, customers: 0, pendingBookings: 0 });
});
