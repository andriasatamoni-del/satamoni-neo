import { DeliveryAssignment } from "../../../src/contexts/delivery/domain/delivery-assignment.aggregate";
import {
  DeliveryAssignmentAlreadyFinalizedError,
  UnknownDispatchStatusError,
} from "../../../src/contexts/delivery/domain/errors";

describe("DeliveryAssignment aggregate", () => {
  it("بيسجّل تكليف صحيح بحالة ASSIGNED", () => {
    const assignment = DeliveryAssignment.register({ orderId: "order-1", driverId: "driver-1", branchId: "branch-1" });
    expect(assignment.status).toBe("ASSIGNED");
    expect(assignment.deliveredAt).toBeNull();
  });

  it("updateStatus بيرفض حالة مش معروفة", () => {
    const assignment = DeliveryAssignment.register({ orderId: "order-1", driverId: "driver-1", branchId: "branch-1" });
    expect(() => assignment.updateStatus("ghost")).toThrow(UnknownDispatchStatusError);
  });

  it("DELIVERED بيحط deliveredAt، ومينفعش يتعدّل تاني بعدها", () => {
    const assignment = DeliveryAssignment.register({ orderId: "order-1", driverId: "driver-1", branchId: "branch-1" });
    assignment.updateStatus("OUT_FOR_DELIVERY");
    assignment.updateStatus("DELIVERED");
    expect(assignment.deliveredAt).not.toBeNull();
    expect(() => assignment.updateStatus("FAILED")).toThrow(DeliveryAssignmentAlreadyFinalizedError);
  });

  it("FAILED بيسجّل سبب الفشل ويقفل التكليف", () => {
    const assignment = DeliveryAssignment.register({ orderId: "order-1", driverId: "driver-1", branchId: "branch-1" });
    assignment.updateStatus("FAILED", { failureReason: "العميل مردش" });
    expect(assignment.failureReason).toBe("العميل مردش");
    expect(() => assignment.updateStatus("ASSIGNED")).toThrow(DeliveryAssignmentAlreadyFinalizedError);
  });
});
