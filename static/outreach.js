const $=s=>document.querySelector(s);
const money=n=>n.toLocaleString('en-AE',{maximumFractionDigits:0});
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nice=d=>{if(!d)return'—';const[y,m,dd]=d.split('-');
  return dd+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+' '+y;};

let REQ=0;

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

  const rows=data.results;
  if(!rows.length){
    out.innerHTML='<div class="msg">No candidates in the next '+days+' day'+(days===1?'':'s')+' — try widening the window above.</div>';
    return;
  }

  out.innerHTML=`<div class="result">
    <div class="msg" style="text-align:left;padding:14px 18px;border-style:solid;margin-bottom:18px">
      <b>${rows.length}</b> candidate${rows.length===1?'':'s'} with an appointment by ${nice(data.today?addDays(data.today,days):null)}
    </div>
    <div class="table-wrap"><table><thead><tr>
      <th>Patient</th><th>Phone</th><th>Appt date</th><th>Condition</th>
      <th class="payer">Insurer</th><th style="text-align:right">Rejected value</th><th>On visit</th>
    </tr></thead><tbody>
      ${rows.map(r=>`<tr>
        <td class="svc">${esc([r.firstName,r.surname].filter(Boolean).join(' ')||'Record '+esc(r.mrn))}
          <div class="payer" style="margin-top:2px">${esc(r.mrn)}${r.email?' &middot; '+esc(r.email):''}</div></td>
        <td class="date">${esc(r.phone)||'—'}</td>
        <td class="date">${nice(r.appointmentDate)}</td>
        <td>${esc(r.diseaseCategory)||'—'}</td>
        <td class="payer">${esc(r.insurer)||'—'}</td>
        <td class="val"><span class="tag t-denied">AED ${money(r.value)}</span></td>
        <td class="date">${nice(r.valueDate)}</td>
      </tr>`).join('')}
    </tbody></table></div>
  </div>`;
}

function addDays(iso,n){
  const d=new Date(iso+'T00:00:00');
  d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}

$('#go').addEventListener('click',load);
$('#days').addEventListener('change',load);
load();
