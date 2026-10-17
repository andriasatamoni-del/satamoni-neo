import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { useAuth } from "./AuthContext";
import { can } from "./roles";
import { PERMISSION } from "./permissions";

export interface BranchOption {
  id: string;
  name: string;
}

// اسم الفرع لما المستخدم مش مسموح له يشوف لستة الفروع (معانا الـid بس من /auth/me)
export const OWN_BRANCH_LABEL = "فرعي";

// لستة الفروع لأي اختيار فرع في الصفحات. GET /branches محتاج branches.view أو branches.manage؛ من غيرهم
// مفيش طلب بيتبعت (عشان مفيش 403)، واللستة بتبقى فرع المستخدم بس لو مربوط بفرع، أو فاضية لو ملوش فرع.
// enabled=false بيأجّل الطلب (مثلًا لحد ما التاب اللي محتاجه يتفتح).
export function useBranchOptions<T extends BranchOption = BranchOption>(enabled = true) {
  const { user } = useAuth();
  const canListBranches = can(user, PERMISSION.BRANCHES_VIEW, PERMISSION.BRANCHES_MANAGE);
  const query = useQuery({
    queryKey: ["branches"],
    queryFn: () => apiRequest<T[]>("/branches"),
    enabled: enabled && canListBranches,
  });
  const branches: T[] = canListBranches
    ? (query.data ?? [])
    : user?.branchId
      ? [{ id: user.branchId, name: OWN_BRANCH_LABEL } as T]
      : [];
  return { branches, canListBranches, query };
}
