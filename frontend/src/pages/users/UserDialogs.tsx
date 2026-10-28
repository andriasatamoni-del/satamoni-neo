import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errorMessage";
import { FormDialog } from "../../shared/ui/FormDialog";
import { Field, Input, Select } from "../../shared/ui/Field";
import { ROLE, type Role } from "../../shared/auth/roles";
import { RolePicker } from "./RolePicker";
import type { PermissionsCatalog } from "./permissionsCatalog";
import { USERS_QUERY_KEY, type AppUser, type Branch } from "./types";

const NO_ROLE_ERROR = "لازم تختار دور واحد على الأقل";

function useSaveUser(request: () => Promise<unknown>, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      onDone();
    },
  });
}

function BranchSelect({ value, onChange, branches }: { value: string; onChange: (branchId: string) => void; branches: Branch[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">- بدون -</option>
      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </Select>
  );
}

export function CreateUserDialog({
  branches,
  catalog,
  onClose,
}: {
  branches: Branch[];
  catalog: PermissionsCatalog | undefined;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "", branchId: "", roles: [ROLE.CASHIER] as Role[] });
  const [validationError, setValidationError] = useState<string | null>(null);
  const create = useSaveUser(
    () => apiRequest("/users", { method: "POST", body: { ...form, branchId: form.branchId || undefined } }),
    onClose
  );

  function submit() {
    if (form.roles.length === 0) return setValidationError(NO_ROLE_ERROR);
    setValidationError(null);
    create.mutate();
  }

  return (
    <FormDialog
      title="مستخدم جديد"
      submitLabel="إنشاء المستخدم"
      isSubmitting={create.isPending}
      error={validationError ?? errorMessage(create.error)}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="الاسم">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="الإيميل">
          <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="كلمة السر">
          <Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Field label="الفرع (اختياري)">
          <BranchSelect value={form.branchId} onChange={(branchId) => setForm({ ...form, branchId })} branches={branches} />
        </Field>
      </div>
      <Field label="الأدوار">
        <RolePicker value={form.roles} onChange={(roles) => setForm({ ...form, roles })} catalog={catalog} />
      </Field>
    </FormDialog>
  );
}

export function EditUserDialog({
  user,
  isCurrentUser,
  branches,
  onClose,
}: {
  user: AppUser;
  isCurrentUser: boolean;
  branches: Branch[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({ branchId: user.branchId ?? "", isActive: user.isActive, password: "" });
  const save = useSaveUser(
    () =>
      apiRequest(`/users/${user.id}`, {
        method: "PATCH",
        body: {
          branchId: form.branchId || null,
          isActive: form.isActive,
          ...(form.password ? { password: form.password } : {}),
        },
      }),
    onClose
  );

  return (
    <FormDialog
      title={`تعديل: ${user.name}`}
      submitLabel="حفظ"
      isSubmitting={save.isPending}
      error={errorMessage(save.error)}
      onSubmit={() => save.mutate()}
      onClose={onClose}
    >
      <Field label="الفرع">
        <BranchSelect value={form.branchId} onChange={(branchId) => setForm({ ...form, branchId })} branches={branches} />
      </Field>
      <Field label="الحالة">
        <Select disabled={isCurrentUser} value={form.isActive ? "1" : "0"} onChange={(e) => setForm({ ...form, isActive: e.target.value === "1" })}>
          <option value="1">نشط</option>
          <option value="0">متوقف</option>
        </Select>
      </Field>
      <Field label="باسورد جديد (اختياري)">
        <Input type="password" minLength={8} placeholder="سيبه فاضي لو مش هتغيّره" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
    </FormDialog>
  );
}

export function AssignRolesDialog({
  user,
  isCurrentUser,
  catalog,
  onClose,
}: {
  user: AppUser;
  isCurrentUser: boolean;
  catalog: PermissionsCatalog | undefined;
  onClose: () => void;
}) {
  const lockedRoles = isCurrentUser && user.roles.includes(ROLE.ADMIN) ? [ROLE.ADMIN] : [];
  const [roles, setRoles] = useState<Role[]>([...user.roles]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const save = useSaveUser(() => apiRequest(`/users/${user.id}`, { method: "PATCH", body: { roles } }), onClose);

  function submit() {
    if (roles.length === 0) return setValidationError(NO_ROLE_ERROR);
    setValidationError(null);
    save.mutate();
  }

  return (
    <FormDialog
      title={`أدوار: ${user.name}`}
      submitLabel="حفظ الأدوار"
      isSubmitting={save.isPending}
      error={validationError ?? errorMessage(save.error)}
      onSubmit={submit}
      onClose={onClose}
    >
      <RolePicker value={roles} onChange={setRoles} catalog={catalog} lockedRoles={lockedRoles} />
      {lockedRoles.length > 0 && <p className="text-xs text-slate-500">مينفعش تشيل دور الأدمن من حسابك انت</p>}
    </FormDialog>
  );
}
