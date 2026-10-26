import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/AuthContext";
import { PERMISSION } from "../../shared/auth/permissions";
import { can } from "../../shared/auth/roles";
import { ActiveShiftCard } from "./shift/ActiveShiftCard";
import { OpenShiftCard } from "./shift/OpenShiftCard";
import { SHIFT_QUERY_KEYS, type Shift } from "./shift/shiftTypes";

export function ShiftBanner() {
  const { user } = useAuth();
  const canViewOwnShift = can(user, PERMISSION.SHIFTS_VIEW_OWN);
  const canOpenShift = can(user, PERMISSION.SHIFTS_OPEN_OWN);
  const canCloseShift = can(user, PERMISSION.SHIFTS_CLOSE_OWN);
  const canRecordCashEntry = can(user, PERMISSION.SHIFTS_RECORD_CASH_ENTRY);

  const currentShiftQuery = useQuery({
    queryKey: SHIFT_QUERY_KEYS.current,
    queryFn: () => apiRequest<Shift | null>("/shifts/current"),
    enabled: canViewOwnShift,
  });

  if (!canViewOwnShift || currentShiftQuery.isLoading) return null;

  const shift = currentShiftQuery.data;
  if (!shift) {
    return canOpenShift ? <OpenShiftCard /> : null;
  }

  return <ActiveShiftCard shift={shift} canRecordCashEntry={canRecordCashEntry} canCloseShift={canCloseShift} />;
}
