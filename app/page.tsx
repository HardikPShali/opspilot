"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, Bell, CheckCircle2, ChevronRight, Clock3, Command, Gauge, LayoutDashboard, LifeBuoy, Search, ShieldCheck, Users, X } from "lucide-react";

type Status = "Investigating" | "Monitoring" | "Resolved";
type Incident = { id: string; title: string; service: string; priority: "P1" | "P2" | "P3"; status: Status; owner: string; age: string; sla: number; signal: string; impact: string };

const incidents: Incident[] = [
  { id: "INC-2841", title: "Checkout latency above error budget", service: "Payments", priority: "P1", status: "Investigating", owner: "Maya Chen", age: "18m", sla: 72, signal: "p95 latency reached 2.8s in eu-west", impact: "About 14% of checkout attempts are taking longer than three seconds." },
  { id: "INC-2838", title: "Delayed webhook delivery", service: "Events API", priority: "P2", status: "Monitoring", owner: "Jon Bell", age: "42m", sla: 46, signal: "Queue depth returning to baseline", impact: "Integrations may receive events up to eight minutes late. No data loss detected." },
  { id: "INC-2835", title: "Search index lag on new records", service: "Discovery", priority: "P2", status: "Investigating", owner: "Nina Shah", age: "1h 12m", sla: 31, signal: "Indexer throughput down 38%", impact: "Recently added records take longer to appear in search results." },
  { id: "INC-2827", title: "Admin exports timing out", service: "Reporting", priority: "P3", status: "Resolved", owner: "Owen Reed", age: "3h 08m", sla: 12, signal: "Success rate stable at 99.98%", impact: "Large CSV exports failed for 23 workspaces. Retries have completed." },
  { id: "INC-2824", title: "Elevated login challenge rate", service: "Identity", priority: "P3", status: "Monitoring", owner: "Sara Khan", age: "4h 21m", sla: 8, signal: "Challenge rate down from 9% to 2%", impact: "Some users were asked to verify twice. Sign-in remained available." },
];
const logs = [["10:42", "Rollback completed. Error rate is falling."], ["10:31", "Traffic shifted away from eu-west-2."], ["10:18", "Incident declared after the second alert."]];

export default function Home() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | Status>("All");
  const [selected, setSelected] = useState<Incident | null>(null);
  const visible = useMemo(() => incidents.filter((item) => `${item.title} ${item.service} ${item.id}`.toLowerCase().includes(query.toLowerCase()) && (filter === "All" || item.status === filter)), [query, filter]);

  return <main className="app-shell">
    <aside className="rail" aria-label="Primary navigation">
      <a className="brand" href="#top" aria-label="OpsPilot home"><Command size={20}/><span>OP</span></a>
      <nav><a className="nav-item active" href="#queue" aria-label="Command centre"><LayoutDashboard/></a><a className="nav-item" href="#services" aria-label="Service health"><Gauge/></a><a className="nav-item" href="#team" aria-label="Team"><Users/></a><a className="nav-item" href="#support" aria-label="Support"><LifeBuoy/></a></nav>
      <button className="avatar" aria-label="Open profile">HS</button>
    </aside>
    <section className="workspace" id="top">
      <header className="topbar">
        <div><span className="eyebrow">Operations / London</span><h1>Good morning, Hardik.</h1></div>
        <div className="header-actions"><button className="icon-button" aria-label="Notifications"><Bell size={18}/><span className="dot"/></button><div className="role"><span>Incident commander</span><strong>On call until 18:00</strong></div></div>
      </header>
      <section className="brief">
        <div className="brief-copy"><span className="eyebrow lime">Morning brief · Tuesday 08 September</span><h2>One incident needs a decision, not another meeting.</h2><p>Checkout latency is consuming the payment service error budget. The rollback is ready and the safest window closes in 24 minutes.</p><button onClick={() => setSelected(incidents[0])}>Review the decision <ArrowUpRight size={17}/></button></div>
        <div className="countdown" aria-label="24 minutes until rollback window closes"><span>Rollback window</span><strong>00:24:16</strong><small>Closes at 11:10</small></div>
      </section>
      <section className="metrics" aria-label="Operations summary">
        <article><span>Active incidents</span><strong>03</strong><small className="warn"><AlertTriangle size={14}/> 1 needs action</small></article>
        <article><span>Services healthy</span><strong>18<span>/20</span></strong><small><Activity size={14}/> 99.94% availability</small></article>
        <article><span>Open requests</span><strong>27</strong><small><Clock3 size={14}/> 4 due today</small></article>
        <article><span>Resolved this week</span><strong>14</strong><small className="good"><CheckCircle2 size={14}/> Median 38 min</small></article>
      </section>
      <section className="queue" id="queue">
        <div className="section-heading"><div><span className="eyebrow">Live work</span><h2>Incident queue</h2></div><span className="updated"><span className="pulse"/> Updated just now</span></div>
        <div className="controls">
          <label className="search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search incidents or services"/></label>
          <div className="filters" aria-label="Filter incidents">{(["All", "Investigating", "Monitoring", "Resolved"] as const).map((name) => <button key={name} className={filter === name ? "selected" : ""} onClick={() => setFilter(name)}>{name}</button>)}</div>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Incident</th><th>Priority</th><th>Status</th><th>Owner</th><th>Age</th><th>SLA used</th><th aria-label="Open"/></tr></thead>
          <tbody>{visible.map((item) => <tr key={item.id} tabIndex={0} onClick={() => setSelected(item)} onKeyDown={(e) => e.key === "Enter" && setSelected(item)}>
            <td><strong>{item.title}</strong><small>{item.id} · {item.service}</small></td><td><span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span></td><td><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span></td><td>{item.owner}</td><td>{item.age}</td><td><div className="sla"><span><i style={{width: `${item.sla}%`}}/></span><small>{item.sla}%</small></div></td><td><ChevronRight size={17}/></td>
          </tr>)}</tbody></table>{visible.length === 0 && <div className="empty">No incidents match that search. A rare quiet moment.</div>}</div>
      </section>
      <footer><span>OpsPilot</span><p>Calm systems. Clear decisions.</p><small>Demo environment · Synthetic data</small></footer>
    </section>
    {selected && <div className="overlay" role="presentation" onMouseDown={() => setSelected(null)}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="incident-title" onMouseDown={(e) => e.stopPropagation()}>
      <button className="close" onClick={() => setSelected(null)} aria-label="Close incident"><X/></button><span className="eyebrow">{selected.id} · {selected.service}</span><h2 id="incident-title">{selected.title}</h2><div className="drawer-badges"><span className={`priority ${selected.priority.toLowerCase()}`}>{selected.priority}</span><span className={`status ${selected.status.toLowerCase()}`}>{selected.status}</span></div>
      <section className="signal"><span><Activity size={16}/> Live signal</span><strong>{selected.signal}</strong></section><section className="detail"><span>Customer impact</span><p>{selected.impact}</p></section>
      <section className="detail"><span>Decision log</span><div className="timeline">{logs.map(([time, note]) => <div key={time}><time>{time}</time><p>{note}</p></div>)}</div></section><div className="decision"><button><ShieldCheck size={17}/> Approve rollback</button><button className="secondary">Open runbook</button></div>
    </aside></div>}
  </main>;
}
