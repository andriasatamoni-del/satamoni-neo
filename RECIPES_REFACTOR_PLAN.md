# Plan: menu-item recipes and items without a recipe

## Goal
1. For now, the recipes page (the الوصفات tab in `ProductionPage`) shows only recipes for the menu items we have.
2. Every menu item must have a recipe. A new item stays **inactive** until it has one, and the item shows the tag "مفيش وصفة" while the recipe is missing.

## Current state
- The الوصفات tab lists and edits only `manufactured_item` recipes (`/catalog/recipes?recipeType=manufactured_item`). Menu-item recipes (`sellable_variant`, one per **variant**) exist and orders consume them (`register-order.handler.ts`), but no page shows them.
- `MenuItem.register` creates items active. `PATCH /catalog/items/:id { isActive }` toggles the status with no checks.
- Orders already reject inactive menu items.

## Rule
An item **has a recipe** when it has at least one variant and every variant has an ACTIVE recipe version with at least one ingredient. This applies to both kinds, `item` and `addon`.

## Backend (catalog context)
1. **Migration** (`pnpm db:generate`): add `menu_items.awaiting_recipe boolean NOT NULL DEFAULT false`. It records that the item is inactive only because its recipe is missing, as opposed to deactivated by hand.
2. **`MenuItem` aggregate**:
   - `register` creates the item with `isActive=false` and `awaitingRecipe=true`.
   - `activate(hasRecipe)` throws `MenuItemRecipeMissingError` (400) when `hasRecipe` is false.
   - `deactivate()` (manual) sets `awaitingRecipe=false`.
   - New `markAwaitingRecipe()` deactivates the item and sets `awaitingRecipe=true`.
   - New `activateWithRecipe()` activates the item only when `awaitingRecipe` is true, then clears the flag.
3. **`RecipeRepositoryPort.variantIdsWithActiveRecipe(variantIds)`**: used to work out whether an item has a recipe.
4. **Handlers**:
   - `RegisterMenuItemHandler` (and the menu-item tabular import, which goes through it): the new item is inactive and awaiting a recipe.
   - `UpdateMenuItemHandler`: `isActive: true` calls `activate(hasRecipe)`.
   - `AddVariantHandler`: the new variant has no recipe, so call `markAwaitingRecipe()` if the item is active.
5. **New command `PUT /catalog/variants/:variantId/recipe { ingredients[] }`** (`CATALOG_RECIPES_MANAGE`), in one `tx.run`:
   - register the `sellable_variant` recipe if it doesn't exist yet;
   - create a new version and activate it;
   - if the item now has a recipe, call `activateWithRecipe()`;
   - write an audit row.
6. **New query `GET /catalog/menu-recipes`** (`CATALOG_ITEMS_VIEW` or `CATALOG_RECIPES_MANAGE`):
   - returns existing menu items, each with its category, kind, `isActive` and `hasRecipe`;
   - for each variant: `{ id, label, recipeId, activeVersion: { versionNumber, ingredients[{ itemId, name, unit, quantity }] } | null }`;
   - sorts items without a recipe first.
7. **`GET /catalog/items`**: add `hasRecipe` per item and per variant. Use the same reader, one query with a left join on `recipes` and the ACTIVE `recipe_versions`, so there are no N+1 queries.
8. **Existing data**: no backfill. Live items keep their current status and show the tag. The activation rule applies to them from now on. If you want items without a recipe switched off now, add a backfill to the migration that sets `is_active=false, awaiting_recipe=true` on active items with no recipe.

## Frontend
1. **الوصفات tab** (`ProductionPage.tsx`, extract it to `pages/production/MenuRecipesTab.tsx`):
   - Read `GET /catalog/menu-recipes`. The list is grouped by category, with search and a filter: الكل / من غير وصفة.
   - Each variant row shows a summary of its ingredients, or the tag "مفيش وصفة".
   - "تعديل الوصفة" or "إضافة وصفة" (`CATALOG_RECIPES_MANAGE`) opens a dialog with ingredient lines (inventory item + quantity) and saves with `PUT /catalog/variants/:id/recipe`.
   - Remove the manufactured-recipe editor from this tab for now. The conversion-orders tab still reads the existing manufactured recipes, and that API stays.
   - Support a deep link: `?tab=recipes&item=<id>` scrolls to the item and highlights it.
2. **`pages/catalog/MenuItemsTab.tsx`**:
   - Show the tag "مفيش وصفة" (`Badge tone="warning"`) next to the name when `!hasRecipe`. The tag links to the recipe deep link.
   - Disable "تفعيل" when `!hasRecipe`, with the hint "ضيف وصفة الأول".
   - In the create dialog, show "الصنف هيتعمل موقوف لحد ما تضيف له وصفة". After saving, offer "إضافة وصفة".
3. **Query invalidation**: saving a recipe invalidates both the `menu-recipes` and the catalog `items` queries, because the item may have just been activated.

## Tests
- **Unit** (`menu-item.aggregate.spec.ts`):
  - a new item is inactive and awaiting a recipe;
  - `activate(false)` throws;
  - adding a variant to an active item deactivates it;
  - `activateWithRecipe` does nothing after a manual deactivation.
- **Integration** (`test/integration/catalog/menu-recipes.e2e.spec.ts`):
  - create an item: it is inactive and `hasRecipe=false`;
  - activating it returns 400;
  - add a recipe to one of two variants: the item stays inactive;
  - add a recipe to the second variant: the item becomes active;
  - add a third variant: the item is inactive again;
  - deactivate by hand, then edit a recipe: the item stays inactive;
  - an order for an item awaiting a recipe is rejected;
  - `GET /catalog/menu-recipes` lists only existing menu items, with the right flags.
- **Frontend**:
  - `MenuItemsTab`: the tag shows and the activate button is disabled;
  - `MenuRecipesTab`: the missing-recipe filter works and the dialog sends the PUT.

## Open points (defaults chosen)
- **Recipe level**: recipes stay per variant, and an item needs every variant covered. The alternative is one shared recipe per item.
- **Addons**: the rule applies to them too.
- **Manufactured-recipe editor**: hidden for now, not deleted.
- **Existing items without a recipe**: tagged, not switched off (see Backend step 8).

## Implementation notes
- **Where the rule lives:** the "new item waits for a recipe" rule is in `RegisterMenuItemHandler` (staff create and the menu import), not in `MenuItem.register`. Seeds and test fixtures that build items directly therefore stay sellable.
- **`ActivateRecipeVersionHandler`:** the older activate route also turns an awaiting item on once all of its variants have a recipe.
- **Menu import:**
  - an "active" cell is ignored for an item that is still waiting for its recipe;
  - an "inactive" cell switches off only an item that is currently active, so an export-then-import round trip changes nothing.
- **Audit:** no audit row for recipe saves. The catalog context doesn't audit its other commands either.
- **Test helper:** `test/integration/helpers/menu.ts` `markReadyForSale` lets suites unrelated to recipes, which create items over HTTP, use those items in orders.

## Revision: menu sizes point to a shared recipe
These are decisions you made: recipes become a named, shared library; each menu size picks one; manufactured stock-item recipes keep pointing at their output item.

### Database
- `recipes.name text NOT NULL`. Existing rows get their name from the data:
  - menu recipes: `<item> - <size>`;
  - manufactured recipes: the stock item's name.
- `menu_item_variants.recipe_id uuid NULL`, a foreign key to `recipes(id)` with `ON DELETE RESTRICT`, filled in from the current `recipes.variant_id`.
- Drop `recipes.variant_id`, along with its unique constraint and foreign key.
- Add a check: a `manufactured_item` recipe has an `inventory_item_id`, and a `sellable_variant` recipe has none.

### Domain and handlers
- **`Recipe`**: loses `variantId`, gains `name` and `rename()`.
- **`MenuItemVariant.recipeId`**:
  - can be set when the item or a size is created;
  - `MenuItem.assignRecipe(variantId, recipeId | null)` sets or clears it.
- **When an item is ready**: every size has a `recipeId` whose recipe has an ACTIVE version.
- **On create, add-size, assign and recipe edits**: an awaiting item turns on as soon as it's ready. Clearing a recipe from a size of an active item switches the item off until a recipe is assigned again.
- **Orders, removable ingredients and reports** find a size's recipe through `menu_item_variants.recipe_id`.

### API
- `POST /catalog/recipes { recipeType, name, inventoryItemId?, ingredients? }`: with ingredients, the first version is created and activated in the same call.
- `PATCH /catalog/recipes/:id { name }`
- `PUT /catalog/recipes/:id/ingredients { ingredients }`: creates a new version and activates it. Every size using the recipe follows it.
- `PUT /catalog/variants/:variantId/recipe { recipeId | null }` (catalog.items.manage or catalog.recipes.manage)
- `POST /catalog/items` and `POST /catalog/items/:id/variants` take an optional `recipeId` per size.
- `GET /catalog/menu-recipes` returns `{ recipes: [library + the sizes using each], items: [items + each size's recipe] }`.

### Frontend
- **الوصفات tab**: a recipe library (new recipe, rename, edit ingredients, which sizes use it) plus a "ربط الأحجام" table with a recipe picker per size and the "مفيش وصفة" tag.
- **Add-item and add-size dialogs**: a recipe picker per size.

### Revision implementation notes
- **Foreign key:** `menu_item_variants.recipe_id` uses `ON DELETE SET NULL`, not RESTRICT. The app has no recipe delete, and SET NULL keeps existing cleanup code working.
- **Migrations:** 0017 adds `recipes.name` and `menu_item_variants.recipe_id` and fills them in from `recipes.variant_id`. 0018 drops `recipes.variant_id` and adds the association check.
- **Manufactured recipe name:** optional in the API, defaulting to the stock item's name.
- **Test helper:** `test/integration/helpers/menu.ts` `linkVariantRecipe` links a size to a recipe in tests. The demo seed creates recipes first and passes their `recipeId` when it creates each item.

### Pagination
- `GET /catalog/menu-recipes` is split into:
  - `/catalog/menu-recipes/recipes` (library, `q`);
  - `/catalog/menu-recipes/items` (`q`, `missing`, `itemId`; items without a recipe sort first in SQL);
  - `/catalog/menu-recipes/options` (an unpaged `{ id, name, ready }` list for the recipe pickers).
- The two lists take the usual `paginate=1&limit&offset` and return the `{ items, total, limit, offset }` envelope.
- In the الوصفات tab both lists use `useListState` and `usePaginatedQuery`, with their own URL prefixes (`recipes.` and `mapping.`). The "مفيش وصفة" link opens just that item, with a "عرض كل الأصناف" button.
