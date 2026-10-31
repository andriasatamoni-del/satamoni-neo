DROP TABLE "talabat_integration_errors" CASCADE;--> statement-breakpoint
DROP TABLE "talabat_orders" CASCADE;--> statement-breakpoint
DROP TABLE "talabat_product_mapping" CASCADE;--> statement-breakpoint
DROP TABLE "talabat_webhook_events" CASCADE;--> statement-breakpoint
DROP INDEX "idx_branches_talabat_branch_id";--> statement-breakpoint
DROP INDEX "idx_payment_methods_talabat_payment_code";--> statement-breakpoint
ALTER TABLE "branches" DROP COLUMN "talabat_branch_id";--> statement-breakpoint
ALTER TABLE "menu_item_variants" DROP COLUMN "talabat_price";--> statement-breakpoint
ALTER TABLE "payment_methods" DROP COLUMN "talabat_payment_code";