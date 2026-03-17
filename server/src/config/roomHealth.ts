import type { RoomHealth, WorkerStatusTotals } from "@deadline-dashboard/contracts";

export interface RoomHealthThresholds {
  redRatio: number;
  yellowRatio: number;
}

export const defaultRoomHealthThresholds: RoomHealthThresholds = {
  yellowRatio: 0.2,
  redRatio: 0.4
};

export function calculateRoomHealth(
  totals: WorkerStatusTotals,
  thresholds: RoomHealthThresholds = defaultRoomHealthThresholds
): RoomHealth {
  if (totals.total === 0) {
    return "green";
  }

  const unavailableRatio = (totals.offline + totals.stalled) / totals.total;
  let health: RoomHealth =
    unavailableRatio >= thresholds.redRatio
      ? "red"
      : unavailableRatio >= thresholds.yellowRatio
        ? "yellow"
        : "green";

  if (totals.stalled > 0) {
    health =
      health === "green" ? "yellow" : health === "yellow" ? "red" : "red";
  }

  return health;
}

