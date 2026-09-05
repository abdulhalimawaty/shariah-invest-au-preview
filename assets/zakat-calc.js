const ZAKAT_RATE = 0.025;

// Nisab is defined by weight of metal, so we fetch a live spot price and convert to AUD.
// gold-api returns USD per troy ounce; er-api gives the USD->AUD rate.
const NISAB_GRAMS = { silver: 612.36, gold: 85 };
const METAL_SYMBOL = { silver: 'XAG', gold: 'XAU' };
const METAL_LABEL = { silver: 'Silver', gold: 'Gold' };
const GRAMS_PER_TROY_OZ = 31.1034768;

// pricePerGramAUD is whatever the currently selected standard resolved to (live or manual).
const nisabState = { standard: 'silver', pricePerGramAUD: null, asOf: '', status: 'loading', manual: false };

function selectedStandard(){
  const el = document.getElementById('inNisabStandard');
  return (el && el.value === 'gold') ? 'gold' : 'silver';
}

function currentNisabAUD(){
  if(!nisabState.pricePerGramAUD) return null;
  return NISAB_GRAMS[nisabState.standard] * nisabState.pricePerGramAUD;
}

async function loadNisab(){
  const standard = selectedStandard();
  nisabState.standard = standard;
  nisabState.status = 'loading';
  nisabState.manual = false;
  renderNisabLive();

  try {
    const [metalRes, fxRes] = await Promise.all([
      fetch(`https://api.gold-api.com/price/${METAL_SYMBOL[standard]}`),
      fetch('https://open.er-api.com/v6/latest/USD'),
    ]);
    if(!metalRes.ok || !fxRes.ok) throw new Error('price service unavailable');
    const metal = await metalRes.json();
    const fx = await fxRes.json();
    const usdPerOz = Number(metal && metal.price);
    const audPerUsd = Number(fx && fx.rates && fx.rates.AUD);
    if(!isFinite(usdPerOz) || usdPerOz <= 0 || !isFinite(audPerUsd) || audPerUsd <= 0){
      throw new Error('unexpected price data');
    }
    nisabState.pricePerGramAUD = (usdPerOz / GRAMS_PER_TROY_OZ) * audPerUsd;
    nisabState.asOf = metal.updatedAt ? new Date(metal.updatedAt).toLocaleDateString('en-AU', {day:'numeric', month:'short', year:'numeric'}) : '';
    nisabState.status = 'ok';
  } catch (err) {
    // Network blocked, offline, or the service changed shape — fall back to manual entry
    // rather than leaving the calculator unusable.
    nisabState.pricePerGramAUD = null;
    nisabState.status = 'failed';
  }
  renderNisabLive();
}

function renderNisabLive(){
  const el = document.getElementById('nisabLive');
  if(!el) return;
  const standard = nisabState.standard;
  const grams = NISAB_GRAMS[standard];
  const metal = METAL_LABEL[standard];

  if(nisabState.status === 'loading'){
    el.innerHTML = `<div class="calc-match warn">Fetching today’s ${metal.toLowerCase()} price…</div>`;
    return;
  }

  if(nisabState.status === 'failed'){
    el.innerHTML = `<div class="calc-match warn">
        Couldn’t reach the live price service just now. Enter today’s ${metal.toLowerCase()} price per gram in AUD and the threshold will update.
      </div>
      <div class="calc-field" style="margin-top:10px;">
        <label for="inManualPrice">${metal} price per gram (AUD)</label>
        <input type="number" id="inManualPrice" class="calc-input" min="0" step="0.01" placeholder="e.g. 2.95">
      </div>
      <div id="manualNisabOut" class="calc-match warn" style="margin-top:8px;">Nisab (${grams}g ${metal.toLowerCase()}): —</div>`;
    const manual = document.getElementById('inManualPrice');
    if(manual){
      manual.addEventListener('input', () => {
        const v = parseFloat(manual.value);
        nisabState.pricePerGramAUD = (isFinite(v) && v > 0) ? v : null;
        nisabState.manual = true;
        const outEl = document.getElementById('manualNisabOut');
        const n = currentNisabAUD();
        if(outEl){
          outEl.className = n ? 'calc-match ok' : 'calc-match warn';
          outEl.innerHTML = n
            ? `Nisab (${grams}g ${metal.toLowerCase()}): <strong>${formatAUD(n)}</strong>`
            : `Nisab (${grams}g ${metal.toLowerCase()}): —`;
        }
      });
    }
    return;
  }

  const nisab = currentNisabAUD();
  el.innerHTML = `<div class="calc-match ok">
      Nisab today (${grams}g of ${metal.toLowerCase()}): <strong>${formatAUD(nisab)}</strong>
      <span style="display:block; margin-top:4px; font-weight:400;">Based on a live ${metal.toLowerCase()} spot price of ${formatAUD(nisabState.pricePerGramAUD)}/g AUD${nisabState.asOf ? ', ' + nisabState.asOf : ''}. If your wealth is below this, zakat isn’t due.</span>
    </div>`;
}

let shareRows = [];
let rowId = 0;

function findStock(ticker){
  const t = ticker.trim().toUpperCase();
  if(!t) return null;
  return SCREENED.find(x => x.t === t) || null;
}

function addShareRow(){
  const id = rowId++;
  shareRows.push({id, ticker:'', value:'', method:'full'});
  renderShareRows();
}

function removeShareRow(id){
  shareRows = shareRows.filter(r => r.id !== id);
  renderShareRows();
}

function renderShareRows(){
  const wrap = document.getElementById('shareRows');
  if(shareRows.length === 0){
    wrap.innerHTML = '<p class="muted-cell" style="font-size:13.5px; margin:4px 0 12px;">No ASX holdings added yet.</p>';
    return;
  }
  wrap.innerHTML = shareRows.map(r => {
    const stock = findStock(r.ticker);
    const zakatable = (stock && stock.recv !== undefined) ? (stock.cash + stock.recv) : null;
    let matchNote;
    if(!r.ticker){
      matchNote = '';
    } else if(stock && zakatable !== null){
      matchNote = `<div class="calc-match ok">Matched ${stock.n} — cash ${stock.cash.toFixed(1)}% + receivables ${stock.recv.toFixed(1)}% = <strong>${zakatable.toFixed(1)}% zakatable under the precise method</strong>.</div>`;
    } else if(stock){
      matchNote = `<div class="calc-match warn">Matched ${stock.n}, but no receivables figure on file for this stock (it already fails another ratio) — use full market value instead.</div>`;
    } else {
      matchNote = `<div class="calc-match warn">Not found in our screened list — full market value will be used unless you know the figure yourself.</div>`;
    }
    return `<div class="calc-row" data-id="${r.id}">
      <div class="calc-row-grid">
        <input type="text" class="calc-input ticker-input" placeholder="Ticker e.g. BHP" value="${r.ticker}" data-field="ticker" maxlength="6">
        <input type="number" class="calc-input" placeholder="Market value (AUD)" value="${r.value}" data-field="value" min="0" step="0.01">
        <select class="calc-input" data-field="method">
          <option value="full" ${r.method==='full'?'selected':''}>Full market value</option>
          <option value="precise" ${r.method==='precise'?'selected':''} ${zakatable===null?'disabled':''}>Precise method (cash+receivables)</option>
        </select>
        <button type="button" class="calc-remove" data-remove="${r.id}" aria-label="Remove">✕</button>
      </div>
      ${matchNote}
    </div>`;
  }).join('');

  wrap.querySelectorAll('.calc-row').forEach(rowEl => {
    const id = Number(rowEl.dataset.id);
    rowEl.querySelectorAll('[data-field]').forEach(inputEl => {
      inputEl.addEventListener('input', e => {
        const row = shareRows.find(r => r.id === id);
        row[e.target.dataset.field] = e.target.value;
        if(e.target.dataset.field === 'ticker') renderShareRows();
      });
    });
  });
  wrap.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeShareRow(Number(btn.dataset.remove)));
  });
}

function calculate(){
  const cash = parseFloat(document.getElementById('inCash').value) || 0;
  const goldSilver = parseFloat(document.getElementById('inGoldSilver').value) || 0;
  const otherAssets = parseFloat(document.getElementById('inOther').value) || 0;
  const liabilities = parseFloat(document.getElementById('inLiabilities').value) || 0;

  let sharesTotal = 0;
  shareRows.forEach(r => {
    const value = parseFloat(r.value) || 0;
    const stock = findStock(r.ticker);
    if(r.method === 'precise' && stock && stock.recv !== undefined){
      const pct = (stock.cash + stock.recv) / 100;
      sharesTotal += value * pct;
    } else {
      sharesTotal += value;
    }
  });

  const totalZakatable = cash + goldSilver + otherAssets + sharesTotal - liabilities;
  const nisab = currentNisabAUD();
  const aboveNisab = nisab !== null && totalZakatable >= nisab;
  const zakatDue = aboveNisab ? totalZakatable * ZAKAT_RATE : 0;

  const resultEl = document.getElementById('calcResult');
  resultEl.hidden = false;

  document.getElementById('resTotal').textContent = formatAUD(totalZakatable);
  document.getElementById('resNisab').textContent = nisab !== null ? formatAUD(nisab) : '— price unavailable';
  document.getElementById('resShares').textContent = formatAUD(sharesTotal);

  const verdictEl = document.getElementById('resVerdict');
  const dueEl = document.getElementById('resDue');
  if(nisab === null){
    verdictEl.textContent = 'Enter today’s metal price above to check the nisab threshold.';
    verdictEl.className = 'calc-verdict warn';
    dueEl.textContent = '—';
  } else if(aboveNisab){
    verdictEl.textContent = 'Above nisab — zakat is due.';
    verdictEl.className = 'calc-verdict pass';
    dueEl.textContent = formatAUD(zakatDue);
  } else {
    verdictEl.textContent = 'Below nisab — zakat is not due this year on this wealth.';
    verdictEl.className = 'calc-verdict neutral';
    dueEl.textContent = formatAUD(0);
  }

  resultEl.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function formatAUD(n){
  return '$' + n.toLocaleString('en-AU', {minimumFractionDigits:2, maximumFractionDigits:2});
}

document.getElementById('addShareBtn').addEventListener('click', addShareRow);
document.getElementById('calcBtn').addEventListener('click', calculate);

const nisabStandardEl = document.getElementById('inNisabStandard');
if(nisabStandardEl){
  nisabStandardEl.addEventListener('change', () => {
    loadNisab().then(() => {
      // If a result is already on screen, keep it in step with the new standard.
      const resultEl = document.getElementById('calcResult');
      if(resultEl && !resultEl.hidden) calculate();
    });
  });
}

renderShareRows();
loadNisab();
