import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { can, ROLE, ROLES, ROLE_LABELS, type Role } from "../shared/auth/roles";
import { PERMISSION } from "../shared/auth/permissions";
import { useBranchOptions } from "../shared/auth/useBranchOptions";

interface Branch { id: string; name: string; }
interface AppUser {
  id: string; name: string; email: string; roles: Role[]; branchId: string | null; isActive: boolean;
}
interface PermissionDef { key: string; label: string; }
interface PermissionGroup { group: string; groupLabel: string; permissions: PermissionDef[]; }
interface PermissionsCatalog { catalog: PermissionGroup[]; rolePermissions: Record<Role, string[]>; }

const EMPTY_CREATE_FORM = { name: "", email: "", password: "", roles: [ROLE.CASHIER] as Role[], branchId: "" };

function toggled<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function effectivePermissionCount(roles: readonly Role[], catalog: PermissionsCatalog): number {
  return new Set(roles.flatMap((r) => catalog.rolePermissions[r] ?? [])).size;
}

function RoleCheckboxes({ value, onChange }: { value: Role[]; onChange: (roles: Role[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {ROLES.map((r) => (
        <label key={r} className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.includes(r)}
            onChange={() => onChange(toggled(value, r))}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          {ROLE_LABELS[r]}
        </label>
      ))}
    </div>
  );
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const canManageUsers = can(currentUser, PERMISSION.IDENTITY_USERS_MANAGE);
  const canManageRoles = can(currentUser, PERMISSION.IDENTITY_ROLES_MANAGE);
  // الصفحة بتفتح بـidentity.roles.manage لوحدها كمان (محرر صلاحيات الأدوار بس)
  const canSeeUsers = can(currentUser, PERMISSION.IDENTITY_USERS_VIEW, PERMISSION.IDENTITY_USERS_MANAGE);

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => apiRequest<AppUser[]>("/users"), enabled: canSeeUsers });
  const { branches } = useBranchOptions<Branch>(canSeeUsers);
  const catalogQuery = useQuery({
    queryKey: ["users", "permissions-catalog"],
    queryFn: () => apiRequest<PermissionsCatalog>("/users/permissions-catalog"),
    enabled: canManageUsers || canManageRoles,
    retry: false,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editForm, setEditForm] = useState({ roles: [] as Role[], branchId: "", isActive: true, password: "" });
  const [editError, setEditError] = useState<string | null>(null);

  const createUser = useMutation({
    mutationFn: () =>
      apiRequest("/users", {
        method: "POST",
        body: {
          name: createForm.name, email: createForm.email, password: createForm.password,
          roles: createForm.roles, branchId: createForm.branchId || undefined,
        },
      }),
    onSuccess: () => {
      setCreateError(null);
      setCreateForm(EMPTY_CREATE_FORM);
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
          roles: editForm.roles,
          branchId: editForm.branchId || null,
          isActive: editForm.isActive,
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
    setEditForm({ roles: [...u.roles], branchId: u.branchId ?? "", isActive: u.isActive, password: "" });
    setEditError(null);
  }

  function branchName(branchId: string | null) {
    if (!branchId) return "-";
    return branches.find((b) => b.id === branchId)?.name ?? branchId;
  }

  const users = usersQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="المستخدمين"
        description="إدارة حسابات الدخول والأدوار، وصلاحيات كل دور"
        actions={canManageUsers ? <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? "إلغاء" : "+ مستخدم جديد"}</Button> : undefined}
      />

      {showCreate && canManageUsers && (
        <Card className="mb-6">
          <CardHeader><CardTitle>مستخدم جديد</CardTitle></CardHeader>
          <CardBody>
            <form
              onSubmit={(e: FormEvent) => { e.preventDefault(); createUser.mutate(); }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="الاسم">
                  <Input required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                </Field>
                <Field label="الإيميل">
                  <Input required type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                </Field>
                <Field label="كلمة السر">
                  <Input required type="password" minLength={8} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
                </Field>
                <Field label="الفرع (اختياري)">
                  <Select value={createForm.branchId} onChange={(e) => setCreateForm({ ...createForm, branchId: e.target.value })}>
                    <option value="">- بدون -</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="الأدوار">
                <RoleCheckboxes value={createForm.roles} onChange={(roles) => setCreateForm({ ...createForm, roles })} />
              </Field>
              {createError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{createError}</p>}
              <Button type="submit" disabled={createUser.isPending || createForm.roles.length === 0}>
                {createUser.isPending ? "بيتسجّل..." : "إنشاء المستخدم"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {editingUser && canManageUsers && (
        <Card className="mb-6">
          <CardHeader><CardTitle>تعديل: {editingUser.name}</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="الفرع">
                <Select value={editForm.branchId} onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}>
                  <option value="">- بدون -</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
            <Field label="الأدوار">
              <RoleCheckboxes value={editForm.roles} onChange={(roles) => setEditForm({ ...editForm, roles })} />
            </Field>
            {catalogQuery.data && (
              <p className="text-xs text-slate-500">
                صلاحيات المستخدم بتيجي من أدواره بس: {effectivePermissionCount(editForm.roles, catalogQuery.data)} صلاحية.
                تقدر تعدّل صلاحيات كل دور من "صلاحيات الأدوار" تحت.
              </p>
            )}

            {editError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{editError}</p>}
            <div className="flex gap-2">
              <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending || editForm.roles.length === 0}>
                {saveEdit.isPending ? "بيتحفظ..." : "حفظ"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>إلغاء</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {canSeeUsers && (
        <Card className="mb-6">
          <CardHeader><CardTitle>المستخدمين ({users.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>الاسم</TH>
                  <TH>الإيميل</TH>
                  <TH>الأدوار</TH>
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
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => <Badge key={r} tone="neutral">{ROLE_LABELS[r] ?? r}</Badge>)}
                      </div>
                    </TD>
                    <TD>{branchName(u.branchId)}</TD>
                    <TD><Badge tone={u.isActive ? "success" : "danger"}>{u.isActive ? "نشط" : "متوقف"}</Badge></TD>
                    <TD>
                      {canManageUsers && (
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
      )}

      {canManageRoles && catalogQuery.data && <RolePermissionsEditor catalog={catalogQuery.data} />}
    </div>
  );
}

function RolePermissionsEditor({ catalog }: { catalog: PermissionsCatalog }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>(ROLE.BRANCH_MANAGER);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(catalog.rolePermissions[ROLE.BRANCH_MANAGER]));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const isAdmin = role === ROLE.ADMIN;

  function pickRole(next: Role) {
    setRole(next);
    setSelected(new Set(catalog.rolePermissions[next] ?? []));
    setMessage(null);
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const save = useMutation({
    mutationFn: () => apiRequest(`/roles/${role}/permissions`, { method: "PUT", body: { permissions: [...selected] } }),
    onSuccess: () => {
      setMessage({ tone: "success", text: `اتحفظت صلاحيات "${ROLE_LABELS[role]}"` });
      queryClient.invalidateQueries({ queryKey: ["users", "permissions-catalog"] });
    },
    onError: (err) => setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "حصل خطأ غير متوقع" }),
  });

  const saved = new Set(catalog.rolePermissions[role] ?? []);
  const dirty = selected.size !== saved.size || [...selected].some((k) => !saved.has(k));

  return (
    <Card>
      <CardHeader><CardTitle>صلاحيات الأدوار</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="الدور">
            <Select value={role} onChange={(e) => pickRole(e.target.value as Role)} className="max-w-[220px]">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </Field>
          <p className="pb-2 text-xs text-slate-500">
            {isAdmin ? "الأدمن معاه كل الصلاحيات دايمًا ومينفعش تتعدّل" : `${selected.size} صلاحية - التعديل بيتطبّق على كل مستخدمين الدور ده`}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.catalog.map((group) => (
            <div key={group.group} className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-bold text-slate-500">{group.groupLabel}</p>
              <div className="space-y-1.5">
                {group.permissions.map((perm) => (
                  <label key={perm.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.has(perm.key)}
                      disabled={isAdmin}
                      onChange={() => toggle(perm.key)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm font-medium ${message.tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {message.text}
          </p>
        )}
        {!isAdmin && (
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>{save.isPending ? "بيتحفظ..." : "حفظ صلاحيات الدور"}</Button>
            <Button type="button" variant="secondary" disabled={!dirty} onClick={() => pickRole(role)}>تراجع</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
