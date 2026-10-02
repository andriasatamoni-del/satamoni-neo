import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { ImageUploadButton } from "../shared/ui/ImageUploadButton";

interface Reward {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pointsCost: number;
  kind: "discount" | "free_item" | "free_combo";
  discountAmount: number | null;
  variantId: string | null;
  comboId: string | null;
  targetName: string | null;
  value: number | null;
  isActive: boolean;
}
interface MenuItem { id: string; name: string; isActive: boolean; variants: { id: string; label: string; price: number }[] }
interface Combo { id: string; name: string; price: number; isActive: boolean }

const KIND_LABELS: Record<Reward["kind"], string> = { discount: "خصم بمبلغ", free_item: "صنف هدية", free_combo: "عرض هدية" };
const EMPTY_FORM = { name: "", description: "", imageUrl: "", pointsCost: "", kind: "free_item" as Reward["kind"], discountAmount: "", variantId: "", comboId: "" };

// نقاط الولاء (STORE-2): نسبة الكسب من إعدادات النظام + كتالوج المكافآت اللي العميل بيصرف فيه نقاطه
// على موقع الطلب (خصم / بيتزا هدية / فطيرة حلو هدية / كومبو هدية)
export function LoyaltyPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({ queryKey: ["pos-settings"], queryFn: () => apiRequest<{ loyaltyPointsPerEgp: number }>("/pos-settings") });
  const rewardsQuery = useQuery({ queryKey: ["loyalty", "rewards"], queryFn: () => apiRequest<Reward[]>("/loyalty/rewards") });
  const itemsQuery = useQuery({ queryKey: ["catalog", "items"], queryFn: () => apiRequest<MenuItem[]>("/catalog/items") });
  const combosQuery = useQuery({ queryKey: ["catalog", "combos", "all"], queryFn: () => apiRequest<Combo[]>("/catalog/combos/all") });

  // الإدارة بتكتب "كل كام جنيه = نقطة" (أوضح من 0.1 نقطة لكل جنيه)
  const [egpPerPoint, setEgpPerPoint] = useState("");
  useEffect(() => {
    const rate = settingsQuery.data?.loyaltyPointsPerEgp;
    if (rate !== undefined) setEgpPerPoint(rate > 0 ? String(Math.round((1 / rate) * 100) / 100) : "0");
  }, [settingsQuery.data]);
  const saveRate = useMutation({
    mutationFn: () => {
      const egp = Number(egpPerPoint);
      return apiRequest("/pos-settings", { method: "PATCH", body: { loyaltyPointsPerEgp: egp > 0 ? 1 / egp : 0 } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos-settings"] }),
  });

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveReward = useMutation({
    mutationFn: (input: { id?: string; body: Record<string, unknown> }) =>
      apiRequest<Reward>(input.id ? `/loyalty/rewards/${input.id}` : "/loyalty/rewards", { method: input.id ? "PATCH" : "POST", body: input.body }),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setEditingId(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["loyalty", "rewards"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  function rewardBody(r: typeof form, extra: Partial<{ isActive: boolean }> = {}) {
    return {
      name: r.name,
      description: r.description || null,
      imageUrl: r.imageUrl || null,
      pointsCost: Number(r.pointsCost),
      kind: r.kind,
      discountAmount: r.kind === "discount" ? Number(r.discountAmount) : null,
      variantId: r.kind === "free_item" ? r.variantId : null,
      comboId: r.kind === "free_combo" ? r.comboId : null,
      ...extra,
    };
  }

  function toForm(r: Reward): typeof form {
    return {
      name: r.name,
      description: r.description ?? "",
      imageUrl: r.imageUrl ?? "",
      pointsCost: String(r.pointsCost),
      kind: r.kind,
      discountAmount: r.discountAmount ? String(r.discountAmount) : "",
      variantId: r.variantId ?? "",
      comboId: r.comboId ?? "",
    };
  }

  const rewards = rewardsQuery.data ?? [];
  const rate = settingsQuery.data?.loyaltyPointsPerEgp ?? 0;

  return (
    <div>
      <PageHeader title="نقاط الولاء" description="العميل بيكسب نقاط على كل طلب بعد ما يتسلّم، ويصرفها في مكافأة وهو بيطلب من الموقع" />

      <Card>
        <CardHeader>
          <CardTitle>نسبة الكسب</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              saveRate.mutate();
            }}
          >
            <Field label="كل كام جنيه = نقطة واحدة (صفر = الكسب واقف)">
              <Input type="number" min="0" step="any" value={egpPerPoint} onChange={(e) => setEgpPerPoint(e.target.value)} disabled={!canManage} data-testid="egp-per-point" />
            </Field>
            {canManage && (
              <Button type="submit" disabled={saveRate.isPending}>
                حفظ
              </Button>
            )}
            <p className="text-sm text-slate-500">
              {rate > 0 ? `طلب بـ200 جنيه = ${Math.floor(200 * rate)} نقطة. النقاط بتتضاف لما الطلب يتقفل (اتسلّم)، لأي طلب برقم عميل عنده حساب.` : "الكسب واقف دلوقتي."}
            </p>
          </form>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{editingId ? "تعديل مكافأة" : "مكافأة جديدة"}</CardTitle>
        </CardHeader>
        <CardBody>
          {canManage ? (
            <form
              className="grid grid-cols-1 gap-4 md:grid-cols-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const current = rewards.find((r) => r.id === editingId);
                saveReward.mutate({ id: editingId ?? undefined, body: rewardBody(form, current ? { isActive: current.isActive } : {}) });
              }}
            >
              <Field label="اسم المكافأة (بيظهر للعميل)">
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="بيتزا صغيرة هدية" />
              </Field>
              <Field label="النوع">
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Reward["kind"] })} data-testid="reward-kind">
                  {Object.entries(KIND_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="عدد النقاط">
                <Input required type="number" min="1" step="1" value={form.pointsCost} onChange={(e) => setForm({ ...form, pointsCost: e.target.value })} />
              </Field>
              {form.kind === "discount" && (
                <Field label="مبلغ الخصم (جنيه)">
                  <Input required type="number" min="1" step="any" value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: e.target.value })} />
                </Field>
              )}
              {form.kind === "free_item" && (
                <Field label="الصنف والحجم الهدية">
                  <Select required value={form.variantId} onChange={(e) => setForm({ ...form, variantId: e.target.value })} data-testid="reward-variant">
                    <option value="">اختار</option>
                    {(itemsQuery.data ?? [])
                      .filter((i) => i.isActive)
                      .flatMap((i) =>
                        i.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {i.name} - {v.label} ({v.price}ج)
                          </option>
                        ))
                      )}
                  </Select>
                </Field>
              )}
              {form.kind === "free_combo" && (
                <Field label="العرض الهدية">
                  <Select required value={form.comboId} onChange={(e) => setForm({ ...form, comboId: e.target.value })}>
                    <option value="">اختار</option>
                    {(combosQuery.data ?? []).filter((c) => c.isActive).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.price}ج)
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="وصف (اختياري)">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Field label="صورة (اختياري - من غيرها بتظهر صورة الصنف/العرض)">
                <ImageUploadButton imageUrl={form.imageUrl} onUploaded={(url) => setForm({ ...form, imageUrl: url })} />
              </Field>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-3">{error}</p>}
              <div className="flex gap-2 md:col-span-3">
                <Button type="submit" disabled={saveReward.isPending}>
                  {editingId ? "حفظ التعديل" : "إضافة المكافأة"}
                </Button>
                {editingId && (
                  <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
                    إلغاء
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-500">إضافة وتعديل المكافآت للأدمن بس</p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>كتالوج المكافآت ({rewards.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>المكافأة</TH>
                <TH>النوع</TH>
                <TH>النقاط</TH>
                <TH>القيمة</TH>
                <TH>الحالة</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {rewards.map((r) => (
                <TR key={r.id}>
                  <TD className="font-semibold text-slate-900">
                    {r.name}
                    {r.targetName && <p className="text-xs font-normal text-slate-400">{r.targetName}</p>}
                  </TD>
                  <TD>{KIND_LABELS[r.kind]}</TD>
                  <TD>{r.pointsCost}</TD>
                  <TD>{r.value !== null ? `${r.value}ج` : "—"}</TD>
                  <TD>{r.isActive ? <Badge tone="success">متاحة</Badge> : <Badge tone="neutral">موقوفة</Badge>}</TD>
                  <TD>
                    {canManage && (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(r.id); setForm(toForm(r)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant={r.isActive ? "secondary" : "primary"}
                          onClick={() => saveReward.mutate({ id: r.id, body: rewardBody(toForm(r), { isActive: !r.isActive }) })}
                        >
                          {r.isActive ? "إيقاف" : "تفعيل"}
                        </Button>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {rewards.length === 0 && <EmptyState>مفيش مكافآت لسه - ضيف أول مكافأة عشان العملاء يقدروا يصرفوا نقاطهم</EmptyState>}
        </CardBody>
      </Card>
    </div>
  );
}
