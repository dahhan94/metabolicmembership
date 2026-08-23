const $=s=>document.querySelector(s);
const money=n=>n.toLocaleString('en-AE',{maximumFractionDigits:0});
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nice=d=>{if(!d)return'—';const[y,m,dd]=d.split('-');
  return dd+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+' '+y;};
const DEN_TYPE=new Set(['Denied','Unbilled']);

let REQ=0;
let ROWS=[];

async function load(){
  const myReq=++REQ;
  const days=+$('#days').value||14;
  const out=$('#out');
  out.innerHTML='<div class="loading">Loading outreach list…</div>';
  let data;
  try{
    const res=await fetch('/api/outreach?days='+encodeURIComponent(days));
    if(res.status===401){location.href='/login';return;}
    data=await res.json();
  }catch(e){
    if(myReq===REQ) out.innerHTML='<div class="msg">Could not reach the server — check your connection and try again</div>';
    return;
  }
  if(myReq!==REQ) return;

  ROWS=data.results;
  if(!ROWS.length){
    out.innerHTML='<div class="msg">No candidates in the next '+days+' day'+(days===1?'':'s')+' — try widening the window above.</div>';
    return;
  }

  out.innerHTML=`<div class="result">
    <div class="msg" style="text-align:left;padding:14px 18px;border-style:solid;margin-bottom:18px">
      <b>${ROWS.length}</b> candidate${ROWS.length===1?'':'s'} with an appointment by ${nice(data.today?addDays(data.today,days):null)}
      &middot; click a row for the test breakdown
    </div>
    <div class="table-wrap"><div class="tscroll"><table><thead><tr>
      <th>Patient</th><th>Phone</th><th>Appt date</th><th>Condition</th>
      <th class="payer">Insurer</th><th style="text-align:right">Completed, Rejected</th>
      <th style="text-align:right">Cancelled, Rejected</th><th>On visit</th>
    </tr></thead><tbody>
      ${ROWS.map((r,idx)=>`<tr class="pick" data-idx="${idx}">
        <td class="svc">${esc([r.firstName,r.surname].filter(Boolean).join(' ')||'Record '+esc(r.mrn))}
          <div class="payer" style="margin-top:2px">${esc(r.mrn)}${r.email?' &middot; '+esc(r.email):''}</div></td>
        <td class="date">${esc(r.phone)||'—'}</td>
        <td class="date">${nice(r.appointmentDate)}</td>
        <td>${esc(r.diseaseCategory)||'—'}</td>
        <td class="payer">${esc(r.insurer)||'—'}</td>
        <td class="val">${r.completedValue?`<span class="tag t-denied">AED ${money(r.completedValue)}</span>`:'—'}</td>
        <td class="val">${r.cancelledValue?`<span class="tag t-cancelled">AED ${money(r.cancelledValue)}</span>`:'—'}</td>
        <td class="date">${nice(r.valueDate)}</td>
      </tr>
      <tr class="detail-row" id="detail-${idx}" hidden><td colspan="8">
        <ul class="component-list">${r.components.map(c=>`<li>
          <span>${esc(c.service)}</span>
          <span class="tag ${DEN_TYPE.has(c.category)?'t-denied':'t-cancelled'}">${esc(c.category)}</span>
          <b>AED ${money(c.value)}</b></li>`).join('')}</ul>
      </td></tr>`).join('')}
    </tbody></table></div></div>
  </div>`;

  out.querySelectorAll('tr.pick').forEach(tr=>{
    tr.addEventListener('click',()=>{
      const detail=$('#detail-'+tr.dataset.idx);
      const hidden=detail.hasAttribute('hidden');
      if(hidden) detail.removeAttribute('hidden'); else detail.setAttribute('hidden','');
      tr.classList.toggle('open',hidden);
    });
  });
}

function addDays(iso,n){
  const d=new Date(iso+'T00:00:00');
  d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}

$('#go').addEventListener('click',load);
$('#days').addEventListener('change',load);
load();
