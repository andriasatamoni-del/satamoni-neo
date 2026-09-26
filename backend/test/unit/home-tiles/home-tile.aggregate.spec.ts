import { HomeTile } from "../../../src/contexts/home-tiles/domain/home-tile.aggregate";
import { HomeTileTitleRequiredError } from "../../../src/contexts/home-tiles/domain/errors";

function tile() {
  return HomeTile.reconstitute("tile-1", {
    tileKey: "orders", href: "/orders", icon: "cart", title: "الطلبات", description: "وصف",
    displayOrder: 10, createdAt: new Date(), updatedAt: new Date(),
  });
}

describe("HomeTile aggregate", () => {
  it("updateDisplay بيحدّث العنوان/الوصف/الترتيب المبعوتين بس", () => {
    const t = tile();
    t.updateDisplay({ title: "الطلبات الجديدة" });
    expect(t.title).toBe("الطلبات الجديدة");
    expect(t.description).toBe("وصف");
    expect(t.displayOrder).toBe(10);
  });

  it("بيرفض عنوان فاضي", () => {
    expect(() => tile().updateDisplay({ title: "   " })).toThrow(HomeTileTitleRequiredError);
  });

  it("tileKey/href/icon ثابتين - مفيش method يغيّرهم", () => {
    const t = tile();
    t.updateDisplay({ title: "تاني", description: "وصف تاني", displayOrder: 99 });
    expect(t.tileKey).toBe("orders");
    expect(t.href).toBe("/orders");
    expect(t.icon).toBe("cart");
  });
});
