import { describe, expect, it } from "vitest";
import { allowedTransitions } from "./transitions";

describe("allowedTransitions", () => {
  it("mirrors the SQL matrix", () => {
    expect(allowedTransitions("referred")).toEqual(["negotiating", "signed", "lost"]);
    expect(allowedTransitions("active")).toEqual(["cancelled"]);
    expect(allowedTransitions("cancelled")).toEqual([]);
    expect(allowedTransitions("unknown")).toEqual([]);
  });
});
