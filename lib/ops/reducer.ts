import { budgetUsed, isExpired } from "./engine.ts";
import type { ActionKind, EntryKind, Incident, OpsState, Priority, Remediation, Status } from "./types.ts";

/** Every action carries a timestamp and a unique id stamped by the caller, which keeps the reducer pure. */
type Stamp = { at: string; uid: string };

export type OpsAction = Stamp &
  (
    | { type: "incident/declare"; title: string; serviceId: string; priority: Priority; ownerId: string; impact: string; signal: string }
    | { type: "incident/status"; incidentId: string; status: Status }
    | { type: "incident/priority"; incidentId: string; priority: Priority }
    | { type: "incident/assign"; incidentId: string; ownerId: string }
    | { type: "incident/note"; incidentId: string; text: string }
    | { type: "action/propose"; incidentId: string; kind: ActionKind; title: string; detail: string; risk: Remediation["risk"]; windowMinutes?: number; durationSec: number }
    | { type: "action/approve"; incidentId: string; actionId: string }
    | { type: "action/reject"; incidentId: string; actionId: string; reason: string }
    | { type: "action/complete"; incidentId: string; actionId: string }
    | { type: "runbook/toggle"; incidentId: string; stepId: string }
    | { type: "member/oncall"; memberId: string; onCall: boolean }
    | { type: "notifications/read" }
    | { type: "state/replace"; state: OpsState }
  );

export type ActionInput = OpsAction extends infer A ? (A extends OpsAction ? Omit<A, "at" | "uid"> : never) : never;

export const incidentIdFor = (no: number) => `INC-${no}`;

const userName = (s: OpsState) => s.members.find((m) => m.id === s.userId)?.name ?? "You";

function entry(state: OpsState, a: Stamp, kind: EntryKind, text: string, author = userName(state)) {
  return { id: `t_${a.uid}`, at: a.at, kind, author, text };
}

function notify(state: OpsState, a: Stamp, text: string, incidentId?: string): OpsState {
  return { ...state, notifications: [{ id: `n_${a.uid}`, at: a.at, text, incidentId, read: false }, ...state.notifications].slice(0, 40) };
}

/**
 * Freezes the burn accumulated so far into the service's stored budget. Called before anything that
 * changes an incident's burn rate, so earlier minutes keep the rate that applied at the time.
 */
function checkpoint(state: OpsState, serviceId: string, at: string): OpsState {
  const now = Date.parse(at);
  return {
    ...state,
    services: state.services.map((s) => (s.id === serviceId ? { ...s, budgetUsed: budgetUsed(s, state.incidents, now), budgetAsOf: at } : s)),
  };
}

function update(state: OpsState, id: string, fn: (i: Incident) => Incident): OpsState {
  return { ...state, incidents: state.incidents.map((i) => (i.id === id ? fn(i) : i)) };
}

function setStatus(state: OpsState, incident: Incident, status: Status, a: Stamp, author?: string): OpsState {
  if (incident.status === status) return state;
  const next = checkpoint(state, incident.serviceId, a.at);
  return update(next, incident.id, (i) => ({
    ...i,
    status,
    mitigatedAt: i.mitigatedAt ?? (status === "Monitoring" || status === "Resolved" ? a.at : undefined),
    resolvedAt: status === "Resolved" ? a.at : undefined,
    timeline: [...i.timeline, entry(state, a, "status", `Status changed to ${status}.`, author)],
  }));
}

export function reducer(state: OpsState, action: OpsAction): OpsState {
  const incident = "incidentId" in action ? state.incidents.find((i) => i.id === action.incidentId) : undefined;
  const me = userName(state);

  switch (action.type) {
    case "incident/declare": {
      const id = incidentIdFor(state.nextIncidentNo);
      const created: Incident = {
        id, title: action.title.trim(), serviceId: action.serviceId, priority: action.priority, status: "Investigating",
        ownerId: action.ownerId, declaredAt: action.at, signal: action.signal.trim() || "Awaiting first signal",
        impact: action.impact.trim(), runbookDone: [], actions: [],
        timeline: [entry(state, action, "declare", `Incident declared by ${me}.`)],
      };
      const next = checkpoint(state, action.serviceId, action.at);
      const owner = state.members.find((m) => m.id === action.ownerId)?.name ?? "the owner";
      return notify({ ...next, incidents: [created, ...next.incidents], nextIncidentNo: state.nextIncidentNo + 1 }, action,
        `${id} declared (${action.priority}). ${owner} is paged.`, id);
    }
    case "incident/status": {
      if (!incident) return state;
      const next = setStatus(state, incident, action.status, action);
      return action.status === "Resolved" && next !== state ? notify(next, action, `${incident.id} resolved.`, incident.id) : next;
    }
    case "incident/priority": {
      if (!incident || incident.priority === action.priority) return state;
      const next = checkpoint(state, incident.serviceId, action.at);
      return update(next, incident.id, (i) => ({ ...i, priority: action.priority, timeline: [...i.timeline, entry(state, action, "status", `Priority changed from ${incident.priority} to ${action.priority}.`)] }));
    }
    case "incident/assign": {
      const owner = state.members.find((m) => m.id === action.ownerId);
      if (!incident || !owner || incident.ownerId === owner.id) return state;
      return notify(update(state, incident.id, (i) => ({ ...i, ownerId: owner.id, timeline: [...i.timeline, entry(state, action, "assign", `${owner.name} is now the owner.`)] })),
        action, `${owner.name} now owns ${incident.id}.`, incident.id);
    }
    case "incident/note": {
      if (!incident || !action.text.trim()) return state;
      return update(state, incident.id, (i) => ({ ...i, timeline: [...i.timeline, entry(state, action, "note", action.text.trim())] }));
    }
    case "action/propose": {
      if (!incident || incident.status === "Resolved") return state;
      const proposal: Remediation = {
        id: `a_${action.uid}`, kind: action.kind, title: action.title.trim(), detail: action.detail.trim(), risk: action.risk,
        status: "proposed", proposedBy: me, proposedAt: action.at, durationSec: action.durationSec,
        windowClosesAt: action.windowMinutes ? new Date(Date.parse(action.at) + action.windowMinutes * 60_000).toISOString() : undefined,
      };
      const next = update(state, incident.id, (i) => ({ ...i, actions: [...i.actions, proposal], timeline: [...i.timeline, entry(state, action, "action", `Proposed: ${proposal.title}.`)] }));
      return notify(next, action, `${me} proposed "${proposal.title}" on ${incident.id}.`, incident.id);
    }
    case "action/approve": {
      const target = incident?.actions.find((a) => a.id === action.actionId);
      // An action whose safe window has closed can no longer be approved.
      if (!incident || !target || target.status !== "proposed" || isExpired(target, Date.parse(action.at))) return state;
      return update(state, incident.id, (i) => ({
        ...i,
        actions: i.actions.map((a) => (a.id === target.id ? { ...a, status: "executing", startedAt: action.at, decidedBy: me } : a)),
        timeline: [...i.timeline, entry(state, action, "action", `${me} approved: ${target.title}.`)],
      }));
    }
    case "action/reject": {
      const target = incident?.actions.find((a) => a.id === action.actionId);
      if (!incident || !target || target.status !== "proposed") return state;
      const reason = action.reason.trim() || "No reason given";
      return update(state, incident.id, (i) => ({
        ...i,
        actions: i.actions.map((a) => (a.id === target.id ? { ...a, status: "rejected", decidedBy: me, reason } : a)),
        timeline: [...i.timeline, entry(state, action, "action", `${me} rejected: ${target.title}. ${reason}`)],
      }));
    }
    case "action/complete": {
      const target = incident?.actions.find((a) => a.id === action.actionId);
      if (!incident || !target || target.status !== "executing") return state;
      let next = update(state, incident.id, (i) => ({
        ...i,
        actions: i.actions.map((a) => (a.id === target.id ? { ...a, status: "done" } : a)),
        signal: `${target.title} completed. Signals recovering.`,
        timeline: [...i.timeline, entry(state, action, "action", `${target.title} completed.`, "Automation")],
      }));
      // A finished remediation mitigates an incident that was still being worked.
      const updated = next.incidents.find((i) => i.id === incident.id)!;
      if (updated.status === "Investigating" || updated.status === "Identified") next = setStatus(next, updated, "Monitoring", action, "Automation");
      return notify(next, action, `${target.title} completed on ${incident.id}.`, incident.id);
    }
    case "runbook/toggle": {
      if (!incident) return state;
      const done = incident.runbookDone.includes(action.stepId)
        ? incident.runbookDone.filter((s) => s !== action.stepId)
        : [...incident.runbookDone, action.stepId];
      return update(state, incident.id, (i) => ({ ...i, runbookDone: done }));
    }
    case "member/oncall":
      return { ...state, members: state.members.map((m) => (m.id === action.memberId ? { ...m, onCall: action.onCall } : m)) };
    case "notifications/read":
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) };
    case "state/replace":
      return action.state;
  }
}
