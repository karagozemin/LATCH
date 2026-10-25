import { describe, expect, it } from "vitest";
import {
  SCENARIOS,
  STARTING_BALANCE,
  experienceSnapshot,
  transitionExperience,
  type ExperiencePhase,
} from "./experience-model";

describe.each(SCENARIOS)("$category experience", (scenario) => {
  it("reserves capacity without moving funds and settles only the actual bill", () => {
    const reserved = transitionExperience("ready", "authorize");
    expect(experienceSnapshot(scenario, reserved, scenario.actual)).toEqual({
      balance: STARTING_BALANCE,
      available: STARTING_BALANCE - scenario.maximum,
      reserved: scenario.maximum,
      paid: 0,
      released: 0,
    });
    const delivered = transitionExperience(reserved, "deliver");
    const settled = transitionExperience(delivered, "capture");
    expect(experienceSnapshot(scenario, settled, scenario.actual)).toEqual({
      balance: STARTING_BALANCE - scenario.actual,
      available: STARTING_BALANCE - scenario.actual,
      reserved: 0,
      paid: scenario.actual,
      released: scenario.maximum - scenario.actual,
    });
  });

  it.each(["release", "expire"] as const)(
    "returns the entire reservation on %s without settlement",
    (action) => {
      const phase = transitionExperience("reserved", action);
      expect(experienceSnapshot(scenario, phase, scenario.actual)).toEqual({
        balance: STARTING_BALANCE,
        available: STARTING_BALANCE,
        reserved: 0,
        paid: 0,
        released: scenario.maximum,
      });
    },
  );

  it("rejects captures beyond the ceiling and fractions of cents", () => {
    for (const amount of [
      -1,
      scenario.maximum + 1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => experienceSnapshot(scenario, "settled", amount)).toThrow();
    }
    expect(experienceSnapshot(scenario, "settled", 0).released).toBe(
      scenario.maximum,
    );
    expect(
      experienceSnapshot(scenario, "settled", scenario.maximum).released,
    ).toBe(0);
  });
});

describe("reservation lifecycle", () => {
  it("prevents unapproved settlement and repeated terminal actions", () => {
    expect(() => transitionExperience("ready", "capture")).toThrow();
    for (const phase of [
      "settled",
      "released",
      "expired",
    ] as ExperiencePhase[]) {
      for (const action of [
        "authorize",
        "capture",
        "release",
        "expire",
      ] as const) {
        expect(() => transitionExperience(phase, action)).toThrow();
      }
    }
  });
});
