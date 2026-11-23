import { describe, it, expect } from "vitest";
import {
  assessRefundEligibility,
  buildRefundRequestedEmail,
  getRefundableAmount,
  REFUND_WATCH_LIMIT_SECONDS,
  type RefundFacts,
} from "./refunds";

// Local-time dates: the Refund Window is counted in calendar days.
const PURCHASED_AT = new Date(2026, 0, 1, 23, 0).toISOString();

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchasedAt: PURCHASED_AT,
    amountPaid: 5000,
    purchaseCountry: "US",
    coursePrice: 5000,
    hasRefundRequest: false,
    isClaimedTeamSeat: false,
    lessonCount: 10,
    completedLessonCount: 0,
    secondsWatched: 0,
    today: new Date(2026, 0, 5, 12, 0),
    ...overrides,
  };
}

describe("assessRefundEligibility", () => {
  it("is eligible for a fresh, untouched purchase", () => {
    expect(assessRefundEligibility(facts())).toEqual({
      eligible: true,
      refundableAmount: 5000,
      lastDayOfRefundWindow: "2026-01-15",
    });
  });

  it("refuses a second Refund Request for the same purchase, whatever happened to the first", () => {
    // A Declined request is final, so any existing request blocks a new one.
    expect(assessRefundEligibility(facts({ hasRefundRequest: true }))).toEqual({
      eligible: false,
      reason: "already-requested",
    });
  });

  it("refuses a claimed team seat", () => {
    expect(
      assessRefundEligibility(facts({ isClaimedTeamSeat: true }))
    ).toMatchObject({ eligible: false, reason: "claimed-team-seat" });
  });

  it("allows the whole of the fourteenth day, even for a late-night purchase", () => {
    expect(
      assessRefundEligibility(facts({ today: new Date(2026, 0, 15, 23, 59) }))
    ).toMatchObject({ eligible: true });
  });

  it("refuses once the Refund Window has closed", () => {
    expect(
      assessRefundEligibility(facts({ today: new Date(2026, 0, 16, 0, 1) }))
    ).toMatchObject({ eligible: false, reason: "outside-window" });
  });

  it("refuses once half the lessons are completed", () => {
    expect(
      assessRefundEligibility(facts({ completedLessonCount: 5 }))
    ).toMatchObject({ eligible: false, reason: "completed-too-much" });
    expect(
      assessRefundEligibility(facts({ completedLessonCount: 4 }))
    ).toMatchObject({ eligible: true });
  });

  it("ignores the completion limit for a course with no lessons", () => {
    expect(
      assessRefundEligibility(
        facts({ lessonCount: 0, completedLessonCount: 0 })
      )
    ).toMatchObject({ eligible: true });
  });

  it("refuses once the watch limit is reached", () => {
    expect(
      assessRefundEligibility(
        facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS })
      )
    ).toMatchObject({ eligible: false, reason: "watched-too-much" });
  });
});

describe("getRefundableAmount", () => {
  it("is the price paid for a purchasing-power-priced purchase", () => {
    expect(
      getRefundableAmount({ amountPaid: 1500, country: "PK", coursePrice: 5000 })
    ).toBe(1500);
  });

  it("is the list price for a full-price purchase", () => {
    expect(
      getRefundableAmount({ amountPaid: 4000, country: "US", coursePrice: 5000 })
    ).toBe(5000);
  });
});

describe("buildRefundRequestedEmail", () => {
  it("speaks of a refund request, never a reversal or chargeback", () => {
    const email = buildRefundRequestedEmail({
      studentName: "Ada",
      studentEmail: "ada@example.com",
      courseTitle: "TypeScript",
      refundableAmount: 5000,
    });

    expect(email.to).toBe("ada@example.com");
    expect(email.subject).toBe("Refund requested — TypeScript");
    expect(email.body).toContain("refund request");
    expect(email.body).not.toMatch(/reversal|chargeback/i);
  });
});
