let VIEW='denied';
let SESSION='exercise';
const SESSION_VALUE={exercise:1710,physio:2400};
const SESSION_LABEL={exercise:'6 exercise sessions',physio:'6 physio sessions'};
const ICON_CLOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
const ICON_SHIELD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l7 3v5.2c0 4.4-3 7.4-7 8.8-4-1.4-7-4.4-7-8.8V6.5l7-3z"/><path d="M9 12l2 2 4-4"/></svg>';
const ICON_DUMBBELL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6M6.5 7.5v9M17.5 7.5v9M20 9v6M6.5 12h11"/></svg>';
const ICON_TAG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9h7v7l-9 9-7-7z"/><circle cx="15" cy="8" r="1" fill="currentColor"/></svg>';
const $=s=>document.querySelector(s);
const money=n=>n.toLocaleString('en-AE',{maximumFractionDigits:0});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nice=d=>{const[y,m,dd]=d.split('-');
  return dd+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+' '+y;};
const CN={dm:'Diabetes',pre:'Pre-diabetes',oth:'Other metabolic risk'};
const conds=()=>[...document.querySelectorAll('.cond:checked')].map(c=>c.value);
const normMrn=s=>s.replace(/[^0-9]/g,'').replace(/^0+/,'');

// ignore stale fetch responses if the user triggers another lookup before the first resolves
let REQ=0;

async function renderLanding(){
  const myReq=++REQ;
  const fee=+$('#fee').value||0;
  $('#out').innerHTML='<div class="loading">Loading cohort figures…</div>';
  let data;
  try{
    const res=await fetch('/api/landing?fee='+encodeURIComponent(fee));
    if(res.status===401){location.href='/login';return;}
    data=await res.json();
  }catch(e){
    if(myReq===REQ) $('#out').innerHTML='<div class="msg">Could not reach the server — check your connection and try again</div>';
    return;
  }
  if(myReq!==REQ) return;
  const {total,hasDenial,exceedD,exceedC,exceedBoth,median,top}=data;

  $('#out').innerHTML=`<div class="landing">
    <div class="msg" style="text-align:left;padding:18px 20px">Enter a record number above to see one patient's coverage history.</div>
    <div class="case">
      <div class="hd">Cohort exposure at AED ${money(fee)} membership &middot; ${total} patients &middot; 6 Apr&ndash;10 Jul 2026</div>
      <div class="bd">
        <div class="compare">
          <div><div class="lbl">Have at least one denial</div><div class="num">${hasDenial}</div>
            <div class="note">Median AED ${money(median)} in denied claims</div></div>
          <div><div class="lbl">Exceed fee on denials alone</div><div class="num pos">${exceedD}</div>
            <div class="note">Denied cash &gt; AED ${money(fee)}</div></div>
          <div><div class="lbl">Exceed on cancelled-after-rejection</div><div class="num pos">${exceedC}</div>
            <div class="note">Cancelled (rejected + other) &gt; AED ${money(fee)}</div></div>
          <div><div class="lbl">Exceed on the two combined</div><div class="num pos">${exceedBoth}</div>
            <div class="note">Denied + cancelled, all reasons &gt; AED ${money(fee)}</div></div>
        </div>
        <p class="say">Adjust the membership fee above to model a different tier — every figure here recomputes
        against the same 95-day window. This is aggregate framing for deciding who to call, not a substitute
        for looking up the patient in front of you — and cancelled-other is never a refusal, so keep that
        distinction when you talk to the patient directly.</p>
      </div>
    </div>
    <div class="why">
      <div class="hd"><h3>Highest exposure this window</h3><span class="n">top ${top.length} of ${total}</span></div>
      <ul>${top.map(([m,d,c,co],idx)=>`<li class="pick" data-idx="${idx}">
        <div class="bd"><div class="nm">Record ${esc(m)}</div>
          <div class="tx">Denied AED ${money(d)} &middot; Cancelled (rejected + other) AED ${money(c+co)}</div></div>
        <div class="amt">${money(d+c+co)}</div></li>`).join('')}</ul>
    </div>
  </div>`;
  $('#out').querySelectorAll('.why li.pick').forEach(li=>{
    li.addEventListener('click',()=>{
      $('#mrn').value=top[+li.dataset.idx][0];
      render();
    });
  });
}

// same service + same cash value, re-billed within 2 days, is one clinical event, not several.
// priority when collapsing a cluster: a real Denied record beats an Unbilled placeholder;
// either "completed" outcome beats a "cancelled" outcome; extra repeats within a bucket collapse to one.
const DEN_TYPE=new Set(['Denied','Unbilled']);
function dedupeRows(rows){
  const groups={};
  rows.forEach(r=>{(groups[r.s+'|'+r.v]=groups[r.s+'|'+r.v]||[]).push(r);});
  const keep=new Set();
  Object.values(groups).forEach(list=>{
    list.sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0);
    let cluster=[list[0]];
    const flush=()=>{
      const denType=cluster.filter(r=>DEN_TYPE.has(r.c))
        .sort((a,b)=>(a.c==='Denied'?0:1)-(b.c==='Denied'?0:1));
      keep.add(denType.length?denType[0]:cluster[0]);
    };
    for(let i=1;i<list.length;i++){
      const gap=(new Date(list[i].d)-new Date(list[i-1].d))/864e5;
      if(gap<=2){cluster.push(list[i]);} else {flush();cluster=[list[i]];}
    }
    flush();
  });
  return rows.filter(r=>keep.has(r));
}

async function render(){
  const myReq=++REQ;
  const rawMrn=$('#mrn').value.trim(), from=$('#from').value, to=$('#to').value, out=$('#out');
  if(!rawMrn){renderLanding();return;}
  const mrn=normMrn(rawMrn);
  out.innerHTML='<div class="loading">Looking up record '+esc(mrn)+'…</div>';

  let data;
  try{
    const res=await fetch(`/api/patient/${encodeURIComponent(mrn)}?from=${from}&to=${to}`);
    if(res.status===401){location.href='/login';return;}
    data=await res.json();
  }catch(e){
    if(myReq===REQ) out.innerHTML='<div class="msg">Could not reach the server — check your connection and try again</div>';
    return;
  }
  if(myReq!==REQ) return;

  if(!data.found){
    out.innerHTML = data.exists
      ? '<div class="msg">Record '+esc(mrn)+' has no activity between '+nice(from)+' and '+nice(to)+'</div>'
      : '<div class="msg">No record '+esc(mrn)+' on file &mdash; check the number and try again</div>';
    return;
  }

  const rows=dedupeRows(data.i);
  const pick=c=>rows.filter(r=>r.c===c), sum=a=>a.reduce((t,r)=>t+r.v,0);
  const unb=pick('Unbilled');
  // unbilled is folded into the patient-facing "Completed, Rejected" bucket alongside true denials
  const den=pick('Denied').concat(unb);
  // cancelled-rejected and cancelled-other are shown as one "Cancelled, Rejected" bucket
  const canR=pick('Cancelled - rejected').concat(pick('Cancelled - other'));
  const denV=sum(den), unbV=sum(unb), canRV=sum(canR);
  // covered is held as daily totals, not item rows
  const cv=Object.entries(data.v);
  const covN=cv.reduce((t,[,x])=>t+x[0],0), covV=cv.reduce((t,[,x])=>t+x[1],0);
  const days=[...new Set([...rows.map(r=>r.d),...cv.map(([d])=>d)])].sort();
  const payer=(rows.find(r=>r.p)||{}).p||'—';
  const fee=+$('#fee').value||0;
  const bar=Math.max(covV+denV+canRV,1);
  const span=Math.round((new Date(days[days.length-1])-new Date(days[0]))/864e5)+1;

  const portalV=500;
  const copayV=Math.round(covV*0.05);
  const sessionV=SESSION_VALUE[SESSION];
  const perksV=portalV+copayV+sessionV;

  const V = VIEW==='denied'
    ? {set:den, val:denV, cls:'h-denied', eyebrow:'Your insurer rejected the claim for',
       lead:`${den.length} test${den.length===1?'':'s'} you had between ${nice(days[0])} and ${nice(days[days.length-1])}. The insurer rejected the claim, so the cost falls to you.`,
       whyHd:'Why the rejected tests matter',
       tableHd:`Completed, rejected <em>— ${nice(days[0])} to ${nice(days[days.length-1])}</em>`,
       foot:'Completed, rejected — payable by you'}
    : {set:canR, val:canRV, cls:'h-cancelled', eyebrow:'Rejected, so never carried out',
       lead:`${canR.length} test${canR.length===1?'':'s'} on the care plan were rejected and cancelled before they could be done. Nothing was charged — but the monitoring did not happen.`,
       whyHd:'Why the cancelled tests matter',
       tableHd:`Cancelled, rejected <em>— ${nice(days[0])} to ${nice(days[days.length-1])}</em>`,
       foot:'Cancelled, rejected — never carried out'};

  const shown=V.set.slice().sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:(a.s<b.s?-1:1));
  const cls={'Denied':'is-denied','Unbilled':'is-denied','Cancelled - rejected':'is-cancelled','Cancelled - other':'is-cancelled'};
  const tag={'Denied':'<span class="tag t-denied">Rejected</span>',
             'Unbilled':'<span class="tag t-denied">Rejected</span>',
             'Cancelled - rejected':'<span class="tag t-cancelled">Cancelled</span>',
             'Cancelled - other':'<span class="tag t-cancelled">Cancelled</span>'};

  // indications, de-duplicated by service, filtered by selected conditions
  const sel=conds(), seen={};
  V.set.forEach(r=>{seen[r.s]=(seen[r.s]||0)+r.v;});
  const why=Object.keys(seen).map(s=>({s,v:seen[s],i:IND[s]}))
    .filter(x=>x.i && (sel.length===0 || x.i.c.some(c=>sel.includes(c))))
    .sort((a,b)=>b.v-a.v);

  out.innerHTML=`<div class="result">
    <dl class="ident">
      <div><dt>Record</dt><dd>${esc(mrn)}</dd></div>
      <div><dt>Insurer</dt><dd>${esc(payer)}</dd></div>
      <div><dt>Visits</dt><dd>${days.length}</dd></div>
      <div><dt>First</dt><dd>${nice(days[0])}</dd></div>
      <div><dt>Last</dt><dd>${nice(days[days.length-1])}</dd></div>
    </dl>

    <div class="ledger">
      <div class="bar" role="img" aria-label="Share of value by outcome">
        <span style="width:${covV/bar*100}%;background:var(--covered)"></span>
        <span style="width:${denV/bar*100}%;background:var(--denied)"></span>
        <span style="width:${canRV/bar*100}%;background:var(--cancelled)"></span>
      </div>
      <div class="keys">
        <span class="key"><i style="background:var(--covered)"></i>Paid by insurer <b>AED ${money(covV)}</b></span>
        <span class="key"><i style="background:var(--denied)"></i>Completed, Rejected <b>AED ${money(denV)}</b></span>
        <span class="key"><i style="background:var(--cancelled)"></i>Cancelled, Rejected <b>AED ${money(canRV)}</b></span>
      </div>
    </div>

    <div class="vt" role="group" aria-label="Choose which gap to show">
      <button data-v="denied" aria-pressed="${VIEW==='denied'}">
        <span class="vl">Completed, Rejected · ${den.length} test${den.length===1?'':'s'}</span>
        <span class="vn">Done, insurer rejected — AED ${money(denV)}</span></button>
      <button data-v="cancelled" aria-pressed="${VIEW==='cancelled'}">
        <span class="vl">Cancelled, Rejected · ${canR.length} test${canR.length===1?'':'s'}</span>
        <span class="vn">Rejected, so never done — AED ${money(canRV)}</span></button>
    </div>

    ${V.set.length?`<div class="headline ${V.cls}">
      <div class="eyebrow">${V.eyebrow}</div>
      <div class="amt"><small>AED</small>${money(V.val)}</div>
      <p>${V.lead}</p></div>`
    :`<div class="headline h-clear">
      <div class="eyebrow">Nothing in this category</div>
      <div class="amt"><small>AED</small>0</div>
      <p>${VIEW==='denied'?'Every test claimed in this period was paid by the insurer.'
        :'Every test on the care plan was carried out.'} Switch views above, or lead the conversation on continuity of care rather than cost.</p></div>`}

    ${V.set.length?`
    <h2 class="sec">${V.tableHd}</h2>
    <div class="table-wrap"><table><thead><tr>
      <th></th><th>Date</th><th>Test</th><th class="payer">Insurer</th>
      <th>Outcome</th><th class="code">Reason</th><th style="text-align:right">Cash price</th>
    </tr></thead><tbody>
      ${shown.map(r=>`<tr class="${cls[r.c]}">
        <td class="flag"></td><td class="date">${nice(r.d)}</td>
        <td class="svc">${esc(r.s)}</td><td class="payer">${esc(r.p||'—')}</td>
        <td>${tag[r.c]}</td><td class="code">${esc(r.k||'—')}</td>
        <td class="val">${money(r.v)}</td></tr>`).join('')}
    </tbody><tfoot><tr>
      <td class="flag"></td><td colspan="5">${V.foot}</td>
      <td class="val">AED ${money(V.val)}</td></tr></tfoot></table></div>

    <div class="why">
      <div class="hd"><h3>${V.whyHd}</h3>
        <span class="n">${why.length} of ${Object.keys(seen).length} shown${sel.length?' · '+sel.map(c=>CN[c]).join(', '):''}</span></div>
      ${why.length?`<ul>${why.map(x=>`<li>
        <div class="bd"><div class="nm">${esc(x.s)}</div>
          <div class="tx">${esc(x.i.t)}</div>
          <div class="ct">Indicated in ${x.i.c.map(c=>CN[c]).join(' · ')}</div></div>
        <div class="amt">${money(x.v)}</div></li>`).join('')}</ul>`
      :`<div class="none">None of these tests are indicated for the conditions selected — widen the selection above</div>`}
    </div>`:''}

    <div class="case">
      <div class="hd">What membership would have changed</div>
      <div class="bd">
        <div class="perks">
          <div class="perks-hd">Membership also includes
            <span class="seg" id="sessionSeg">
              <button type="button" data-s="exercise" class="${SESSION==='exercise'?'active':''}">Exercise</button>
              <button type="button" data-s="physio" class="${SESSION==='physio'?'active':''}">Physio</button>
            </span>
          </div>
          <div class="perks-grid">
            <div class="perk-tile"><span class="perk-icon c1">${ICON_CLOCK}</span>
              <div class="perk-lbl">1 month portal monitoring</div>
              <div class="perk-val">AED ${money(portalV)}</div></div>
            <div class="perk-tile"><span class="perk-icon c2">${ICON_SHIELD}</span>
              <div class="perk-lbl">Copayment waived (5% of AED ${money(covV)} paid by insurer)</div>
              <div class="perk-val">AED ${money(copayV)}</div></div>
            <div class="perk-tile"><span class="perk-icon c3">${ICON_DUMBBELL}</span>
              <div class="perk-lbl">${SESSION_LABEL[SESSION]}</div>
              <div class="perk-val">AED ${money(sessionV)}</div></div>
            <div class="perk-tile tbd"><span class="perk-icon c4">${ICON_TAG}</span>
              <div class="perk-lbl">Discounts on select cash services</div>
              <div class="perk-val">Not yet defined</div></div>
          </div>
          <div class="perks-total"><span>Membership perks, this window</span><span>AED ${money(perksV)}</span></div>
        </div>

        <div class="compare">
          <div><div class="lbl">${VIEW==='denied'?'Paid out of pocket':'Value of care missed'}</div>
            <div class="num ${VIEW==='denied'?'neg':''}">${money(V.val)}</div>
            <div class="note">${span} days, ${nice(days[0])} – ${nice(days[days.length-1])}</div></div>
          <div><div class="lbl">Plus membership perks</div>
            <div class="num">${money(perksV)}</div>
            <div class="note">Portal, copay waiver, ${SESSION} sessions</div></div>
          <div><div class="lbl">Membership, one year</div>
            <div class="num">${money(fee)}</div>
            <div class="note">Every test listed included, no claim to file</div></div>
          <div><div class="lbl">${(V.val+perksV)>fee?'Ahead by':'Difference'}</div>
            <div class="num ${(V.val+perksV)>fee?'pos':''}">${money(Math.abs(V.val+perksV-fee))}</div>
            <div class="note">${(V.val+perksV)>fee
              ?'Covered in '+span+' days, with the rest of the year still to run'
              :'Membership costs more than this window shows — annualise it, or lead on the care plan'}</div></div>
        </div>

        <p class="say">Between ${nice(days[0])} and ${nice(days[days.length-1])} the insurer paid for
        <strong>AED ${money(covV)}</strong> of testing and rejected <strong>AED ${money(denV+canRV)}</strong>
        — ${den.length} test${den.length===1?'':'s'} already done and billed to you,
        ${canR.length} cancelled before ${canR.length===1?'it':'they'} could happen.
        Membership at AED ${money(fee)} a year covers that, plus AED ${money(perksV)} in included
        perks above — with no claim to file.</p>
      </div>
    </div>

    ${unb.length?`<div class="internal">
      <div class="hd"><span>Internal only</span><span style="opacity:.6">Do not show the patient</span>
        <button type="button" class="reveal-btn" id="staffToggle">Reveal</button></div>
      <div class="bd" id="internalBody" hidden>
        <p><span class="big">${unb.length} test${unb.length===1?'':'s'}, AED ${money(unbV)}</span>
        were performed but never submitted to ${esc(payer)}. The insurer did not reject these —
        no claim was ever filed.</p>
        <p>These are now counted inside the "Completed, Rejected" total shown to the patient above.
        There is no actual denial on file for them — if the patient calls ${esc(payer)} to verify,
        there will be no claim on record at all. Clear these through billing first, and be ready for
        that call.</p>
      </div></div>`:''}
  </div>`;

  out.querySelectorAll('.vt button').forEach(b=>b.addEventListener('click',()=>{
    VIEW=b.dataset.v;render();}));

  const st=$('#staffToggle');
  if(st) st.addEventListener('click',()=>{
    const body=$('#internalBody');
    const hidden=body.hasAttribute('hidden');
    if(hidden){body.removeAttribute('hidden');st.textContent='Hide';}
    else{body.setAttribute('hidden','');st.textContent='Reveal';}
  });

  const seg=$('#sessionSeg');
  if(seg) seg.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    SESSION=b.dataset.s;render();}));
}

$('#go').addEventListener('click',render);
$('#mrn').addEventListener('keydown',e=>{if(e.key==='Enter')render()});
['#from','#to','#fee'].forEach(s=>$(s).addEventListener('change',render));
document.querySelectorAll('.cond').forEach(c=>c.addEventListener('change',()=>{if($('#mrn').value.trim())render();}));

renderLanding();
