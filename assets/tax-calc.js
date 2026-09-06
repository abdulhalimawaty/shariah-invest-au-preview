// Financial-year 2026-27 individual resident figures.
const TAX_BRACKETS = [
  {min:0, max:18200, rate:0},
  {min:18200, max:45000, rate:0.15},
  {min:45000, max:135000, rate:0.30},
  {min:135000, max:190000, rate:0.37},
  {min:190000, max:Infinity, rate:0.45}
];
const SUPER_RATE = 0.12;

function formatAUD(n){
  const v = Number(n);
  if(!isFinite(v)) return '$0';
  // Sign before the symbol: "-$1,200", not "$-1,200".
  return (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-AU');
}

function bracketBreakdown(income){
  return TAX_BRACKETS.map(b => {
    const amountInBracket = Math.max(0, Math.min(income, b.max) - b.min);
    return {...b, amountInBracket, taxFromBracket: amountInBracket * b.rate};
  }).filter(b => b.amountInBracket > 0);
}

function incomeTax(income){
  return bracketBreakdown(income).reduce((sum, b) => sum + b.taxFromBracket, 0);
}

function lito(income){
  if(income <= 37500) return 700;
  if(income <= 45000) return 700 - (income - 37500) * 0.05;
  if(income <= 66667) return Math.max(0, 325 - (income - 45000) * 0.015);
  return 0;
}

function medicareLevyThresholds(hasFamily, children){
  if(!hasFamily) return { lower:28011, upper:35013 };
  const lower = 47238 + children * 4338;
  return { lower, upper: lower + (59047 - 47238) };
}

function medicareLevy(income, hasFamily, children){
  const { lower, upper } = medicareLevyThresholds(hasFamily, children);
  if(income <= lower) return 0;
  if(income <= upper) return Math.min(income * 0.02, (income - lower) * 0.10);
  return income * 0.02;
}

function mlsThresholds(hasFamily, children){
  if(!hasFamily) return { base:105000, t1:123000, t2:164000 };
  const extra = Math.max(0, children - 1) * 1500;
  const base = 210000 + extra;
  return { base, t1: base + 36000, t2: base + 118000 };
}

function medicareLevySurcharge(income, hasFamily, children){
  const { base, t1, t2 } = mlsThresholds(hasFamily, children);
  if(income <= base) return 0;
  if(income <= t1) return income * 0.01;
  if(income <= t2) return income * 0.0125;
  return income * 0.015;
}

/*
  Marginal HELP repayment: 15c per dollar from T1, 17c per dollar from T2, with total
  repayment capped at 10% of repayment income.

  The CAP branch is deliberate, not a stray flat rate. 186,051 is precisely where the
  marginal formula crosses 10% of income:
      9028.35 + 0.17(I - 129717) = 0.10I  ->  I = 186,050.6
  Below it the marginal result is the smaller number, above it the 10% cap binds. The
  constant 9028.35 is the carried amount at T2: (129717 - 69528) x 0.15.

  UNVERIFIED — see BUG_LOG.md. ato.gov.au returned 403 to automated fetches, and the only
  other sources are secondary calculator sites. Worth confirming against the ATO directly
  before launch, particularly whether the 10% cap survives in the marginal system.
*/
function hecsRepayment(income){
  const T1 = 69528, T2 = 129717, CAP = 186051;
  if(income < T1) return 0;
  if(income >= CAP) return income * 0.10;
  if(income <= T2) return (income - T1) * 0.15;
  return 9028.35 + (income - T2) * 0.17;
}

function splitPackage(total, mode){
  if(mode === 'included'){
    const salaryForTax = total / (1 + SUPER_RATE);
    return { salaryForTax, superAmt: total - salaryForTax };
  }
  return { salaryForTax: total, superAmt: total * SUPER_RATE };
}

function computeBreakdown(salary, hasHecs, hasCover, hasFamily, children, sacrifice){
  const taxableSalary = Math.max(0, salary - sacrifice);
  const incomeTaxAmt = incomeTax(taxableSalary);
  const litoAmt = Math.min(incomeTaxAmt, lito(taxableSalary));
  const taxAfterLito = incomeTaxAmt - litoAmt;
  const medicareAmt = medicareLevy(taxableSalary, hasFamily, children);
  const mlsAmt = hasCover ? 0 : medicareLevySurcharge(taxableSalary, hasFamily, children);
  const hecsAmt = hasHecs ? hecsRepayment(taxableSalary) : 0;
  const totalDeductions = taxAfterLito + medicareAmt + mlsAmt + hecsAmt;
  const net = taxableSalary - totalDeductions;
  return { salaryForTax: taxableSalary, sacrifice, incomeTaxAmt, litoAmt, taxAfterLito, medicareAmt, mlsAmt, hecsAmt, totalDeductions, net };
}

function render(breakdown, superAmt, grossSalary){
  const { salaryForTax, sacrifice, incomeTaxAmt, litoAmt, taxAfterLito, medicareAmt, mlsAmt, hecsAmt, net } = breakdown;
  const totalSuper = superAmt + sacrifice;

  const segs = [
    { label:'Take-home', amt:net, color:'var(--accent)' },
    { label:'Income tax', amt:taxAfterLito, color:'var(--fail)' },
    { label:'Medicare levy', amt:medicareAmt + mlsAmt, color:'var(--review)' },
    { label:'HECS-HELP', amt:hecsAmt, color:'var(--ink-muted)' }
  ].filter(s => s.amt > 0.5);

  // A zero income (empty field, or "0" typed) makes every one of these a division by
  // zero, which rendered the effective rate as "NaN%" and gave the bar NaN widths.
  const pct = (amt) => salaryForTax > 0 ? (amt / salaryForTax * 100) : 0;

  document.getElementById('taxBar').innerHTML = segs.map(s =>
    `<div class="tax-bar-seg" style="width:${pct(s.amt).toFixed(2)}%; background:${s.color};" title="${s.label}: ${formatAUD(s.amt)}"></div>`
  ).join('');

  document.getElementById('taxLegend').innerHTML = segs.map(s =>
    `<div class="tax-legend-item"><span class="tax-legend-dot" style="background:${s.color};"></span>${s.label}: <strong>${formatAUD(s.amt)}</strong> (${pct(s.amt).toFixed(1)}%)</div>`
  ).join('');

  document.getElementById('txNet').textContent = formatAUD(net);
  document.getElementById('txNetWeekly').textContent = formatAUD(net / 52);
  document.getElementById('txEffRate').textContent = pct(taxAfterLito + medicareAmt + mlsAmt).toFixed(1) + '%';

  const brackets = bracketBreakdown(salaryForTax);
  const marginal = brackets.length ? brackets[brackets.length - 1].rate : 0;
  document.getElementById('txMargRate').textContent = (marginal * 100).toFixed(0) + '%';

  document.getElementById('txSuper').textContent = formatAUD(totalSuper);
  const capWarning = document.getElementById('txCapWarning');
  if(capWarning){
    capWarning.hidden = totalSuper <= 30000;
  }

  const rows = [['Gross salary', formatAUD(grossSalary)]];
  if(sacrifice > 0) rows.push(['Salary sacrificed to super', '−' + formatAUD(sacrifice)]);
  rows.push(
    ['Taxable income', formatAUD(salaryForTax)],
    ['Income tax (before offsets)', formatAUD(incomeTaxAmt)],
    ['Low Income Tax Offset', litoAmt > 0 ? '−' + formatAUD(litoAmt) : '$0'],
    ['Income tax (after offsets)', formatAUD(taxAfterLito)],
    ['Medicare levy (2%)', formatAUD(medicareAmt)]
  );
  if(mlsAmt > 0) rows.push(['Medicare Levy Surcharge', formatAUD(mlsAmt)]);
  if(hecsAmt > 0) rows.push(['HECS-HELP repayment', formatAUD(hecsAmt)]);
  rows.push(['Take-home pay', formatAUD(net)]);
  document.querySelector('#txBreakdownTable tbody').innerHTML = rows.map(([k,v]) =>
    `<tr><td>${k}</td><td class="mono-cell">${v}</td></tr>`
  ).join('');

  document.querySelector('#txBracketTable tbody').innerHTML = brackets.map(b => {
    const label = b.max === Infinity ? `${formatAUD(b.min)}+` : `${formatAUD(b.min)} – ${formatAUD(b.max)}`;
    return `<tr><td>${label}</td><td class="mono-cell">${(b.rate*100).toFixed(0)}%</td><td class="mono-cell">${formatAUD(b.amountInBracket)}</td><td class="mono-cell">${formatAUD(b.taxFromBracket)}</td></tr>`;
  }).join('');
}

function calculateTax(){
  // A salary can't be negative or Infinity ("1e999" parses to the latter), and min="0"
  // on the input is only a hint when the handler is on a plain button.
  const rawIncome = parseFloat(document.getElementById('txIncome').value);
  const income = (isFinite(rawIncome) && rawIncome > 0) ? rawIncome : 0;
  const superMode = document.getElementById('txSuperMode').value;
  const hasHecs = document.getElementById('txHecs').value === 'yes';
  const hasCover = document.getElementById('txCover').value === 'yes';
  const hasSpouse = document.getElementById('txSpouse').value === 'yes';
  const rawChildren = parseInt(document.getElementById('txChildren').value, 10);
  const children = (isFinite(rawChildren) && rawChildren > 0) ? Math.min(rawChildren, 20) : 0;
  const rawSacrifice = parseFloat(document.getElementById('txSacrifice').value);
  const sacrifice = (isFinite(rawSacrifice) && rawSacrifice > 0) ? rawSacrifice : 0;
  const hasFamily = hasSpouse || children > 0;

  const { salaryForTax, superAmt } = splitPackage(income, superMode);
  const breakdown = computeBreakdown(salaryForTax, hasHecs, hasCover, hasFamily, children, sacrifice);

  document.getElementById('txResult').hidden = false;
  render(breakdown, superAmt, salaryForTax);
  document.getElementById('txResult').scrollIntoView({behavior:'smooth', block:'nearest'});
}

document.getElementById('txCalcBtn').addEventListener('click', calculateTax);
