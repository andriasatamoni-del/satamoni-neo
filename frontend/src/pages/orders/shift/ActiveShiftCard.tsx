import { useState } from "react";
import { Badge } from "../../../shared/ui/Badge";
import { Button } from "../../../shared/ui/Button";
import { Card, CardBody } from "../../../shared/ui/Card";
import { formatPrice } from "../posLabels";
import { CashDrawerEntriesSection } from "./CashDrawerEntriesSection";
import { CloseShiftSection } from "./CloseShiftSection";
import { VARIANCE_LABELS, type Shift } from "./shiftTypes";

export function ActiveShiftCard({
  shift,
  canRecordCashEntry,
  canCloseShift,
}: {
  shift: Shift;
  canRecordCashEntry: boolean;
  canCloseShift: boolean;
}) {
  const [showCashEntry, setShowCashEntry] = useState(false);
  const [showClose, setShowClose] = useState(false);

  return (
    <Card className="mb-6 border-emerald-200 bg-emerald-50">
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge tone="success">شيفت شغال</Badge>
            <p className="text-sm font-semibold text-slate-700">رصيد الافتتاح: {formatPrice(shift.openingCash)}</p>
          </div>
          <div className="flex gap-2">
            {canRecordCashEntry && (
              <ToggleButton open={showCashEntry} onToggle={() => setShowCashEntry((v) => !v)} label="تسجيل مصروف/مشترى" />
            )}
            {canCloseShift && (
              <ToggleButton open={showClose} onToggle={() => setShowClose((v) => !v)} label="قفل الشيفت" />
            )}
          </div>
        </div>

        {showCashEntry && <CashDrawerEntriesSection shiftId={shift.id} />}
        {showClose && <CloseShiftSection shiftId={shift.id} onClosed={() => setShowClose(false)} />}

        {shift.varianceStatus !== "NONE" && (
          <p className="mt-2 text-xs font-semibold text-amber-700">{VARIANCE_LABELS[shift.varianceStatus]}</p>
        )}
      </CardBody>
    </Card>
  );
}

function ToggleButton({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={onToggle}>
      {open ? "إلغاء" : label}
    </Button>
  );
}
