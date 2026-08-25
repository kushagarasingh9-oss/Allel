'use client';

import { useEffect, useState, useCallback } from 'react';

interface RecoveryCase {
  id: string;
  case_key: string;
  status: string;
  severity: string;
  resolution: string | null;
  risk_score: number;
  score_confidence: number;
  mrr_baseline_cents: number;
  trigger_event_type: string;
  trigger_provider: string;
  action_type: string;
  opened_at: string;
  resolved_at: string | null;
  scenario_id: string | null;
  customer_accounts?: { name: string; domain: string };
}

interface CaseEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_type: string;
  detail: Record<string, unknown>;
  created_at: string;
}

const POLL_MS = 4000;

const STATUS_ORDER = [
  'open','analyzing','action_proposed','awaiting_approval',
  'approved','sent','monitoring','resolved','suppressed','failed',
];

const STATUS_COLOR: Record<string,string> = {
  open:'#6366f1', analyzing:'#8b5cf6', action_proposed:'#a78bfa',
  awaiting_approval:'#f59e0b', approved:'#3b82f6', sent:'#06b6d4',
  monitoring:'#10b981', resolved:'#22c55e', suppressed:'#6b7280', failed:'#ef4444',
};

const SEV_COLOR: Record<string,string> = {
  critical:'#ef4444', high:'#f97316', medium:'#f59e0b', low:'#6b7280',
};

const EV_ICON: Record<string,string> = {
  case_opened:'🔔', score_computed:'🧮', analysis_completed:'🔍',
  draft_created:'✍️', verification_passed:'✅', verification_failed:'❌',
  approval_granted:'👍', approval_rejected:'👎', send_succeeded:'📧',
  send_failed:'📭', billing_recovered:'💰', reply_observed:'💬',
  usage_recovered:'📈', case_resolved:'🏁', job_dead_lettered:'💀',
};

function fmtMrr(c: number) {
  return '$'+(c/100).toLocaleString('en-US',{maximumFractionDigits:0});
}
function fmtElapsed(from: string, to?: string|null) {
  const s = Math.floor((new Date(to??new Date()).getTime()-new Date(from).getTime())/1000);
  if(s<60) return s+'s'; if(s<3600) return Math.floor(s/60)+'m';
  return Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m';
}
function fmtTs(ts: string) {
  return new Date(ts).toLocaleString('en-IN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

function StatusBadge({status}:{status:string}) {
  const c=STATUS_COLOR[status]??'#6b7280';
  return <span style={{background:c+'22',color:c,border:`1px solid ${c}44`,borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>{status.replace(/_/g,' ').toUpperCase()}</span>;
}
function SevBadge({s}:{s:string}) {
  const c=SEV_COLOR[s]??'#6b7280';
  return <span aria-label={`Severity: ${s}`} style={{background:c+'22',color:c,border:`1px solid ${c}55`,borderRadius:6,padding:'2px 7px',fontSize:11,fontWeight:700}}>{s.toUpperCase()}</span>;
}
function StageBar({status}:{status:string}) {
  const idx=STATUS_ORDER.indexOf(status);
  const pct=Math.min(100,(Math.max(0,idx)/STATUS_ORDER.indexOf('resolved'))*100);
  const col=status==='failed'?'#ef4444':status==='resolved'?'#22c55e':'#6366f1';
  return <div style={{position:'relative',height:4,background:'#ffffff0f',borderRadius:2,overflow:'hidden',minWidth:60}}><div style={{position:'absolute',left:0,top:0,height:'100%',width:`${pct}%`,background:col,borderRadius:2,transition:'width 0.5s'}} /></div>;
}

function EventTimeline({caseId}:{caseId:string}) {
  const [events,setEvents]=useState<CaseEvent[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    setLoading(true);
    fetch(`/api/recovery/cases/${caseId}`)
      .then(r=>r.json()).then(d=>{setEvents(d.events||[]);setLoading(false);})
      .catch(()=>setLoading(false));
  },[caseId]);
  if(loading) return <div style={{padding:24,color:'#6b7280',fontSize:13}}>Loading timeline…</div>;
  if(!events.length) return <div style={{padding:24,color:'#6b7280',fontSize:13}}>No events yet.</div>;
  return (
    <div style={{padding:'12px 20px'}}>
      {events.map((ev,i)=>(
        <div key={ev.id} style={{display:'flex',gap:14,position:'relative'}}>
          {i<events.length-1&&<div style={{position:'absolute',left:17,top:32,bottom:0,width:1,background:'#ffffff0f'}}/>}
          <div style={{width:34,height:34,borderRadius:'50%',background:'#1e1e2e',border:'1px solid #ffffff15',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0,marginTop:4}}>{EV_ICON[ev.event_type]??'●'}</div>
          <div style={{paddingBottom:20,flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:'#e2e8f0'}}>{ev.event_type.replace(/_/g,' ')}</div>
            <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>
              {fmtTs(ev.created_at)} · {ev.actor_type}
              {ev.from_status&&ev.to_status&&ev.from_status!==ev.to_status&&<> · <span style={{color:STATUS_COLOR[ev.from_status]??'#6b7280'}}>{ev.from_status}</span>{' → '}<span style={{color:STATUS_COLOR[ev.to_status]??'#6b7280'}}>{ev.to_status}</span></>}
            </div>
            {Object.keys(ev.detail).length>0&&<div style={{marginTop:6,fontSize:11,color:'#475569',background:'#0f172a',borderRadius:6,padding:'6px 10px',fontFamily:'monospace',wordBreak:'break-all'}}>{JSON.stringify(ev.detail).slice(0,300)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FlowsPage() {
  const [cases,setCases]=useState<RecoveryCase[]>([]);
  const [loading,setLoading]=useState(true);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [filter,setFilter]=useState<'all'|'active'|'resolved'|'failed'>('all');
  const [lastUpdated,setLastUpdated]=useState<Date|null>(null);

  const fetchCases=useCallback(async()=>{
    try{
      const r=await fetch('/api/recovery/cases?limit=100');
      if(!r.ok) return;
      const d=await r.json();
      setCases(d.cases||[]);
      setLastUpdated(new Date());
    }catch{/*retry*/}finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    fetchCases();
    const iv=setInterval(fetchCases,POLL_MS);
    return ()=>clearInterval(iv);
  },[fetchCases]);

  const sevOrder: Record<string,number>={critical:0,high:1,medium:2,low:3};
  const sorted=[...cases].sort((a,b)=>{
    const af=a.status==='failed'?0:1, bf=b.status==='failed'?0:1;
    if(af!==bf) return af-bf;
    const as=(sevOrder[a.severity]??4), bs=(sevOrder[b.severity]??4);
    if(as!==bs) return as-bs;
    return b.mrr_baseline_cents-a.mrr_baseline_cents;
  });
  const displayed=sorted.filter(c=>{
    if(filter==='active') return !['resolved','suppressed','failed'].includes(c.status);
    if(filter==='resolved') return c.status==='resolved';
    if(filter==='failed') return c.status==='failed';
    return true;
  });

  const selected=cases.find(c=>c.id===selectedId)??null;
  const stats={
    total:cases.length,
    active:cases.filter(c=>!['resolved','suppressed','failed'].includes(c.status)).length,
    critical:cases.filter(c=>c.severity==='critical'&&c.status!=='resolved').length,
    resolved:cases.filter(c=>c.status==='resolved').length,
    atRisk:cases.reduce((s,c)=>!['resolved','suppressed'].includes(c.status)?s+c.mrr_baseline_cents:s,0),
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0a0a0f] text-neutral-900 dark:text-[#e2e8f0] font-sans">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-white/10 px-7 py-5 flex items-center justify-between">
        <div>
          <h1 className="m-0 text-xl font-bold text-neutral-900 dark:text-[#f0f0f0]">Recovery Workflows</h1>
          <p className="mt-1 mb-0 text-xs text-neutral-500 dark:text-neutral-400">Live pipeline · polls every 4s{lastUpdated&&<> · Updated {fmtTs(lastUpdated.toISOString())}</>}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-lg px-3 py-1.5 text-xs font-semibold">
          ⚡ Test Mode Simulation — No real customer funds represented
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-px bg-neutral-200 dark:bg-white/[0.08] border-b border-neutral-200 dark:border-white/10">
        {[{l:'Total Cases',v:stats.total,c:'#6366f1'},{l:'Active',v:stats.active,c:'#3b82f6'},{l:'Critical',v:stats.critical,c:'#ef4444'},{l:'Resolved',v:stats.resolved,c:'#22c55e'},{l:'MRR at Risk',v:fmtMrr(stats.atRisk),c:'#a78bfa'}].map(s=>(
          <div key={s.l} className="px-6 py-4 bg-white dark:bg-[#0a0a0f]">
            <div className="text-[22px] font-extrabold" style={{color:s.c}}>{s.v}</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 tracking-wider">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="flex h-[calc(100vh-172px)]">
        {/* Cases list */}
        <div className={`overflow-auto transition-all ${selected ? 'flex-[0_0_55%] border-r border-neutral-200 dark:border-white/10' : 'flex-1'}`}>
          {/* Filter tabs */}
          <div className="flex border-b border-neutral-200 dark:border-white/10 px-4">
            {(['all','active','resolved','failed'] as const).map(f=>(
              <button
                key={f}
                id={`flow-filter-${f}`}
                onClick={()=>setFilter(f)}
                className={`bg-transparent border-0 cursor-pointer px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
                  filter === f
                    ? 'text-indigo-600 dark:text-[#6366f1] border-indigo-600 dark:border-[#6366f1]'
                    : 'text-neutral-500 dark:text-neutral-400 border-transparent hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {f[0].toUpperCase()+f.slice(1)} <span className="opacity-60 text-[11px]">({f==='all'?cases.length:f==='active'?stats.active:f==='resolved'?stats.resolved:cases.filter(c=>c.status==='failed').length})</span>
              </button>
            ))}
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[180px_100px_80px_80px_1fr_80px_60px] gap-3 px-4 py-2 text-[10px] text-neutral-400 dark:text-neutral-500 tracking-wider font-semibold uppercase border-b border-neutral-200/80 dark:border-white/[0.08]">
            <div>Account</div><div>Status</div><div>Severity</div><div>MRR</div><div>Progress</div><div className="text-right">Elapsed</div><div>Mode</div>
          </div>

          {loading&&<div className="p-12 text-center text-neutral-400 dark:text-neutral-500 text-sm">Loading recovery cases…</div>}

          {!loading&&displayed.length===0&&(
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">🎯</div>
              <div className="text-neutral-500 dark:text-neutral-400 text-sm">{filter==='all'?'No recovery cases yet. Trigger a Stripe test event to begin.':`No ${filter} cases.`}</div>
            </div>
          )}

          {displayed.map(c=>{
            const acct=c.customer_accounts?.name??c.case_key.split(':')[1]?.slice(0,8)??'Unknown';
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={()=>setSelectedId(selectedId===c.id?null:c.id)}
                onKeyDown={e=>e.key==='Enter'&&setSelectedId(selectedId===c.id?null:c.id)}
                className={`grid grid-cols-[180px_100px_80px_80px_1fr_80px_60px] items-center gap-3 px-4 py-3 cursor-pointer border-b border-neutral-200/60 dark:border-white/[0.08] transition-colors ${
                  selectedId === c.id ? 'bg-indigo-500/10' : 'hover:bg-neutral-100/80 dark:hover:bg-white/[0.03]'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="font-semibold text-[13px] text-neutral-900 dark:text-[#f0f0f0] truncate">{acct}</div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{c.trigger_provider} · {c.trigger_event_type.replace(/_/g,' ')}</div>
                </div>
                <StatusBadge status={c.status}/>
                <SevBadge s={c.severity}/>
                <div className="text-xs font-bold text-indigo-600 dark:text-[#a78bfa]">{fmtMrr(c.mrr_baseline_cents)}</div>
                <div className="flex items-center gap-2"><StageBar status={c.status}/><span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{c.action_type.replace(/_/g,' ')}</span></div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 text-right">{fmtElapsed(c.opened_at,['resolved','suppressed'].includes(c.status)?c.resolved_at:undefined)}</div>
                {c.scenario_id?<span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 text-center">TEST</span>:<div/>}
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected&&(
          <div className="flex-[0_0_45%] overflow-auto bg-white dark:bg-[#0a0a0f] border-l border-neutral-200 dark:border-white/10">
            <div className="p-4 px-5 border-b border-neutral-200 dark:border-white/10 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-neutral-900 dark:text-[#f0f0f0]">{selected.customer_accounts?.name??'Case'} — Timeline</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{selected.id.slice(0,8)} · Score {selected.risk_score} · Confidence {Math.round(selected.score_confidence*100)}%</div>
              </div>
              <button id="flow-close-detail" onClick={()=>setSelectedId(null)} className="bg-transparent border-0 cursor-pointer text-neutral-400 hover:text-neutral-900 dark:hover:text-white text-lg p-1" aria-label="Close detail panel">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 px-5 border-b border-neutral-200 dark:border-white/10">
              {[
                ['Status',<StatusBadge key="s" status={selected.status}/>],
                ['Severity',<SevBadge key="sv" s={selected.severity}/>],
                ['MRR Baseline',<span key="m" className="text-indigo-600 dark:text-[#a78bfa] font-bold">{fmtMrr(selected.mrr_baseline_cents)}</span>],
                ['Action',selected.action_type.replace(/_/g,' ')],
                ['Opened',fmtTs(selected.opened_at)],
                ['Elapsed',fmtElapsed(selected.opened_at,selected.resolved_at)],
                ['Resolution',selected.resolution??'—'],
                ['Trigger',selected.trigger_event_type],
              ].map(([l,v])=>(
                <div key={String(l)}>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500 tracking-wider font-semibold uppercase mb-1">{l}</div>
                  <div className="text-[13px] text-neutral-900 dark:text-[#e2e8f0]">{v}</div>
                </div>
              ))}
            </div>
            <div className="py-3">
              <div className="px-5 py-2 text-[11px] text-neutral-400 dark:text-neutral-500 tracking-wider font-semibold uppercase">Case Events</div>
              <EventTimeline caseId={selected.id}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
