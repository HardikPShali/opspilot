import type { OpsState } from "./types.ts";

const MIN = 60_000;

/** Synthetic workspace; every time is relative to `now` so the demo always looks live. */
export function createSeed(now: Date = new Date()): OpsState {
  const t = now.getTime();
  const ago = (m: number) => new Date(t - m * MIN).toISOString();
  const inMin = (m: number) => new Date(t + m * MIN).toISOString();
  const shiftEnd = new Date(now);
  shiftEnd.setHours(18, 0, 0, 0);
  if (shiftEnd.getTime() < t) shiftEnd.setDate(shiftEnd.getDate() + 1);

  return {
    schema: 1,
    userId: "hs",
    location: "London",
    nextIncidentNo: 2842,
    services: [
      { id: "payments", name: "Payments", team: "Payments", tier: 1, sloTarget: 99.95, budgetUsed: 41, budgetAsOf: ago(18), latencyP95Ms: 2800, errorRate: 1.9, runbookId: "rb-rollback" },
      { id: "events", name: "Events API", team: "Platform", tier: 1, sloTarget: 99.9, budgetUsed: 22, budgetAsOf: ago(42), latencyP95Ms: 340, errorRate: 0.2, runbookId: "rb-queue" },
      { id: "discovery", name: "Discovery", team: "Search", tier: 2, sloTarget: 99.5, budgetUsed: 18, budgetAsOf: ago(72), latencyP95Ms: 610, errorRate: 0.4, runbookId: "rb-index" },
      { id: "reporting", name: "Reporting", team: "Data", tier: 3, sloTarget: 99.0, budgetUsed: 12, budgetAsOf: ago(30), latencyP95Ms: 900, errorRate: 0.1 },
      { id: "identity", name: "Identity", team: "Security", tier: 1, sloTarget: 99.99, budgetUsed: 9, budgetAsOf: ago(261), latencyP95Ms: 180, errorRate: 0.05 },
      { id: "checkout-web", name: "Checkout web", team: "Payments", tier: 1, sloTarget: 99.9, budgetUsed: 6, budgetAsOf: ago(60), latencyP95Ms: 420, errorRate: 0.1 },
      { id: "notifications", name: "Notifications", team: "Platform", tier: 2, sloTarget: 99.5, budgetUsed: 3, budgetAsOf: ago(60), latencyP95Ms: 150, errorRate: 0.02 },
    ],
    members: [
      { id: "hs", name: "Hardik Shali", team: "Operations", role: "Incident commander", onCall: true, shiftEnds: shiftEnd.toISOString() },
      { id: "mc", name: "Maya Chen", team: "Payments", role: "Payments on-call", onCall: true, shiftEnds: shiftEnd.toISOString() },
      { id: "jb", name: "Jon Bell", team: "Platform", role: "Platform on-call", onCall: true, shiftEnds: shiftEnd.toISOString() },
      { id: "ns", name: "Nina Shah", team: "Search", role: "Search engineer", onCall: false, shiftEnds: shiftEnd.toISOString() },
      { id: "or", name: "Owen Reed", team: "Data", role: "Data engineer", onCall: false, shiftEnds: shiftEnd.toISOString() },
      { id: "sk", name: "Sara Khan", team: "Security", role: "Security on-call", onCall: true, shiftEnds: shiftEnd.toISOString() },
    ],
    runbooks: [
      {
        id: "rb-rollback", title: "Roll back a bad deploy", summary: "Use when a release correlates with an error-budget burn.",
        steps: [
          { id: "s1", text: "Confirm the regression started with the latest deploy" },
          { id: "s2", text: "Freeze further deploys to the service" },
          { id: "s3", text: "Shift traffic away from the affected region" },
          { id: "s4", text: "Approve and run the rollback" },
          { id: "s5", text: "Watch p95 latency and error rate for 15 minutes" },
          { id: "s6", text: "Post a customer update" },
        ],
      },
      {
        id: "rb-queue", title: "Drain a backed-up queue", summary: "Use when consumers fall behind producers.",
        steps: [
          { id: "s1", text: "Check consumer lag per partition" },
          { id: "s2", text: "Scale consumers horizontally" },
          { id: "s3", text: "Confirm no messages hit the dead-letter queue" },
          { id: "s4", text: "Wait for depth to return to baseline" },
        ],
      },
      {
        id: "rb-index", title: "Recover index throughput", summary: "Use when search freshness lags behind writes.",
        steps: [
          { id: "s1", text: "Check indexer error logs" },
          { id: "s2", text: "Restart stuck workers" },
          { id: "s3", text: "Reindex records created during the incident" },
        ],
      },
    ],
    incidents: [
      {
        id: "INC-2841", title: "Checkout latency above error budget", serviceId: "payments", priority: "P1", status: "Identified", ownerId: "mc",
        declaredAt: ago(18), signal: "p95 latency reached 2.8s in eu-west", impact: "About 14% of checkout attempts are taking longer than three seconds.",
        runbookDone: ["s1", "s2", "s3"],
        timeline: [
          { id: "t1", at: ago(19), kind: "alert", author: "Monitor", text: "p95 latency above 2s for 5 minutes in eu-west." },
          { id: "t2", at: ago(18), kind: "declare", author: "Maya Chen", text: "Incident declared after the second alert." },
          { id: "t3", at: ago(11), kind: "note", author: "Maya Chen", text: "Regression lines up with payments release 2026.10.22-3." },
          { id: "t4", at: ago(7), kind: "action", author: "Maya Chen", text: "Traffic shifted away from eu-west-2." },
          { id: "t5", at: ago(4), kind: "status", author: "Maya Chen", text: "Status changed to Identified." },
        ],
        actions: [
          {
            id: "a1", kind: "rollback", title: "Roll back payments to 2026.10.22-2", detail: "Reverts the connection-pool change shipped this morning. Safe while traffic is shifted.",
            risk: "medium", status: "proposed", proposedBy: "Maya Chen", proposedAt: ago(5), windowClosesAt: inMin(24), durationSec: 20,
          },
        ],
      },
      {
        id: "INC-2838", title: "Delayed webhook delivery", serviceId: "events", priority: "P2", status: "Monitoring", ownerId: "jb",
        declaredAt: ago(42), mitigatedAt: ago(12), signal: "Queue depth returning to baseline", impact: "Integrations may receive events up to eight minutes late. No data loss detected.",
        runbookDone: ["s1", "s2"],
        timeline: [
          { id: "t1", at: ago(42), kind: "declare", author: "Jon Bell", text: "Webhook queue depth above 50k." },
          { id: "t2", at: ago(25), kind: "action", author: "Jon Bell", text: "Consumers scaled from 6 to 12." },
          { id: "t3", at: ago(12), kind: "status", author: "Jon Bell", text: "Status changed to Monitoring." },
        ],
        actions: [{ id: "a1", kind: "scale", title: "Scale webhook consumers to 12", detail: "Doubles consumer capacity.", risk: "low", status: "done", proposedBy: "Jon Bell", proposedAt: ago(28), durationSec: 20, startedAt: ago(26), decidedBy: "Hardik Shali" }],
      },
      {
        id: "INC-2835", title: "Search index lag on new records", serviceId: "discovery", priority: "P2", status: "Investigating", ownerId: "ns",
        declaredAt: ago(72), signal: "Indexer throughput down 38%", impact: "Recently added records take longer to appear in search results.",
        runbookDone: ["s1"],
        timeline: [
          { id: "t1", at: ago(72), kind: "declare", author: "Nina Shah", text: "Freshness alert: new records take 9 minutes to index." },
          { id: "t2", at: ago(40), kind: "note", author: "Nina Shah", text: "Two indexer workers stuck on a malformed document." },
        ],
        actions: [{ id: "a1", kind: "scale", title: "Restart indexer workers 3 and 7", detail: "Clears the stuck batch. Indexing pauses for ~30 seconds.", risk: "low", status: "proposed", proposedBy: "Nina Shah", proposedAt: ago(9), durationSec: 15 }],
      },
      {
        id: "INC-2827", title: "Admin exports timing out", serviceId: "reporting", priority: "P3", status: "Resolved", ownerId: "or",
        declaredAt: ago(188), mitigatedAt: ago(120), resolvedAt: ago(95), signal: "Success rate stable at 99.98%", impact: "Large CSV exports failed for 23 workspaces. Retries have completed.",
        runbookDone: [],
        timeline: [
          { id: "t1", at: ago(188), kind: "declare", author: "Owen Reed", text: "Export job timeouts above threshold." },
          { id: "t2", at: ago(95), kind: "status", author: "Owen Reed", text: "Resolved after raising the export worker timeout." },
        ],
        actions: [],
      },
      {
        id: "INC-2824", title: "Elevated login challenge rate", serviceId: "identity", priority: "P3", status: "Monitoring", ownerId: "sk",
        declaredAt: ago(261), mitigatedAt: ago(200), signal: "Challenge rate down from 9% to 2%", impact: "Some users were asked to verify twice. Sign-in remained available.",
        runbookDone: [],
        timeline: [
          { id: "t1", at: ago(261), kind: "declare", author: "Sara Khan", text: "Challenge rate 9% vs 1% baseline." },
          { id: "t2", at: ago(200), kind: "status", author: "Sara Khan", text: "Risk rule threshold relaxed; monitoring." },
        ],
        actions: [],
      },
      {
        id: "INC-2810", title: "Notification emails delayed", serviceId: "notifications", priority: "P3", status: "Resolved", ownerId: "jb",
        declaredAt: ago(3 * 24 * 60), mitigatedAt: ago(3 * 24 * 60 - 25), resolvedAt: ago(3 * 24 * 60 - 31), signal: "Provider throughput restored", impact: "Emails were delayed up to 20 minutes.",
        runbookDone: [], timeline: [{ id: "t1", at: ago(3 * 24 * 60), kind: "declare", author: "Jon Bell", text: "Email provider throttling." }], actions: [],
      },
      {
        id: "INC-2802", title: "Checkout web assets 404 in one CDN region", serviceId: "checkout-web", priority: "P2", status: "Resolved", ownerId: "mc",
        declaredAt: ago(5 * 24 * 60), mitigatedAt: ago(5 * 24 * 60 - 30), resolvedAt: ago(5 * 24 * 60 - 45), signal: "CDN cache purged", impact: "Checkout failed to load for some users in APAC.",
        runbookDone: [], timeline: [{ id: "t1", at: ago(5 * 24 * 60), kind: "declare", author: "Maya Chen", text: "Asset 404s in ap-southeast." }], actions: [],
      },
    ],
    notifications: [
      { id: "n1", at: ago(5), text: "Maya Chen proposed a rollback for INC-2841. Approval needed.", incidentId: "INC-2841", read: false },
      { id: "n2", at: ago(9), text: "Nina Shah proposed restarting indexer workers for INC-2835.", incidentId: "INC-2835", read: false },
      { id: "n3", at: ago(12), text: "INC-2838 moved to Monitoring.", incidentId: "INC-2838", read: true },
    ],
  };
}
