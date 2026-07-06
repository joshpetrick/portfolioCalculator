let state;
let projection;
let valueChart;
let incomeChart;

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);
const frequencies = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'NONE'];

async function api(url, opts) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!response.ok) {
        const body = await response.text();
        try {
            const parsed = JSON.parse(body);
            throw new Error(parsed.message || body);
        } catch (error) {
            if (error instanceof SyntaxError) throw new Error(body);
            throw error;
        }
    }
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
    renderCurrentDashboard();
    renderDashboard();
    renderCharts();
}


function renderCurrentDashboard() {
    const rsu = normalizedRsu();
    const currentPortfolioValue = state.holdings.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);
    const currentRsuValue = rsu.includeInProjection ? rsu.currentShares * rsu.currentSharePrice : 0;
    const currentYearlyDividend = state.holdings.reduce((sum, h) => sum + h.shares * h.dividendAmount * paymentsPerYear(h.dividendFrequency), 0);
    $('currentDashboard').innerHTML = [
        ['Current stock portfolio', money(currentPortfolioValue)],
        ['Current RSU value', money(currentRsuValue)],
        ['Current yearly dividends', money(currentYearlyDividend)]
    ].map(item => `<div class="card"><span class="muted">${item[0]}</span><br><b>${item[1]}</b></div>`).join('');
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
    const rsu = normalizedRsu();
    $('rsuSummary').innerHTML = `Ticker: <b>${rsu.ticker || 'Not set'}</b><br>Current RSU shares: <b>${rsu.currentShares}</b><br>Estimated annual RSU value: <b>${money(rsu.annualGrantValue)}</b><br>Share price: <b>${money(rsu.currentSharePrice)}</b><br>Growth: <b>${rsu.expectedAnnualGrowthPercent}%</b><br>Included: <b>${rsu.includeInProjection ? 'Yes' : 'No'}</b>`;
}


function normalizedRsu() {
    const rsu = state.activeScenario.rsuSettings || {};
    return {
        ticker: rsu.ticker || '',
        currentSharePrice: Number(rsu.currentSharePrice || 0),
        currentShares: Number(rsu.currentShares || 0),
        annualGrantValue: Number(rsu.annualGrantValue || 0),
        expectedAnnualGrowthPercent: Number(rsu.expectedAnnualGrowthPercent || 0),
        includeInProjection: rsu.includeInProjection !== false
    };
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
        ${field('name', 'Display name', 'text', { hint: 'Optional. Lookup can fill this; blank entries use the ticker.' })}
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
    const rsu = normalizedRsu();
    $('scenarioForm').innerHTML = `
        <label>Scenario name<input name="name" required value="${a.name}"></label>
        <button type="submit">Save scenario</button>`;
    $('contributionForm').innerHTML = `
        <label>Per paycheck<input name="contributionPerPaycheck" type="number" step="any" min="0" value="${a.assumptions.contributionPerPaycheck}"></label>
        <label>Pay frequency<select name="paycheckFrequency">${['WEEKLY', 'BIWEEKLY', 'MONTHLY'].map(x => `<option ${a.assumptions.paycheckFrequency === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Yearly contribution<input name="yearlyContributionAmount" type="number" step="any" min="0" value="${a.assumptions.yearlyContributionAmount}"></label>
        <label>Yearly month<input name="yearlyContributionMonth" type="number" min="1" max="12" value="${a.assumptions.yearlyContributionMonth}"></label>
        <label><input name="contributionsEnabled" type="checkbox" ${a.assumptions.contributionsEnabled ? 'checked' : ''}> Enable contributions</label>
        <button type="submit">Save contributions</button>`;
    $('rsuForm').innerHTML = `
        <label>RSU ticker<input name="ticker" pattern="[A-Za-z.]{0,10}" value="${rsu.ticker}" placeholder="MSFT"></label>
        <label>Current RSU share price<input name="currentSharePrice" type="number" step="any" min="0" value="${rsu.currentSharePrice}"></label>
        <label>Existing RSU shares<input name="currentShares" type="number" step="any" min="0" value="${rsu.currentShares}"></label>
        <label>Estimated RSU value per year<input name="annualGrantValue" type="number" step="any" min="0" value="${rsu.annualGrantValue}"></label>
        <label>RSU annual growth %<input name="expectedAnnualGrowthPercent" type="number" step="any" value="${rsu.expectedAnnualGrowthPercent}"></label>
        <label><input name="includeInProjection" type="checkbox" ${rsu.includeInProjection ? 'checked' : ''}> Include RSUs</label>
        <div class="form-actions"><button id="lookupRsuQuote" class="secondary" type="button">Lookup RSU stock price</button><button type="submit">Save RSUs</button></div>`;

    $('lookupQuote').onclick = lookupQuote;
    $('lookupRsuQuote').onclick = lookupRsuQuote;
}

function field(name, label, type, options = {}) {
    return `<label>${fieldLabel(name, label)}<input name="${name}" type="${type}" step="any" ${options.required ? 'required' : ''} ${options.pattern ? `pattern="${options.pattern}"` : ''} ${options.min !== undefined ? `min="${options.min}"` : ''}>${options.hint ? `<span class="hint">${options.hint}</span>` : ''}</label>`;
}

function fieldLabel(_name, label) {
    return `${label}${['Ticker symbol', 'Shares owned'].includes(label) ? ' <span class="required">*</span>' : ''}`;
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
        setStatus(`Filled ${quote.ticker} at ${money(quote.currentPrice)} with estimated ${quote.dividendFrequency.toLowerCase()} dividend data from the external Yahoo Finance chart API.`, 'ok');
    } catch (error) {
        setStatus(`Lookup failed: ${error.message}. You can still enter price and dividend fields manually.`, 'error');
    }
}

function setStatus(message, type = '') {
    $('lookupStatus').textContent = message;
    $('lookupStatus').className = `status ${type}`;
}


async function lookupRsuQuote() {
    const form = $('rsuForm');
    const ticker = form.elements.ticker.value.trim();
    setRsuStatus('');
    if (!ticker) {
        form.elements.ticker.reportValidity();
        setRsuStatus('Enter an RSU ticker before lookup.', 'error');
        return;
    }
    try {
        setRsuStatus(`Looking up ${ticker.toUpperCase()}...`);
        const quote = await api(`/api/market-data/${encodeURIComponent(ticker)}`);
        form.elements.ticker.value = quote.ticker;
        form.elements.currentSharePrice.value = quote.currentPrice || 0;
        setRsuStatus(`Filled ${quote.ticker} RSU share price at ${money(quote.currentPrice)}.`, 'ok');
    } catch (error) {
        setRsuStatus(`RSU lookup failed: ${error.message}. You can enter the share price manually.`, 'error');
    }
}

function setRsuStatus(message, type = '') {
    $('rsuLookupStatus').textContent = message;
    $('rsuLookupStatus').className = `status ${type}`;
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
    if (!holding.name || !holding.name.trim()) holding.name = holding.ticker;
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

async function saveScenario() {
    const scenarioData = new FormData($('scenarioForm'));
    const contributionData = new FormData($('contributionForm'));
    const rsuData = new FormData($('rsuForm'));
    const scenario = {
        id: state.activeScenario.id,
        name: scenarioData.get('name'),
        assumptions: {
            contributionPerPaycheck: +contributionData.get('contributionPerPaycheck'),
            paycheckFrequency: contributionData.get('paycheckFrequency'),
            yearlyContributionAmount: +contributionData.get('yearlyContributionAmount'),
            yearlyContributionMonth: +contributionData.get('yearlyContributionMonth'),
            contributionsEnabled: contributionData.has('contributionsEnabled')
        },
        rsuSettings: {
            ticker: (rsuData.get('ticker') || '').toUpperCase(),
            currentSharePrice: +rsuData.get('currentSharePrice'),
            currentShares: +rsuData.get('currentShares'),
            annualGrantValue: +rsuData.get('annualGrantValue'),
            expectedAnnualGrowthPercent: +rsuData.get('expectedAnnualGrowthPercent'),
            includeInProjection: rsuData.has('includeInProjection')
        }
    };
    state = await api('/api/scenario', { method: 'PUT', body: JSON.stringify(scenario) });
    renderForms();
    await refreshProjection();
}

$('scenarioForm').onsubmit = async event => { event.preventDefault(); await saveScenario(); };
$('contributionForm').onsubmit = async event => { event.preventDefault(); await saveScenario(); };
$('rsuForm').onsubmit = async event => { event.preventDefault(); await saveScenario(); setRsuStatus('RSU settings saved.', 'ok'); };

$('years').onchange = refreshProjection;
$('scenario').onchange = refreshProjection;
$('slider').oninput = event => { $('years').value = event.target.value; refreshProjection(); };
$('theme').onclick = () => document.body.classList.toggle('dark');
$('duplicate').onclick = async () => { state = await api('/api/scenario/duplicate', { method: 'POST' }); renderForms(); await refreshProjection(); };

load();
