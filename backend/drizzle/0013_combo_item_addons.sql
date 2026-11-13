ALTER TABLE "combo_items" DROP CONSTRAINT "uq_combo_items_combo_variant";--> statement-breakpoint
ALTER TABLE "combo_items" ADD COLUMN "parent_combo_item_id" uuid;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_parent_combo_item_id_fkey" FOREIGN KEY ("parent_combo_item_id") REFERENCES "public"."combo_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_combo_items_combo_variant" ON "combo_items" USING btree ("combo_id","variant_id") WHERE parent_combo_item_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_combo_items_parent_variant" ON "combo_items" USING btree ("parent_combo_item_id","variant_id") WHERE parent_combo_item_id IS NOT NULL;