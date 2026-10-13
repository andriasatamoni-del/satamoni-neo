import { ForbiddenException, Logger, NotFoundException } from "@nestjs/common";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { dbErrorMessage } from "../../../src/shared/database/transaction-context";
import { GlobalExceptionFilter } from "../../../src/shared/http/global-exception.filter";
import { ConflictDomainError, DomainError, ForbiddenDomainError, SegregationOfDutiesError, statusOf } from "../../../src/shared/domain/domain-error";

// The last-resort filter turns database/client errors into meaningful 4xx answers (BL: 409 instead of 500, malformed UUID -> 400)
// and keeps real infrastructure failures as 500.
function run(error: unknown) {
  const out: { status?: number; body?: Record<string, unknown> } = {};
  const res = { status: (s: number) => ((out.status = s), res), json: (b: Record<string, unknown>) => ((out.body = b), res) };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: "POST", path: "/x", route: { path: "/x" }, user: undefined }) }) };
  const filter = new GlobalExceptionFilter({ } as never);
  try {
    filter.catch(error, host as never);
  } catch {
    out.status = out.status ?? 500;
  }
  return out;
}
const pg = (code: string, message = "m") => Object.assign(new Error(message), { code });

describe("GlobalExceptionFilter", () => {
  test.each([
    ["23505", 409],
    ["22P02", 400],
    ["22003", 400],
    ["22007", 400],
    ["23503", 400],
    ["23502", 400],
    ["23514", 400],
    ["40P01", 409],
    ["40001", 409],
    ["P0001", 409],
  ])("PostgreSQL %s -> HTTP %i", (code, status) => {
    expect(run(pg(code)).status).toBe(status);
  });

  test("a business-rule trigger message is passed through", () => {
    expect(run(pg("P0001", "الفترة المحاسبية مقفولة")).body?.error).toBe("الفترة المحاسبية مقفولة");
  });

  test("an unknown database error (infrastructure failure) is NOT disguised as a client error", () => {
    expect([undefined, 500]).toContain(run(pg("XX000")).status);
    expect(run(pg("XX000")).status).not.toBe(409);
    expect(run(pg("XX000")).status).not.toBe(400);
  });

  test("HttpException keeps its own status", () => {
    // NotFoundException goes through BaseExceptionFilter (needs an adapter): the mapping must not intercept it
    expect(run(pg("57014")).status).not.toBe(409); // statement_timeout stays 5xx
    expect(new NotFoundException().getStatus()).toBe(404);
    expect(new ForbiddenException().getStatus()).toBe(403);
  });
});

// Drizzle wraps driver errors; its message is the full SQL plus the bound parameters (password hashes, phones ...).
describe("database error messages", () => {
  const wrapped = (code: string, message: string) =>
    new DrizzleQueryError("insert into \"users\" (\"email\", \"password_hash\") values ($1, $2)", ["a@b.c", "$2b$10$secret-hash"], pg(code, message) as never);

  test("dbErrorMessage returns PostgreSQL's own message, never the query or its parameters", () => {
    expect(dbErrorMessage(wrapped("23514", "new row violates check constraint"))).toBe("new row violates check constraint");
    expect(dbErrorMessage(new Error("plain"))).toBe("plain");
    expect(dbErrorMessage("text")).toBe("text");
  });

  test("an unmapped database error is logged without the query or its parameters", () => {
    const logged: string[] = [];
    const spy = jest.spyOn(Logger.prototype, "error").mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
    // a minimal adapter, so Nest's own handling (which logs the message and stack of what it is given) runs too
    const adapter = { isHeadersSent: () => false, reply: () => undefined, end: () => undefined };
    const host = { switchToHttp: () => ({ getResponse: () => ({}), getRequest: () => ({}) }), getArgByIndex: () => ({}) };
    try {
      new GlobalExceptionFilter(adapter as never).catch(wrapped("XX000", "internal error"), host as never);
    } finally {
      spy.mockRestore();
    }
    const output = logged.join("\n");
    expect(logged.length).toBeGreaterThanOrEqual(2); // the filter's line and Nest's
    expect(output).toContain("internal error");
    expect(output).not.toContain("secret-hash");
    expect(output).not.toContain("insert into");
  });
});

describe("domain error status hints", () => {
  test("conflicts are 409, SoD and forbidden are 403, plain domain errors fall back to the context default", () => {
    expect(statusOf(new ConflictDomainError("x"), 400)).toBe(409);
    expect(statusOf(new ForbiddenDomainError("x"), 400)).toBe(403);
    expect(statusOf(new SegregationOfDutiesError("اعتماد"), 400)).toBe(403);
    expect(statusOf(new DomainError("x"), 400)).toBe(400);
  });
});
