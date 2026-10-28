import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../shared/api/client";
import { errorMessage } from "../shared/api/errorMessage";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { ListFilters, type SelectFilterDef } from "../shared/ui/ListFilters";
import { Pagination } from "../shared/ui/Pagination";
import { useListState } from "../shared/ui/useListState";
import { usePaginatedQuery } from "../shared/api/usePaginatedQuery";
import { can, ROLES, ROLE_LABELS } from "../shared/auth/roles";
import { PERMISSION } from "../shared/auth/permissions";
import { useBranchOptions } from "../shared/auth/useBranchOptions";
import { usePermissionsCatalog } from "./users/permissionsCatalog";
import { AssignRolesDialog, CreateUserDialog, EditUserDialog } from "./users/UserDialogs";
import { USERS_QUERY_KEY, type AppUser, type Branch } from "./users/types";

type UserDialog = { kind: "create" } | { kind: "edit"; user: AppUser } | { kind: "roles"; user: AppUser };

const LIST_FILTERS: SelectFilterDef<"role" | "status">[] = [
  { name: "role", label: "الدور", options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })) },
  { name: "status", label: "الحالة", options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "موقوف" }] },
];

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const canManageUsers = can(currentUser, PERMISSION.IDENTITY_USERS_MANAGE);
  const canSeeUsers = can(currentUser, PERMISSION.IDENTITY_USERS_VIEW, PERMISSION.IDENTITY_USERS_MANAGE);

  const usersList = useListState(["q", "role", "status"] as const, { prefix: "users." });
  const usersQuery = usePaginatedQuery<AppUser>(USERS_QUERY_KEY, "/users", usersList.params, { enabled: canSeeUsers });
  const { branches } = useBranchOptions<Branch>(canSeeUsers);
  const catalog = usePermissionsCatalog(canManageUsers).data;
  const [dialog, setDialog] = useState<UserDialog | null>(null);
  const closeDialog = () => setDialog(null);

  const toggleActive = useMutation({
    mutationFn: (u: AppUser) => apiRequest(`/users/${u.id}`, { method: "PATCH", body: { isActive: !u.isActive } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });

  const users = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const branchName = (branchId: string | null) => (branchId ? branches.find((b) => b.id === branchId)?.name ?? branchId : "-");

  return (
    <div>
      <PageHeader
        title="المستخدمين"
        description="إدارة حسابات الدخول وأدوار كل مستخدم"
        actions={canManageUsers ? <Button onClick={() => setDialog({ kind: "create" })}>+ مستخدم جديد</Button> : undefined}
      />

      <Card>
        <CardHeader><CardTitle>المستخدمين ({total})</CardTitle></CardHeader>
        <CardBody className="p-0">
          {toggleActive.error && (
            <p className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errorMessage(toggleActive.error)}</p>
          )}
          <ListFilters state={usersList} search={{ placeholder: "الاسم أو الإيميل" }} selects={LIST_FILTERS} />
          <Table>
            <THead>
              <TR>
                <TH>الاسم</TH>
                <TH>الإيميل</TH>
                <TH>الأدوار</TH>
                <TH>الفرع</TH>
                <TH>الحالة</TH>
                {canManageUsers && <TH>إجراء</TH>}
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
                  {canManageUsers && (
                    <TD>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "roles", user: u })}>الأدوار</Button>
                        <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "edit", user: u })}>تعديل</Button>
                        {u.id !== currentUser?.id && (
                          <Button
                            size="sm"
                            variant={u.isActive ? "danger" : "primary"}
                            disabled={toggleActive.isPending}
                            onClick={() => toggleActive.mutate(u)}
                          >
                            {u.isActive ? "تعطيل" : "تفعيل"}
                          </Button>
                        )}
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
          {users.length === 0 && !usersQuery.isLoading && <EmptyState>مفيش مستخدمين بالفلاتر دي</EmptyState>}
          <Pagination
            total={total}
            limit={usersList.limit}
            offset={usersList.offset}
            onPageChange={usersList.setPage}
            isFetching={usersQuery.isFetching}
          />
        </CardBody>
      </Card>

      {canManageUsers && dialog?.kind === "create" && <CreateUserDialog branches={branches} catalog={catalog} onClose={closeDialog} />}
      {canManageUsers && dialog?.kind === "edit" && <EditUserDialog user={dialog.user} isCurrentUser={dialog.user.id === currentUser?.id} branches={branches} onClose={closeDialog} />}
      {canManageUsers && dialog?.kind === "roles" && <AssignRolesDialog user={dialog.user} isCurrentUser={dialog.user.id === currentUser?.id} catalog={catalog} onClose={closeDialog} />}
    </div>
  );
}
