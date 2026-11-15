import { Fragment, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";
import { useCan } from "../shared/auth/AuthContext";
import { PERMISSION } from "../shared/auth/permissions";
import { useBranchOptions } from "../shared/auth/useBranchOptions";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge, StatusBadge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs, usePermittedTabs } from "../shared/ui/Tabs";
import { Pagination } from "../shared/ui/Pagination";
import { usePaginatedQuery } from "../shared/api/usePaginatedQuery";
import { MenuRecipesTab } from "./production/MenuRecipesTab";
import { RecipeLinksTab } from "./production/RecipeLinksTab";
import { useListState } from "../shared/ui/useListState";

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

interface ProductionPlanRow {
  inventoryItemId: string;
  itemName: string;
  unit: string;
  approvedDemand: number;
  pendingDemand: number;
  availableStock: number;
  plannedOrInProgress: number;
  requiredProduction: number;
  hasActiveRecipe: boolean;
  recipeId: string | null;
  recipeVersionId: string | null;
}
interface ProductionPlanResponse { ckBranchId: string; fromDate: string; toDate: string; plan: ProductionPlanRow[]; }
interface RawMaterialRow { inventoryItemId: string; itemName: string | null; unit: string | null; required: number; available: number; shortage: number; }
interface RawMaterialRequirementResponse { hasRecipe: boolean; raw: RawMaterialRow[]; }

const TABS = [
  { key: "orders", label: "أوامر التحويل", perm: PERMISSION.PRODUCTION_VIEW },
  { key: "recipes", label: "مكتبة الوصفات", perm: [PERMISSION.CATALOG_ITEMS_VIEW, PERMISSION.CATALOG_RECIPES_MANAGE] },
  { key: "recipe-links", label: "ربط المنيو بالوصفات", perm: [PERMISSION.CATALOG_ITEMS_VIEW, PERMISSION.CATALOG_RECIPES_MANAGE] },
  { key: "planning", label: "تخطيط التصنيع", perm: PERMISSION.PRODUCTION_VIEW },
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة", APPROVED: "معتمد", IN_PROGRESS: "قيد التنفيذ", COMPLETED: "مكتمل", CANCELLED: "ملغى",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function ProductionPage() {
  const queryClient = useQueryClient();
  const allowed = useCan();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tabs, active: tab, setActive: setTab } = usePermittedTabs(TABS, searchParams.get("tab") ?? undefined);
  const canSeeProduction = allowed(PERMISSION.PRODUCTION_VIEW);
  const canCreateOrder = allowed(PERMISSION.PRODUCTION_CREATE);
  const canApproveOrder = allowed(PERMISSION.PRODUCTION_APPROVE);
  const canCompleteOrder = allowed(PERMISSION.PRODUCTION_COMPLETE);
  const canCancelOrder = allowed(PERMISSION.PRODUCTION_CANCEL);
  const canManageRecipes = allowed(PERMISSION.CATALOG_RECIPES_MANAGE);

  const itemsQuery = useQuery({
    queryKey: ["inventory", "items"],
    queryFn: () => apiRequest<InventoryItem[]>("/inventory/items"),
    enabled: allowed(PERMISSION.INVENTORY_ITEMS_VIEW, PERMISSION.INVENTORY_ITEMS_MANAGE),
  });
  const { branches } = useBranchOptions<Branch>(tab === "orders" || tab === "planning");
  const recipesQuery = useQuery({
    queryKey: ["catalog", "recipes", "manufactured_item"],
    queryFn: () => apiRequest<Recipe[]>("/catalog/recipes?recipeType=manufactured_item"),
    enabled: tab === "orders",
  });

  const items = itemsQuery.data ?? [];
  const recipes = recipesQuery.data ?? [];
  const ordersList = useListState([] as const, { prefix: "orders." });
  const ordersPageQuery = usePaginatedQuery<ConversionOrder>(["production", "orders"], "/production", ordersList.params, { enabled: canSeeProduction && tab === "orders" });

  function itemName(id: string): string {
    return items.find((i) => i.id === id)?.name ?? id;
  }

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

  const [completeForm, setCompleteForm] = useState<Record<string, { actualOutputQuantity: string; varianceReason: string; expiryDate: string }>>({});
  const [completeOpenId, setCompleteOpenId] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<Record<string, string>>({});
  const completeOrder = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/production/${id}/complete`, {
        method: "POST",
        body: {
          actualOutputQuantity: Number(completeForm[id]?.actualOutputQuantity),
          varianceReason: completeForm[id]?.varianceReason || undefined,
          expiryDate: completeForm[id]?.expiryDate || undefined,
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

  const [planCkBranchId, setPlanCkBranchId] = useState("");
  const [planFromDate, setPlanFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [planToDate, setPlanToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rawMaterialOpenItemId, setRawMaterialOpenItemId] = useState<string | null>(null);

  const planQuery = useQuery({
    queryKey: ["production", "planning", "plan", planCkBranchId, planFromDate, planToDate],
    queryFn: () =>
      apiRequest<ProductionPlanResponse>(
        `/production/planning/plan?ckBranchId=${planCkBranchId}&fromDate=${planFromDate}&toDate=${planToDate}`
      ),
    enabled: !!planCkBranchId,
  });

  const rawMaterialRow = planQuery.data?.plan.find((r) => r.inventoryItemId === rawMaterialOpenItemId) ?? null;
  const rawMaterialsQuery = useQuery({
    queryKey: ["production", "planning", "raw-materials", planCkBranchId, rawMaterialOpenItemId],
    queryFn: () =>
      apiRequest<RawMaterialRequirementResponse>(
        `/production/planning/raw-materials?ckBranchId=${planCkBranchId}&inventoryItemId=${rawMaterialOpenItemId}&quantity=${rawMaterialRow?.requiredProduction}`
      ),
    enabled: !!planCkBranchId && !!rawMaterialOpenItemId && !!rawMaterialRow?.requiredProduction,
  });

  function handleOrderSubmit(e: FormEvent) {
    e.preventDefault();
    createOrder.mutate();
  }

  const recipesWithActiveVersion = recipes.filter((r) => r.versions.some((v) => v.status === "ACTIVE"));

  return (
    <div>
      <PageHeader title="التصنيع والتعبئة" description="وصفات أصناف المنيو وأوامر التصنيع/التعبئة" />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "recipes" && <MenuRecipesTab ingredients={items} canManageRecipes={canManageRecipes} />}

      {tab === "recipe-links" && (
        <RecipeLinksTab
          canAssign={allowed(PERMISSION.CATALOG_ITEMS_MANAGE, PERMISSION.CATALOG_RECIPES_MANAGE)}
          highlightItemId={searchParams.get("item")}
          onClearHighlight={() =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.delete("item");
                return next;
              },
              { replace: true }
            )
          }
        />
      )}

      {tab === "orders" && (
        <div className="space-y-6">
          {canCreateOrder && (
            <Card>
              <CardHeader><CardTitle>أمر تحويل جديد</CardTitle></CardHeader>
              <CardBody>
                <form onSubmit={handleOrderSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
                  <Field label="الفرع">
                    <Select required value={orderForm.branchId} onChange={(e) => setOrderForm({ ...orderForm, branchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
          )}

          <Card>
            <CardHeader><CardTitle>أوامر التحويل ({ordersPageQuery.data?.total ?? 0})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR><TH>الناتج</TH><TH>المخطط</TH><TH>الفعلي</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
                </THead>
                <TBody>
                  {(ordersPageQuery.data?.items ?? []).map((order) => (
                    <Fragment key={order.id}>
                      <TR>
                        <TD className="font-semibold text-slate-900">{itemName(order.outputItemId)}</TD>
                        <TD>{fmt(order.plannedOutputQuantity)}</TD>
                        <TD>{order.actualOutputQuantity != null ? fmt(order.actualOutputQuantity) : "-"}</TD>
                        <TD><StatusBadge status={STATUS_LABELS[order.status] ?? order.status} /></TD>
                        <TD>
                          <div className="flex flex-wrap gap-1.5">
                            {order.status === "DRAFT" && canApproveOrder && (
                              <Button size="sm" onClick={() => approveOrder.mutate(order.id)} disabled={approveOrder.isPending}>اعتماد</Button>
                            )}
                            {order.status === "APPROVED" && canCreateOrder && (
                              <Button size="sm" onClick={() => startOrder.mutate(order.id)} disabled={startOrder.isPending}>بدء التنفيذ</Button>
                            )}
                            {order.status === "IN_PROGRESS" && canCompleteOrder && (
                              <Button size="sm" onClick={() => setCompleteOpenId(completeOpenId === order.id ? null : order.id)}>إكمال</Button>
                            )}
                            {["DRAFT", "APPROVED", "IN_PROGRESS"].includes(order.status) && canCancelOrder && (
                              <Button size="sm" variant="danger" onClick={() => cancelOrder.mutate(order.id)} disabled={cancelOrder.isPending}>إلغاء</Button>
                            )}
                          </div>
                        </TD>
                      </TR>
                      {completeOpenId === order.id && canCompleteOrder && (
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
                                  onChange={(e) => setCompleteForm((prev) => ({ ...prev, [order.id]: { ...prev[order.id], varianceReason: e.target.value, actualOutputQuantity: prev[order.id]?.actualOutputQuantity ?? "", expiryDate: prev[order.id]?.expiryDate ?? "" } }))}
                                />
                              </Field>
                              <Field label="تاريخ الصلاحية (اختياري - بيعمل دفعة)">
                                <Input
                                  type="date"
                                  value={completeForm[order.id]?.expiryDate ?? ""}
                                  onChange={(e) => setCompleteForm((prev) => ({ ...prev, [order.id]: { ...prev[order.id], expiryDate: e.target.value, actualOutputQuantity: prev[order.id]?.actualOutputQuantity ?? "", varianceReason: prev[order.id]?.varianceReason ?? "" } }))}
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
              {ordersPageQuery.data && (
                <Pagination total={ordersPageQuery.data.total} limit={ordersPageQuery.data.limit} offset={ordersPageQuery.data.offset} onPageChange={ordersList.setPage} isFetching={ordersPageQuery.isFetching} />
              )}
              {ordersPageQuery.data?.total === 0 && <EmptyState>مفيش أوامر تحويل لسه</EmptyState>}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "planning" && (
        <div className="space-y-6">
          <Card>
            <CardBody>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="فرع السنتر كيتشن">
                  <Select
                    value={planCkBranchId}
                    onChange={(e) => { setPlanCkBranchId(e.target.value); setRawMaterialOpenItemId(null); }}
                  >
                    <option value="">اختر فرع</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
                <Field label="من تاريخ">
                  <Input type="date" value={planFromDate} onChange={(e) => setPlanFromDate(e.target.value)} />
                </Field>
                <Field label="لتاريخ">
                  <Input type="date" value={planToDate} onChange={(e) => setPlanToDate(e.target.value)} />
                </Field>
              </div>
            </CardBody>
          </Card>

          {planCkBranchId && (
            <Card>
              <CardHeader><CardTitle>خطة التصنيع ({planQuery.data?.plan.length ?? 0} صنف مصنّع)</CardTitle></CardHeader>
              <CardBody className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>الصنف</TH><TH>الطلب المعتمد</TH><TH>طلب بانتظار الاعتماد</TH><TH>المتاح</TH>
                      <TH>تحت التنفيذ/مخطط</TH><TH>المطلوب تصنيعه</TH><TH>الوصفة</TH><TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {planQuery.data?.plan.map((row) => (
                      <Fragment key={row.inventoryItemId}>
                        <TR>
                          <TD className="font-semibold text-slate-900">{row.itemName}</TD>
                          <TD>{fmt(row.approvedDemand)} {row.unit}</TD>
                          <TD className="text-slate-500">{fmt(row.pendingDemand)} {row.unit}</TD>
                          <TD>{fmt(row.availableStock)} {row.unit}</TD>
                          <TD>{fmt(row.plannedOrInProgress)} {row.unit}</TD>
                          <TD className={row.requiredProduction > 0 ? "font-bold text-amber-700" : "text-emerald-700"}>
                            {fmt(row.requiredProduction)} {row.unit}
                          </TD>
                          <TD>
                            <Badge tone={row.hasActiveRecipe ? "brand" : "neutral"}>{row.hasActiveRecipe ? "فيها وصفة" : "من غير وصفة"}</Badge>
                          </TD>
                          <TD>
                            {row.requiredProduction > 0 && row.hasActiveRecipe && (
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => setRawMaterialOpenItemId(rawMaterialOpenItemId === row.inventoryItemId ? null : row.inventoryItemId)}
                              >
                                {rawMaterialOpenItemId === row.inventoryItemId ? "إخفاء الخامات" : "احتياج الخامات"}
                              </Button>
                            )}
                          </TD>
                        </TR>
                        {rawMaterialOpenItemId === row.inventoryItemId && (
                          <TR>
                            <TD colSpan={8}>
                              {rawMaterialsQuery.data?.raw.length ? (
                                <Table>
                                  <THead>
                                    <TR><TH>الخامة</TH><TH>المطلوب</TH><TH>المتاح عند السنتر كيتشن</TH><TH>النقص</TH></TR>
                                  </THead>
                                  <TBody>
                                    {rawMaterialsQuery.data.raw.map((r) => (
                                      <TR key={r.inventoryItemId}>
                                        <TD className="font-semibold text-slate-900">{r.itemName ?? r.inventoryItemId}</TD>
                                        <TD>{fmt(r.required)} {r.unit}</TD>
                                        <TD>{fmt(r.available)} {r.unit}</TD>
                                        <TD className={r.shortage > 0 ? "font-bold text-red-700" : "text-emerald-700"}>
                                          {r.shortage > 0 ? `${fmt(r.shortage)} ${r.unit}` : "كفاية"}
                                        </TD>
                                      </TR>
                                    ))}
                                  </TBody>
                                </Table>
                              ) : (
                                <p className="p-3 text-sm text-slate-400">مفيش خامات محتاجة (لسه بيتحمّل أو مفيش وصفة)</p>
                              )}
                            </TD>
                          </TR>
                        )}
                      </Fragment>
                    ))}
                  </TBody>
                </Table>
                {planQuery.data?.plan.length === 0 && <EmptyState>مفيش أصناف مصنّعة مسجلة لسه</EmptyState>}
              </CardBody>
            </Card>
          )}
          {!planCkBranchId && <EmptyState>اختر فرع السنتر كيتشن عشان تشوف خطة التصنيع</EmptyState>}
        </div>
      )}
    </div>
  );
}
