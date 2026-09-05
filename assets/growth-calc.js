function formatAUD2(n){
  return '$' + Math.round(n).toLocaleString('en-AU');
}

function formatAxis(v){
  if(v >= 1000) return '$' + (v/1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return '$' + v.toFixed(0);
}

function computeSeries(start, monthly, annualRatePct, years){
  const rMonthly = (annualRatePct / 100) / 12;
  const points = [];
  let balance = start;
  let contributed = start;
  points.push({month:0, year:0, balance, contributed});
  const totalMonths = years * 12;
  for(let m = 1; m <= totalMonths; m++){
    balance = balance * (1 + rMonthly) + monthly;
    contributed += monthly;
    points.push({month:m, year: m/12, balance, contributed});
  }
  return points;
}

let chartState = null;

function drawChart(points){
  const svg = document.getElementById('growthChart');
  const w = 640, h = 300, padL = 60, padB = 34, padT = 16, padR = 16;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const totalYears = points[points.length-1].year;
  const maxVal = Math.max(...points.map(p => p.balance));
  const niceMax = Math.ceil(maxVal / Math.pow(10, Math.floor(Math.log10(maxVal || 1)))) * Math.pow(10, Math.floor(Math.log10(maxVal || 1)));
  const yMax = niceMax > 0 ? niceMax : 1;
  const xFor = (year) => padL + (year / totalYears) * plotW;
  const yFor = (val) => padT + plotH - (val / yMax) * plotH;

  const balPath = points.map((p,i) => `${i===0?'M':'L'} ${xFor(p.year).toFixed(1)} ${yFor(p.balance).toFixed(1)}`).join(' ');
  const contribPath = points.map((p,i) => `${i===0?'M':'L'} ${xFor(p.year).toFixed(1)} ${yFor(p.contributed).toFixed(1)}`).join(' ');
  const contribPathReversed = [...points].reverse().map(p => `L ${xFor(p.year).toFixed(1)} ${yFor(p.contributed).toFixed(1)}`).join(' ');
  const compoundingAreaPath = balPath + ' ' + contribPathReversed + ' Z';
  const last = points[points.length-1];

  const yearlyPoints = points.filter(p => Number.isInteger(p.year));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => f * yMax);
  const yGrid = yTicks.map(v => `
    <line x1="${padL}" y1="${yFor(v).toFixed(1)}" x2="${w-padR}" y2="${yFor(v).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
    <text x="${padL-10}" y="${(yFor(v)+4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink-muted)" font-family="'Instrument Sans', sans-serif" font-variant-numeric="tabular-nums">${formatAxis(v)}</text>
  `).join('');

  const xLabelEvery = yearlyPoints.length > 12 ? Math.ceil(yearlyPoints.length/8) : 1;
  const xTicks = yearlyPoints.filter((p,i)=> i % xLabelEvery === 0 || i === yearlyPoints.length-1).map(p => `
    <text x="${xFor(p.year).toFixed(1)}" y="${h-padB+20}" text-anchor="middle" font-size="11" fill="var(--ink-muted)" font-family="'Instrument Sans', sans-serif" font-variant-numeric="tabular-nums">Yr ${p.year}</text>
  `).join('');

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `
    ${yGrid}
    ${xTicks}
    <path d="${compoundingAreaPath}" fill="var(--accent)" opacity="0.14"/>
    <path d="${contribPath}" fill="none" stroke="var(--ink-muted)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <path d="${balPath}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
    <circle cx="${xFor(last.year).toFixed(1)}" cy="${yFor(last.balance).toFixed(1)}" r="4" fill="var(--accent)"/>
    <g id="hoverLayer" style="display:none;">
      <line id="hoverLine" x1="0" y1="${padT}" x2="0" y2="${h-padB}" stroke="var(--ink-muted)" stroke-width="1" stroke-dasharray="3 3"/>
      <circle id="hoverDotBal" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
      <circle id="hoverDotContrib" r="4" fill="var(--ink-muted)" stroke="var(--surface)" stroke-width="2"/>
      <g id="hoverTip">
        <rect id="tipRect" rx="8" ry="8" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1"/>
        <text id="tipYear" font-size="10.5" font-weight="700" fill="var(--ink-muted)" font-family="'Instrument Sans',sans-serif" letter-spacing="0.02em"></text>
        <text id="tipBalance" font-size="14" font-weight="700" fill="var(--ink)" font-family="'Instrument Sans', sans-serif" font-variant-numeric="tabular-nums"></text>
        <text id="tipContrib" font-size="10.5" fill="var(--ink-muted)" font-family="'Instrument Sans', sans-serif" font-variant-numeric="tabular-nums"></text>
      </g>
    </g>
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor:crosshair;"/>
  `;

  chartState = {points, totalYears, w, h, padL, padR, padT, padB, plotW, plotH, xFor, yFor};
  setReadout(last.year, last.balance, last.contributed);
}

function pointAtYear(year){
  const {points} = chartState;
  const monthFloat = year * 12;
  const i0 = Math.max(0, Math.min(points.length-1, Math.floor(monthFloat)));
  const i1 = Math.min(points.length-1, i0+1);
  const t = monthFloat - i0;
  const p0 = points[i0], p1 = points[i1];
  return {
    year,
    balance: p0.balance + (p1.balance - p0.balance) * t,
    contributed: p0.contributed + (p1.contributed - p0.contributed) * t
  };
}

function setReadout(year, balance, contributed){
  const yearEl = document.getElementById('croYear');
  if(!yearEl) return;
  yearEl.textContent = year.toFixed(1).replace(/\.0$/, '');
  document.getElementById('croBalance').textContent = formatAUD2(balance);
  document.getElementById('croContributed').textContent = formatAUD2(contributed);
  document.getElementById('croGrowth').textContent = formatAUD2(balance - contributed);
}

function positionTooltip(x, y, year, balance, contributed){
  const { w, padT, padR } = chartState;
  const boxW = 108, boxH = 52, pad = 9;
  let boxX = x + 14;
  if(boxX + boxW > w - padR) boxX = x - boxW - 14;
  let boxY = y - boxH - 12;
  if(boxY < padT) boxY = y + 14;

  document.getElementById('tipRect').setAttribute('x', boxX);
  document.getElementById('tipRect').setAttribute('y', boxY);
  document.getElementById('tipRect').setAttribute('width', boxW);
  document.getElementById('tipRect').setAttribute('height', boxH);

  const yearLabel = year.toFixed(1).replace(/\.0$/, '');
  const tYear = document.getElementById('tipYear');
  tYear.setAttribute('x', boxX + pad); tYear.setAttribute('y', boxY + 16); tYear.textContent = 'Year ' + yearLabel;
  const tBal = document.getElementById('tipBalance');
  tBal.setAttribute('x', boxX + pad); tBal.setAttribute('y', boxY + 32); tBal.textContent = formatAUD2(balance);
  const tContrib = document.getElementById('tipContrib');
  tContrib.setAttribute('x', boxX + pad); tContrib.setAttribute('y', boxY + 45); tContrib.textContent = 'Contributed ' + formatAUD2(contributed);
}

function handleHover(clientX){
  if(!chartState) return;
  const svg = document.getElementById('growthChart');
  const rect = svg.getBoundingClientRect();
  if(rect.width === 0) return;
  const { w, padL, plotW, totalYears, xFor, yFor } = chartState;
  const scaleX = w / rect.width;
  const localX = (clientX - rect.left) * scaleX;
  const year = Math.max(0, Math.min(totalYears, ((localX - padL) / plotW) * totalYears));
  const { balance, contributed } = pointAtYear(year);

  const hoverLayer = document.getElementById('hoverLayer');
  if(!hoverLayer) return;
  hoverLayer.style.display = '';
  const x = xFor(year);
  document.getElementById('hoverLine').setAttribute('x1', x.toFixed(1));
  document.getElementById('hoverLine').setAttribute('x2', x.toFixed(1));
  document.getElementById('hoverDotBal').setAttribute('cx', x.toFixed(1));
  document.getElementById('hoverDotBal').setAttribute('cy', yFor(balance).toFixed(1));
  document.getElementById('hoverDotContrib').setAttribute('cx', x.toFixed(1));
  document.getElementById('hoverDotContrib').setAttribute('cy', yFor(contributed).toFixed(1));
  positionTooltip(x, yFor(balance), year, balance, contributed);

  setReadout(year, balance, contributed);
}

function resetHover(){
  if(!chartState) return;
  const hoverLayer = document.getElementById('hoverLayer');
  if(hoverLayer) hoverLayer.style.display = 'none';
  const last = chartState.points[chartState.points.length - 1];
  setReadout(last.year, last.balance, last.contributed);
}

function calculateGrowth(){
  const start = parseFloat(document.getElementById('gStart').value) || 0;
  const monthly = parseFloat(document.getElementById('gMonthly').value) || 0;
  const rate = parseFloat(document.getElementById('gRate').value) || 0;
  const years = parseInt(document.getElementById('gYears').value) || 0;

  if(years <= 0){ return; }

  const points = computeSeries(start, monthly, rate, years);
  const final = points[points.length-1];

  document.getElementById('gResult').hidden = false;
  document.getElementById('resFinal').textContent = formatAUD2(final.balance);
  document.getElementById('resContributed').textContent = formatAUD2(final.contributed);
  document.getElementById('resGrowth').textContent = formatAUD2(final.balance - final.contributed);

  drawChart(points);
  document.getElementById('gResult').scrollIntoView({behavior:'smooth', block:'nearest'});
}

document.getElementById('gCalcBtn').addEventListener('click', calculateGrowth);

const growthSvgEl = document.getElementById('growthChart');
growthSvgEl.addEventListener('mousemove', e => handleHover(e.clientX));
growthSvgEl.addEventListener('mouseleave', resetHover);
growthSvgEl.addEventListener('touchmove', e => {
  if(e.touches[0]){ handleHover(e.touches[0].clientX); e.preventDefault(); }
}, {passive:false});
growthSvgEl.addEventListener('touchend', resetHover);
