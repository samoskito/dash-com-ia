import type {
  WorkspaceSubscriptionContractStatus,
  WhatsappSeatStatus
} from "@prisma/client";

const ACCESS_STATUSES = new Set<WorkspaceSubscriptionContractStatus>([
  "active",
  "grace_period",
  "cancel_at_period_end",
  "exempt",
  "legacy_protected"
]);

const OCCUPIED_SEAT_STATUSES = new Set<WhatsappSeatStatus>([
  "reserved",
  "active",
  "suspended"
]);

export function contractAllowsWhatsappAccess(
  status: WorkspaceSubscriptionContractStatus,
  now: Date,
  accessEndsAt: Date | null
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
  seats: Array<{ status: WhatsappSeatStatus }>
): number {
  return seats.filter((seat) => seatConsumesCapacity(seat.status)).length;
}

export function assertPackageCapacity(
  includedWhatsappNumbers: number,
  occupiedWhatsappNumbers: number
): void {
  if (occupiedWhatsappNumbers >= includedWhatsappNumbers) {
    throw new Error("package_capacity_exhausted");
  }
}

export function assertDowngradeCapacity(
  includedWhatsappNumbers: number,
  occupiedWhatsappNumbers: number
): void {
  if (occupiedWhatsappNumbers > includedWhatsappNumbers) {
    throw new Error("package_capacity_below_current_usage");
  }
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
