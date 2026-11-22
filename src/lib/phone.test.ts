import { describe, expect, it } from "vitest";
import { formatPhone, isCompletePhone } from "./phone";

describe("phone", () => {
  it("formats a mobile number as (DDD) 9XXXX-XXXX", () => {
    expect(formatPhone("86999990000")).toBe("(86) 99999-0000");
    expect(formatPhone("(86) 99999-0000")).toBe("(86) 99999-0000");
    expect(formatPhone("86 9 9999 0000")).toBe("(86) 99999-0000");
  });

  it("formats a landline with eight digits after the area code", () => {
    expect(formatPhone("8632220000")).toBe("(86) 3222-0000");
  });

  it("follows the typing, one digit at a time", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("8")).toBe("(8");
    expect(formatPhone("86")).toBe("(86");
    expect(formatPhone("869")).toBe("(86) 9");
    expect(formatPhone("869999")).toBe("(86) 9999");
    expect(formatPhone("8699999")).toBe("(86) 9999-9");
    expect(formatPhone("8699999000")).toBe("(86) 9999-9000");
  });

  it("drops what is not a digit and what passes eleven digits", () => {
    expect(formatPhone("tel: 86.99999-0000 ramal 12")).toBe("(86) 99999-0000");
    // Apagar o espaço depois do DDD devolve o campo ao DDD aberto.
    expect(formatPhone("(86)")).toBe("(86");
  });

  it("is complete with ten or eleven digits", () => {
    expect(isCompletePhone("(86) 99999-0000")).toBe(true);
    expect(isCompletePhone("(86) 3222-0000")).toBe(true);
    expect(isCompletePhone("(86) 9999-000")).toBe(false);
    expect(isCompletePhone("")).toBe(false);
  });
});
