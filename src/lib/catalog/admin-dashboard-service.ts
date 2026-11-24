import "server-only";

import { connectToDatabase } from "../db/mongodb";
import { BookingModel, CategoryModel, OrderModel, ProductModel, UserModel } from "../db/models";

export type AdminDashboardCounts = {
  products: number;
  publishedProducts: number;
  draftProducts: number;
  archivedProducts: number;
  categories: number;
  orders: number;
  customers: number;
  pendingBookings: number;
};

type DashboardCountQueries = {
  productsByStatus(status: "published" | "draft" | "archived"): Promise<number>;
  categories(): Promise<number>;
  orders(): Promise<number>;
  customers(): Promise<number>;
  pendingBookings(): Promise<number>;
};

type DashboardDependencies = { queries?: DashboardCountQueries; connect?: () => Promise<unknown> };

/** Returns aggregate counts only; no customer, order, or booking records leave the database. */
export async function getAdminDashboardCounts(
  dependencies: DashboardDependencies = {},
): Promise<AdminDashboardCounts> {
  const queries = dependencies.queries ?? {
    productsByStatus: (publicationStatus) => ProductModel.countDocuments({ publicationStatus }),
    categories: () => CategoryModel.estimatedDocumentCount(),
    orders: () => OrderModel.estimatedDocumentCount(),
    customers: () => UserModel.countDocuments({ role: "customer", status: { $ne: "deleted" } }),
    pendingBookings: () => BookingModel.countDocuments({ status: "awaiting_scheduling" }),
  };
  await (dependencies.connect ?? connectToDatabase)();
  const [publishedProducts, draftProducts, archivedProducts, categories, orders, customers, pendingBookings] = await Promise.all([
    queries.productsByStatus("published"),
    queries.productsByStatus("draft"),
    queries.productsByStatus("archived"),
    queries.categories(),
    queries.orders(),
    queries.customers(),
    queries.pendingBookings(),
  ]);
  return { products: publishedProducts + draftProducts + archivedProducts, publishedProducts, draftProducts, archivedProducts, categories, orders, customers, pendingBookings };
}
