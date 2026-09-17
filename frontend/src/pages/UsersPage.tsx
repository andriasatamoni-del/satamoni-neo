import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface Branch { id: string; name: string; }
interface AppUser {
  id: string; name: string; email: string; role: string; branchId: string | null; isActive: boolean;
  permissionGrants: string[]; permissionRevokes: string[];
}
interface PermissionDef { key: string; label: string; }
interface PermissionGroup { group: string; groupLabel: string; permissions: PermissionDef[]; }
interface PermissionsCatalog { catalog: PermissionGroup[]; rolePermissions: Record<string, string[]>; }

const ROLES = ["admin", "branch_manager", "accountant", "cashier", "callcenter", "driver", "employee"] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: "أدمن", branch_manager: "مدير فرع", accountant: "محاسب", cashier: "كاشير",
  callcenter: "كول سنتر", driver: "سائق", employee: "موظف",
};

function effectivePermissions(role: string, catalog: PermissionsCatalog, grants: string[], revokes: string[]): Set<string> {
  const defaults = new Set(catalog.rolePermissions[role] ?? []);
  for (const key of revokes) defaults.delete(key);
  for (const key of grants) defaults.add(key);
  return defaults;
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => apiRequest<AppUser[]>("/users") });
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  // نفس أسلوب ShiftReviewPanel بالظبط: بنعتمد على استجابة السيرفر نفسه (403 لو معندوش identity.users.manage)
  // بدل ما نحاول نحسب الصلاحيات الفعلية في الفرونت إند من جديد - مدير الفرع (عنده view بس) هيشوف
  // القايمة للقراءة فقط تلقائيًا لما الكتالوج ده يفشل
  const catalogQuery = useQuery({
    queryKey: ["users", "permissions-catalog"],
    queryFn: () => apiRequest<PermissionsCatalog>("/users/permissions-catalog"),
    retry: false,
  });
  const canManage = catalogQuery.isSuccess;

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "cashier", branchId: "" });
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editForm, setEditForm] = useState({ role: "", branchId: "", isActive: true, password: "" });
  const [editPermissions, setEditPermissions] = useState<Set<string>>(new Set());
  const [editError, setEditError] = useState<string | null>(null);

  const createUser = useMutation({
    mutationFn: () =>
      apiRequest("/users", {
        method: "POST",
        body: {
          name: createForm.name, email: createForm.email, password: createForm.password,
          role: createForm.role, branchId: createForm.branchId || undefined,
        },
      }),
    onSuccess: () => {
      setCreateError(null);
      setCreateForm({ name: "", email: "", password: "", role: "cashier", branchId: "" });
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const quickToggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/users/${id}`, { method: "PATCH", body: { isActive } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const saveEdit = useMutation({
    mutationFn: () => {
      if (!editingUser) throw new Error("مفيش مستخدم متحدد");
      return apiRequest(`/users/${editingUser.id}`, {
        method: "PATCH",
        body: {
          role: editForm.role,
          branchId: editForm.branchId || null,
          isActive: editForm.isActive,
          permissions: [...editPermissions],
          ...(editForm.password ? { password: editForm.password } : {}),
        },
      });
    },
    onSuccess: () => {
      setEditError(null);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  function openEdit(u: AppUser) {
    setEditingUser(u);
    setEditForm({ role: u.role, branchId: u.branchId ?? "", isActive: u.isActive, password: "" });
    setEditError(null);
    if (catalogQuery.data) {
      setEditPermissions(effectivePermissions(u.role, catalogQuery.data, u.permissionGrants, u.permissionRevokes));
    } else {
      setEditPermissions(new Set());
    }
  }

  function resetPermissionsToRoleDefaults() {
    if (!catalogQuery.data) return;
    setEditPermissions(new Set(catalogQuery.data.rolePermissions[editForm.role] ?? []));
  }

  function togglePermission(key: string) {
    setEditPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function branchName(branchId: string | null) {
    if (!branchId) return "-";
    return branchesQuery.data?.find((b) => b.id === branchId)?.name ?? branchId;
  }

  const users = usersQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="المستخدمين"
        description="إدارة حسابات الدخول والأدوار والصلاحيات"
        actions={canManage ? <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? "إلغاء" : "+ مستخدم جديد"}</Button> : undefined}
      />

      {showCreate && canManage && (
        <Card className="mb-6">
          <CardHeader><CardTitle>مستخدم جديد</CardTitle></CardHeader>
          <CardBody>
            <form
              onSubmit={(e: FormEvent) => { e.preventDefault(); createUser.mutate(); }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Field label="الاسم">
                  <Input required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                </Field>
                <Field label="الإيميل">
                  <Input required type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                </Field>
                <Field label="كلمة السر">
                  <Input required type="password" minLength={8} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
                </Field>
                <Field label="الدور">
                  <Select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </Select>
                </Field>
                <Field label="الفرع (اختياري)">
                  <Select value={createForm.branchId} onChange={(e) => setCreateForm({ ...createForm, branchId: e.target.value })}>
                    <option value="">- بدون -</option>
                    {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
              </div>
              {createError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{createError}</p>}
              <Button type="submit" disabled={createUser.isPending}>{createUser.isPending ? "بيتسجّل..." : "إنشاء المستخدم"}</Button>
            </form>
          </CardBody>
        </Card>
      )}

      {editingUser && canManage && catalogQuery.data && (
        <Card className="mb-6">
          <CardHeader><CardTitle>تعديل: {editingUser.name}</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="الدور">
                <Select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              </Field>
              <Field label="الفرع">
                <Select value={editForm.branchId} onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}>
                  <option value="">- بدون -</option>
                  {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="الحالة">
                <Select value={editForm.isActive ? "1" : "0"} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === "1" })}>
                  <option value="1">نشط</option>
                  <option value="0">متوقف</option>
                </Select>
              </Field>
              <Field label="باسورد جديد (اختياري)">
                <Input type="password" minLength={8} placeholder="سيبه فاضي لو مش هتغيّره" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
              </Field>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700">الصلاحيات</h3>
                <Button type="button" size="sm" variant="secondary" onClick={resetPermissionsToRoleDefaults}>
                  استخدام صلاحيات الدور الافتراضية
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catalogQuery.data.catalog.map((group) => (
                  <div key={group.group} className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-bold text-slate-500">{group.groupLabel}</p>
                    <div className="space-y-1.5">
                      {group.permissions.map((perm) => (
                        <label key={perm.key} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={editPermissions.has(perm.key)}
                            onChange={() => togglePermission(perm.key)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          {perm.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {editError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{editError}</p>}
            <div className="flex gap-2">
              <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>{saveEdit.isPending ? "بيتحفظ..." : "حفظ"}</Button>
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>إلغاء</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>المستخدمين ({users.length})</CardTitle></CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>الاسم</TH>
                <TH>الإيميل</TH>
                <TH>الدور</TH>
                <TH>الفرع</TH>
                <TH>الحالة</TH>
                <TH>إجراء</TH>
              </TR>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD className="font-semibold text-slate-900">{u.name}</TD>
                  <TD>{u.email}</TD>
                  <TD><Badge tone="neutral">{ROLE_LABELS[u.role] ?? u.role}</Badge></TD>
                  <TD>{branchName(u.branchId)}</TD>
                  <TD><Badge tone={u.isActive ? "success" : "danger"}>{u.isActive ? "نشط" : "متوقف"}</Badge></TD>
                  <TD>
                    {canManage && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>تعديل</Button>
                        <Button
                          size="sm"
                          variant={u.isActive ? "danger" : "primary"}
                          disabled={quickToggleActive.isPending}
                          onClick={() => quickToggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                        >
                          {u.isActive ? "تعطيل" : "تفعيل"}
                        </Button>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {users.length === 0 && <EmptyState>مفيش مستخدمين لسه</EmptyState>}
        </CardBody>
      </Card>
    </div>
  );
}
