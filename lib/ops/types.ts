export type Priority = "P1" | "P2" | "P3";
export type Status = "Investigating" | "Identified" | "Monitoring" | "Resolved";
export const STATUSES: Status[] = ["Investigating", "Identified", "Monitoring", "Resolved"];
export const PRIORITIES: Priority[] = ["P1", "P2", "P3"];

export type Service = {
  id: string;
  name: string;
  team: string;
  tier: 1 | 2 | 3;
  /** Availability objective, e.g. 99.9. */
  sloTarget: number;
  /** Percent of the 30-day error budget consumed as of `budgetAsOf`. Live burn is added on top. */
  budgetUsed: number;
  budgetAsOf: string;
  latencyP95Ms: number;
  errorRate: number;
  runbookId?: string;
};

export type EntryKind = "declare" | "alert" | "status" | "note" | "action" | "assign";
export type TimelineEntry = { id: string; at: string; kind: EntryKind; author: string; text: string };

export type ActionKind = "rollback" | "failover" | "scale" | "flag";
export type ActionStatus = "proposed" | "executing" | "done" | "rejected";

export type Remediation = {
  id: string;
  kind: ActionKind;
  title: string;
  detail: string;
  risk: "low" | "medium" | "high";
  status: ActionStatus;
  proposedBy: string;
  proposedAt: string;
  /** After this moment the action can no longer be approved safely. */
  windowClosesAt?: string;
  durationSec: number;
  startedAt?: string;
  decidedBy?: string;
  reason?: string;
};

export type Incident = {
  id: string;
  title: string;
  serviceId: string;
  priority: Priority;
  status: Status;
  ownerId: string;
  declaredAt: string;
  mitigatedAt?: string;
  resolvedAt?: string;
  signal: string;
  impact: string;
  timeline: TimelineEntry[];
  actions: Remediation[];
  runbookDone: string[];
};

export type Member = { id: string; name: string; team: string; role: string; onCall: boolean; shiftEnds: string };

export type Runbook = { id: string; title: string; summary: string; steps: { id: string; text: string }[] };

export type Notification = { id: string; at: string; text: string; incidentId?: string; read: boolean };

export type OpsState = {
  schema: 1;
  userId: string;
  location: string;
  services: Service[];
  incidents: Incident[];
  members: Member[];
  runbooks: Runbook[];
  notifications: Notification[];
  nextIncidentNo: number;
};
