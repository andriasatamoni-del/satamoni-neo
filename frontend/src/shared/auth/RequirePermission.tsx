import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { can } from "./roles";
import type { Permission } from "./permissions";
import { NoAccess } from "../ui/NoAccess";

// حارس الراوت: أي مفتاح واحد من anyOf كفاية (نفس مفاتيح @RequirePermission بتاع الـendpoint الأساسي للصفحة).
// anyOf = null يعني الصفحة مفتوحة لأي مستخدم داخل. المستخدم نفسه اتأكد منه في RequireAuth قبلها.
export function RequirePermission({ anyOf, children }: { anyOf: readonly Permission[] | null; children: ReactNode }) {
  const { user } = useAuth();
  if (anyOf && !can(user, ...anyOf)) return <NoAccess />;
  return <>{children}</>;
}
