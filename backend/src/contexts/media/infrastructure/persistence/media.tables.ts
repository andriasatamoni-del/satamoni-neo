// Drizzle table definitions for the media tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, check, uuid, integer, foreignKey, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bytea } from "../../../../shared/database/columns";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";

export const mediaImages = pgTable("media_images", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  mime: text().notNull(),
    content: bytea().notNull(),
  size_bytes: integer().notNull(),
  uploaded_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.uploaded_by],
      foreignColumns: [users.id],
      name: "media_images_uploaded_by_fkey"
    }).onDelete("set null"),
  check("media_images_mime_check", sql`mime = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text])`),
]);
