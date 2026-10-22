"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { toast } from "sonner";
import { Activity, BookOpen, Check, Clock3, Plus, ShieldCheck, X } from "lucide-react";
import { actionProgress, formatAge, formatDuration, isExpired, MITIGATE_TARGET_MIN, slaUsed } from "@/lib/ops/engine";
import { PRIORITIES, STATUSES, type ActionKind, type Incident, type Remediation } from "@/lib/ops/types";
import { useOps } from "./store";

const KIND_LABEL: Record<ActionKind, string> = { rollback: "Rollback", failover: "Failover", scale: "Scale / restart", flag: "Feature flag" };

export function IncidentDrawer({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const { state, now, dispatch } = useOps();
  const [note, setNote] = useState("");
  const [proposing, setProposing] = useState(false);
  const service = state.services.find((s) => s.id === incident.serviceId);
  const runbook = state.runbooks.find((r) => r.id === service?.runbookId);
  const sla = slaUsed(incident, now);
  const resolved = incident.status === "Resolved";

  const addNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    dispatch({ type: "incident/note", incidentId: incident.id, text: note });
    setNote("");
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="overlay" />
        <DialogPrimitive.Content className="drawer" aria-describedby={undefined}>
          <DialogPrimitive.Close className="close" aria-label="Close incident"><X /></DialogPrimitive.Close>
          <span className="eyebrow">{incident.id} · {service?.name ?? incident.serviceId} · open {formatAge(incident.declaredAt, now)}</span>
          <DialogPrimitive.Title asChild><h2 id="incident-title">{incident.title}</h2></DialogPrimitive.Title>

          <div className="drawer-controls">
            <label>Status
              <select value={incident.status} onChange={(e) => dispatch({ type: "incident/status", incidentId: incident.id, status: e.target.value as Incident["status"] })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>Priority
              <select value={incident.priority} onChange={(e) => dispatch({ type: "incident/priority", incidentId: incident.id, priority: e.target.value as Incident["priority"] })}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>Owner
              <select value={incident.ownerId} onChange={(e) => dispatch({ type: "incident/assign", incidentId: incident.id, ownerId: e.target.value })}>
                {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.onCall ? " · on call" : ""}</option>)}
              </select>
            </label>
          </div>

          <section className="sla-panel" aria-label="Mitigation SLA">
            <div><span>Time to mitigate</span><b className={sla >= 100 ? "over" : ""}>{sla}% of {MITIGATE_TARGET_MIN[incident.priority]} min</b></div>
            <div className="sla big"><span><i style={{ width: `${Math.min(sla, 100)}%` }} className={sla >= 100 ? "over" : sla >= 75 ? "warn" : ""} /></span></div>
            <small>{incident.mitigatedAt ? `Mitigated after ${formatAge(incident.declaredAt, Date.parse(incident.mitigatedAt))}` : sla >= 100 ? "Target missed. Escalate if no mitigation is in progress." : "Clock stops when the incident is mitigated."}</small>
          </section>

          <section className="signal"><span><Activity size={16} /> Live signal</span><strong>{incident.signal}</strong></section>
          <section className="detail"><span>Customer impact</span><p>{incident.impact || "Not yet assessed."}</p></section>

          <section className="detail">
            <span>Decisions</span>
            {!incident.actions.length ? <p className="muted">No remediation proposed yet.</p> : null}
            {incident.actions.map((a) => <ActionCard key={a.id} incidentId={incident.id} action={a} />)}
            {!resolved ? (
              proposing ? <ProposeForm incidentId={incident.id} onDone={() => setProposing(false)} />
                : <button className="text-button" onClick={() => setProposing(true)}><Plus size={14} />Propose a remediation</button>
            ) : null}
          </section>

          {runbook ? (
            <section className="detail">
              <span><BookOpen size={14} /> Runbook · {runbook.title}</span>
              <ul className="checklist">
                {runbook.steps.map((step) => (
                  <li key={step.id}>
                    <label>
                      <input type="checkbox" checked={incident.runbookDone.includes(step.id)} onChange={() => dispatch({ type: "runbook/toggle", incidentId: incident.id, stepId: step.id })} />
                      <span>{step.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <small className="muted">{incident.runbookDone.filter((id) => runbook.steps.some((s) => s.id === id)).length} of {runbook.steps.length} steps done</small>
            </section>
          ) : null}

          <section className="detail">
            <span>Decision log</span>
            <div className="timeline">
              {[...incident.timeline].reverse().map((t) => (
                <div key={t.id} className={t.kind}>
                  <time dateTime={t.at}>{new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  <p>{t.text}<small>{t.author}</small></p>
                </div>
              ))}
            </div>
            <form className="note-form" onSubmit={addNote}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an update to the log" aria-label="Add an update" maxLength={280} />
              <button disabled={!note.trim()}>Log</button>
            </form>
          </section>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ActionCard({ incidentId, action }: { incidentId: string; action: Remediation }) {
  const { now, dispatch } = useOps();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const expired = isExpired(action, now);
  const left = action.windowClosesAt ? Date.parse(action.windowClosesAt) - now : null;
  const progress = actionProgress(action, now);
  const state = expired ? "expired" : action.status;

  return (
    <article className={`action-card ${state}`}>
      <header>
        <span className="tag">{KIND_LABEL[action.kind]}</span>
        <span className={`risk ${action.risk}`}>{action.risk} risk</span>
        <span className="action-state">{state === "proposed" ? "Awaiting approval" : state === "executing" ? "Running" : state === "done" ? "Completed" : state === "rejected" ? "Rejected" : "Window closed"}</span>
      </header>
      <b>{action.title}</b>
      <p>{action.detail}</p>
      <small>Proposed by {action.proposedBy}{action.decidedBy ? ` · ${action.status === "rejected" ? "rejected" : "approved"} by ${action.decidedBy}` : ""}{action.reason ? ` — “${action.reason}”` : ""}</small>
      {action.status === "proposed" && left !== null ? (
        <p className={`window ${expired ? "closed" : left < 5 * 60_000 ? "soon" : ""}`}><Clock3 size={14} />{expired ? "The safe window has closed. Propose a new action to continue." : `Safe window closes in ${formatDuration(left)}`}</p>
      ) : null}
      {action.status === "executing" ? (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${action.title} progress`}><i style={{ width: `${progress * 100}%` }} /></div>
      ) : null}
      {action.status === "proposed" && !expired ? (
        rejecting ? (
          <form className="reject-form" onSubmit={(e) => { e.preventDefault(); dispatch({ type: "action/reject", incidentId, actionId: action.id, reason }); setRejecting(false); }}>
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why not? (shared in the log)" aria-label="Rejection reason" />
            <button type="button" className="secondary" onClick={() => setRejecting(false)}>Cancel</button>
            <button className="secondary danger">Reject</button>
          </form>
        ) : (
          <div className="decision">
            <button onClick={() => { dispatch({ type: "action/approve", incidentId, actionId: action.id }); toast.success("Approved", { description: `${action.title} is running.` }); }}><ShieldCheck size={17} />Approve</button>
            <button className="secondary" onClick={() => setRejecting(true)}>Reject</button>
          </div>
        )
      ) : null}
      {action.status === "done" ? <p className="done-line"><Check size={14} />Completed</p> : null}
    </article>
  );
}

function ProposeForm({ incidentId, onDone }: { incidentId: string; onDone: () => void }) {
  const { dispatch } = useOps();
  const [kind, setKind] = useState<ActionKind>("rollback");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [risk, setRisk] = useState<Remediation["risk"]>("medium");
  const [windowMinutes, setWindowMinutes] = useState(30);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 4) return;
    dispatch({ type: "action/propose", incidentId, kind, title, detail, risk, windowMinutes: windowMinutes || undefined, durationSec: kind === "rollback" ? 20 : 12 });
    toast("Remediation proposed", { description: "It now needs approval." });
    onDone();
  };

  return (
    <form className="propose" onSubmit={submit}>
      <div className="propose-row">
        <label>Type<select value={kind} onChange={(e) => setKind(e.target.value as ActionKind)}>{(Object.keys(KIND_LABEL) as ActionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
        <label>Risk<select value={risk} onChange={(e) => setRisk(e.target.value as Remediation["risk"])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label>Safe window (min)<input type="number" min={0} max={240} value={windowMinutes} onChange={(e) => setWindowMinutes(Math.max(0, Number(e.target.value) || 0))} /></label>
      </div>
      <label>What will happen<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fail over payments to eu-central" maxLength={80} /></label>
      <label>Why it is safe<input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Capacity verified; reversible in 2 minutes" maxLength={160} /></label>
      <div className="decision">
        <button disabled={title.trim().length < 4}>Propose</button>
        <button type="button" className="secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
