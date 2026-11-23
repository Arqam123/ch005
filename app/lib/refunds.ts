// ─── Refunds ───
// The one definition of Refund Eligibility and the Refundable Amount, plus
// the Refund Request confirmation email. Vocabulary follows GLOSSARY.md.
//
// Imported by the course page and the refund route, so nothing here may touch
// the database or the request. `refunds.server.ts` gathers the facts.

import { getDiscountForCountry } from "~/lib/ppp";
import { formatPrice } from "~/lib/utils";

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
/** Fraction of a course's lessons completed at which a refund is refused. */
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundIneligibility =
  | "already-requested"
  | "claimed-team-seat"
  | "outside-window"
  | "completed-too-much"
  | "watched-too-much";

/** Everything Refund Eligibility depends on, for one Purchase. */
export type RefundFacts = {
  purchasedAt: string;
  amountPaid: number;
  purchaseCountry: string | null;
  coursePrice: number;
  /** Any Refund Request at all — a Declined one is final. */
  hasRefundRequest: boolean;
  isClaimedTeamSeat: boolean;
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
  today: Date;
};

export type RefundEligibility =
  | { eligible: true; refundableAmount: number; lastDayOfRefundWindow: string }
  | { eligible: false; reason: RefundIneligibility };

// Compare whole days, not hours — a purchase at 23:00 should still get its
// full fourteenth day.
function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

/**
 * A purchasing-power-priced Purchase is refunded at the price paid; any other
 * Purchase at the course's list price.
 */
export function getRefundableAmount(purchase: {
  amountPaid: number;
  country: string | null;
  coursePrice: number;
}): number {
  return getDiscountForCountry(purchase.country) > 0
    ? purchase.amountPaid
    : purchase.coursePrice;
}

export function assessRefundEligibility(facts: RefundFacts): RefundEligibility {
  if (facts.hasRefundRequest) {
    return { eligible: false, reason: "already-requested" };
  }

  if (facts.isClaimedTeamSeat) {
    return { eligible: false, reason: "claimed-team-seat" };
  }

  const purchasedDay = calendarDay(new Date(facts.purchasedAt));
  const windowEnd = new Date(facts.purchasedAt);
  windowEnd.setDate(windowEnd.getDate() + REFUND_WINDOW_DAYS);
  const lastDayOfRefundWindow = calendarDay(windowEnd);
  const today = calendarDay(facts.today);

  if (today < purchasedDay || today > lastDayOfRefundWindow) {
    return { eligible: false, reason: "outside-window" };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "completed-too-much" };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "watched-too-much" };
  }

  return {
    eligible: true,
    refundableAmount: getRefundableAmount({
      amountPaid: facts.amountPaid,
      country: facts.purchaseCountry,
      coursePrice: facts.coursePrice,
    }),
    lastDayOfRefundWindow,
  };
}

/** What the Student is told when a Refund Request cannot be raised. */
export const REFUND_INELIGIBILITY_MESSAGES: Record<RefundIneligibility, string> =
  {
    "already-requested":
      "You have already made a refund request for this purchase.",
    "claimed-team-seat": "A claimed team seat cannot be refunded.",
    "outside-window": `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    "completed-too-much":
      "You have completed too much of this course to request a refund.",
    "watched-too-much":
      "You have watched too much of this course to request a refund.",
  };

/**
 * The confirmation the Student gets in their inbox. There is no mail
 * transport wired up yet, so the built message goes to the server log.
 */
export function buildRefundRequestedEmail(input: {
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  refundableAmount: number;
}) {
  return {
    to: input.studentEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: [
      `Hi ${input.studentName},`,
      "",
      `We have your refund request for "${input.courseTitle}".`,
      `If it is approved, we will refund ${formatPrice(input.refundableAmount)} to the card you paid with.`,
      "",
      "Our team reviews every refund request by hand. You do not need to do anything else — we will email you again once it has been decided.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}
