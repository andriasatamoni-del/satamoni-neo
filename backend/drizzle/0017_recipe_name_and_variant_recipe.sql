ALTER TABLE "menu_item_variants" ADD COLUMN "recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "name" text;--> statement-breakpoint
UPDATE "recipes" SET "name" = "menu_items"."name" || ' - ' || "menu_item_variants"."label"
FROM "menu_item_variants" JOIN "menu_items" ON "menu_items"."id" = "menu_item_variants"."item_id"
WHERE "menu_item_variants"."id" = "recipes"."variant_id";--> statement-breakpoint
UPDATE "recipes" SET "name" = "inventory_items"."name"
FROM "inventory_items"
WHERE "inventory_items"."id" = "recipes"."inventory_item_id" AND "recipes"."name" IS NULL;--> statement-breakpoint
UPDATE "recipes" SET "name" = 'وصفة' WHERE "name" IS NULL;--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
UPDATE "menu_item_variants" SET "recipe_id" = "recipes"."id"
FROM "recipes"
WHERE "recipes"."variant_id" = "menu_item_variants"."id";--> statement-breakpoint
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_item_variants_recipe_id_idx" ON "menu_item_variants" USING btree ("recipe_id");
