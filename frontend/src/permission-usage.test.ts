// Same rule the backend permissions-catalog test enforces: permission checks use PERMISSION constants, never
// string literals, so a renamed or removed key fails the typecheck instead of silently hiding a feature.
import { describe, expect, it } from "vitest";

const sources = import.meta.glob(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}", "!./test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const LITERAL_CHECKS: RegExp[] = [
  /\bcan\(\s*\w+\s*,\s*["'`]/, // can(user, "x")
  /\ballowed\(\s*["'`]/, // const allowed = useCan(); allowed("x")
  /\buseCan\(\)\(\s*["'`]/, // useCan()("x")
  /\bperm:\s*["'`]/, // { perm: "x" } in tabs / routes
  /\bperm:\s*\[\s*["'`]/, // { perm: ["x"] }
];

describe("permission checks", () => {
  it("scans the frontend sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it("never pass a string literal as a permission key", () => {
    const offenders = Object.entries(sources).flatMap(([file, src]) =>
      src
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => LITERAL_CHECKS.some((re) => re.test(line)))
        .map(({ line, i }) => `${file}:${i + 1}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});
