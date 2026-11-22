import { describe, expect, it } from "vitest";
import {
  addMonths,
  competencyLabel,
  completesMonth,
  competencyToDate,
  currentCompetency,
  dateToCompetency,
  isCompetency,
  lastFullDayOfMonth,
  previousCompetency,
} from "./competency";

describe("competency", () => {
  it("adds and subtracts months across years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-09", 12)).toBe("2027-09");
  });

  it("uses the Fortaleza calendar for the current month", () => {
    expect(currentCompetency(new Date("2026-10-01T01:00:00Z"))).toBe("2026-09");
    expect(currentCompetency(new Date("2026-10-01T04:00:00Z"))).toBe("2026-10");
    expect(previousCompetency(new Date("2026-10-15T12:00:00Z"))).toBe("2026-09");
  });

  it("only an import sent after the month ended completes it", () => {
    expect(completesMonth("2026-10-31T23:00:00-03:00", "2026-10")).toBe(false);
    expect(completesMonth("2026-11-01T00:30:00-03:00", "2026-10")).toBe(true);
    expect(completesMonth("2026-11-01T02:00:00Z", "2026-10")).toBe(false);
    expect(completesMonth("2026-12-10T12:00:00Z", "2026-10")).toBe(true);
  });

  it("counts paid lives up to yesterday (D-1) in the Fortaleza calendar", () => {
    expect(lastFullDayOfMonth(new Date("2026-11-18T15:00:00Z"))).toBe(17);
    // 01:00 UTC do dia 19 ainda é dia 18 em Fortaleza.
    expect(lastFullDayOfMonth(new Date("2026-11-19T01:00:00Z"))).toBe(17);
    expect(lastFullDayOfMonth(new Date("2026-11-30T15:00:00Z"))).toBe(29);
    // Dia 1: o mês ainda não tem dia fechado.
    expect(lastFullDayOfMonth(new Date("2026-11-01T15:00:00Z"))).toBeNull();
  });

  it("converts and labels", () => {
    expect(isCompetency("2026-09")).toBe(true);
    expect(isCompetency("2026-13")).toBe(false);
    expect(competencyToDate("2026-09")).toBe("2026-09-01");
    expect(dateToCompetency("2026-09-01")).toBe("2026-09");
    expect(competencyLabel("2026-09")).toBe("setembro de 2026");
  });
});
