export type ScenarioId = "hotel" | "fuel" | "studio";
export type ExperiencePhase =
  | "ready"
  | "reserved"
  | "delivered"
  | "settled"
  | "released"
  | "expired";
export interface Scenario {
  id: ScenarioId;
  category: string;
  merchant: string;
  name: string;
  description: string;
  image: string;
  reference: string;
  maximum: number;
  actual: number;
  duration: string;
  service: string;
  serviceAction: string;
  serviceCopy: string;
  item: string;
}
// Illustrative amounts are integer cents. These scenarios never submit transactions.
export const SCENARIOS: Scenario[] = [
  {
    id: "hotel",
    category: "Hospitality",
    merchant: "Meridian Hotel",
    name: "A stay, without the wait.",
    description:
      "Check in with a promise. Check out with only your actual bill.",
    image: "hotel.jpg",
    reference: "MH · ROOM 204",
    maximum: 15000,
    actual: 8400,
    duration: "7 hours",
    service: "Make yourself at home.",
    serviceAction: "Check out & review bill",
    serviceCopy:
      "Your room is ready. The hotel can verify your reservation while your funds stay in your LATCH account.",
    item: "Room & services",
  },
  {
    id: "fuel",
    category: "Mobility",
    merchant: "Atlantic Fuel",
    name: "Fill up. Settle exactly.",
    description:
      "Authorize a ceiling. Pay for what actually goes into the tank.",
    image: "drive.jpg",
    reference: "AF · PUMP 03",
    maximum: 10000,
    actual: 6240,
    duration: "30 minutes",
    service: "You’re clear to go.",
    serviceAction: "Finish fueling & review",
    serviceCopy:
      "The pump has verified your reserved capacity. Fill your tank knowing the final charge can never exceed your ceiling.",
    item: "Fuel dispensed",
  },
  {
    id: "studio",
    category: "Services",
    merchant: "Forma Studio",
    name: "Good work. Assured payment.",
    description: "Give your provider certainty before the first hour starts.",
    image: "studio.jpg",
    reference: "FS · BOOKING 018",
    maximum: 20000,
    actual: 13500,
    duration: "4 hours",
    service: "Space to do your best work.",
    serviceAction: "Finish session & review",
    serviceCopy:
      "The studio has verified your reservation. Your session can begin with payment capacity already accounted for.",
    item: "Studio time & equipment",
  },
];
export const STARTING_BALANCE = 50000;
export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0];
}
export function experienceSnapshot(
  scenario: Scenario,
  phase: ExperiencePhase,
  finalAmount: number,
) {
  if (
    !Number.isSafeInteger(finalAmount) ||
    finalAmount < 0 ||
    finalAmount > scenario.maximum
  ) {
    throw new Error("Final amount must be within the authorized ceiling.");
  }
  const reserved =
    phase === "reserved" || phase === "delivered" ? scenario.maximum : 0;
  const paid = phase === "settled" ? finalAmount : 0;
  return {
    balance: STARTING_BALANCE - paid,
    available: STARTING_BALANCE - paid - reserved,
    reserved,
    paid,
    released:
      phase === "settled"
        ? scenario.maximum - paid
        : phase === "released" || phase === "expired"
          ? scenario.maximum
          : 0,
  };
}
export function transitionExperience(
  phase: ExperiencePhase,
  action: "authorize" | "deliver" | "capture" | "release" | "expire",
): ExperiencePhase {
  if (phase === "ready" && action === "authorize") return "reserved";
  if (phase === "reserved" && action === "deliver") return "delivered";
  if (phase === "delivered" && action === "capture") return "settled";
  if ((phase === "reserved" || phase === "delivered") && action === "release")
    return "released";
  if ((phase === "reserved" || phase === "delivered") && action === "expire")
    return "expired";
  throw new Error("This reservation cannot make that transition.");
}
