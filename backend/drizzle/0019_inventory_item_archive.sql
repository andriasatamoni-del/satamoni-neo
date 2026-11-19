ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_name_key";--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_active_name_key" ON "inventory_items" USING btree ("name") WHERE (archived_at IS NULL);