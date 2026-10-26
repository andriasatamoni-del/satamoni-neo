import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../shared/auth/AuthContext";
import { PERMISSION } from "../../shared/auth/permissions";
import { can } from "../../shared/auth/roles";
import { OWN_BRANCH_LABEL } from "../../shared/auth/useBranchOptions";
import { offlineFallbackQuery } from "./offlineFallbackQuery";
import type { Branch } from "./posTypes";

export function usePosBranches() {
  const { user } = useAuth();
  const canListBranches = can(user, PERMISSION.BRANCHES_VIEW, PERMISSION.BRANCHES_MANAGE);
  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => offlineFallbackQuery<Branch[]>("/branches", "branches"),
    enabled: canListBranches,
  });
  const ownBranches: Branch[] = user?.branchId ? [{ id: user.branchId, name: OWN_BRANCH_LABEL }] : [];
  return {
    canListBranches,
    branches: canListBranches ? (branchesQuery.data ?? []) : ownBranches,
    defaultBranchId: canListBranches ? "" : (user?.branchId ?? ""),
  };
}
