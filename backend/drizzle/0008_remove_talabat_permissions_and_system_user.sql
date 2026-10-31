DELETE FROM "role_permissions" WHERE "permission_key" LIKE 'talabat.%';--> statement-breakpoint
DELETE FROM "permissions" WHERE "key" LIKE 'talabat.%';--> statement-breakpoint
DO $$
BEGIN
  DELETE FROM "users" u
  WHERE u."email" = 'talabat-integration@system.internal'
    AND NOT EXISTS (SELECT 1 FROM "audit_logs" a WHERE a."actor_user_id" = u."id");
EXCEPTION
  WHEN foreign_key_violation THEN NULL;
END $$;
