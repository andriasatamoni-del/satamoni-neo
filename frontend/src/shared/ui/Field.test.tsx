import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input, Select } from "./Field";

describe("Select", () => {
  it("uses the same control box as Input", () => {
    render(
      <>
        <Input aria-label="input" />
        <Select aria-label="select" />
      </>,
    );
    const select = screen.getByLabelText("select");
    for (const boxClass of screen.getByLabelText("input").classList) {
      expect(select).toHaveClass(boxClass);
    }
  });

  it("drops the native appearance so the line height applies", () => {
    render(<Select aria-label="select" />);
    expect(screen.getByLabelText("select")).toHaveClass("appearance-none", "select-chevron");
  });

  it("keeps caller classes and the native select behaviour", () => {
    render(
      <Select aria-label="select" className="max-w-[180px]" defaultValue="b">
        <option value="a">أ</option>
        <option value="b">ب</option>
      </Select>,
    );
    const select = screen.getByRole("combobox", { name: "select" });
    expect(select).toHaveClass("max-w-[180px]");
    expect(select).toHaveValue("b");
  });
});
