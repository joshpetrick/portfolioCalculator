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
    renderTabs();
    showTab('overview');
    await refreshProjection();
    renderHoldings();
    renderAccounts();
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
    $('currentDashboard').innerHTML = `<div class="card"><span class="muted">Total overall current value</span><br><b>${money(currentPortfolioValue + currentRsuValue + accountsCurrentValue())}</b></div><div class="card"><span class="muted">Current yearly dividends</span><br><b>${money(currentYearlyDividend)}</b></div>`;
}


function accountsCurrentValue() {
    return (state.accounts || []).reduce((sum, account) => sum + account.currentValue + ((account.holdings || []).reduce((hSum, h) => hSum + h.shares * h.currentPrice, 0)), 0);
}

function renderTabs(active = 'overview') {
    const accountTabs = (state.accounts || []).map(account => `<button type="button" data-tab="${account.id}" class="${active === account.id ? 'active' : ''}">${account.name}</button>`).join('');
    $('tabBar').innerHTML = `<button type="button" data-tab="overview" class="${active === 'overview' ? 'active' : ''}">Overview</button><button type="button" data-tab="create" class="secondary">＋</button><button type="button" data-tab="stock" class="${active === 'stock' ? 'active' : ''}">Funny money + company</button>${accountTabs}`;
    document.querySelectorAll('#tabBar button').forEach(button => button.onclick = () => showTab(button.dataset.tab));
}

function showTab(tab) {
    if (tab === 'create') { openTabWizard(); return; }
    renderTabs(tab);
    if (tab === 'overview' || tab === 'stock') {
        $('mainOverview').classList.remove('hidden');
        $('accountTab').classList.add('hidden');
        document.querySelectorAll('.detail-section').forEach(section => section.classList.toggle('hidden', tab === 'overview'));
        return;
    }
    const account = (state.accounts || []).find(a => a.id === tab);
    if (!account) return;
    $('mainOverview').classList.add('hidden');
    $('accountTab').classList.remove('hidden');
    const holdings = account.holdings || [];
    const holdingRows = holdings.map(h => `<tr><td>${h.ticker}</td><td>${h.name || h.ticker}</td><td>${h.shares}</td><td>${money(h.currentPrice)}</td><td>${money(h.dividendAmount || 0)} / ${h.dividendFrequency || 'NONE'}</td><td>${h.reinvestDividends ? 'Yes' : 'No'}</td><td><button class="danger" onclick="deleteAccountHolding('${account.id}','${h.id}')">Delete</button></td></tr>`).join('');
    const holdingsValue = holdings.reduce((sum,h)=>sum+h.shares*h.currentPrice,0);
    const yearlyDividends = holdings.reduce((sum,h)=>sum+h.shares*(h.dividendAmount||0)*paymentsPerYear(h.dividendFrequency),0);
    $('accountTab').innerHTML = `<h2>${account.name}</h2><p class="muted">${account.category || ''} · ${account.type || 'Investment account'}</p><div class="cards"><div class="card"><span class="muted">Tab total value</span><br><b>${money(account.currentValue + holdingsValue)}</b></div><div class="card"><span class="muted">Yearly dividends</span><br><b>${money(yearlyDividends)}</b></div><div class="card"><span class="muted">Annual contribution/income</span><br><b>${money(account.annualContribution)}</b></div><div class="card"><span class="muted">Expected growth</span><br><b>${account.expectedAnnualGrowthPercent}%</b></div></div><h3>Add stock to this tab</h3><form id="accountHoldingForm" class="form">${field('ticker', 'Ticker symbol', 'text', { required: true, pattern: '[A-Za-z.]{1,10}' })}${field('name', 'Display name', 'text', {})}${field('shares', 'Shares owned', 'number', { required: true, min: 0.000001 })}${field('currentPrice', 'Current share price', 'number', { min: 0 })}${field('dividendAmount', 'Dividend per payment', 'number', { min: 0 })}<label>Dividend frequency<select name="dividendFrequency">${frequencies.map(x => `<option>${x}</option>`).join('')}</select></label><label><input type="checkbox" name="reinvestDividends" checked> Reinvest dividends</label><button type="button" onclick="lookupAccountHolding('${account.id}')">Lookup ticker</button><button type="submit">Add stock</button></form><table><thead><tr><th>Ticker</th><th>Name</th><th>Shares</th><th>Price</th><th>Dividend</th><th>Reinvest</th><th></th></tr></thead><tbody>${holdingRows}</tbody></table>`;
    $('accountHoldingForm').onsubmit = async event => {
        event.preventDefault();
        const data = new FormData(event.target);
        const holding = Object.fromEntries(data);
        if (!holding.name || !holding.name.trim()) holding.name = holding.ticker;
        holding.shares = Number(holding.shares || 0);
        holding.currentPrice = Number(holding.currentPrice || 0);
        holding.dividendAmount = Number(holding.dividendAmount || 0);
        holding.dividendFrequency = holding.dividendFrequency || 'NONE';
        holding.reinvestDividends = data.has('reinvestDividends');
        holding.expectedAnnualPriceGrowthPercent = account.expectedAnnualGrowthPercent || 6;
        holding.expectedAnnualDividendGrowthPercent = 0;
        state = await api(`/api/accounts/${account.id}/holdings`, { method: 'POST', body: JSON.stringify(holding) });
        renderTabs(account.id);
        showTab(account.id);
        await refreshProjection();
    };
}

function renderDashboard() {
    const s = projection.summary;
    $('dashboard').innerHTML = `<div class="card"><span class="muted">Total overall projected value</span><br><b>${money(s.combinedValue)}</b></div><div class="card"><span class="muted">Projected dividend income</span><br><b>${money(s.dividendIncome)}</b></div>`;

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
                ds('Other accounts', projection.points.map(p => p.otherAccountsValue || 0), '#ec4899'),
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
    if (form.elements.dividendAmount) form.elements.dividendAmount.value = quote.dividendAmount || 0;
    if (form.elements.dividendFrequency) form.elements.dividendFrequency.value = quote.dividendFrequency || 'NONE';
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


function renderAccounts() {
    $('accountsList').innerHTML = `<div class="account-list">${(state.accounts || []).map(account => `
        <div class="account-row">
            <b>${account.name}</b> <span class="muted">${account.type || ''}</span><br>
            Current: ${money(account.currentValue)} · Annual contribution: ${money(account.annualContribution)} · Growth: ${account.expectedAnnualGrowthPercent}%<br>
            <button type="button" onclick="editAccount('${account.id}')">Edit</button> <button type="button" class="danger" onclick="deleteAccount('${account.id}')">Delete</button>
        </div>`).join('')}</div>`;
}

async function editAccount(id) {
    const account = (state.accounts || []).find(a => a.id === id);
    if (!account) return;
    const name = prompt('Account name', account.name) || account.name;
    const currentValue = Number(prompt('Current value', account.currentValue) || account.currentValue);
    const annualContribution = Number(prompt('Annual contribution/income', account.annualContribution) || account.annualContribution);
    const expectedAnnualGrowthPercent = Number(prompt('Expected annual growth %', account.expectedAnnualGrowthPercent) || account.expectedAnnualGrowthPercent);
    state = await api(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ ...account, name, currentValue, annualContribution, expectedAnnualGrowthPercent }) });
    renderTabs();
    showTab('stock');
    renderAccounts();
    await refreshProjection();
}

async function deleteAccount(id) {
    state = await api(`/api/accounts/${id}`, { method: 'DELETE' });
    renderTabs();
    showTab('stock');
    renderAccounts();
    await refreshProjection();
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



async function lookupAccountHolding(accountId) {
    const form = $('accountHoldingForm');
    const ticker = form.elements.ticker.value.trim();
    if (!ticker) return form.elements.ticker.reportValidity();
    const quote = await api(`/api/market-data/${encodeURIComponent(ticker)}`);
    form.elements.ticker.value = quote.ticker;
    form.elements.name.value = quote.name;
    form.elements.currentPrice.value = quote.currentPrice || 0;
    form.elements.dividendAmount.value = quote.dividendAmount || 0;
    form.elements.dividendFrequency.value = quote.dividendFrequency || 'NONE';
}

async function deleteAccountHolding(accountId, holdingId) {
    state = await api(`/api/accounts/${accountId}/holdings/${holdingId}`, { method: 'DELETE' });
    renderTabs(accountId);
    showTab(accountId);
    await refreshProjection();
}

function openTabWizard() {
    $('tabWizard').classList.remove('hidden');
}

function closeTabWizard() {
    $('tabWizard').classList.add('hidden');
}

$('closeTabWizard').onclick = closeTabWizard;
$('tabWizardForm').onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.target);
    const account = {
        name: data.get('name'),
        category: data.get('category'),
        type: data.get('type'),
        currentValue: +data.get('currentValue'),
        annualContribution: +data.get('annualContribution'),
        expectedAnnualGrowthPercent: +data.get('expectedAnnualGrowthPercent')
    };
    state = await api('/api/accounts', { method: 'POST', body: JSON.stringify(account) });
    event.target.reset();
    closeTabWizard();
    renderTabs();
    renderAccounts();
    await refreshProjection();
};

$('scenarioForm').onsubmit = async event => { event.preventDefault(); await saveScenario(); };
$('contributionForm').onsubmit = async event => { event.preventDefault(); await saveScenario(); };
$('rsuForm').onsubmit = async event => { event.preventDefault(); await saveScenario(); setRsuStatus('RSU settings saved.', 'ok'); };

$('years').onchange = refreshProjection;
$('scenario').onchange = refreshProjection;
$('slider').oninput = event => { $('years').value = event.target.value; refreshProjection(); };
$('theme').onclick = () => document.body.classList.toggle('dark');
$('duplicate').onclick = async () => { state = await api('/api/scenario/duplicate', { method: 'POST' }); renderForms(); renderTabs(); renderAccounts(); await refreshProjection(); };

load();
