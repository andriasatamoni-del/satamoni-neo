import { classifyChecklist } from "../../../src/contexts/branch-day/domain/branch-day-checklist";

describe("classifyChecklist", () => {
  it("أخضر لو مفيش بنود حمرا ولا صفرا", () => {
    const result = classifyChecklist([], []);
    expect(result.color).toBe("GREEN");
    expect(result.canClose).toBe(true);
  });

  it("أصفر لو فيه بنود صفرا بس ومفيش حمرا - لسه ينفع يقفل", () => {
    const result = classifyChecklist([], [{ code: "REVIEWED_VARIANCE_TODAY", message: "test" }]);
    expect(result.color).toBe("YELLOW");
    expect(result.canClose).toBe(true);
  });

  it("أحمر لو فيه بند أحمر واحد - مينفعش يقفل حتى لو فيه أصفر كمان", () => {
    const result = classifyChecklist(
      [{ code: "ACTIVE_SHIFTS", message: "test" }],
      [{ code: "REVIEWED_VARIANCE_TODAY", message: "test" }]
    );
    expect(result.color).toBe("RED");
    expect(result.canClose).toBe(false);
  });
});
