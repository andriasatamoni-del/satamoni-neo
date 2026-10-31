import { pgTable, text, uuid, boolean, integer, numeric } from "drizzle-orm/pg-core";

export const branches = pgTable("branches", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  address: text(),
  phone: text(),
  hours: text(),
  lat: numeric().$type<number>(),
  lng: numeric().$type<number>(),
  is_central_kitchen: boolean().default(false).notNull(),
  supports_dine_in: boolean().default(true).notNull(),
  legacy_branch_id: integer(),
});
