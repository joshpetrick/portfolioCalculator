let state;
let projection;
let valueChart;
let incomeChart;

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);
const frequencies = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'NONE'];

async function api(url, opts) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}

async function load() {
    state = await api('/api/portfolio');
    renderForms();
    await refreshProjection();
    renderHoldings();
}

async function refreshProjection() {
    const years = $('years').value;
    $('slider').value = years;
    $('projectionCsv').href = `/api/export/projection.csv?years=${years}`;
    projection = await api(`/api/projection?years=${years}&scenario=${$('scenario').value}`);
    renderDashboard();
    renderCharts();
}

function renderDashboard() {
    const s = projection.summary;
    $('dashboard').innerHTML = [
        ['Portfolio value', money(s.portfolioValue)],
        ['Dividend income', money(s.dividendIncome)],
        ['Projected shares', s.shareCount.toFixed(2)],
        ['Total contributions', money(s.contributions)],
        ['Total RSU value', money(s.rsuValue)],
        ['Combined net value', money(s.combinedValue)]
    ].map(item => `<div class="card"><span class="muted">${item[0]}</span><br><b>${item[1]}</b></div>`).join('');

    $('dividendSummary').innerHTML = `Projected cumulative income: <b>${money(s.dividendIncome)}</b><br>Current annual run-rate estimate: <b>${money(state.holdings.reduce((sum, h) => sum + h.shares * h.dividendAmount * paymentsPerYear(h.dividendFrequency), 0))}</b>`;
    $('rsuSummary').innerHTML = `Annual grant: <b>${money(state.activeScenario.rsuSettings.annualGrantValue)}</b><br>Growth: <b>${state.activeScenario.rsuSettings.expectedAnnualGrowthPercent}%</b><br>Included: <b>${state.activeScenario.rsuSettings.includeInProjection ? 'Yes' : 'No'}</b>`;
}

function paymentsPerYear(frequency) {
    return { MONTHLY: 12, QUARTERLY: 4, SEMIANNUAL: 2, ANNUAL: 1, NONE: 0 }[frequency] || 0;
}

function renderCharts() {
    const labels = projection.points.map(p => `M${p.month}`);
    const ds = (label, data, color) => ({ label, data, borderColor: color, backgroundColor: `${color}33`, tension: 0.25, fill: false });
    valueChart?.destroy();
    incomeChart?.destroy();
    valueChart = new Chart($('valueChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                ds('Portfolio', projection.points.map(p => p.portfolioValue), '#2563eb'),
                ds('RSUs', projection.points.map(p => p.rsuValue), '#14b8a6'),
                ds('Combined', projection.points.map(p => p.combinedValue), '#f59e0b'),
                ds('Contributions', projection.points.map(p => p.contributions), '#8b5cf6')
            ]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Portfolio value over time' } } }
    });
    incomeChart = new Chart($('incomeChart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Cumulative dividends', data: projection.points.map(p => p.dividendIncome), backgroundColor: '#22c55e88' },
                { label: 'Growth value', data: projection.points.map(p => p.growthValue), backgroundColor: '#3b82f688' }
            ]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Dividend income and growth' } } }
    });
}

function renderForms() {
    $('holdingForm').innerHTML = `
        ${field('ticker', 'Ticker symbol', 'text', { required: true, pattern: '[A-Za-z.]{1,10}', hint: 'Required. Example: VTI, SCHD, MSFT.' })}
        ${field('name', 'Company / fund name', 'text', { required: true, hint: 'Required. Lookup can fill this after ticker entry.' })}
        ${field('shares', 'Shares owned', 'number', { required: true, min: 0.000001, hint: 'Required. Fractional shares are supported.' })}
        ${field('currentPrice', 'Current share price', 'number', { min: 0, hint: 'Lookup fills this from public quote data; editable.' })}
        ${field('dividendAmount', 'Dividend per payment', 'number', { min: 0, hint: 'Lookup estimates this from annual dividend data.' })}
        <label>Dividend frequency
            <select name="dividendFrequency">${frequencies.map(x => `<option>${x}</option>`).join('')}</select>
            <span class="hint">Lookup defaults dividend payers to quarterly when frequency is unavailable.</span>
        </label>
        <label>${fieldLabel('expectedAnnualPriceGrowthPercent', 'Expected annual price growth %')}<input name="expectedAnnualPriceGrowthPercent" type="number" step="any" value="6"></label>
        <label>${fieldLabel('expectedAnnualDividendGrowthPercent', 'Expected annual dividend growth %')}<input name="expectedAnnualDividendGrowthPercent" type="number" step="any" value="3"></label>
        <label><input type="checkbox" name="reinvestDividends" checked> Reinvest dividends</label>
        <div class="form-actions">
            <button id="lookupQuote" class="secondary" type="button">Lookup public price & dividend info</button>
            <button type="submit">Add to portfolio</button>
        </div>`;

    const a = state.activeScenario;
    $('assumptionForm').innerHTML = `
        <label>Scenario name<input name="name" required value="${a.name}"></label>
        <label>Per paycheck<input name="contributionPerPaycheck" type="number" step="any" min="0" value="${a.assumptions.contributionPerPaycheck}"></label>
        <label>Pay frequency<select name="paycheckFrequency">${['WEEKLY', 'BIWEEKLY', 'MONTHLY'].map(x => `<option ${a.assumptions.paycheckFrequency === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Yearly contribution<input name="yearlyContributionAmount" type="number" step="any" min="0" value="${a.assumptions.yearlyContributionAmount}"></label>
        <label>Yearly month<input name="yearlyContributionMonth" type="number" min="1" max="12" value="${a.assumptions.yearlyContributionMonth}"></label>
        <label><input name="contributionsEnabled" type="checkbox" ${a.assumptions.contributionsEnabled ? 'checked' : ''}> Enable contributions</label>
        <label>Annual RSU grant<input name="annualGrantValue" type="number" step="any" min="0" value="${a.rsuSettings.annualGrantValue}"></label>
        <label>RSU growth %<input name="expectedAnnualGrowthPercent" type="number" step="any" value="${a.rsuSettings.expectedAnnualGrowthPercent}"></label>
        <label><input name="includeInProjection" type="checkbox" ${a.rsuSettings.includeInProjection ? 'checked' : ''}> Include RSUs</label>
        <button type="submit">Save assumptions</button>`;

    $('lookupQuote').onclick = lookupQuote;
}

function field(name, label, type, options = {}) {
    return `<label>${fieldLabel(name, label)}<input name="${name}" type="${type}" step="any" ${options.required ? 'required' : ''} ${options.pattern ? `pattern="${options.pattern}"` : ''} ${options.min !== undefined ? `min="${options.min}"` : ''}>${options.hint ? `<span class="hint">${options.hint}</span>` : ''}</label>`;
}

function fieldLabel(_name, label) {
    return `${label}${['Ticker symbol', 'Company / fund name', 'Shares owned'].includes(label) ? ' <span class="required">*</span>' : ''}`;
}

async function lookupQuote() {
    const form = $('holdingForm');
    const ticker = form.elements.ticker.value.trim();
    setStatus('');
    if (!ticker) {
        form.elements.ticker.reportValidity();
        setStatus('Enter a ticker before lookup.', 'error');
        return;
    }
    try {
        setStatus(`Looking up ${ticker.toUpperCase()}...`);
        const quote = await api(`/api/market-data/${encodeURIComponent(ticker)}`);
        form.elements.ticker.value = quote.ticker;
        form.elements.name.value = quote.name;
        form.elements.currentPrice.value = quote.currentPrice || 0;
        form.elements.dividendAmount.value = quote.dividendAmount || 0;
        form.elements.dividendFrequency.value = quote.dividendFrequency;
        setStatus(`Filled ${quote.name} (${quote.ticker}) at ${money(quote.currentPrice)} with estimated ${quote.dividendFrequency.toLowerCase()} dividend data.`, 'ok');
    } catch (error) {
        setStatus(`Lookup failed: ${error.message}. You can still enter price and dividend fields manually.`, 'error');
    }
}

function setStatus(message, type = '') {
    $('lookupStatus').textContent = message;
    $('lookupStatus').className = `status ${type}`;
}

function renderHoldings() {
    $('holdings').innerHTML = state.holdings.map(h => `
        <tr>
            ${['ticker', 'name', 'shares', 'currentPrice', 'dividendAmount'].map(k => `<td><input data-id="${h.id}" data-k="${k}" value="${h[k]}"></td>`).join('')}
            <td><select data-id="${h.id}" data-k="dividendFrequency">${frequencies.map(x => `<option ${h.dividendFrequency === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
            <td><input type="checkbox" data-id="${h.id}" data-k="reinvestDividends" ${h.reinvestDividends ? 'checked' : ''}></td>
            <td>${h.expectedAnnualPriceGrowthPercent || 0}% / ${h.expectedAnnualDividendGrowthPercent || 0}%</td>
            <td><button class="danger" onclick="del('${h.id}')">Delete</button></td>
        </tr>`).join('');
    document.querySelectorAll('#holdings input,#holdings select').forEach(el => el.onchange = inlineEdit);
}

async function inlineEdit(event) {
    const h = state.holdings.find(x => x.id === event.target.dataset.id);
    const k = event.target.dataset.k;
    h[k] = event.target.type === 'checkbox' ? event.target.checked : (event.target.type === 'number' ? Number(event.target.value) : event.target.value);
    state = await api(`/api/holdings/${h.id}`, { method: 'PUT', body: JSON.stringify(h) });
    await refreshProjection();
    renderHoldings();
}

async function del(id) {
    state = await api(`/api/holdings/${id}`, { method: 'DELETE' });
    await refreshProjection();
    renderHoldings();
}

$('holdingForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const holding = Object.fromEntries(data);
    ['shares', 'currentPrice', 'dividendAmount', 'expectedAnnualPriceGrowthPercent', 'expectedAnnualDividendGrowthPercent']
        .forEach(k => holding[k] = Number(holding[k] || 0));
    holding.reinvestDividends = data.has('reinvestDividends');
    state = await api('/api/holdings', { method: 'POST', body: JSON.stringify(holding) });
    form.reset();
    form.elements.reinvestDividends.checked = true;
    form.elements.expectedAnnualPriceGrowthPercent.value = 6;
    form.elements.expectedAnnualDividendGrowthPercent.value = 3;
    setStatus('Holding added to portfolio.', 'ok');
    await refreshProjection();
    renderHoldings();
};

$('assumptionForm').onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.target);
    const scenario = {
        id: state.activeScenario.id,
        name: data.get('name'),
        assumptions: {
            contributionPerPaycheck: +data.get('contributionPerPaycheck'),
            paycheckFrequency: data.get('paycheckFrequency'),
            yearlyContributionAmount: +data.get('yearlyContributionAmount'),
            yearlyContributionMonth: +data.get('yearlyContributionMonth'),
            contributionsEnabled: data.has('contributionsEnabled')
        },
        rsuSettings: {
            annualGrantValue: +data.get('annualGrantValue'),
            expectedAnnualGrowthPercent: +data.get('expectedAnnualGrowthPercent'),
            includeInProjection: data.has('includeInProjection')
        }
    };
    state = await api('/api/scenario', { method: 'PUT', body: JSON.stringify(scenario) });
    await refreshProjection();
};

$('years').onchange = refreshProjection;
$('scenario').onchange = refreshProjection;
$('slider').oninput = event => { $('years').value = event.target.value; refreshProjection(); };
$('theme').onclick = () => document.body.classList.toggle('dark');
$('duplicate').onclick = async () => { state = await api('/api/scenario/duplicate', { method: 'POST' }); renderForms(); await refreshProjection(); };

load();
