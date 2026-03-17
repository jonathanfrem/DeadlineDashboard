import type {
  DashboardRoomsResponse,
  DashboardSnapshot,
  FarmOverviewSummary,
  JobRow,
  WorkerStatusTotals
} from "@deadline-dashboard/contracts";

export type DeadlineRecord = Record<string, unknown>;

export interface DeadlineApiResponses {
  groups: string[];
  jobs: DeadlineRecord[];
  pools: string[];
  workerInfo: DeadlineRecord[];
  workerInfoSettings: DeadlineRecord[];
}

export interface WorkerStatusAggregate extends WorkerStatusTotals {}

export interface WorkerAssignment {
  groups: string[];
  name: string;
  pools: string[];
  roomKey: string | null;
  source: "group" | "pool" | "unassigned";
  statusBucket: keyof WorkerStatusTotals;
}

export interface NormalizedDashboardData {
  jobs: JobRow[];
  roomsResponse: DashboardRoomsResponse;
  snapshot: DashboardSnapshot;
  summary: FarmOverviewSummary;
  unassignedWorkersCount: number;
  workerAssignments: WorkerAssignment[];
}

