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
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0a0a0f 0%,#0f0f1a 100%)',color:'#e2e8f0',fontFamily:'Inter,system-ui,sans-serif'}}>
      {/* Header */}
      <div style={{borderBottom:'1px solid #ffffff0a',padding:'20px 28px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,color:'#f0f0f0'}}>Recovery Workflows</h1>
          <p style={{margin:'4px 0 0',fontSize:12,color:'#6b7280'}}>Live pipeline · polls every 4s{lastUpdated&&<> · Updated {fmtTs(lastUpdated.toISOString())}</>}</p>
        </div>
        <div style={{background:'#f59e0b15',border:'1px solid #f59e0b44',color:'#f59e0b',borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600}}>
          ⚡ Test Mode Simulation — No real customer funds represented
        </div>
      </div>

      {/* Stats bar */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:'#ffffff08',borderBottom:'1px solid #ffffff0a'}}>
        {[{l:'Total Cases',v:stats.total,c:'#6366f1'},{l:'Active',v:stats.active,c:'#3b82f6'},{l:'Critical',v:stats.critical,c:'#ef4444'},{l:'Resolved',v:stats.resolved,c:'#22c55e'},{l:'MRR at Risk',v:fmtMrr(stats.atRisk),c:'#a78bfa'}].map(s=>(
          <div key={s.l} style={{padding:'16px 24px',background:'#0a0a0f'}}>
            <div style={{fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
            <div style={{fontSize:11,color:'#6b7280',marginTop:2,letterSpacing:'0.04em'}}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',height:'calc(100vh - 172px)'}}>
        {/* Cases list */}
        <div style={{flex:selected?'0 0 55%':'1',borderRight:selected?'1px solid #ffffff0a':'none',overflow:'auto',transition:'flex 0.2s'}}>
          {/* Filter tabs */}
          <div style={{display:'flex',borderBottom:'1px solid #ffffff0a',padding:'0 18px'}}>
            {(['all','active','resolved','failed'] as const).map(f=>(
              <button key={f} id={`flow-filter-${f}`} onClick={()=>setFilter(f)} style={{background:'none',border:'none',cursor:'pointer',padding:'12px 16px',fontSize:13,fontWeight:500,color:filter===f?'#6366f1':'#6b7280',borderBottom:`2px solid ${filter===f?'#6366f1':'transparent'}`,transition:'color 0.15s'}}>
                {f[0].toUpperCase()+f.slice(1)} <span style={{opacity:0.6,fontSize:11}}>({f==='all'?cases.length:f==='active'?stats.active:f==='resolved'?stats.resolved:cases.filter(c=>c.status==='failed').length})</span>
              </button>
            ))}
          </div>

          {/* Column headers */}
          <div style={{display:'grid',gridTemplateColumns:'180px 100px 80px 80px 1fr 80px 60px',gap:12,padding:'8px 18px',fontSize:10,color:'#6b7280',letterSpacing:'0.08em',fontWeight:600,textTransform:'uppercase',borderBottom:'1px solid #ffffff08'}}>
            <div>Account</div><div>Status</div><div>Severity</div><div>MRR</div><div>Progress</div><div style={{textAlign:'right'}}>Elapsed</div><div>Mode</div>
          </div>

          {loading&&<div style={{padding:48,textAlign:'center',color:'#6b7280',fontSize:14}}>Loading recovery cases…</div>}

          {!loading&&displayed.length===0&&(
            <div style={{padding:48,textAlign:'center'}}>
              <div style={{fontSize:40,marginBottom:12}}>🎯</div>
              <div style={{color:'#6b7280',fontSize:14}}>{filter==='all'?'No recovery cases yet. Trigger a Stripe test event to begin.':`No ${filter} cases.`}</div>
            </div>
          )}

          {displayed.map(c=>{
            const acct=c.customer_accounts?.name??c.case_key.split(':')[1]?.slice(0,8)??'Unknown';
            return (
              <div key={c.id} role="button" tabIndex={0} onClick={()=>setSelectedId(selectedId===c.id?null:c.id)} onKeyDown={e=>e.key==='Enter'&&setSelectedId(selectedId===c.id?null:c.id)}
                style={{display:'grid',gridTemplateColumns:'180px 100px 80px 80px 1fr 80px 60px',alignItems:'center',gap:12,padding:'12px 18px',cursor:'pointer',borderBottom:'1px solid #ffffff08',background:selectedId===c.id?'#6366f115':'transparent',transition:'background 0.15s'}}>
                <div style={{overflow:'hidden'}}>
                  <div style={{fontWeight:600,fontSize:13,color:'#f0f0f0',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{acct}</div>
                  <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{c.trigger_provider} · {c.trigger_event_type.replace(/_/g,' ')}</div>
                </div>
                <StatusBadge status={c.status}/>
                <SevBadge s={c.severity}/>
                <div style={{fontSize:12,fontWeight:700,color:'#a78bfa'}}>{fmtMrr(c.mrr_baseline_cents)}</div>
                <div style={{display:'flex',alignItems:'center',gap:8}}><StageBar status={c.status}/><span style={{fontSize:11,color:'#6b7280',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.action_type.replace(/_/g,' ')}</span></div>
                <div style={{fontSize:11,color:'#6b7280',textAlign:'right'}}>{fmtElapsed(c.opened_at,['resolved','suppressed'].includes(c.status)?c.resolved_at:undefined)}</div>
                {c.scenario_id?<span style={{fontSize:10,background:'#f59e0b22',color:'#f59e0b',border:'1px solid #f59e0b44',borderRadius:4,padding:'1px 5px',textAlign:'center'}}>TEST</span>:<div/>}
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected&&(
          <div style={{flex:'0 0 45%',overflow:'auto',background:'#0a0a0f'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #ffffff0a',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:'#f0f0f0'}}>{selected.customer_accounts?.name??'Case'} — Timeline</div>
                <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{selected.id.slice(0,8)} · Score {selected.risk_score} · Confidence {Math.round(selected.score_confidence*100)}%</div>
              </div>
              <button id="flow-close-detail" onClick={()=>setSelectedId(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:18,padding:4}} aria-label="Close detail panel">×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,padding:'14px 20px',borderBottom:'1px solid #ffffff0a'}}>
              {[
                ['Status',<StatusBadge key="s" status={selected.status}/>],
                ['Severity',<SevBadge key="sv" s={selected.severity}/>],
                ['MRR Baseline',<span key="m" style={{color:'#a78bfa',fontWeight:700}}>{fmtMrr(selected.mrr_baseline_cents)}</span>],
                ['Action',selected.action_type.replace(/_/g,' ')],
                ['Opened',fmtTs(selected.opened_at)],
                ['Elapsed',fmtElapsed(selected.opened_at,selected.resolved_at)],
                ['Resolution',selected.resolution??'—'],
                ['Trigger',selected.trigger_event_type],
              ].map(([l,v])=>(
                <div key={String(l)}>
                  <div style={{fontSize:10,color:'#6b7280',letterSpacing:'0.06em',fontWeight:600,textTransform:'uppercase',marginBottom:4}}>{l}</div>
                  <div style={{fontSize:13,color:'#e2e8f0'}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{padding:'12px 0'}}>
              <div style={{padding:'8px 20px',fontSize:11,color:'#6b7280',letterSpacing:'0.08em',fontWeight:600,textTransform:'uppercase'}}>Case Events</div>
              <EventTimeline caseId={selected.id}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
