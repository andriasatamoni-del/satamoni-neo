import { Fragment, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge, StatusBadge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface InventoryItem { id: string; name: string; unit: string; itemType: "raw" | "manufactured"; }
interface Branch { id: string; name: string; }
interface RecipeIngredient { ingredientItemId: string; quantity: number; unit: string | null; }
interface RecipeVersion { id: string; versionNumber: number; status: string; ingredients: RecipeIngredient[]; }
interface Recipe { id: string; recipeType: string; inventoryItemId: string | null; versions: RecipeVersion[]; }

interface ConversionOrderInputLine {
  ingredientItemId: string; plannedQuantityPerUnit: number; plannedQuantity: number;
  actualQuantity: number | null; unitCost: number | null;
}
interface ConversionOrder {
  id: string; branchId: string; recipeId: string; outputItemId: string; status: string;
  plannedOutputQuantity: number; actualOutputQuantity: number | null; outputUnitCost: number | null;
  varianceReason: string | null; inputLines: ConversionOrderInputLine[]; createdAt: string;
}

const TABS = [
  { key: "orders", label: "أوامر التحويل" },
  { key: "recipes", label: "الوصفات" },
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة", APPROVED: "معتمد", IN_PROGRESS: "قيد التنفيذ", COMPLETED: "مكتمل", CANCELLED: "ملغى",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function ProductionPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("orders");

  const itemsQuery = useQuery({ queryKey: ["inventory", "items"], queryFn: () => apiRequest<InventoryItem[]>("/inventory/items") });
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const recipesQuery = useQuery({
    queryKey: ["catalog", "recipes", "manufactured_item"],
    queryFn: () => apiRequest<Recipe[]>("/catalog/recipes?recipeType=manufactured_item"),
  });
  const ordersQuery = useQuery({ queryKey: ["production", "orders"], queryFn: () => apiRequest<ConversionOrder[]>("/production") });

  const items = itemsQuery.data ?? [];
  const manufacturedItems = items.filter((i) => i.itemType === "manufactured");
  const rawItems = items.filter((i) => i.itemType === "raw");
  const recipes = recipesQuery.data ?? [];
  const orders = ordersQuery.data ?? [];

  function itemName(id: string): string {
    return items.find((i) => i.id === id)?.name ?? id;
  }

  // ---------- وصفات ----------
  const [newRecipeOutputId, setNewRecipeOutputId] = useState("");
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const createRecipe = useMutation({
    mutationFn: () => apiRequest<Recipe>("/catalog/recipes", { method: "POST", body: { recipeType: "manufactured_item", inventoryItemId: newRecipeOutputId } }),
    onSuccess: () => {
      setNewRecipeOutputId("");
      setRecipeError(null);
      queryClient.invalidateQueries({ queryKey: ["catalog", "recipes", "manufactured_item"] });
    },
    onError: (err) => setRecipeError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [versionLines, setVersionLines] = useState<Record<string, { ingredientItemId: string; quantity: string }[]>>({});
  const [versionError, setVersionError] = useState<Record<string, string>>({});

  function linesFor(recipeId: string) {
    return versionLines[recipeId] ?? [{ ingredientItemId: "", quantity: "" }];
  }
  function updateLine(recipeId: string, index: number, patch: Partial<{ ingredientItemId: string; quantity: string }>) {
    setVersionLines((prev) => {
      const lines = [...linesFor(recipeId)];
      lines[index] = { ...lines[index], ...patch };
      return { ...prev, [recipeId]: lines };
    });
  }

  const createAndActivateVersion = useMutation({
    mutationFn: async (recipeId: string) => {
      const ingredients = linesFor(recipeId)
        .filter((l) => l.ingredientItemId && l.quantity)
        .map((l) => ({ ingredientItemId: l.ingredientItemId, quantity: Number(l.quantity) }));
      const created = await apiRequest<Recipe>(`/catalog/recipes/${recipeId}/versions`, { method: "POST", body: { ingredients } });
      const draft = created.versions.find((v) => v.status === "DRAFT");
      return apiRequest<Recipe>(`/catalog/recipes/${recipeId}/versions/${draft!.id}/activate`, { method: "POST" });
    },
    onSuccess: (_res, recipeId) => {
      setVersionLines((prev) => ({ ...prev, [recipeId]: [{ ingredientItemId: "", quantity: "" }] }));
      setVersionError((prev) => ({ ...prev, [recipeId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["catalog", "recipes", "manufactured_item"] });
    },
    onError: (err, recipeId) => setVersionError((prev) => ({ ...prev, [recipeId]: err instanceof ApiError ? err.message : "حصل خطأ غير متوقع" })),
  });

  // ---------- أوامر التحويل ----------
  const [orderForm, setOrderForm] = useState({ branchId: "", recipeId: "", plannedOutputQuantity: "" });
  const [orderError, setOrderError] = useState<string | null>(null);
  const createOrder = useMutation({
    mutationFn: () =>
      apiRequest("/production", {
        method: "POST",
        body: { branchId: orderForm.branchId, recipeId: orderForm.recipeId, plannedOutputQuantity: Number(orderForm.plannedOutputQuantity) },
      }),
    onSuccess: () => {
      setOrderForm({ branchId: "", recipeId: "", plannedOutputQuantity: "" });
      setOrderError(null);
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
    },
    onError: (err) => setOrderError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const approveOrder = useMutation({
    mutationFn: (id: string) => apiRequest(`/production/${id}/approve`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["production", "orders"] }),
  });
  const startOrder = useMutation({
    mutationFn: (id: string) => apiRequest(`/production/${id}/start`, { method: "POST", body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
  const cancelOrder = useMutation({
    mutationFn: (id: string) => apiRequest(`/production/${id}/cancel`, { method: "POST", body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const [completeForm, setCompleteForm] = useState<Record<string, { actualOutputQuantity: string; varianceReason: string }>>({});
  const [completeOpenId, setCompleteOpenId] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<Record<string, string>>({});
  const completeOrder = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/production/${id}/complete`, {
        method: "POST",
        body: {
          actualOutputQuantity: Number(completeForm[id]?.actualOutputQuantity),
          varianceReason: completeForm[id]?.varianceReason || undefined,
        },
      }),
    onSuccess: (_res, id) => {
      setCompleteOpenId(null);
      setCompleteError((prev) => ({ ...prev, [id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err, id) => setCompleteError((prev) => ({ ...prev, [id]: err instanceof ApiError ? err.message : "حصل خطأ غير متوقع" })),
  });

  function handleRecipeSubmit(e: FormEvent) {
    e.preventDefault();
    createRecipe.mutate();
  }
  function handleOrderSubmit(e: FormEvent) {
    e.preventDefault();
    createOrder.mutate();
  }

  const recipesWithActiveVersion = recipes.filter((r) => r.versions.some((v) => v.status === "ACTIVE"));

  return (
    <div>
      <PageHeader title="التصنيع والتعبئة" description="وصفات التحويل وأوامر التصنيع/التعبئة" />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "recipes" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>وصفة تحويل جديدة</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={handleRecipeSubmit} className="flex flex-wrap items-end gap-3">
                <Field label="الصنف الناتج (لازم يكون نوعه مصنّع)">
                  <Select required value={newRecipeOutputId} onChange={(e) => setNewRecipeOutputId(e.target.value)}>
                    <option value="">اختر صنف مصنّع</option>
                    {manufacturedItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </Select>
                </Field>
                <Button type="submit" disabled={createRecipe.isPending}>إنشاء وصفة</Button>
              </form>
              {manufacturedItems.length === 0 && (
                <p className="mt-3 text-sm text-slate-400">مفيش أصناف "مصنّعة" لسه - أضف صنف جديد من تبويب المخزون واختار نوعه "مصنّع".</p>
              )}
              {recipeError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{recipeError}</p>}
            </CardBody>
          </Card>

          {recipes.map((recipe) => {
            const activeVersion = recipe.versions.find((v) => v.status === "ACTIVE");
            return (
              <Card key={recipe.id}>
                <CardHeader><CardTitle>{itemName(recipe.inventoryItemId ?? "")}</CardTitle></CardHeader>
                <CardBody>
                  {activeVersion ? (
                    <div className="mb-4">
                      <Badge tone="brand">نسخة نشطة #{activeVersion.versionNumber}</Badge>
                      <ul className="mt-2 space-y-1 text-sm text-slate-700">
                        {activeVersion.ingredients.map((ing, i) => (
                          <li key={i}>{itemName(ing.ingredientItemId)} - {fmt(ing.quantity)} لكل وحدة ناتج</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mb-4 text-sm text-slate-400">مفيش نسخة نشطة لسه - أضف مكوّنات وفعّل نسخة عشان تقدر تستخدمها في أمر تحويل.</p>
                  )}

                  <p className="mb-2 text-xs font-semibold text-slate-500">نسخة جديدة (هتتفعّل فورًا)</p>
                  <div className="space-y-2">
                    {linesFor(recipe.id).map((line, i) => (
                      <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Select value={line.ingredientItemId} onChange={(e) => updateLine(recipe.id, i, { ingredientItemId: e.target.value })}>
                          <option value="">اختر مكوّن خام</option>
                          {rawItems.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
                        </Select>
                        <Input type="number" step="any" placeholder="الكمية لكل وحدة ناتج" value={line.quantity} onChange={(e) => updateLine(recipe.id, i, { quantity: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setVersionLines((prev) => ({ ...prev, [recipe.id]: [...linesFor(recipe.id), { ingredientItemId: "", quantity: "" }] }))}>
                      + مكوّن
                    </Button>
                    <Button type="button" size="sm" disabled={createAndActivateVersion.isPending} onClick={() => createAndActivateVersion.mutate(recipe.id)}>
                      حفظ وتفعيل
                    </Button>
                  </div>
                  {versionError[recipe.id] && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{versionError[recipe.id]}</p>}
                </CardBody>
              </Card>
            );
          })}
          {recipes.length === 0 && (
            <Card><CardBody><EmptyState>مفيش وصفات تحويل لسه</EmptyState></CardBody></Card>
          )}
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>أمر تحويل جديد</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={handleOrderSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
                <Field label="الفرع">
                  <Select required value={orderForm.branchId} onChange={(e) => setOrderForm({ ...orderForm, branchId: e.target.value })}>
                    <option value="">اختر فرع</option>
                    {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
                <Field label="الوصفة">
                  <Select required value={orderForm.recipeId} onChange={(e) => setOrderForm({ ...orderForm, recipeId: e.target.value })}>
                    <option value="">اختر وصفة (بنسخة نشطة)</option>
                    {recipesWithActiveVersion.map((r) => <option key={r.id} value={r.id}>{itemName(r.inventoryItemId ?? "")}</option>)}
                  </Select>
                </Field>
                <Field label="الكمية المخططة">
                  <Input required type="number" step="any" value={orderForm.plannedOutputQuantity} onChange={(e) => setOrderForm({ ...orderForm, plannedOutputQuantity: e.target.value })} />
                </Field>
                <Button type="submit" disabled={createOrder.isPending}>إنشاء</Button>
              </form>
              {recipesWithActiveVersion.length === 0 && (
                <p className="mt-3 text-sm text-slate-400">مفيش وصفة بنسخة نشطة لسه - فعّل وصفة الأول من تبويب "الوصفات".</p>
              )}
              {orderError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{orderError}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>أوامر التحويل ({orders.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR><TH>الناتج</TH><TH>المخطط</TH><TH>الفعلي</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
                </THead>
                <TBody>
                  {orders.map((order) => (
                    <Fragment key={order.id}>
                      <TR>
                        <TD className="font-semibold text-slate-900">{itemName(order.outputItemId)}</TD>
                        <TD>{fmt(order.plannedOutputQuantity)}</TD>
                        <TD>{order.actualOutputQuantity != null ? fmt(order.actualOutputQuantity) : "-"}</TD>
                        <TD><StatusBadge status={STATUS_LABELS[order.status] ?? order.status} /></TD>
                        <TD>
                          <div className="flex flex-wrap gap-1.5">
                            {order.status === "DRAFT" && (
                              <>
                                <Button size="sm" onClick={() => approveOrder.mutate(order.id)} disabled={approveOrder.isPending}>اعتماد</Button>
                                <Button size="sm" variant="danger" onClick={() => cancelOrder.mutate(order.id)} disabled={cancelOrder.isPending}>إلغاء</Button>
                              </>
                            )}
                            {order.status === "APPROVED" && (
                              <>
                                <Button size="sm" onClick={() => startOrder.mutate(order.id)} disabled={startOrder.isPending}>بدء التنفيذ</Button>
                                <Button size="sm" variant="danger" onClick={() => cancelOrder.mutate(order.id)} disabled={cancelOrder.isPending}>إلغاء</Button>
                              </>
                            )}
                            {order.status === "IN_PROGRESS" && (
                              <>
                                <Button size="sm" onClick={() => setCompleteOpenId(completeOpenId === order.id ? null : order.id)}>إكمال</Button>
                                <Button size="sm" variant="danger" onClick={() => cancelOrder.mutate(order.id)} disabled={cancelOrder.isPending}>إلغاء</Button>
                              </>
                            )}
                          </div>
                        </TD>
                      </TR>
                      {completeOpenId === order.id && (
                        <TR>
                          <TD colSpan={5}>
                            <div className="flex flex-wrap items-end gap-3">
                              <Field label="الكمية الفعلية المنتجة">
                                <Input
                                  type="number" step="any"
                                  value={completeForm[order.id]?.actualOutputQuantity ?? ""}
                                  onChange={(e) => setCompleteForm((prev) => ({ ...prev, [order.id]: { ...prev[order.id], actualOutputQuantity: e.target.value, varianceReason: prev[order.id]?.varianceReason ?? "" } }))}
                                />
                              </Field>
                              <Field label="سبب الفرق (لو الفرق كبير)">
                                <Input
                                  value={completeForm[order.id]?.varianceReason ?? ""}
                                  onChange={(e) => setCompleteForm((prev) => ({ ...prev, [order.id]: { ...prev[order.id], varianceReason: e.target.value, actualOutputQuantity: prev[order.id]?.actualOutputQuantity ?? "" } }))}
                                />
                              </Field>
                              <Button size="sm" onClick={() => completeOrder.mutate(order.id)} disabled={completeOrder.isPending}>تأكيد الإكمال</Button>
                            </div>
                            {completeError[order.id] && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{completeError[order.id]}</p>}
                          </TD>
                        </TR>
                      )}
                    </Fragment>
                  ))}
                </TBody>
              </Table>
              {orders.length === 0 && <EmptyState>مفيش أوامر تحويل لسه</EmptyState>}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
