INSERT INTO permissions (key, group_key, group_label, label, sort_order)
VALUES ('inventory.transfers.register', 'inventory', 'المخزون', 'تسجيل تحويل أصناف من فرع لفرع', 119);
--> statement-breakpoint
INSERT INTO role_permissions (role, permission_key)
SELECT key, 'inventory.transfers.register' FROM roles WHERE key IN ('admin', 'branch_manager');
