import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../shared/api/client";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Field, Input, Select } from "../../shared/ui/Field";
import { Badge } from "../../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { FormDialog } from "../../shared/ui/FormDialog";
import { Pagination } from "../../shared/ui/Pagination";
import { useListState } from "../../shared/ui/useListState";

export interface IngredientOption { id: string; name: string; unit: string; }

interface MenuRecipeIngredient { ingredientItemId: string; name: string; unit: string; quantity: number; }
interface MenuRecipeUsage { itemId: string; itemName: string; variantId: string; label: string; }
export interface MenuRecipe {
  id: string;
  name: string;
  activeVersion: { versionNumber: number; ingredients: MenuRecipeIngredient[] } | null;
  usedBy: MenuRecipeUsage[];
}
export interface MenuRecipeOption { id: string; name: string; ready: boolean; }
interface MenuRecipeVariant { id: string; label: string; recipeId: string | null; recipeName: string | null; ready: boolean; }
export interface MenuRecipeItem {
  id: string;
  name: string;
  kind: "item" | "addon";
  categoryId: string | null;
  categoryName: string | null;
  isActive: boolean;
  awaitingRecipe: boolean;
  hasRecipe: boolean;
  variants: MenuRecipeVariant[];
}

export const MENU_RECIPES_KEY = ["catalog", "menu-recipes"] as const;

type Line = { ingredientItemId: string; quantity: string };
const EMPTY_LINE: Line = { ingredientItemId: "", quantity: "" };

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(n);
}

function ingredientsText(recipe: MenuRecipe): string {
  return (recipe.activeVersion?.ingredients ?? []).map((i) => `${i.name} ${fmt(i.quantity)} ${i.unit}`).join("، ");
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "حصل خطأ غير متوقع";
}

export function MenuRecipesTab({
  ingredients,
  canManageRecipes,
}: {
  ingredients: readonly IngredientOption[];
  canManageRecipes: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MenuRecipe | "new" | null>(null);

  const recipesList = useListState(["q"] as const, { prefix: "recipes." });
  const recipesPage = usePaginatedQuery<MenuRecipe>([...MENU_RECIPES_KEY, "recipes"], "/catalog/menu-recipes/recipes", recipesList.params);
  const recipes = recipesPage.data?.items ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["catalog"] });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>مكتبة الوصفات ({recipesPage.data?.total ?? 0})</CardTitle>
            {canManageRecipes && <Button size="sm" onClick={() => setEditing("new")}>وصفة جديدة</Button>}
          </div>
        </CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-slate-500">الوصفة ممكن تتربط بأكتر من حجم أو صنف، وأي تعديل فيها بيمشي على كل الأحجام المربوطة بيها.</p>
          <div className="mb-4 max-w-xs">
            <Field label="بحث في الوصفات">
              <Input aria-label="بحث في الوصفات" value={recipesList.filters.q} onChange={(e) => recipesList.setFilter("q", e.target.value)} placeholder="اسم الوصفة" />
            </Field>
          </div>
          {recipes.length === 0 ? (
            <EmptyState>{recipesPage.isLoading ? "بيحمّل..." : "مفيش وصفات"}</EmptyState>
          ) : (
            <Table>
              <THead>
                <TR><TH>الوصفة</TH><TH>المكوّنات</TH><TH>مستخدمة في</TH>{canManageRecipes && <TH />}</TR>
              </THead>
              <TBody>
                {recipes.map((recipe) => (
                  <TR key={recipe.id}>
                    <TD className="font-semibold text-slate-900">{recipe.name}</TD>
                    <TD>{recipe.activeVersion ? <span className="text-sm">{ingredientsText(recipe)}</span> : <Badge tone="warning">من غير مكوّنات</Badge>}</TD>
                    <TD className="text-sm">
                      {recipe.usedBy.length === 0 ? (
                        <span className="text-slate-400">مش مربوطة</span>
                      ) : (
                        recipe.usedBy.map((u) => `${u.itemName} (${u.label})`).join("، ")
                      )}
                    </TD>
                    {canManageRecipes && (
                      <TD><Button size="sm" variant="secondary" onClick={() => setEditing(recipe)}>تعديل</Button></TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <Pagination
            total={recipesPage.data?.total ?? 0}
            limit={recipesList.limit}
            offset={recipesList.offset}
            onPageChange={recipesList.setPage}
            isFetching={recipesPage.isFetching}
          />
        </CardBody>
      </Card>

      {editing && (
        <RecipeDialog
          recipe={editing === "new" ? null : editing}
          ingredients={ingredients}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function RecipeDialog({
  recipe,
  ingredients,
  onClose,
  onSaved,
}: {
  recipe: MenuRecipe | null;
  ingredients: readonly IngredientOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialLines = recipe?.activeVersion?.ingredients.map((i) => ({ ingredientItemId: i.ingredientItemId, quantity: String(i.quantity) })) ?? [];
  const [name, setName] = useState(recipe?.name ?? "");
  const [lines, setLines] = useState<Line[]>(initialLines.length ? initialLines : [EMPTY_LINE]);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = lines
        .filter((l) => l.ingredientItemId && l.quantity)
        .map((l) => ({ ingredientItemId: l.ingredientItemId, quantity: Number(l.quantity) }));
      if (!recipe) {
        return apiRequest("/catalog/recipes", { method: "POST", body: { recipeType: "sellable_variant", name, ingredients: body } });
      }
      if (name.trim() !== recipe.name) await apiRequest(`/catalog/recipes/${recipe.id}`, { method: "PATCH", body: { name } });
      const unchanged = JSON.stringify(body) === JSON.stringify(initialLines.map((l) => ({ ingredientItemId: l.ingredientItemId, quantity: Number(l.quantity) })));
      if (!unchanged) await apiRequest(`/catalog/recipes/${recipe.id}/ingredients`, { method: "PUT", body: { ingredients: body } });
      return null;
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <FormDialog
      title={recipe ? `تعديل ${recipe.name}` : "وصفة جديدة"}
      submitLabel="حفظ الوصفة"
      isSubmitting={save.isPending}
      error={error}
      onSubmit={() => save.mutate()}
      onClose={onClose}
    >
      <Field label="اسم الوصفة">
        <Input aria-label="اسم الوصفة" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {recipe && recipe.usedBy.length > 1 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">الوصفة دي مربوطة بـ{recipe.usedBy.length} أحجام، والتعديل هيمشي عليهم كلهم.</p>
      )}
      <p className="text-xs text-slate-500">الكميات لكل وحدة واحدة. تعديل المكوّنات بيعمل نسخة جديدة من الوصفة وبيفعّلها.</p>
      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
            <Select aria-label="المكوّن" value={line.ingredientItemId} onChange={(e) => updateLine(i, { ingredientItemId: e.target.value })}>
              <option value="">اختر مكوّن</option>
              {ingredients.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
            </Select>
            <Input aria-label="الكمية" type="number" step="any" min="0" placeholder="الكمية" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
            <Button type="button" variant="secondary" size="sm" disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>×</Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, EMPTY_LINE])}>+ مكوّن</Button>
    </FormDialog>
  );
}
