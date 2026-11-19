INSERT INTO role_permissions (role, permission_key)
SELECT r.key, p.key
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'callcenter'
  AND p.key IN ('orders.create', 'orders.view', 'branches.view')
ON CONFLICT DO NOTHING;
