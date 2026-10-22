import type { Incident, OpsState, Priority, Remediation, Service, Status } from "./types.ts";

const MIN = 60_000;

/** Time-to-mitigate targets that the SLA bar measures against. */
export const MITIGATE_TARGET_MIN: Record<Priority, number> = { P1: 30, P2: 120, P3: 480 };

/** Percent of a service's 30-day error budget burned per minute while an incident is open. */
const BURN_PER_MIN: Record<Priority, number> = { P1: 0.35, P2: 0.08, P3: 0.02 };
const STATUS_BURN: Record<Status, number> = { Investigating: 1, Identified: 1, Monitoring: 0.2, Resolved: 0 };

export const isActive = (i: Incident) => i.status !== "Resolved";

export function burnRate(incident: Incident): number {
  return BURN_PER_MIN[incident.priority] * STATUS_BURN[incident.status];
}

/** Share of the mitigation target used so far; stops counting once the incident is mitigated. */
export function slaUsed(incident: Incident, now: number): number {
  const end = Date.parse(incident.mitigatedAt ?? incident.resolvedAt ?? new Date(now).toISOString());
  const minutes = Math.max(0, end - Date.parse(incident.declaredAt)) / MIN;
  return Math.round((minutes / MITIGATE_TARGET_MIN[incident.priority]) * 100);
}

/** Budget consumed at `now`: the stored checkpoint plus live burn from open incidents on the service. */
export function budgetUsed(service: Service, incidents: Incident[], now: number): number {
  const asOf = Date.parse(service.budgetAsOf);
  const burn = incidents
    .filter((i) => i.serviceId === service.id && isActive(i))
    .reduce((sum, i) => sum + (Math.max(0, now - Math.max(asOf, Date.parse(i.declaredAt))) / MIN) * burnRate(i), 0);
  return Math.round((service.budgetUsed + burn) * 10) / 10;
}

export type Health = "healthy" | "degraded" | "down";

export function serviceHealth(service: Service, incidents: Incident[]): Health {
  const open = incidents.filter((i) => i.serviceId === service.id && isActive(i));
  if (open.some((i) => i.priority === "P1" && (i.status === "Investigating" || i.status === "Identified"))) return "down";
  if (open.some((i) => i.status !== "Monitoring") || open.some((i) => i.priority === "P1")) return "degraded";
  return "healthy";
}

export function isExpired(action: Remediation, now: number): boolean {
  return action.status === "proposed" && !!action.windowClosesAt && now > Date.parse(action.windowClosesAt);
}

export type Decision = { incident: Incident; action: Remediation; msLeft: number | null };

/** Approvals that are still possible, most urgent window first. */
export function pendingDecisions(state: Pick<OpsState, "incidents">, now: number): Decision[] {
  return state.incidents
    .filter(isActive)
    .flatMap((incident) => incident.actions.filter((a) => a.status === "proposed" && !isExpired(a, now)).map((action) => ({
      incident,
      action,
      msLeft: action.windowClosesAt ? Date.parse(action.windowClosesAt) - now : null,
    })))
    .sort((a, b) => (a.msLeft ?? Infinity) - (b.msLeft ?? Infinity));
}

export function actionProgress(action: Remediation, now: number): number {
  if (action.status === "done") return 1;
  if (action.status !== "executing" || !action.startedAt) return 0;
  return Math.min(1, (now - Date.parse(action.startedAt)) / (action.durationSec * 1000));
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function weekStats(state: Pick<OpsState, "incidents">, now: number) {
  const weekAgo = now - 7 * 24 * 60 * MIN;
  const resolved = state.incidents.filter((i) => i.resolvedAt && Date.parse(i.resolvedAt) >= weekAgo);
  const ttr = resolved.map((i) => (Date.parse(i.resolvedAt!) - Date.parse(i.declaredAt)) / MIN);
  return { resolved: resolved.length, medianMinutes: Math.round(median(ttr)) };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatAge(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(fromIso)) / MIN));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function greeting(now: Date, name: string): string {
  const h = now.getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  return `Good ${part}, ${name.split(" ")[0]}.`;
}

const PRIORITY_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };
const STATUS_RANK: Record<Status, number> = { Investigating: 0, Identified: 1, Monitoring: 2, Resolved: 3 };

/** Queue order: open work first, then priority, then oldest. */
export function queueOrder(a: Incident, b: Incident): number {
  return STATUS_RANK[a.status] === 3 || STATUS_RANK[b.status] === 3
    ? STATUS_RANK[a.status] - STATUS_RANK[b.status] || Date.parse(b.resolvedAt ?? b.declaredAt) - Date.parse(a.resolvedAt ?? a.declaredAt)
    : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || Date.parse(a.declaredAt) - Date.parse(b.declaredAt);
}
