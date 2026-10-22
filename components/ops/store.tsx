"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { actionProgress } from "@/lib/ops/engine";
import { reducer, type ActionInput, type OpsAction } from "@/lib/ops/reducer";
import { createSeed } from "@/lib/ops/seed";
import type { OpsState } from "@/lib/ops/types";

const STORAGE_KEY = "opspilot:workspace:v1";

const entry = z.object({ id: z.string(), at: z.string(), kind: z.enum(["declare", "alert", "status", "note", "action", "assign"]), author: z.string(), text: z.string() });
const remediation = z.object({
  id: z.string(), kind: z.enum(["rollback", "failover", "scale", "flag"]), title: z.string(), detail: z.string(), risk: z.enum(["low", "medium", "high"]),
  status: z.enum(["proposed", "executing", "done", "rejected"]), proposedBy: z.string(), proposedAt: z.string(), windowClosesAt: z.string().optional(),
  durationSec: z.number(), startedAt: z.string().optional(), decidedBy: z.string().optional(), reason: z.string().optional(),
});
const stateShape = z.object({
  schema: z.literal(1),
  userId: z.string(),
  location: z.string(),
  nextIncidentNo: z.number(),
  services: z.array(z.object({
    id: z.string(), name: z.string(), team: z.string(), tier: z.union([z.literal(1), z.literal(2), z.literal(3)]), sloTarget: z.number(),
    budgetUsed: z.number(), budgetAsOf: z.string(), latencyP95Ms: z.number(), errorRate: z.number(), runbookId: z.string().optional(),
  })),
  incidents: z.array(z.object({
    id: z.string(), title: z.string(), serviceId: z.string(), priority: z.enum(["P1", "P2", "P3"]),
    status: z.enum(["Investigating", "Identified", "Monitoring", "Resolved"]), ownerId: z.string(), declaredAt: z.string(),
    mitigatedAt: z.string().optional(), resolvedAt: z.string().optional(), signal: z.string(), impact: z.string(),
    timeline: z.array(entry), actions: z.array(remediation), runbookDone: z.array(z.string()),
  })),
  members: z.array(z.object({ id: z.string(), name: z.string(), team: z.string(), role: z.string(), onCall: z.boolean(), shiftEnds: z.string() })),
  runbooks: z.array(z.object({ id: z.string(), title: z.string(), summary: z.string(), steps: z.array(z.object({ id: z.string(), text: z.string() })) })),
  notifications: z.array(z.object({ id: z.string(), at: z.string(), text: z.string(), incidentId: z.string().optional(), read: z.boolean() })),
});

export function makeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type Store = {
  state: OpsState;
  /** Wall clock in ms, ticking every second for countdowns and SLA timers. */
  now: number;
  dispatch: (action: ActionInput) => string;
  reset: () => void;
};

const StoreContext = createContext<Store | null>(null);

function load(): OpsState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return stateShape.parse(JSON.parse(raw)) as OpsState;
  } catch {
    // Corrupt or unavailable storage falls back to the demo workspace.
  }
  return createSeed();
}

export function OpsProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);
  const [now, setNow] = useState(() => Date.now());
  const first = useRef(true);

  const dispatch = useCallback((action: ActionInput) => {
    const uid = makeId();
    rawDispatch({ ...action, at: new Date().toISOString(), uid } as OpsAction);
    return uid;
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Approved remediations run for their duration, then complete on their own.
  useEffect(() => {
    for (const incident of state.incidents) {
      for (const a of incident.actions) {
        if (a.status === "executing" && actionProgress(a, now) >= 1) dispatch({ type: "action/complete", incidentId: incident.id, actionId: a.id });
      }
    }
  }, [state.incidents, now, dispatch]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be full or blocked; the session still works in memory.
    }
  }, [state]);

  const reset = useCallback(() => dispatch({ type: "state/replace", state: createSeed() }), [dispatch]);
  const value = useMemo(() => ({ state, now, dispatch, reset }), [state, now, dispatch, reset]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useOps(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useOps must be used inside OpsProvider");
  return store;
}
