CREATE TYPE "public"."menu_item_kind" AS ENUM('item', 'addon');--> statement-breakpoint
DROP TABLE "menu_item_modifier_variant_prices" CASCADE;--> statement-breakpoint
DROP TABLE "menu_item_modifiers" CASCADE;--> statement-breakpoint
DROP TABLE "order_item_modifiers" CASCADE;--> statement-breakpoint
ALTER TABLE "menu_price_history" DROP CONSTRAINT "menu_price_history_entity_type_check";--> statement-breakpoint
DELETE FROM "menu_price_history" WHERE "entity_type" <> 'variant';--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "kind" "menu_item_kind" DEFAULT 'item' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "parent_order_item_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_pending_order_lines" ADD COLUMN "addons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_id_unique" UNIQUE("order_id","id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_parent_same_order_fkey" FOREIGN KEY ("order_id","parent_order_item_id") REFERENCES "public"."order_items"("order_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_items_active_kind_idx" ON "menu_items" USING btree ("kind") WHERE is_active;--> statement-breakpoint
CREATE INDEX "idx_order_items_parent" ON "order_items" USING btree ("parent_order_item_id");--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_addon_has_no_category_or_station" CHECK (kind = 'item'::menu_item_kind OR (category_id IS NULL AND station_id IS NULL));--> statement-breakpoint
ALTER TABLE "menu_price_history" ADD CONSTRAINT "menu_price_history_entity_type_check" CHECK (entity_type = 'variant'::text);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_addon_not_combo" CHECK ((parent_order_item_id IS NULL) OR (combo_id IS NULL));