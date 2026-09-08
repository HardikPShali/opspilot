# OpsPilot

OpsPilot is an incident operations workbench built for the moment when a team needs a clear decision, not another dashboard.

## What it demonstrates

- Product thinking: the interface prioritises decisions, customer impact and ownership.
- Frontend engineering: responsive layouts, derived filtering state, accessible controls and keyboard navigation.
- Operational judgment: error budgets, rollback windows, service health and decision logs are treated as connected work.
- Communication: technical signals are translated into plain customer impact.

## Features

- Search incidents by title, service or incident ID.
- Filter by investigation state.
- Open a focused incident view with live signals and decision history.
- Review SLA consumption without losing the wider queue context.
- Use the core workflow on desktop or mobile.
- Respect reduced motion preferences.

## Technical choices

The project uses React 19, TypeScript, Vinext, Tailwind CSS and Lucide icons. It is deliberately frontend-first and uses a small synthetic dataset so the interaction model can be reviewed without account setup.

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
```

## Next engineering step

The next iteration would place the incident model behind an API, add optimistic updates with audit events, and test the rollback approval flow with role-based permissions.
