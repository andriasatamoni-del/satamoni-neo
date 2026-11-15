ALTER TABLE "recipes" DROP CONSTRAINT "recipes_variant_id_key";--> statement-breakpoint
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_variant_id_fkey";
--> statement-breakpoint
ALTER TABLE "recipes" DROP COLUMN "variant_id";--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_association_check" CHECK ((recipe_type = 'manufactured_item') = (inventory_item_id IS NOT NULL));