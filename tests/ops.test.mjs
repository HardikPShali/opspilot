import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetUsed, formatDuration, isExpired, pendingDecisions, queueOrder, serviceHealth, slaUsed, weekStats } from "../lib/ops/engine.ts";
import { reducer } from "../lib/ops/reducer.ts";
import { createSeed } from "../lib/ops/seed.ts";

const NOW = new Date("2026-10-22T10:00:00Z");
const MIN = 60_000;
const at = (m) => new Date(NOW.getTime() + m * MIN).toISOString();
let n = 0;
const run = (state, action, minutes = 0) => reducer(state, { ...action, at: at(minutes), uid: `u${++n}` });
const inc = (s, id) => s.incidents.find((i) => i.id === id);
const svc = (s, id) => s.services.find((x) => x.id === id);

test("seed brief surfaces the rollback with its window", () => {
  const s = createSeed(NOW);
  const [first, second] = pendingDecisions(s, NOW.getTime());
  assert.equal(first.incident.id, "INC-2841");
  assert.equal(Math.round(first.msLeft / MIN), 24);
  assert.equal(second.incident.id, "INC-2835", "decisions without a deadline sort last");
});

test("SLA clock stops at mitigation", () => {
  const s = createSeed(NOW);
  assert.equal(slaUsed(inc(s, "INC-2841"), NOW.getTime()), 60, "18 of 30 minutes");
  assert.equal(slaUsed(inc(s, "INC-2838"), NOW.getTime() + 60 * MIN), 25, "mitigated after 30 of 120 minutes");
});

test("error budget burns live and checkpoints when the burn rate changes", () => {
  let s = createSeed(NOW);
  const t = NOW.getTime();
  // The seed's 41% is as of the P1's declaration 18 minutes ago, so 18 × 0.35% has burned since.
  assert.equal(budgetUsed(svc(s, "payments"), s.incidents, t), 47.3);
  assert.equal(budgetUsed(svc(s, "payments"), s.incidents, t + 10 * MIN), 50.8, "P1 burns 0.35%/min");
  s = run(s, { type: "incident/status", incidentId: "INC-2841", status: "Monitoring" }, 10);
  assert.equal(svc(s, "payments").budgetUsed, 50.8, "burn so far is frozen into the checkpoint");
  assert.equal(budgetUsed(svc(s, "payments"), s.incidents, t + 20 * MIN), 51.5, "monitoring burns at a fifth of the rate");
  assert.equal(inc(s, "INC-2841").mitigatedAt, at(10));
});

test("service health follows open incidents", () => {
  const s = createSeed(NOW);
  assert.equal(serviceHealth(svc(s, "payments"), s.incidents), "down");
  assert.equal(serviceHealth(svc(s, "events"), s.incidents), "healthy", "P2 in monitoring");
  assert.equal(serviceHealth(svc(s, "discovery"), s.incidents), "degraded");
});

test("approving runs the remediation, which then mitigates the incident", () => {
  let s = createSeed(NOW);
  s = run(s, { type: "action/approve", incidentId: "INC-2841", actionId: "a1" }, 1);
  assert.equal(inc(s, "INC-2841").actions[0].status, "executing");
  assert.equal(inc(s, "INC-2841").actions[0].decidedBy, "Hardik Shali");
  s = run(s, { type: "action/complete", incidentId: "INC-2841", actionId: "a1" }, 2);
  const done = inc(s, "INC-2841");
  assert.equal(done.actions[0].status, "done");
  assert.equal(done.status, "Monitoring");
  assert.match(s.notifications[0].text, /completed on INC-2841/);
  assert.equal(pendingDecisions(s, NOW.getTime()).length, 1);
});

test("an expired window cannot be approved", () => {
  const s = createSeed(NOW);
  const action = inc(s, "INC-2841").actions[0];
  assert.ok(isExpired(action, NOW.getTime() + 25 * MIN));
  const after = run(s, { type: "action/approve", incidentId: "INC-2841", actionId: "a1" }, 25);
  assert.equal(after, s);
});

test("reject records the reason", () => {
  const s = run(createSeed(NOW), { type: "action/reject", incidentId: "INC-2835", actionId: "a1", reason: "Wait for the batch to finish" });
  const a = inc(s, "INC-2835").actions[0];
  assert.equal(a.status, "rejected");
  assert.match(inc(s, "INC-2835").timeline.at(-1).text, /Wait for the batch to finish/);
});

test("declaring numbers incidents, pages the owner and resolving sets timestamps", () => {
  let s = createSeed(NOW);
  s = run(s, { type: "incident/declare", title: "Card payments failing", serviceId: "payments", priority: "P1", ownerId: "mc", impact: "1 in 10 payments fail", signal: "" });
  const created = inc(s, "INC-2842");
  assert.equal(created.status, "Investigating");
  assert.equal(created.signal, "Awaiting first signal");
  assert.equal(s.nextIncidentNo, 2843);
  assert.match(s.notifications[0].text, /Maya Chen is paged/);
  s = run(s, { type: "incident/status", incidentId: "INC-2842", status: "Resolved" }, 30);
  assert.equal(inc(s, "INC-2842").resolvedAt, at(30));
  assert.equal(inc(s, "INC-2842").mitigatedAt, at(30));
});

test("runbook steps toggle and notes append", () => {
  let s = run(createSeed(NOW), { type: "runbook/toggle", incidentId: "INC-2841", stepId: "s4" });
  assert.ok(inc(s, "INC-2841").runbookDone.includes("s4"));
  s = run(s, { type: "runbook/toggle", incidentId: "INC-2841", stepId: "s4" });
  assert.ok(!inc(s, "INC-2841").runbookDone.includes("s4"));
  s = run(s, { type: "incident/note", incidentId: "INC-2841", text: "  Customer update posted " });
  assert.equal(inc(s, "INC-2841").timeline.at(-1).text, "Customer update posted");
});

test("queue order, weekly stats and countdown format", () => {
  const s = createSeed(NOW);
  assert.deepEqual([...s.incidents].sort(queueOrder).slice(0, 2).map((i) => i.id), ["INC-2841", "INC-2835"]);
  const week = weekStats(s, NOW.getTime());
  assert.equal(week.resolved, 3);
  assert.equal(week.medianMinutes, 45);
  assert.equal(formatDuration(24 * MIN + 16_000), "00:24:16");
});
