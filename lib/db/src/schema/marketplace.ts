import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const storagePointsTable = pgTable("storage_points", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  district: text("district").notNull(),
  state: text("state").notNull(),
  address: text("address").notNull(),
  feePerQuintal: numeric("fee_per_quintal", {
    precision: 12,
    scale: 2,
    mode: "number",
  }).notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const marketplaceListingsTable = pgTable("marketplace_listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  cropType: text("crop_type").notNull(),
  description: text("description").notNull().default(""),
  price: numeric("price", { precision: 12, scale: 2, mode: "number" }).notNull(),
  unit: text("unit").notNull(),
  quantity: numeric("quantity", {
    precision: 12,
    scale: 2,
    mode: "number",
  }).notNull(),
  availableQuantity: numeric("available_quantity", {
    precision: 12,
    scale: 2,
    mode: "number",
  }).notNull(),
  storagePointId: text("storage_point_id")
    .notNull()
    .references(() => storagePointsTable.id),
  farmerName: text("farmer_name").notNull(),
  originType: text("origin_type").notNull().default("storage_hub"),
  originLabel: text("origin_label").notNull().default(""),
  sellerCredential: text("seller_credential").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DemoOrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  storagePointName: string;
};

export const demoOrdersTable = pgTable("demo_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  items: jsonb("items").$type<DemoOrderItem[]>().notNull(),
  itemCount: integer("item_count").notNull(),
  totalAmount: numeric("total_amount", {
    precision: 12,
    scale: 2,
    mode: "number",
  }).notNull(),
  status: text("status").notNull().default("demo_received"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMarketplaceListingSchema = createInsertSchema(
  marketplaceListingsTable,
).omit({
  id: true,
  availableQuantity: true,
  active: true,
  createdAt: true,
});
export type InsertMarketplaceListing = z.infer<
  typeof insertMarketplaceListingSchema
>;
export type MarketplaceListingRecord =
  typeof marketplaceListingsTable.$inferSelect;
export type DemoOrderRecord = typeof demoOrdersTable.$inferSelect;
