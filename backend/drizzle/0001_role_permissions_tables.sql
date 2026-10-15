CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"group_key" text NOT NULL,
	"group_label" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" text NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permissions_pkey" PRIMARY KEY("role","permission_key"),
	CONSTRAINT "role_permissions_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'accountant'::text, 'cashier'::text, 'callcenter'::text, 'driver'::text, 'employee'::text]))
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pkey" PRIMARY KEY("user_id","role"),
	CONSTRAINT "user_roles_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'accountant'::text, 'cashier'::text, 'callcenter'::text, 'driver'::text, 'employee'::text]))
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;