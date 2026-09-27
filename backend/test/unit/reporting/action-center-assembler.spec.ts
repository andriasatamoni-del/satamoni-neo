import { assembleActionCenterAlerts } from "../../../src/contexts/reporting/domain/action-center-assembler";
import type { ActionCenterAlert } from "../../../src/contexts/reporting/domain/ports/action-center-reader.port";

function alert(type: string, severity: ActionCenterAlert["severity"]): ActionCenterAlert {
  return { type, severity, branchId: null, branchName: null, description: type };
}

describe("assembleActionCenterAlerts", () => {
  it("بيرتّب التنبيهات: HIGH الأول، بعدين MEDIUM، بعدين LOW - بغض النظر عن ترتيب المجموعات المدخلة", () => {
    const { alerts } = assembleActionCenterAlerts([
      [alert("A", "LOW")],
      [alert("B", "HIGH")],
      [alert("C", "MEDIUM")],
      [alert("D", "HIGH")],
    ]);
    expect(alerts.map((a) => a.severity)).toEqual(["HIGH", "HIGH", "MEDIUM", "LOW"]);
  });

  it("بيحسب countsBySeverity صح، وبيرجع صفر للمستوى اللي مفيهوش تنبيهات", () => {
    const { countsBySeverity } = assembleActionCenterAlerts([[alert("A", "HIGH")], [alert("B", "HIGH")]]);
    expect(countsBySeverity).toEqual({ HIGH: 2, MEDIUM: 0, LOW: 0 });
  });

  it("مجموعات فاضية كلها - بيرجع مصفوفة فاضية وأصفار من غير أي خطأ", () => {
    const result = assembleActionCenterAlerts([[], [], []]);
    expect(result.alerts).toEqual([]);
    expect(result.countsBySeverity).toEqual({ HIGH: 0, MEDIUM: 0, LOW: 0 });
  });
});
