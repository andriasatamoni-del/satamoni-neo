INSERT INTO customer_phones (id, customer_id, phone, label, is_primary, created_at)
SELECT gen_random_uuid(), id, phone, NULL, true, created_at FROM customers;
--> statement-breakpoint
INSERT INTO customer_phones (id, customer_id, phone, label, is_primary, created_at)
SELECT gen_random_uuid(), id, phone2, NULL, false, created_at + interval '1 microsecond'
FROM customers
WHERE phone2 IS NOT NULL AND btrim(phone2) <> '' AND phone2 <> phone;
--> statement-breakpoint
INSERT INTO permissions (key, group_key, group_label, label, sort_order)
VALUES ('customers.manage', 'customers', 'العملاء', 'إضافة عملاء وأرقامهم وعناوينهم', 118);
--> statement-breakpoint
INSERT INTO role_permissions (role, permission_key) VALUES
  ('admin', 'customers.manage'),
  ('branch_manager', 'customers.manage'),
  ('cashier', 'customers.manage'),
  ('callcenter', 'customers.manage');
