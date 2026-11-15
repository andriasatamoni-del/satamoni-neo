import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errorMessage";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Badge } from "../../shared/ui/Badge";
import { Field, Input } from "../../shared/ui/Field";
import { FormDialog } from "../../shared/ui/FormDialog";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { ROLE_SCOPE_LABELS, type Role, type RoleScope } from "../../shared/auth/roles";
import { PERMISSIONS_CATALOG_KEY, usePermissionsCatalog, type PermissionGroup } from "./permissionsCatalog";
import { PermissionChecklist } from "./PermissionChecklist";

export interface RoleRow {
  key: Role;
  label: string;
  scope: RoleScope;
  fullAccess: boolean;
  permissions: string[];
  userCount: number;
}

export const ROLES_QUERY_KEY = ["roles"] as const;

type RoleDialogState = { kind: "create" } | { kind: "edit"; role: RoleRow };

export function RolesTab() {
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({ queryKey: ROLES_QUERY_KEY, queryFn: () => apiRequest<RoleRow[]>("/roles") });
  const catalogQuery = usePermissionsCatalog(true);
  const [dialog, setDialog] = useState<RoleDialogState | null>(null);

  const remove = useMutation({
    mutationFn: (role: RoleRow) => apiRequest(`/roles/${role.key}`, { method: "DELETE" }),
    onSuccess: () => refreshRoles(queryClient),
  });

  function confirmDelete(role: RoleRow) {
    if (window.confirm(`مسح الدور "${role.label}"؟`)) remove.mutate(role);
  }

  const roles = rolesQuery.data ?? [];
  const groups = catalogQuery.data?.catalog;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>الأدوار ({roles.length})</CardTitle>
        <Button size="sm" disabled={!groups} onClick={() => setDialog({ kind: "create" })}>+ دور جديد</Button>
      </CardHeader>
      <CardBody className="p-0">
        {(rolesQuery.isError || catalogQuery.isError) && (
          <p className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">مقدرناش نجيب الأدوار أو كتالوج الصلاحيات</p>
        )}
        {remove.error && <p className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errorMessage(remove.error)}</p>}
        <Table>
          <THead>
            <TR>
              <TH>الدور</TH>
              <TH>النطاق</TH>
              <TH>الصلاحيات</TH>
              <TH>المستخدمين</TH>
              <TH>إجراء</TH>
            </TR>
          </THead>
          <TBody>
            {roles.map((role) => (
              <TR key={role.key}>
                <TD className="font-semibold text-slate-900">{role.label}</TD>
                <TD><Badge tone={role.scope === "company" ? "brand" : "info"}>{ROLE_SCOPE_LABELS[role.scope]}</Badge></TD>
                <TD>{role.fullAccess ? "كل الصلاحيات" : `${role.permissions.length} صلاحية`}</TD>
                <TD>{role.userCount}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" disabled={!groups} onClick={() => setDialog({ kind: "edit", role })}>تعديل</Button>
                    {!role.fullAccess && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={remove.isPending || role.userCount > 0}
                        title={role.userCount > 0 ? "شيل الدور من مستخدمينه الأول" : undefined}
                        onClick={() => confirmDelete(role)}
                      >
                        مسح
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {roles.length === 0 && !rolesQuery.isLoading && <EmptyState>مفيش أدوار</EmptyState>}
      </CardBody>
      {groups && dialog && <RoleDialog state={dialog} groups={groups} onClose={() => setDialog(null)} />}
    </Card>
  );
}

function refreshRoles(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: PERMISSIONS_CATALOG_KEY }),
  ]);
}

function RoleDialog({ state, groups, onClose }: { state: RoleDialogState; groups: PermissionGroup[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const editing = state.kind === "edit" ? state.role : null;
  const fullAccess = editing?.fullAccess ?? false;
  const [label, setLabel] = useState(editing?.label ?? "");
  const [scope, setScope] = useState<RoleScope>(editing?.scope ?? "branch");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(editing?.permissions ?? []));

  const save = useMutation({
    mutationFn: async () => {
      const permissions = [...selected];
      if (!editing) return apiRequest("/roles", { method: "POST", body: { label, scope, permissions } });
      if (fullAccess) return apiRequest(`/roles/${editing.key}`, { method: "PATCH", body: { label } });
      await apiRequest(`/roles/${editing.key}`, { method: "PATCH", body: { label, scope } });
      return apiRequest(`/roles/${editing.key}/permissions`, { method: "PUT", body: { permissions } });
    },
    onSuccess: async () => {
      await refreshRoles(queryClient);
      onClose();
    },
  });

  return (
    <FormDialog
      title={editing ? `تعديل الدور: ${editing.label}` : "دور جديد"}
      submitLabel={editing ? "حفظ الدور" : "إضافة الدور"}
      isSubmitting={save.isPending}
      error={errorMessage(save.error)}
      onSubmit={() => save.mutate()}
      onClose={onClose}
      size="xl"
    >
      {fullAccess ? (
        <div className="space-y-3">
          <Field label="اسم الدور">
            <Input required maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            الدور ده عنده كل الصلاحيات على كل الفروع: تقدر تغيّر اسمه بس.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="اسم الدور">
            <Input required maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثلًا: مشرف صالة" />
          </Field>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium text-slate-700">نطاق الدور</legend>
            <ScopeOption
              checked={scope === "branch"}
              onSelect={() => setScope("branch")}
              title="مربوط بفرع"
              hint="المستخدم بيشتغل على الفرع المتسجّل في حسابه بس"
            />
            <ScopeOption
              checked={scope === "company"}
              onSelect={() => setScope("company")}
              title="عام"
              hint="المستخدم يشوف ويشتغل على كل الفروع"
            />
          </fieldset>
        </div>
      )}
      {!fullAccess && <PermissionChecklist groups={groups} selected={selected} onChange={setSelected} />}
    </FormDialog>
  );
}

function ScopeOption({ checked, onSelect, title, hint }: { checked: boolean; onSelect: () => void; title: string; hint: string }) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
      <input type="radio" name="role-scope" checked={checked} onChange={onSelect} className="mt-0.5 h-4 w-4 text-brand-600 focus:ring-brand-500" />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
