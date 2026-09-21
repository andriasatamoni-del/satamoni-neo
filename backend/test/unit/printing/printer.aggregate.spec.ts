import { Printer } from "../../../src/contexts/printing/domain/printer.aggregate";
import {
  PrinterNameRequiredError,
  UnknownPrinterTypeError,
  UnknownConnectionTypeError,
  MissingOsPrinterNameError,
  MissingIpAddressError,
} from "../../../src/contexts/printing/domain/errors";

describe("Printer aggregate", () => {
  it("بيسجّل طابعة USB صحيحة", () => {
    const printer = Printer.register({ branchId: "b1", name: "طابعة الكاشير", printerType: "CASHIER", osPrinterName: "XP-D200N" });
    expect(printer.name).toBe("طابعة الكاشير");
    expect(printer.connectionType).toBe("USB");
    expect(printer.isEnabled).toBe(true);
    expect(printer.isDefaultForType).toBe(false);
  });

  it("بيرفض نوع طابعة غير معروف", () => {
    expect(() => Printer.register({ branchId: "b1", name: "x", printerType: "GHOST" })).toThrow(UnknownPrinterTypeError);
  });

  it("بيرفض نوع اتصال غير معروف", () => {
    expect(() =>
      Printer.register({ branchId: "b1", name: "x", printerType: "CASHIER", connectionType: "BLUETOOTH" })
    ).toThrow(UnknownConnectionTypeError);
  });

  it("طابعة USB لازم لها osPrinterName", () => {
    expect(() => Printer.register({ branchId: "b1", name: "x", printerType: "CASHIER" })).toThrow(MissingOsPrinterNameError);
  });

  it("طابعة LAN لازم لها ipAddress، وبتاخد بورت 9100 افتراضي", () => {
    expect(() =>
      Printer.register({ branchId: "b1", name: "x", printerType: "KITCHEN", connectionType: "LAN" })
    ).toThrow(MissingIpAddressError);

    const printer = Printer.register({ branchId: "b1", name: "x", printerType: "KITCHEN", connectionType: "LAN", ipAddress: "10.0.0.5" });
    expect(printer.port).toBe(9100);
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => Printer.register({ branchId: "b1", name: "   ", printerType: "CASHIER", osPrinterName: "x" })).toThrow(
      PrinterNameRequiredError
    );
  });

  it("update بيتحقق من نفس قواعد التسجيل (USB لازم osPrinterName)", () => {
    const printer = Printer.register({ branchId: "b1", name: "x", printerType: "CASHIER", osPrinterName: "XP-D200N" });
    expect(() => printer.update({ osPrinterName: null })).toThrow(MissingOsPrinterNameError);
  });

  it("update بيغيّر الحقول المبعوتة بس", () => {
    const printer = Printer.register({ branchId: "b1", name: "x", printerType: "CASHIER", osPrinterName: "XP-D200N" });
    printer.update({ isEnabled: false });
    expect(printer.isEnabled).toBe(false);
    expect(printer.name).toBe("x");
  });

  it("clearDefaultForType بيرجّعها FALSE", () => {
    const printer = Printer.register({ branchId: "b1", name: "x", printerType: "CASHIER", osPrinterName: "XP-D200N" });
    printer.update({ isDefaultForType: true });
    expect(printer.isDefaultForType).toBe(true);
    printer.clearDefaultForType();
    expect(printer.isDefaultForType).toBe(false);
  });
});
