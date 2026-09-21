import { KitchenStation } from "../../../src/contexts/printing/domain/kitchen-station.aggregate";
import { KitchenStationNameRequiredError } from "../../../src/contexts/printing/domain/errors";

describe("KitchenStation aggregate", () => {
  it("بيسجّل محطة صحيحة من غير طابعة مربوطة", () => {
    const station = KitchenStation.register({ branchId: "b1", name: "  البيتزا  " });
    expect(station.name).toBe("البيتزا");
    expect(station.printerId).toBeNull();
    expect(station.isActive).toBe(true);
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => KitchenStation.register({ branchId: "b1", name: "  " })).toThrow(KitchenStationNameRequiredError);
  });

  it("update بيربط/يفك ربط الطابعة ويعطّل المحطة", () => {
    const station = KitchenStation.register({ branchId: "b1", name: "الحلواني" });
    station.update({ printerId: "p1" });
    expect(station.printerId).toBe("p1");
    station.update({ printerId: null, isActive: false });
    expect(station.printerId).toBeNull();
    expect(station.isActive).toBe(false);
  });

  it("update برفض اسم فاضي ومايغيّرش الاسم الحالي", () => {
    const station = KitchenStation.register({ branchId: "b1", name: "المشويات" });
    expect(() => station.update({ name: "  " })).toThrow(KitchenStationNameRequiredError);
    expect(station.name).toBe("المشويات");
  });
});
