import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/AuthContext";
import { useBranchOptions } from "../../../shared/auth/useBranchOptions";
import { Button } from "../../../shared/ui/Button";
import { Card, CardBody } from "../../../shared/ui/Card";
import { Field, Input, Select } from "../../../shared/ui/Field";
import { errorMessage } from "../../../shared/api/errorMessage";
import type { Branch } from "../posTypes";
import { SHIFT_QUERY_KEYS } from "./shiftTypes";

export function OpenShiftCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openingCash, setOpeningCash] = useState("");
  const [branchId, setBranchId] = useState("");

  const needsBranchPick = !user?.branchId;
  const { branches } = useBranchOptions<Branch>(needsBranchPick);

  const openShift = useMutation({
    mutationFn: () =>
      apiRequest("/shifts/open", { method: "POST", body: { openingCash: Number(openingCash), branchId: user?.branchId ?? (branchId || undefined) } }),
    onSuccess: () => {
      setOpeningCash("");
      setBranchId("");
      queryClient.invalidateQueries({ queryKey: SHIFT_QUERY_KEYS.current });
    },
  });

  const canSubmit = openingCash !== "" && (!needsBranchPick || branchId !== "") && !openShift.isPending;
  const error = errorMessage(openShift.error);

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50">
      <CardBody className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <p className="mb-2 text-sm font-bold text-amber-900">لازم تفتح شيفت قبل ما تسجّل أي طلب</p>
          <div className="flex flex-wrap items-end gap-3">
            {needsBranchPick && (
              <Field label="الفرع">
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="max-w-[220px]">
                  <option value="">اختار الفرع</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="رصيد الدرج الافتتاحي">
              <Input type="number" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="max-w-[160px]" />
            </Field>
          </div>
        </div>
        <Button onClick={() => openShift.mutate()} disabled={!canSubmit}>
          فتح شيفت
        </Button>
        {error && <p className="w-full text-sm font-medium text-red-700">{error}</p>}
      </CardBody>
    </Card>
  );
}
