"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Toaster, toast } from "sonner";
import {
  Activity, AlertTriangle, ArrowUpRight, Bell, BookOpen, CheckCircle2, ChevronRight, Clock3, Command, Gauge, LayoutDashboard,
  Plus, Search, ShieldCheck, Users,
} from "lucide-react";
import { Confirm, Modal } from "@/components/ui/dialog";
import {
  budgetUsed, formatAge, formatDuration, greeting, isActive, pendingDecisions, queueOrder, serviceHealth, slaUsed, weekStats,
} from "@/lib/ops/engine";
import { incidentIdFor } from "@/lib/ops/reducer";
import { PRIORITIES, STATUSES, type Priority, type Status } from "@/lib/ops/types";
import { IncidentDrawer } from "./IncidentDrawer";
import { OpsProvider, useOps } from "./store";

const noopSubscribe = () => () => {};

export function OpsApp() {
  // The workspace lives in localStorage, so render only after mount to avoid hydration mismatches.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <main className="app-shell" aria-busy="true"><aside className="rail" /></main>;
  return (
    <OpsProvider>
      <Workbench />
      <Toaster theme="dark" position="bottom-right" closeButton />
    </OpsProvider>
  );
}

type View = "queue" | "services" | "team" | "runbooks";
const VIEWS: { id: View; label: string; icon: typeof Gauge }[] = [
  { id: "queue", label: "Command centre", icon: LayoutDashboard },
  { id: "services", label: "Service health", icon: Gauge },
  { id: "team", label: "Team", icon: Users },
  { id: "runbooks", label: "Runbooks", icon: BookOpen },
];

function readHash(): { view: View; incidentId?: string } {
  const [view, incidentId] = window.location.hash.slice(1).split("/");
  return VIEWS.some((v) => v.id === view) ? { view: view as View, incidentId } : { view: "queue" };
}

function Workbench() {
  const { state, now, dispatch, reset } = useOps();
  const initial = readHash();
  const [view, setView] = useState<View>(initial.view);
  const [openId, setOpenId] = useState<string | undefined>(initial.incidentId);
  const [declaring, setDeclaring] = useState(false);
  const [bell, setBell] = useState(false);
  const [resetting, setResetting] = useState(false);
  const me = state.members.find((m) => m.id === state.userId);

  const go = useCallback((next: View, incidentId?: string) => {
    window.location.hash = incidentId ? `${next}/${incidentId}` : next;
    setView(next);
    setOpenId(incidentId);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onHash = () => { const h = readHash(); setView(h.view); setOpenId(h.incidentId); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Global shortcuts: "/" search, "n" declare. Ignored while typing or when a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.matches("input, textarea, select");
      if (typing || e.metaKey || e.ctrlKey || openId || declaring) return;
      if (e.key === "/") { e.preventDefault(); go("queue"); setTimeout(() => document.querySelector<HTMLInputElement>(".search input")?.focus()); }
      if (e.key === "n") { e.preventDefault(); setDeclaring(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, openId, declaring]);

  const open = state.incidents.find((i) => i.id === openId);
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Primary navigation">
        <a className="brand" href="#queue" aria-label="OpsPilot home" onClick={(e) => { e.preventDefault(); go("queue"); }}><Command size={20} /><span>OP</span></a>
        <nav>
          {VIEWS.map((v) => (
            <a key={v.id} className={`nav-item${view === v.id ? " active" : ""}`} href={`#${v.id}`} aria-label={v.label} title={v.label} aria-current={view === v.id ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); go(v.id); }}><v.icon /></a>
          ))}
        </nav>
        <button className="avatar" aria-label="Reset demo data" title="Reset demo data" onClick={() => setResetting(true)}>{me?.name.split(" ").map((x) => x[0]).join("") ?? "?"}</button>
      </aside>

      <section className="workspace" id="top">
        <header className="topbar">
          <div><span className="eyebrow">Operations / {state.location}</span><h1>{view === "queue" ? greeting(new Date(now), me?.name ?? "there") : VIEWS.find((v) => v.id === view)!.label}</h1></div>
          <div className="header-actions">
            <button className="declare" onClick={() => setDeclaring(true)}><Plus size={16} />Declare incident</button>
            <div className="bell-wrap">
              <button className="icon-button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={bell} onClick={() => setBell(!bell)}><Bell size={18} />{unread ? <span className="dot" /> : null}</button>
              {bell ? (
                <div className="bell-panel" role="dialog" aria-label="Notifications">
                  <header><b>Notifications</b>{unread ? <button onClick={() => dispatch({ type: "notifications/read" })}>Mark all read</button> : null}</header>
                  {!state.notifications.length ? <p className="muted">Nothing yet.</p> : null}
                  {state.notifications.slice(0, 8).map((n) => (
                    <button key={n.id} className={n.read ? "note-row" : "note-row unread"} onClick={() => { setBell(false); if (n.incidentId) go("queue", n.incidentId); }}>
                      <span>{n.text}</span><small>{formatAge(n.at, now)} ago</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="role"><span>{me?.role}</span><strong>{me?.onCall ? `On call until ${new Date(me.shiftEnds).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Off call"}</strong></div>
          </div>
        </header>

        {view === "queue" ? <CommandCentre onOpen={(id) => go("queue", id)} onDeclare={() => setDeclaring(true)} />
          : view === "services" ? <ServicesView onOpen={(id) => go("queue", id)} />
            : view === "team" ? <TeamView onOpen={(id) => go("queue", id)} />
              : <RunbooksView />}

        <footer><span>OpsPilot</span><p>Calm systems. Clear decisions.</p><small>Demo environment · Synthetic data · Press <kbd>n</kbd> to declare, <kbd>/</kbd> to search</small></footer>
      </section>

      {open ? <IncidentDrawer key={open.id} incident={open} onClose={() => go(view)} /> : null}
      {declaring ? <DeclareModal onClose={() => setDeclaring(false)} onCreated={(id) => go("queue", id)} /> : null}
      <Confirm open={resetting} onOpenChange={setResetting} danger confirmLabel="Reset" title="Reset demo data?"
        description="Incidents, decisions and notifications return to the sample workspace." onConfirm={() => { reset(); go("queue"); toast.success("Demo data reset"); }} />
    </main>
  );
}

function CommandCentre({ onOpen, onDeclare }: { onOpen: (id: string) => void; onDeclare: () => void }) {
  const { state, now } = useOps();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | "Open" | Status>("Open");
  const rows = useRef<HTMLTableSectionElement>(null);
  const decisions = pendingDecisions(state, now);
  const urgent = decisions[0];
  const active = state.incidents.filter(isActive);
  const healthy = state.services.filter((s) => serviceHealth(s, state.incidents) === "healthy").length;
  const week = weekStats(state, now);
  const serviceName = (id: string) => state.services.find((s) => s.id === id)?.name ?? id;
  const ownerName = (id: string) => state.members.find((m) => m.id === id)?.name ?? "Unassigned";

  const q = query.trim().toLowerCase();
  const visible = state.incidents
    .filter((i) => `${i.title} ${serviceName(i.serviceId)} ${i.id}`.toLowerCase().includes(q))
    .filter((i) => filter === "All" || (filter === "Open" ? isActive(i) : i.status === filter))
    .sort(queueOrder);

  // j/k or arrow keys move between rows; Enter opens.
  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, id: string) => {
    // preventDefault stops the same Enter from activating the drawer's close button once focus moves into it.
    if (e.key === "Enter") { e.preventDefault(); onOpen(id); return; }
    const delta = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const list = Array.from(rows.current?.querySelectorAll<HTMLTableRowElement>("tr") ?? []);
    list[list.indexOf(e.currentTarget) + delta]?.focus();
  };

  return (
    <>
      <section className={urgent ? "brief" : "brief calm"}>
        <div className="brief-copy">
          <span className="eyebrow lime">Brief · {new Date(now).toLocaleDateString([], { weekday: "long", day: "2-digit", month: "long" })}</span>
          {urgent ? (
            <>
              <h2>{decisions.length === 1 ? "One incident needs a decision, not another meeting." : `${decisions.length} decisions are waiting on you.`}</h2>
              <p>{urgent.incident.title} ({urgent.incident.id}): {urgent.incident.impact} {urgent.action.proposedBy} proposes “{urgent.action.title}”.{urgent.msLeft !== null ? ` The safest window closes in ${Math.ceil(urgent.msLeft / 60_000)} minutes.` : ""}</p>
              <button onClick={() => onOpen(urgent.incident.id)}>Review the decision <ArrowUpRight size={17} /></button>
            </>
          ) : (
            <>
              <h2>{active.length ? "Nothing needs your approval right now." : "All clear. No open incidents."}</h2>
              <p>{active.length ? `${active.length} incident${active.length === 1 ? " is" : "s are"} being worked by their owners. You will be notified when a decision is needed.` : "Every service is within its error budget. Declare an incident if something looks wrong."}</p>
              <button onClick={onDeclare}>Declare incident <Plus size={17} /></button>
            </>
          )}
        </div>
        <div className="countdown" aria-live="off">
          {urgent?.msLeft != null ? (
            <><span>{urgent.action.kind === "rollback" ? "Rollback window" : "Decision window"}</span><strong className={urgent.msLeft < 5 * 60_000 ? "soon" : ""}>{formatDuration(urgent.msLeft)}</strong><small>Closes at {new Date(Date.parse(urgent.action.windowClosesAt!)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></>
          ) : (
            <><span>Pending approvals</span><strong>{String(decisions.length).padStart(2, "0")}</strong><small>{decisions.length ? "No deadline set" : "Queue is clear"}</small></>
          )}
        </div>
      </section>

      <section className="metrics" aria-label="Operations summary">
        <article><span>Active incidents</span><strong>{String(active.length).padStart(2, "0")}</strong><small className={decisions.length ? "warn" : ""}><AlertTriangle size={14} /> {decisions.length} need{decisions.length === 1 ? "s" : ""} action</small></article>
        <article><span>Services healthy</span><strong>{healthy}<span>/{state.services.length}</span></strong><small><Activity size={14} /> {state.services.length - healthy} degraded or down</small></article>
        <article><span>Breaching SLA</span><strong>{String(active.filter((i) => !i.mitigatedAt && slaUsed(i, now) >= 100).length).padStart(2, "0")}</strong><small><Clock3 size={14} /> {active.filter((i) => !i.mitigatedAt).length} not yet mitigated</small></article>
        <article><span>Resolved this week</span><strong>{week.resolved}</strong><small className="good"><CheckCircle2 size={14} /> Median {week.medianMinutes} min</small></article>
      </section>

      <section className="queue" id="queue">
        <div className="section-heading"><div><span className="eyebrow">Live work</span><h2>Incident queue</h2></div><span className="updated"><span className="pulse" /> Live · updates every second</span></div>
        <div className="controls">
          <label className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search incidents or services" aria-label="Search incidents" /></label>
          <div className="filters" role="group" aria-label="Filter incidents">
            {(["Open", "All", ...STATUSES] as const).map((name) => <button key={name} className={filter === name ? "selected" : ""} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>)}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Incident</th><th>Priority</th><th>Status</th><th>Owner</th><th>Age</th><th>SLA used</th><th aria-label="Open" /></tr></thead>
            <tbody ref={rows}>
              {visible.map((item) => {
                const sla = slaUsed(item, now);
                const needs = decisions.some((d) => d.incident.id === item.id);
                return (
                  <tr key={item.id} tabIndex={0} onClick={() => onOpen(item.id)} onKeyDown={(e) => onRowKey(e, item.id)}>
                    <td><strong>{item.title}{needs ? <em className="needs">Decision</em> : null}</strong><small>{item.id} · {serviceName(item.serviceId)}</small></td>
                    <td><span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span></td>
                    <td><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span></td>
                    <td>{ownerName(item.ownerId)}</td>
                    <td>{formatAge(item.declaredAt, item.resolvedAt ? Date.parse(item.resolvedAt) : now)}</td>
                    <td><div className="sla"><span><i style={{ width: `${Math.min(sla, 100)}%` }} className={sla >= 100 ? "over" : sla >= 75 ? "warn" : ""} /></span><small>{sla}%</small></div></td>
                    <td><ChevronRight size={17} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 ? <div className="empty">No incidents match that search. A rare quiet moment.</div> : null}
        </div>
      </section>
    </>
  );
}

function ServicesView({ onOpen }: { onOpen: (id: string) => void }) {
  const { state, now } = useOps();
  return (
    <section className="queue">
      <div className="section-heading"><div><span className="eyebrow">30-day error budgets</span><h2>Service health</h2></div><span className="updated"><span className="pulse" /> Budgets burn live while incidents are open</span></div>
      <div className="service-grid">
        {state.services.map((s) => {
          const used = budgetUsed(s, state.incidents, now);
          const health = serviceHealth(s, state.incidents);
          const open = state.incidents.filter((i) => i.serviceId === s.id && isActive(i));
          return (
            <article key={s.id} className={`service ${health}`}>
              <header><div><b>{s.name}</b><small>{s.team} · tier {s.tier}</small></div><span className={`health ${health}`}>{health}</span></header>
              <div className="budget">
                <div><span>Error budget used</span><b className={used >= 100 ? "over" : used >= 75 ? "warn" : ""}>{used.toFixed(1)}%</b></div>
                <div className="sla big"><span><i style={{ width: `${Math.min(used, 100)}%` }} className={used >= 100 ? "over" : used >= 75 ? "warn" : ""} /></span></div>
                <small>SLO {s.sloTarget}% · {used >= 100 ? "budget exhausted: freeze risky deploys" : `${(100 - used).toFixed(1)}% remaining`}</small>
              </div>
              <dl><div><dt>p95 latency</dt><dd>{s.latencyP95Ms >= 1000 ? `${(s.latencyP95Ms / 1000).toFixed(1)}s` : `${s.latencyP95Ms}ms`}</dd></div><div><dt>Error rate</dt><dd>{s.errorRate}%</dd></div></dl>
              {open.map((i) => <button key={i.id} className="service-incident" onClick={() => onOpen(i.id)}><span className={`priority ${i.priority.toLowerCase()}`}>{i.priority}</span>{i.title}<ChevronRight size={14} /></button>)}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TeamView({ onOpen }: { onOpen: (id: string) => void }) {
  const { state, dispatch } = useOps();
  return (
    <section className="queue">
      <div className="section-heading"><div><span className="eyebrow">Who is on point</span><h2>On-call roster</h2></div><span className="updated">{state.members.filter((m) => m.onCall).length} of {state.members.length} on call</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Person</th><th>Team</th><th>Owns</th><th>Shift</th><th>On call</th></tr></thead>
          <tbody>
            {state.members.map((m) => {
              const owns = state.incidents.filter((i) => i.ownerId === m.id && isActive(i));
              return (
                <tr key={m.id} className="static">
                  <td><strong>{m.name}{m.id === state.userId ? <em className="needs you">You</em> : null}</strong><small>{m.role}</small></td>
                  <td>{m.team}</td>
                  <td>{owns.length ? owns.map((i) => <button key={i.id} className="chip" onClick={() => onOpen(i.id)}>{i.id}</button>) : <span className="muted">—</span>}</td>
                  <td>{m.onCall ? `Until ${new Date(m.shiftEnds).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Off"}</td>
                  <td>
                    <label className="toggle">
                      <input type="checkbox" checked={m.onCall} onChange={(e) => {
                        if (!e.target.checked && owns.length) toast.warning(`${m.name} still owns ${owns.length} open incident${owns.length === 1 ? "" : "s"}. Reassign before handing off.`);
                        dispatch({ type: "member/oncall", memberId: m.id, onCall: e.target.checked });
                      }} aria-label={`${m.name} on call`} />
                      <span />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunbooksView() {
  const { state } = useOps();
  return (
    <section className="queue">
      <div className="section-heading"><div><span className="eyebrow">Shared playbooks</span><h2>Runbooks</h2></div></div>
      <div className="runbooks">
        {state.runbooks.map((r) => (
          <article key={r.id}>
            <b>{r.title}</b>
            <p>{r.summary}</p>
            <ol>{r.steps.map((s) => <li key={s.id}>{s.text}</li>)}</ol>
            <small>Used by {state.services.filter((s) => s.runbookId === r.id).map((s) => s.name).join(", ") || "no service yet"}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function DeclareModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { state, dispatch } = useOps();
  const [title, setTitle] = useState("");
  const [serviceId, setServiceId] = useState(state.services[0]!.id);
  const [priority, setPriority] = useState<Priority>("P2");
  const [impact, setImpact] = useState("");
  const [signal, setSignal] = useState("");
  const service = state.services.find((s) => s.id === serviceId)!;
  const defaultOwner = state.members.find((m) => m.onCall && m.team === service.team) ?? state.members.find((m) => m.id === state.userId)!;
  const [ownerId, setOwnerId] = useState("");
  const owner = ownerId || defaultOwner.id;
  const valid = title.trim().length >= 6 && impact.trim().length >= 6;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const id = incidentIdFor(state.nextIncidentNo);
    dispatch({ type: "incident/declare", title, serviceId, priority, ownerId: owner, impact, signal });
    toast.success(`${id} declared`, { description: `${state.members.find((m) => m.id === owner)?.name} has been paged.` });
    onCreated(id);
    onClose();
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Declare incident" description="Start the clock, page an owner and open a decision log." wide>
      <form className="form" onSubmit={submit}>
        <label>What is happening<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card payments failing for Visa in EU" maxLength={80} /></label>
        <div className="form-grid">
          <label>Service<select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setOwnerId(""); }}>{state.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Priority<select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label>Owner<select value={owner} onChange={(e) => setOwnerId(e.target.value)}>{state.members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.onCall ? " · on call" : ""}</option>)}</select></label>
        </div>
        <label>Customer impact, in plain words<input value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Roughly 1 in 10 card payments fail on first try." maxLength={200} /></label>
        <label>Current signal (optional)<input value={signal} onChange={(e) => setSignal(e.target.value)} placeholder="Auth decline rate 11% vs 1% baseline" maxLength={120} /></label>
        <p className="hint">{priority === "P1" ? "P1 pages the owner immediately and burns error budget fastest. Mitigation target: 30 minutes." : priority === "P2" ? "Mitigation target: 2 hours." : "Mitigation target: 8 hours."}</p>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!valid}><ShieldCheck size={16} />Declare {priority}</button>
        </div>
      </form>
    </Modal>
  );
}

