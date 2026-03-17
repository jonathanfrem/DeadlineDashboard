export const DEADLINE_ENDPOINTS = {
  groups: "/api/groups",
  jobs: "/api/jobs?States=Active,Failed,Pending,Suspended",
  pools: "/api/pools",
  workerInfo: "/api/slaves?Data=info",
  workerInfoSettings: "/api/slaves?Data=infosettings"
} as const;

