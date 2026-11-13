interface ComboItemRow {
  combo_item_id: string;
  parent_combo_item_id: string | null;
  item_name: string;
  quantity: number;
}

export function withAddonsFolded<R extends ComboItemRow>(rows: R[]): R[] {
  const addonsByParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_combo_item_id) continue;
    const quantity = Number(row.quantity);
    const label = quantity > 1 ? `${row.item_name} × ${quantity}` : row.item_name;
    addonsByParent.set(row.parent_combo_item_id, [...(addonsByParent.get(row.parent_combo_item_id) ?? []), label]);
  }
  return rows
    .filter((row) => !row.parent_combo_item_id)
    .map((row) => {
      const addons = addonsByParent.get(row.combo_item_id);
      return addons ? { ...row, item_name: `${row.item_name} + ${addons.join(" + ")}` } : row;
    });
}
