CREATE INDEX "idx_journal_entries_created_at" ON "journal_entries" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_journal_entries_entry_date" ON "journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "idx_complaints_created_at" ON "complaints" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_delivery_assignments_branch_assigned_at" ON "delivery_assignments" USING btree ("branch_id","assigned_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_orders_status_created_at" ON "orders" USING btree ("status","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_goods_receipts_branch_created_at" ON "goods_receipts" USING btree ("branch_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_branch_created_at" ON "purchase_orders" USING btree ("branch_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_cashier_shifts_branch_opened_at" ON "cashier_shifts" USING btree ("branch_id","opened_at" DESC NULLS FIRST);