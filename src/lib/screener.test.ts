import { describe, expect, it } from "vitest";
import { __testing } from "./screener";

const { classifyDbError } = __testing;

/**
 * Drizzle wraps driver failures in a DrizzleQueryError whose message is the
 * whole SQL statement and whose `code` is undefined — the Postgres code sits on
 * `.cause`. Reading only the outer error classified every failure as
 * unreachable and dumped the query at the user, so these guard the unwrapping.
 */
function drizzleWrapped(query: string, cause: unknown): Error {
  const err = new Error(`Failed query: ${query}`);
  (err as Error & { cause: unknown }).cause = cause;
  return err;
}

function pgError(code: string, message: string): Error {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  return err;
}

describe("database error classification", () => {
  it("finds a missing table through Drizzle's wrapper", () => {
    const err = drizzleWrapped(
      'select "companies"."symbol" from "companies" inner join "scores"',
      pgError("42P01", 'relation "companies" does not exist'),
    );
    const result = classifyDbError(err);
    expect(result.status).toBe("no-tables");
  });

  it("classifies a missing table reported directly", () => {
    expect(classifyDbError(pgError("42P01", "nope")).status).toBe("no-tables");
  });

  it("distinguishes an unreachable host from a missing table", () => {
    for (const code of ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT"]) {
      const result = classifyDbError(drizzleWrapped("select 1", pgError(code, "boom")));
      expect(result.status, code).toBe("connection-error");
    }
  });

  it("identifies a rejected password", () => {
    const result = classifyDbError(pgError("28P01", "password authentication failed"));
    expect(result.status).toBe("connection-error");
    expect(result.detail).toMatch(/password/i);
  });

  it("walks more than one level of wrapping", () => {
    const err = drizzleWrapped("select 1", drizzleWrapped("inner", pgError("42P01", "x")));
    expect(classifyDbError(err).status).toBe("no-tables");
  });

  it("terminates on a circular cause chain", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(() => classifyDbError(a)).not.toThrow();
  });

  it("never leaks a connection string into the UI", () => {
    const err = new Error(
      "connect failed for postgresql://admin:hunter2@db.internal:5432/railway",
    );
    const result = classifyDbError(err);
    expect(result.detail).not.toContain("hunter2");
    expect(result.detail).toContain("[connection string]");
  });

  it("strips the SQL body Drizzle appends", () => {
    const err = new Error(
      'something broke\nFailed query: select "companies"."symbol", "companies"."name" from "companies"',
    );
    const result = classifyDbError(err);
    expect(result.detail).not.toMatch(/select/i);
    expect(result.detail).toContain("something broke");
  });

  it("truncates very long messages", () => {
    const result = classifyDbError(new Error("x".repeat(1000)));
    expect(result.detail.length).toBeLessThanOrEqual(301);
  });
});
