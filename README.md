# OpsPilot

OpsPilot is an incident operations workbench built for the moment when a team needs a clear decision, not another dashboard.

## What it demonstrates

- Product thinking: the interface prioritises decisions, customer impact and ownership.
- Frontend engineering: responsive layouts, derived filtering state, accessible controls and keyboard navigation.
- Operational judgment: error budgets, rollback windows, service health and decision logs are treated as connected work.
- Communication: technical signals are translated into plain customer impact.

## Features

- **Live brief** – the command centre leads with the most urgent pending decision, its customer impact and a countdown to the end of its safe window. When nothing needs approval it says so plainly.
- **Decisions with deadlines** – remediations (rollback, failover, scale/restart, feature flag) are proposed with a risk level and an optional safe window. Approve one and it runs with visible progress, then mitigates the incident on its own. Reject one and the reason goes into the log. Once a window has closed the action can no longer be approved.
- **SLA and error budgets that move** – the time-to-mitigate bar (P1 30 min, P2 2 h, P3 8 h) stops when an incident is mitigated. Each service's 30-day error budget burns live while incidents are open, at a rate set by priority and status, and is checkpointed whenever that rate changes.
- **Incident workflow** – declare incidents with `n`. The on-call owner for the service is suggested and paged. Change status, priority or owner, work through the service runbook checklist, and add updates to the decision log.
- **Queue** – search (`/`), status filters, open-first ordering by priority and age, "Decision" flags, and keyboard navigation (↑/↓ or j/k, Enter).
- **Service health, team and runbooks** – per-service health, budget, latency and open incidents; an on-call roster with hand-off warnings for people who still own incidents; the shared runbook library.
- **Notifications** for declarations, proposals, completed remediations and ownership changes.
- Everything persists in the browser. The demo can be reset from the avatar button, and reduced-motion preferences are respected.

## Technical choices

The project uses React 19, TypeScript, Vinext, Tailwind CSS, Radix dialogs and Lucide icons. The domain lives in `lib/ops/` as plain TypeScript: `engine.ts` (SLA, error-budget burn, health, pending decisions, queue order) and a pure `reducer.ts` that writes the decision log and notifications. The UI derives everything else from that state. It is deliberately frontend-first and uses a small synthetic dataset so the interaction model can be reviewed without account setup.

The design avoids a conventional analytics dashboard. A narrow command rail, square operational surfaces and a restrained signal colour system make urgency visible without making the interface noisy.

## Run locally

```bash
npm ci
npm run dev
```

Then open the local URL printed by Vite.

## Verify

```bash
npm run build
npm run lint
npm test   # builds, then runs the engine and reducer tests in tests/
```

## Next engineering step

The next iteration would place the incident model behind an API, add optimistic updates with audit events, and test the rollback approval flow with role-based permissions.
