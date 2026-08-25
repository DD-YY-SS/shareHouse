import { React, useEffect, useState, API, BarChart3 } from '../shared.js';

export default function Dashboard({auth,context,logout}){
  const[data,setData]=useState(null);
  useEffect(()=>{fetch(API+'/api/v1/operators/'+context.operatorId+'/dashboard',{headers:{Authorization:'Bearer '+auth.accessToken}}).then(r=>r.json()).then(setData).catch(()=>{})},[auth.accessToken,context.operatorId]);
  const kpis=data?.kpis||[{label:'Monthly entries',value:'248',change:'+12%'},{label:'Verification complete',value:'82%',change:'+6.4%p'},{label:'Match success',value:'61%',change:'+8.1%p'},{label:'30-day retention',value:'94%',change:'+4.0%p'}];
  const funnel=data?.funnel||[{label:'Entry',value:248},{label:'Survey',value:203},{label:'Match',value:149},{label:'Move-in',value:91}];
  return <div className="dashboard-shell"><header className="dashboard-top"><div><span className="section-kicker">OPERATOR CONSOLE</span><h1>Operator dashboard</h1><p>Room {context.roomId} - mock KPI view</p></div><button onClick={logout}>Log out</button></header><section className="kpi-grid">{kpis.map(k=><div key={k.label}><span>{k.label}</span><strong>{k.value}</strong><small>{k.change} vs last month</small></div>)}</section><section className="funnel-card"><div className="card-title"><div><BarChart3 size={19}/><strong>Conversion funnel</strong></div><span>Mock data</span></div>{funnel.map((item,index)=><div className="funnel-row" key={item.label}><span>{item.label}</span><div><i style={{width:(item.value/funnel[0].value*100)+'%'}}/></div><strong>{item.value}</strong><small>{index?Math.round(item.value/funnel[index-1].value*100)+'%':'100%'}</small></div>)}</section></div>
}
