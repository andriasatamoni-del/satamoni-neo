INSERT INTO "roles" ("key", "label", "scope", "full_access", "sort_order") VALUES
	('kitchen', 'مطبخ', 'branch', false, 8)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role", "permission_key")
SELECT v.role, v.permission_key
FROM (VALUES
	('kitchen', 'kitchen.view'),
	('kitchen', 'kitchen.advance'),
	('kitchen', 'hr.self.view'),
	('kitchen', 'hr.self.leave.manage')
) AS v(role, permission_key)
WHERE EXISTS (SELECT 1 FROM "roles" r WHERE r.key = v.role)
ON CONFLICT DO NOTHING;
