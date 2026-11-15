import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../shared/api/client";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Field, Input, Select } from "../../shared/ui/Field";
import { Badge } from "../../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { Pagination } from "../../shared/ui/Pagination";
import { useListState } from "../../shared/ui/useListState";
import { MENU_RECIPES_KEY, type MenuRecipeItem, type MenuRecipeOption } from "./MenuRecipesTab";

function groupLabel(item: MenuRecipeItem): string {
  if (item.kind === "addon") return "الإضافات";
  return item.categoryName ?? "من غير قسم";
}

export function RecipeLinksTab({
  canAssign,
  highlightItemId,
  onClearHighlight,
}: {
  canAssign: boolean;
  highlightItemId?: string | null;
  onClearHighlight?: () => void;
}) {
  const queryClient = useQueryClient();
  const [assignError, setAssignError] = useState<string | null>(null);

  const itemsList = useListState(["q", "missing"] as const, { prefix: "links." });
  const itemsPage = usePaginatedQuery<MenuRecipeItem>([...MENU_RECIPES_KEY, "items"], "/catalog/menu-recipes/items", {
    ...itemsList.params,
    itemId: highlightItemId ?? undefined,
  });
  const items = itemsPage.data?.items ?? [];

  const missingPage = usePaginatedQuery<MenuRecipeItem>([...MENU_RECIPES_KEY, "missing-count"], "/catalog/menu-recipes/items", { missing: 1, limit: 1, offset: 0 });
  const missingCount = missingPage.data?.total ?? 0;

  const optionsQuery = useQuery({
    queryKey: [...MENU_RECIPES_KEY, "options"],
    queryFn: () => apiRequest<MenuRecipeOption[]>("/catalog/menu-recipes/options"),
    enabled: canAssign,
  });
  const options = optionsQuery.data ?? [];

  const groups = useMemo(() => {
    const byGroup = new Map<string, MenuRecipeItem[]>();
    for (const item of items) byGroup.set(groupLabel(item), [...(byGroup.get(groupLabel(item)) ?? []), item]);
    return [...byGroup.entries()];
  }, [items]);

  useEffect(() => {
    if (!highlightItemId || !itemsPage.data) return;
    document.getElementById(`menu-recipe-${highlightItemId}`)?.scrollIntoView({ block: "center" });
  }, [highlightItemId, itemsPage.data]);

  const assign = useMutation({
    mutationFn: ({ variantId, recipeId }: { variantId: string; recipeId: string | null }) =>
      apiRequest(`/catalog/variants/${variantId}/recipe`, { method: "PUT", body: { recipeId } }),
    onSuccess: () => {
      setAssignError(null);
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (err) => setAssignError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  return (
    <Card>
      <CardHeader><CardTitle>ربط أحجام المنيو بالوصفات</CardTitle></CardHeader>
      <CardBody>
        {highlightItemId ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>بتعرض الصنف اللي اخترته بس.</span>
            {onClearHighlight && <Button size="sm" variant="secondary" onClick={onClearHighlight}>عرض كل الأصناف</Button>}
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="بحث بالاسم">
              <Input aria-label="بحث في الأصناف" value={itemsList.filters.q} onChange={(e) => itemsList.setFilter("q", e.target.value)} placeholder="اسم الصنف" />
            </Field>
            <Field label="عرض">
              <Select aria-label="عرض الأصناف" value={itemsList.filters.missing ? "missing" : "all"} onChange={(e) => itemsList.setFilter("missing", e.target.value === "missing" ? "1" : "")}>
                <option value="all">الكل</option>
                <option value="missing">من غير وصفة</option>
              </Select>
            </Field>
            {missingCount > 0 && <Badge tone="warning">{missingCount} صنف من غير وصفة</Badge>}
          </div>
        )}
        <p className="mb-3 text-sm text-slate-500">اختار لكل حجم في المنيو الوصفة بتاعته من مكتبة الوصفات. الصنف بيفضل موقوف لحد ما كل أحجامه تتربط، وبعدها بيتفعّل لوحده.</p>
        {assignError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{assignError}</p>}
        {groups.length === 0 && !itemsPage.isLoading && <EmptyState>{itemsList.filters.missing ? "كل الأصناف ليها وصفات" : "مفيش أصناف"}</EmptyState>}
        {groups.map(([label, groupItems]) => (
          <div key={label} className="mb-6">
            <h4 className="mb-2 text-sm font-bold text-slate-700">{label}</h4>
            <Table>
              <THead>
                <TR><TH>الصنف</TH><TH>الحجم</TH><TH>الوصفة</TH></TR>
              </THead>
              <TBody>
                {groupItems.flatMap((item) =>
                  (item.variants.length ? item.variants : [null]).map((variant, index) => (
                    <TR
                      key={`${item.id}-${variant?.id ?? "none"}`}
                      id={index === 0 ? `menu-recipe-${item.id}` : undefined}
                      className={highlightItemId === item.id ? "bg-amber-50" : undefined}
                    >
                      <TD className="font-semibold text-slate-900">
                        {index === 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{item.name}</span>
                            {!item.hasRecipe && <Badge tone="warning">مفيش وصفة</Badge>}
                            {!item.isActive && <Badge tone="neutral">موقوف</Badge>}
                          </div>
                        )}
                      </TD>
                      <TD>{variant?.label ?? "—"}</TD>
                      <TD>
                        {!variant ? (
                          <span className="text-sm text-slate-400">الصنف ملوش أحجام</span>
                        ) : canAssign ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              aria-label={`وصفة ${item.name} ${variant.label}`}
                              value={variant.recipeId ?? ""}
                              disabled={assign.isPending}
                              onChange={(e) => assign.mutate({ variantId: variant.id, recipeId: e.target.value || null })}
                            >
                              <option value="">— من غير وصفة —</option>
                              {options.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}{r.ready ? "" : " (من غير مكوّنات)"}</option>
                              ))}
                            </Select>
                            {!variant.ready && <Badge tone="warning">مفيش وصفة</Badge>}
                          </div>
                        ) : variant.recipeName ? (
                          <span className="text-sm">{variant.recipeName}</span>
                        ) : (
                          <Badge tone="warning">مفيش وصفة</Badge>
                        )}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        ))}
        <Pagination
          total={itemsPage.data?.total ?? 0}
          limit={itemsList.limit}
          offset={itemsList.offset}
          onPageChange={itemsList.setPage}
          isFetching={itemsPage.isFetching}
        />
      </CardBody>
    </Card>
  );
}
