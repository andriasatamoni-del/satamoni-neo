import { TalabatProductMapping } from "../../../src/contexts/talabat/domain/talabat-product-mapping.aggregate";
import { InvalidProductMappingError } from "../../../src/contexts/talabat/domain/errors";

describe("TalabatProductMapping aggregate", () => {
  it("بيسجّل ربط صحيح", () => {
    const mapping = TalabatProductMapping.register({
      branchId: "branch-1", talabatItemId: "TAL-ITEM-1", menuItemId: "item-1", variantId: "variant-1",
    });
    expect(mapping.talabatItemId).toBe("TAL-ITEM-1");
    expect(mapping.variantId).toBe("variant-1");
  });

  it("بيرفض معرّف صنف Talabat فاضي", () => {
    expect(() =>
      TalabatProductMapping.register({ branchId: "branch-1", talabatItemId: "  ", menuItemId: "item-1", variantId: "variant-1" })
    ).toThrow(InvalidProductMappingError);
  });

  it("relink بيحدّث الربط لحجم/عرض تاني", () => {
    const mapping = TalabatProductMapping.register({
      branchId: "branch-1", talabatItemId: "TAL-ITEM-1", menuItemId: "item-1", variantId: "variant-1",
    });
    mapping.relink({ menuItemId: "item-2", variantId: "variant-2" });
    expect(mapping.menuItemId).toBe("item-2");
    expect(mapping.variantId).toBe("variant-2");
  });
});
