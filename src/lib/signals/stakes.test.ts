import { describe, expect, it } from "vitest";
import { intentFor } from "./stakes";

/**
 * Reading intent from the form type.
 *
 * The whole reason this module treats 13D and 13G separately: one discloses a
 * stake taken to influence the company, the other a passive holding crossing
 * the same 5% line. Getting this classification wrong would label an index
 * fund's routine accumulation the same as an activist's opening move.
 */
describe("stake filing intent", () => {
  it("reads Schedule 13D as activist", () => {
    expect(intentFor("SC 13D")).toBe("activist");
  });

  it("reads an amended 13D as still activist", () => {
    expect(intentFor("SC 13D/A")).toBe("activist");
  });

  it("reads Schedule 13G as passive", () => {
    expect(intentFor("SC 13G")).toBe("passive");
  });

  it("reads an amended 13G as still passive", () => {
    expect(intentFor("SC 13G/A")).toBe("passive");
  });
});
