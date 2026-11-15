CREATE TABLE "roles" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"scope" text NOT NULL,
	"full_access" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_label_key" UNIQUE("label"),
	CONSTRAINT "roles_scope_check" CHECK (scope = ANY (ARRAY['company'::text, 'branch'::text]))
);
--> statement-breakpoint
INSERT INTO "roles" ("key", "label", "scope", "full_access", "sort_order") VALUES
	('admin', 'أدمن', 'company', true, 1),
	('branch_manager', 'مدير فرع', 'branch', false, 2),
	('accountant', 'محاسب', 'company', false, 3),
	('cashier', 'كاشير', 'branch', false, 4),
	('callcenter', 'كول سنتر', 'company', false, 5),
	('driver', 'سائق', 'branch', false, 6),
	('employee', 'موظف', 'branch', false, 7);--> statement-breakpoint
DELETE FROM "role_permissions" WHERE "permission_key" = 'identity.roles.manage' AND "role" <> 'admin';--> statement-breakpoint
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_check";--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_role_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fkey" FOREIGN KEY ("role") REFERENCES "public"."roles"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_fkey" FOREIGN KEY ("role") REFERENCES "public"."roles"("key") ON DELETE restrict ON UPDATE no action;