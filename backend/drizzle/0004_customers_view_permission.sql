INSERT INTO permissions (key, group_key, group_label, label, sort_order)
VALUES ('customers.view', 'customers', 'العملاء', 'رؤية قائمة العملاء', 117);
--> statement-breakpoint
INSERT INTO role_permissions (role, permission_key) VALUES
  ('admin', 'customers.view'),
  ('branch_manager', 'customers.view'),
  ('callcenter', 'customers.view');
