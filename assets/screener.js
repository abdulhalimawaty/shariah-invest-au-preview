const ALL = [
  ...SCREENED.map(x=>({...x, status: x.st})),
  ...EXCLUDED.map(x=>({t:x.t,n:x.n,s:x.s,status:"excluded",reason:x.r})),
  ...UNSCREENED.map(t=>({t,n:t,s:"",status:"unscreened"})),
];

const STATUS_META = {
  pass:{label:"Compliant", badge:"pass"},
  fail:{label:"Non-compliant", badge:"fail"},
  review:{label:"Review", badge:"review"},
  excluded:{label:"Excluded", badge:"neutral"},
  unscreened:{label:"Not yet screened", badge:"neutral"},
};

const statStrip = document.getElementById('statStrip');
const counts = {pass:0,fail:0,review:0,excluded:0,unscreened:0};
ALL.forEach(x=>counts[x.status]++);
if(statStrip){
  statStrip.innerHTML = `
    <div class="stat pass"><div class="n">${counts.pass}</div><div class="l">Compliant</div></div>
    <div class="stat fail"><div class="n">${counts.fail+counts.review}</div><div class="l">Non-compliant / review</div></div>
    <div class="stat"><div class="n">${counts.excluded}</div><div class="l">Excluded (business activity)</div></div>
    <div class="stat"><div class="n">${counts.unscreened}</div><div class="l">Queued for screening</div></div>
  `;
}

let activeFilter = "all";
let query = "";

const chipsEl = document.getElementById('filterChips');
const chipDefs = [
  {k:"all", label:"All", count:ALL.length},
  {k:"pass", label:"Compliant", count:counts.pass},
  {k:"fail", label:"Non-compliant", count:counts.fail},
  {k:"review", label:"Review", count:counts.review},
  {k:"excluded", label:"Excluded", count:counts.excluded},
  {k:"unscreened", label:"Not screened", count:counts.unscreened},
];
if(chipsEl){
  chipsEl.innerHTML = chipDefs.map(c=>`<button class="chip" data-k="${c.k}" aria-pressed="${c.k==='all'}">${c.label} <span class="count">${c.count}</span></button>`).join('');
  chipsEl.addEventListener('click', e=>{
    const btn = e.target.closest('.chip'); if(!btn) return;
    activeFilter = btn.dataset.k;
    [...chipsEl.children].forEach(c=>c.setAttribute('aria-pressed', c===btn));
    visibleLimit = PAGE_SIZE;   // a new filter starts a fresh page
    render();
  });
}

const searchInput = document.getElementById('searchInput');
if(searchInput){
  searchInput.addEventListener('input', e=>{
    query = e.target.value.trim().toLowerCase();
    visibleLimit = PAGE_SIZE;   // a new search starts a fresh page
    render();
  });
}

const listEl = document.getElementById('list');
const emptyEl = document.getElementById('emptyState');

// Windows reserves CON/PRN/AUX/NUL/COM1-9/LPT1-9 as device names — a stock page folder can't
// use one of these bare, so we suffix it. PRN (Perenti) is the only current ticker that collides;
// this must stay identical to the slug() logic in generate-stock-pages.js.
const WIN_RESERVED = new Set(['con','prn','aux','nul','com0','com1','com2','com3','com4','com5','com6','com7','com8','com9','lpt0','lpt1','lpt2','lpt3','lpt4','lpt5','lpt6','lpt7','lpt8','lpt9']);
function slug(ticker){
  const s = ticker.toLowerCase().replace(/[^a-z0-9]/g, '');
  return WIN_RESERVED.has(s) ? s + '-asx' : s;
}

function barsHtml(x){
  if(x.status!=='pass' && x.status!=='fail' && x.status!=='review') return '<div></div>';
  const recvBar = (x.recv!==undefined) ? `<div class="bar-track"><div class="bar-fill" style="width:${Math.min(x.recv,100)}%; background:${x.recv>30?'var(--fail)':'var(--accent)'}"></div><div class="bar-thresh"></div></div>` : '';
  return `<div class="bars">
    <div class="bar-track"><div class="bar-fill" style="width:${Math.min(x.debt,100)}%; background:${x.debt>30?'var(--fail)':'var(--accent)'}"></div><div class="bar-thresh"></div></div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.min(x.cash,100)}%; background:${x.cash>30?'var(--fail)':'var(--accent)'}"></div><div class="bar-thresh"></div></div>
    ${recvBar}
  </div>`;
}

function detailHtml(x){
  if(x.status==='pass'||x.status==='fail'||x.status==='review'){
    const recvItem = (x.recv!==undefined) ? `<div class="detail-item"><div class="k">Receivables / market cap</div><div class="v">${x.recv.toFixed(1)}% <span style="color:var(--ink-muted); font-weight:400;">(limit 30%)</span></div></div>` : `<div class="detail-item"><div class="k">Receivables / market cap</div><div class="v" style="color:var(--ink-muted); font-weight:400;">Not checked — already fails another ratio</div></div>`;
    return `<div class="detail-grid">
      <div class="detail-item"><div class="k">Market cap</div><div class="v">$${x.mc.toFixed(2)}B AUD</div></div>
      <div class="detail-item"><div class="k">Debt / market cap</div><div class="v">${x.debt.toFixed(1)}% <span style="color:var(--ink-muted); font-weight:400;">(limit 30%)</span></div></div>
      <div class="detail-item"><div class="k">Cash+securities / market cap</div><div class="v">${x.cash.toFixed(1)}% <span style="color:var(--ink-muted); font-weight:400;">(limit 30%)</span></div></div>
      ${recvItem}
    </div>
    <div class="note">${x.note}</div>
    <p style="margin-top:10px;"><a href="${slug(x.t)}/" style="font-size:13px; font-weight:700;">View full page for ${x.t} →</a></p>`;
  }
  if(x.status==='excluded'){
    return `<div class="note"><strong style="color:var(--ink)">Excluded on business activity:</strong> ${x.reason}. No ratio screen applied — this stock is out regardless of its balance sheet.</div>
    <p style="margin-top:10px;"><a href="${slug(x.t)}/" style="font-size:13px; font-weight:700;">View full page for ${x.t} →</a></p>`;
  }
  return `<div class="note">Business-activity and ratio screening hasn't been run on this stock yet. It's in the queue for the next data pass — check back, or search for a name we've already covered above.</div>`;
}

// Rendering all 199 rows up front pushed Largest Contentful Paint to ~8s on a throttled
// phone: the browser kept re-attributing LCP to each later, larger paint as the list grew.
// Showing a first page and revealing the rest on demand fixes that, and 199 rows was a lot
// to scroll on mobile anyway. Search and filtering still run across the FULL dataset —
// only the number of rows painted is capped.
const PAGE_SIZE = 25;
let visibleLimit = PAGE_SIZE;

function render(){
  if(!listEl) return;
  let items = ALL.filter(x=> activeFilter==='all' || x.status===activeFilter);
  if(query){
    items = items.filter(x=> x.t.toLowerCase().includes(query) || (x.n||'').toLowerCase().includes(query));
  }
  emptyEl.hidden = items.length>0;

  const total = items.length;
  const shown = Math.min(visibleLimit, total);
  items = items.slice(0, shown);

  listEl.innerHTML = items.map(x=>{
    const meta = STATUS_META[x.status];
    return `<div class="row" data-open="false" data-t="${x.t}">
      <div class="row-head" tabindex="0" role="button" aria-expanded="false">
        <div class="tick">${x.t}</div>
        <div class="name-cell"><div class="name">${x.n}</div><div class="sector">${x.s||''}</div></div>
        <div class="badge ${meta.badge}"><span class="dot"></span>${meta.label}</div>
        ${barsHtml(x)}
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="row-detail"><div class="row-detail-inner">${detailHtml(x)}</div></div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.row-head').forEach(head=>{
    const toggle = ()=>{
      const row = head.closest('.row');
      const open = row.dataset.open === 'true';
      row.dataset.open = open ? 'false' : 'true';
      head.setAttribute('aria-expanded', String(!open));
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
  });

  renderShowMore(shown, total);
}

function renderShowMore(shown, total){
  const wrap = document.getElementById('showMoreWrap');
  if(!wrap) return;
  if(shown >= total){
    wrap.innerHTML = total > PAGE_SIZE
      ? `<p class="list-count">Showing all ${total} stocks.</p>`
      : '';
    return;
  }
  wrap.innerHTML = `<p class="list-count">Showing ${shown} of ${total} stocks.</p>
    <button type="button" class="btn btn-secondary" id="showMoreBtn">Show ${Math.min(PAGE_SIZE, total - shown)} more</button>
    <button type="button" class="linklike" id="showAllBtn">Show all ${total}</button>`;
  document.getElementById('showMoreBtn').addEventListener('click', ()=>{
    visibleLimit += PAGE_SIZE;
    render();
  });
  document.getElementById('showAllBtn').addEventListener('click', ()=>{
    visibleLimit = Infinity;
    render();
  });
}

const unscreenedListEl = document.getElementById('unscreenedList');
if(unscreenedListEl){
  unscreenedListEl.innerHTML = UNSCREENED.map(t=>`<span class="mini-chip">${t}</span>`).join('');
}

render();
