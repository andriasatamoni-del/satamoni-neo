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
  whatsappBotEnabled: boolean;
  smsConfirmationsEnabled: boolean;
  smsRatingRequestsEnabled: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

type ToggleKey = "whatsappBotEnabled" | "smsConfirmationsEnabled" | "smsRatingRequestsEnabled";

interface OrderNotificationsLog {
  gatewayConfigured: boolean;
  ratingLinkBaseUrl: string | null;
  notifications: { id: string; orderId: string; kind: string; recipient: string; status: string; error: string | null; createdAt: string }[];
}

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  {
    key: "whatsappBotEnabled",
    label: "بوت الرد الآلي (واتساب/ماسنجر/إنستجرام)",
    hint: "بيرد على العملاء من المنيو الحقيقي، يجمّع الأوردر كمسودة ويبعته لشاشة واتساب للمراجعة، ويسجّل الشكاوى. مش بيشتغل غير لو مفتاح Gemini (GEMINI_API_KEY) متضاف في السيرفر.",
  },
  {
    key: "smsConfirmationsEnabled",
    label: "رسالة تأكيد الطلب للعميل (SMS)",
    hint: "بعد تسجيل طلب دليفري أو تيك أواي عليه رقم تليفون - محتاج بوابة SMS (SMS_WEBHOOK_URL) في السيرفر.",
  },
  {
    key: "smsRatingRequestsEnabled",
    label: "رسالة طلب تقييم بعد التسليم (SMS)",
    hint: "بعد ما الدليفري يتقفل completed أو التيك أواي يبقى جاهز - فيها رابط صفحة التقييم.",
  },
];

const NOTIFICATION_STATUS_LABELS: Record<string, string> = { sent: "اتبعتت", failed: "فشلت", not_configured: "مفيش بوابة" };
const NOTIFICATION_KIND_LABELS: Record<string, string> = { confirmation: "تأكيد", rating_request: "طلب تقييم" };

const FIELDS: { key: keyof Omit<PosSettings, "updatedBy" | "updatedAt" | ToggleKey>; label: string; hint: string; suffix: string }[] = [
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
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    whatsappBotEnabled: false,
    smsConfirmationsEnabled: false,
    smsRatingRequestsEnabled: false,
  });
  const notificationsQuery = useQuery({
    queryKey: ["order-notifications"],
    queryFn: () => apiRequest<OrderNotificationsLog>("/order-notifications?limit=20"),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(
        Object.fromEntries(FIELDS.map((f) => [f.key, String(settingsQuery.data![f.key])]))
      );
      setToggles({
        whatsappBotEnabled: settingsQuery.data.whatsappBotEnabled,
        smsConfirmationsEnabled: settingsQuery.data.smsConfirmationsEnabled,
        smsRatingRequestsEnabled: settingsQuery.data.smsRatingRequestsEnabled,
      });
    }
  }, [settingsQuery.data]);

  const updateSettings = useMutation({
    mutationFn: () =>
      apiRequest("/pos-settings", {
        method: "PATCH",
        body: { ...Object.fromEntries(FIELDS.map((f) => [f.key, Number(form[f.key])])), ...toggles },
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

          {TOGGLES.map((t, i) => (
            <div
              key={t.key}
              className={`grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px] sm:items-start ${i === 0 ? "border-t border-slate-100 pt-5" : ""}`}
            >
              <Field label={t.label}>
                <p className="text-xs text-slate-400">{t.hint}</p>
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  disabled={!canManage}
                  checked={toggles[t.key]}
                  onChange={(e) => setToggles({ ...toggles, [t.key]: e.target.checked })}
                  data-testid={t.key === "whatsappBotEnabled" ? "bot-enabled-toggle" : `toggle-${t.key}`}
                />
                {toggles[t.key] ? "شغّال" : "مقفول"}
              </label>
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

      {notificationsQuery.data && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>آخر رسايل العملاء (SMS)</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3" data-testid="sms-log">
            {!notificationsQuery.data.gatewayConfigured && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                بوابة SMS مش متظبطة في السيرفر (SMS_WEBHOOK_URL) - الرسايل بتتسجل بس مابتتبعتش
              </p>
            )}
            {notificationsQuery.data.notifications.length === 0 ? (
              <p className="text-sm text-slate-500">مفيش رسايل لسه</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-xs text-slate-500">
                    <th className="py-1">الوقت</th><th>النوع</th><th>الطلب</th><th>الرقم</th><th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {notificationsQuery.data.notifications.map((n) => (
                    <tr key={n.id} className="border-t border-slate-100">
                      <td className="py-1.5">{new Date(n.createdAt).toLocaleString("ar-EG")}</td>
                      <td>{NOTIFICATION_KIND_LABELS[n.kind] ?? n.kind}</td>
                      <td className="font-mono text-xs">{n.orderId.slice(0, 8)}</td>
                      <td dir="ltr" className="text-right">{n.recipient}</td>
                      <td title={n.error ?? undefined}>{NOTIFICATION_STATUS_LABELS[n.status] ?? n.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
