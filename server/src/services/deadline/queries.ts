export const DEADLINE_ENDPOINTS = {
  groups: "/api/groups",
  jobs: "/api/jobs?States=Active,Failed,Pending",
  pools: "/api/pools",
  workerInfo: "/api/slaves?Data=info",
  workerInfoSettings: "/api/slaves?Data=infosettings"
} as const;

export function getWorkerReportsEndpoint(workerName: string): string {
  return `/api/slaves?Name=${encodeURIComponent(workerName)}&Data=reports`;
}
