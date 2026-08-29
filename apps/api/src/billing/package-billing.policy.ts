import type {
  WorkspaceSubscriptionContractStatus,
  WhatsappSeatStatus,
} from "@prisma/client";

const ACCESS_STATUSES = new Set<WorkspaceSubscriptionContractStatus>([
  "active",
  "grace_period",
  "cancel_at_period_end",
  "exempt",
  "legacy_protected",
]);

const OCCUPIED_SEAT_STATUSES = new Set<WhatsappSeatStatus>([
  "reserved",
  "active",
  "suspended",
]);

const INDIVIDUAL_NUMBER_KEY = "individual-whatsapp-number";
const INDIVIDUAL_NUMBER_PRICE_CENTS = 3_000;

type AdditiveCapacityItem = {
  key: string;
  status: string;
  providerSyncStatus: string;
  quantity: number;
  capacityPerUnit: number;
  monthlyPriceCentsPerUnit: number;
  paymentCharge: { status: string; amountCents: number } | null;
};

export function contractAllowsWhatsappAccess(
  status: WorkspaceSubscriptionContractStatus,
  now: Date,
  accessEndsAt: Date | null,
): boolean {
  if (!ACCESS_STATUSES.has(status)) {
    return false;
  }

  return accessEndsAt === null || accessEndsAt.getTime() > now.getTime();
}

export function seatConsumesCapacity(status: WhatsappSeatStatus): boolean {
  return OCCUPIED_SEAT_STATUSES.has(status);
}

export function countOccupiedSeats(
  seats: Array<{ status: WhatsappSeatStatus }>,
): number {
  return seats.filter((seat) => seatConsumesCapacity(seat.status)).length;
}

/**
 * The contract snapshot is the durable capacity for activated additions.
 * A verified R$30 additive payment also grants capacity while its provider
 * subscription update is pending or being retried. This closes the gap where
 * Asaas has confirmed payment but its recurring-value sync temporarily fails.
 * Active items are deliberately not added here because syncPaidItems already
 * atomically folds them into the snapshot.
 */
export function effectiveWhatsappCapacity(
  snapshotCapacity: number,
  items: AdditiveCapacityItem[] = [],
): number {
  const recoverablePaidCapacity = items.reduce((total, item) => {
    if (
      item.key !== INDIVIDUAL_NUMBER_KEY ||
      item.status !== "pending_payment" ||
      !["pending", "failed"].includes(item.providerSyncStatus) ||
      item.quantity !== 1 ||
      item.capacityPerUnit !== 1 ||
      item.monthlyPriceCentsPerUnit !== INDIVIDUAL_NUMBER_PRICE_CENTS ||
      item.paymentCharge?.status !== "paid" ||
      item.paymentCharge.amountCents !== INDIVIDUAL_NUMBER_PRICE_CENTS
    ) {
      return total;
    }
    return total + item.capacityPerUnit * item.quantity;
  }, 0);

  return Math.max(0, snapshotCapacity) + recoverablePaidCapacity;
}

export function assertPackageCapacity(
  includedWhatsappNumbers: number,
  occupiedWhatsappNumbers: number,
): void {
  if (occupiedWhatsappNumbers >= includedWhatsappNumbers) {
    throw new Error("package_capacity_exhausted");
  }
}

export function assertDowngradeCapacity(
  includedWhatsappNumbers: number,
  occupiedWhatsappNumbers: number,
): void {
  if (occupiedWhatsappNumbers > includedWhatsappNumbers) {
    throw new Error("package_capacity_below_current_usage");
  }
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
