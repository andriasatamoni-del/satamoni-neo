import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../shared/api/client";
import { errorMessage } from "../shared/api/errorMessage";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Badge } from "../shared/ui/Badge";
import { FormDialog } from "../shared/ui/FormDialog";
import { TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { ROLE, ROLES, ROLE_LABELS, type Role } from "../shared/auth/roles";
import {
  PERMISSIONS_CATALOG_KEY,
  rolePermissionCountLabel,
  usePermissionsCatalog,
  type PermissionGroup,
  type PermissionsCatalog,
} from "./users/permissionsCatalog";

export function RolesPage() {
  const catalogQuery = usePermissionsCatalog(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const catalog = catalogQuery.data;

  return (
    <div>
      <PageHeader title="الأدوار والصلاحيات" description="حدد الصلاحيات اللي مع كل دور. التعديل بيتطبّق فورًا على كل المستخدمين اللي معاهم الدور ده" />
      {catalogQuery.isError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">مقدرناش نجيب كتالوج الصلاحيات</p>
      )}
      {catalog && (
        <Card>
          <CardHeader><CardTitle>الأدوار ({ROLES.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>الدور</TH>
                  <TH>الصلاحيات</TH>
                  <TH>إجراء</TH>
                </TR>
              </THead>
              <TBody>
                {ROLES.map((r) => (
                  <TR key={r}>
                    <TD className="font-semibold text-slate-900">{ROLE_LABELS[r]}</TD>
                    <TD><Badge tone="neutral">{rolePermissionCountLabel(r, catalog)}</Badge></TD>
                    <TD>
                      {r === ROLE.ADMIN ? (
                        <span className="text-xs text-slate-500">مينفعش يتعدّل</span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setEditingRole(r)}>تعديل الصلاحيات</Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      )}
      {catalog && editingRole && <RolePermissionsDialog role={editingRole} catalog={catalog} onClose={() => setEditingRole(null)} />}
    </div>
  );
}

function RolePermissionsDialog({ role, catalog, onClose }: { role: Role; catalog: PermissionsCatalog; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(catalog.rolePermissions[role] ?? []));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroup, select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (select) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });
  }

  const save = useMutation({
    mutationFn: () => apiRequest(`/roles/${role}/permissions`, { method: "PUT", body: { permissions: [...selected] } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PERMISSIONS_CATALOG_KEY });
      onClose();
    },
  });

  return (
    <FormDialog
      title={`صلاحيات: ${ROLE_LABELS[role]}`}
      submitLabel="حفظ صلاحيات الدور"
      isSubmitting={save.isPending}
      error={errorMessage(save.error)}
      onSubmit={() => save.mutate()}
      onClose={onClose}
      size="xl"
    >
      <p className="text-xs text-slate-500">{selected.size} صلاحية متحددة</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.catalog.map((group) => {
          const allSelected = group.permissions.every((p) => selected.has(p.key));
          return (
            <div key={group.group} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500">{group.groupLabel}</p>
                <button type="button" onClick={() => toggleGroup(group, !allSelected)} className="text-xs font-medium text-brand-600 hover:underline">
                  {allSelected ? "شيل الكل" : "اختار الكل"}
                </button>
              </div>
              <div className="space-y-1.5">
                {group.permissions.map((perm) => (
                  <label key={perm.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.has(perm.key)}
                      onChange={() => toggle(perm.key)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </FormDialog>
  );
}
