import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input } from "../shared/ui/Field";

interface PosSettings {
  shiftVarianceAckThresholdEgp: number;
  driverSettlementVarianceAckThresholdEgp: number;
  driverHourlyRateEgp: number;
  paymentAdjustmentHighThresholdEgp: number;
  productionVarianceAlertPercent: number;
  updatedBy: string | null;
  updatedAt: string;
}

const FIELDS: { key: keyof Omit<PosSettings, "updatedBy" | "updatedAt">; label: string; hint: string; suffix: string }[] = [
  {
    key: "shiftVarianceAckThresholdEgp",
    label: "حد اعتماد فرق كاش الشيفت",
    hint: "فرق جوّه الحد ده وقت قفل شيفت الكاشير بيتقفل تلقائيًا من غير ما يحتاج مراجعة مدير",
    suffix: "ج",
  },
  {
    key: "driverSettlementVarianceAckThresholdEgp",
    label: "حد اعتماد فرق تسليم السائق",
    hint: "فرق جوّه الحد ده وقت تسوية كاش السائق بيتقفل تلقائيًا",
    suffix: "ج",
  },
  {
    key: "driverHourlyRateEgp",
    label: "أجر ساعة السائق الافتراضي",
    hint: "بيتجمّد على كل شيفت حضور سائق وقت تسجيل الدخول - تغييره بيأثر على الشيفتات الجديدة بس",
    suffix: "ج/ساعة",
  },
  {
    key: "paymentAdjustmentHighThresholdEgp",
    label: "سقف اعتماد تعديل الدفعات",
    hint: "طلب تعديل دفعة أعلى من الحد ده لازم اعتماد محاسب/أدمن، مش مدير الفرع بمفرده",
    suffix: "ج",
  },
  {
    key: "productionVarianceAlertPercent",
    label: "نسبة تنبيه فرق الإنتاج",
    hint: "فرق أكبر من النسبة دي بين الكمية المخطّطة والفعلية لازم سبب مكتوب قبل إغلاق أمر التصنيع",
    suffix: "%",
  },
];

export function PosSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "admin";

  const settingsQuery = useQuery({ queryKey: ["pos-settings"], queryFn: () => apiRequest<PosSettings>("/pos-settings") });
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(
        Object.fromEntries(FIELDS.map((f) => [f.key, String(settingsQuery.data![f.key])]))
      );
    }
  }, [settingsQuery.data]);

  const updateSettings = useMutation({
    mutationFn: () =>
      apiRequest("/pos-settings", {
        method: "PATCH",
        body: Object.fromEntries(FIELDS.map((f) => [f.key, Number(form[f.key])])),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      queryClient.invalidateQueries({ queryKey: ["pos-settings"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  return (
    <div>
      <PageHeader title="إعدادات النظام" description="القيم القابلة للتهيئة في الكاشير والتوصيل والمحاسبة والتصنيع" />

      <Card>
        <CardHeader>
          <CardTitle>الإعدادات العامة</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          {!canManage && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
              للعرض بس - محتاج صلاحية أدمن عشان تعدّل الإعدادات دي
            </p>
          )}
          {FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px] sm:items-start">
              <Field label={f.label}>
                <p className="text-xs text-slate-400">{f.hint}</p>
              </Field>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  disabled={!canManage}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
                <span className="text-xs text-slate-400">{f.suffix}</span>
              </div>
            </div>
          ))}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
          {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">اتحفظ بنجاح</p>}

          {canManage && (
            <Button onClick={() => updateSettings.mutate()} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "بيتحفظ..." : "حفظ التغييرات"}
            </Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
