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
    const currentValue = includedEntities().reduce((sum, entity) => sum + entityCurrentValue(entity), 0);
    const currentYearlyDividend = currentDividendIncome();
    $('currentDashboard').innerHTML = `<div class="card"><span class="muted">Total current net worth</span><br><b>${money(currentValue)}</b></div><div class="card"><span class="muted">Current yearly dividends</span><br><b>${money(currentYearlyDividend)}</b></div>`;
}


function accountsCurrentValue() {
    return includedEntities().reduce((sum, entity) => sum + entityCurrentValue(entity), 0);
}

function includedEntities() {
    return (state.accounts || []).filter(entity => entity.includeInOverview !== false);
}

function entityHoldingsValue(entity) {
    return (entity.holdings || []).reduce((sum, holding) => sum + Number(holding.shares || 0) * Number(holding.currentPrice || 0), 0);
}

function entityCurrentValue(entity) {
    return Number(entity.currentValue || 0) + entityHoldingsValue(entity);
}

function entityYearlyDividends(entity) {
    if ((entity.type || 'Investment Account') !== 'Investment Account') return 0;
    return (entity.holdings || []).reduce((sum, holding) => sum + Number(holding.shares || 0) * Number(holding.dividendAmount || 0) * paymentsPerYear(holding.dividendFrequency), 0);
}

function currentDividendIncome() {
    return includedEntities().reduce((sum, entity) => sum + entityYearlyDividends(entity), 0);
}

function renderTabs(active = 'overview') {
    const accountTabs = (state.accounts || []).map(account => `<button type="button" data-tab="${account.id}" class="${active === account.id ? 'active' : ''}">${account.name}</button>`).join('');
    $('tabBar').innerHTML = `<button type="button" data-tab="overview" class="${active === 'overview' ? 'active' : ''}">Overview</button>${accountTabs}<button type="button" data-tab="create" class="secondary">＋</button>`;
    document.querySelectorAll('#tabBar button').forEach(button => button.onclick = () => showTab(button.dataset.tab));
}

function showTab(tab) {
    if (tab === 'create') { openTabWizard(); return; }
    renderTabs(tab);
    if (tab === 'overview') {
        $('mainOverview').classList.remove('hidden');
        $('accountTab').classList.add('hidden');
        document.querySelectorAll('.detail-section').forEach(section => section.classList.add('hidden'));
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
    $('accountTab').innerHTML = `<h2>${account.name}</h2><p class="muted">${account.description || ''} · ${account.type || 'Investment Account'}</p><div class="cards"><div class="card"><span class="muted">Tab total value</span><br><b>${money(account.currentValue + holdingsValue)}</b></div><div class="card"><span class="muted">Yearly dividends</span><br><b>${money(yearlyDividends)}</b></div><div class="card"><span class="muted">Annual contribution/income</span><br><b>${money(account.annualContribution)}</b></div><div class="card"><span class="muted">Expected growth</span><br><b>${account.expectedAnnualGrowthPercent}%</b></div></div><h3>Add stock to this tab</h3><form id="accountHoldingForm" class="form">${field('ticker', 'Ticker symbol', 'text', { required: true, pattern: '[A-Za-z.]{1,10}' })}${field('name', 'Display name', 'text', {})}${field('shares', 'Shares owned', 'number', { required: true, min: 0.000001 })}${field('currentPrice', 'Current share price', 'number', { min: 0 })}${field('dividendAmount', 'Dividend per payment', 'number', { min: 0 })}<label>Dividend frequency<select name="dividendFrequency">${frequencies.map(x => `<option>${x}</option>`).join('')}</select></label><label><input type="checkbox" name="reinvestDividends" checked> Reinvest dividends</label><button type="button" onclick="lookupAccountHolding('${account.id}')">Lookup ticker</button><button type="submit">Add stock</button></form><table><thead><tr><th>Ticker</th><th>Name</th><th>Shares</th><th>Price</th><th>Dividend</th><th>Reinvest</th><th></th></tr></thead><tbody>${holdingRows}</tbody></table>`;
    if ($('accountHoldingForm')) $('accountHoldingForm').onsubmit = async event => {
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
    if ($('entityDetailsForm')) $('entityDetailsForm').onsubmit = async event => {
        event.preventDefault();
        const data = new FormData(event.target);
        const updated = { ...account, currentValue: +(data.get('currentValue') || account.currentValue), expectedAnnualGrowthPercent: +(data.get('expectedAnnualGrowthPercent') || account.expectedAnnualGrowthPercent), monthlyContribution: +(data.get('monthlyContribution') || account.monthlyContribution || 0), yearlyContribution: +(data.get('yearlyContribution') || account.yearlyContribution || 0), includeInOverview: data.has('includeInOverview') };
        state = await api(`/api/accounts/${account.id}`, { method: 'PUT', body: JSON.stringify(updated) });
        renderTabs(account.id); showTab(account.id); await refreshProjection();
    };
}

function renderDashboard() {
    const s = projection.summary;
    $('dashboard').innerHTML = `<div class="card"><span class="muted">Total projected value</span><br><b>${money(s.combinedValue)}</b></div><div class="card"><span class="muted">Projected dividend income</span><br><b>${money(s.dividendIncome)}</b></div>`;
    $('dividendSummary').innerHTML = `Projected cumulative income: <b>${money(s.dividendIncome)}</b><br>Current annual run-rate estimate: <b>${money(currentDividendIncome())}</b>`;
    const rsu = normalizedRsu();
    $('rsuSummary').innerHTML = `Ticker: <b>${rsu.ticker || 'Not set'}</b><br>Current RSU shares: <b>${rsu.currentShares}</b><br>Estimated annual RSU value: <b>${money(rsu.annualGrantValue)}</b><br>Share price: <b>${money(rsu.currentSharePrice)}</b><br>Growth: <b>${rsu.expectedAnnualGrowthPercent}%</b><br>Included: <b>${rsu.includeInProjection ? 'Yes' : 'No'}</b>`;
    renderOverviewBreakdowns();
}

function renderOverviewBreakdowns() {
    const byType = includedEntities().reduce((acc, entity) => {
        const type = entity.type || 'Investment Account';
        acc[type] = (acc[type] || 0) + entityCurrentValue(entity);
        return acc;
    }, {});
    const entityRows = includedEntities().map(entity => `<tr><td>${entity.name}</td><td>${entity.type || 'Investment Account'}</td><td>${money(entityCurrentValue(entity))}</td><td>${money(entityYearlyDividends(entity))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Create an entity with the + tab to start tracking wealth.</td></tr>';
    const typeRows = Object.entries(byType).map(([type, value]) => `<tr><td>${type}</td><td>${money(value)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No included entities yet.</td></tr>';
    $('overviewBreakdowns').innerHTML = `<div class="panel"><h2>Breakdown by entity</h2><table><thead><tr><th>Entity</th><th>Type</th><th>Current value</th><th>Yearly dividends</th></tr></thead><tbody>${entityRows}</tbody></table></div><div class="panel"><h2>Breakdown by type</h2><table><thead><tr><th>Type</th><th>Current value</th></tr></thead><tbody>${typeRows}</tbody></table></div>`;
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
    const name = prompt('Entity name', account.name);
    if (name === null || !name.trim()) return;
    const description = prompt('Description', account.description || '');
    if (description === null) return;
    const type = prompt('Entity type: Investment Account, Asset, or Savings Account', account.type || 'Investment Account');
    if (type === null) return;
    const allowed = ['Investment Account', 'Asset', 'Savings Account'];
    const normalizedType = allowed.includes(type) ? type : account.type || 'Investment Account';
    const includeText = prompt('Include in Overview? yes/no', account.includeInOverview === false ? 'no' : 'yes');
    if (includeText === null) return;
    const includeInOverview = !['no', 'false', '0'].includes(includeText.trim().toLowerCase());
    state = await api(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ ...account, name: name.trim(), description, type: normalizedType, includeInOverview }) });
    renderTabs(id);
    renderAccounts();
    showTab(id);
    await refreshProjection();
}

async function deleteAccount(id) {
    const account = (state.accounts || []).find(a => a.id === id);
    if (!account || !confirm(`Delete ${account.name}? This removes the entity and its holdings.`)) return;
    state = await api(`/api/accounts/${id}`, { method: 'DELETE' });
    renderTabs('overview');
    renderAccounts();
    showTab('overview');
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
    const form = event.target;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const beforeIds = new Set((state.accounts || []).map(account => account.id));
    const account = {
        name: (data.get('name') || '').trim(),
        description: data.get('description') || '',
        type: data.get('type'),
        includeInOverview: true,
        currentValue: 0,
        annualContribution: 0,
        monthlyContribution: 0,
        yearlyContribution: 0,
        expectedAnnualGrowthPercent: 0,
        holdings: []
    };
    if (!account.name || !account.type) return;
    state = await api('/api/accounts', { method: 'POST', body: JSON.stringify(account) });
    const created = (state.accounts || []).find(entity => !beforeIds.has(entity.id));
    form.reset();
    closeTabWizard();
    renderTabs(created?.id || 'overview');
    renderAccounts();
    await refreshProjection();
    showTab(created?.id || 'overview');
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

// Wealth Assessment entity page override. Kept at the end so it supersedes the earlier MVP tab renderer.
function projectedEntityValue(entity) {
    const years = Number($('years').value || 5);
    const growth = Number(entity.expectedAnnualGrowthPercent || 0) / 100;
    let value = entityCurrentValue(entity);
    for (let year = 0; year < years; year++) {
        if ((entity.type || 'Investment Account') === 'Savings Account') value += Number(entity.monthlyContribution || 0) * 12 + Number(entity.yearlyContribution || 0);
        if ((entity.type || 'Investment Account') === 'Investment Account') value += Number(entity.annualContribution || 0);
        value *= (1 + growth);
    }
    return value;
}

function showTab(tab) {
    if (tab === 'create') { openTabWizard(); return; }
    renderTabs(tab);
    if (tab === 'overview') {
        $('mainOverview').classList.remove('hidden');
        $('accountTab').classList.add('hidden');
        document.querySelectorAll('.detail-section').forEach(section => section.classList.add('hidden'));
        return;
    }
    const entity = (state.accounts || []).find(a => a.id === tab);
    if (!entity) return;
    const type = entity.type || 'Investment Account';
    const yearlyDividends = entityYearlyDividends(entity);
    const currentValue = entityCurrentValue(entity);
    $('mainOverview').classList.add('hidden');
    $('accountTab').classList.remove('hidden');

    const header = `<div class="entity-header"><div><h2>${entity.name}</h2><p class="muted">${entity.description || 'No description yet.'}</p></div><div class="entity-actions"><span class="badge">${type}</span><button type="button" onclick="editAccount('${entity.id}')">Edit entity</button><button type="button" class="danger" onclick="deleteAccount('${entity.id}')">Delete entity</button></div></div>`;
    const cards = `<section class="cards"><div class="card"><span class="muted">Current value</span><br><b>${money(currentValue)}</b></div><div class="card"><span class="muted">Projected value</span><br><b>${money(projectedEntityValue(entity))}</b></div><div class="card"><span class="muted">Annual dividends / income</span><br><b>${money(type === 'Investment Account' ? yearlyDividends : (entity.annualContribution || entity.yearlyContribution || 0))}</b></div><div class="card"><span class="muted">Expected growth / return</span><br><b>${entity.expectedAnnualGrowthPercent || 0}%</b></div></section>`;

    if (type === 'Investment Account') {
        const holdings = entity.holdings || [];
        const rows = holdings.map(h => `<tr><td>${h.ticker}</td><td>${h.name || h.ticker}</td><td>${h.shares}</td><td>${money(h.currentPrice)}</td><td>${money(h.shares * h.currentPrice)}</td><td>${money(h.dividendAmount || 0)}</td><td>${h.dividendFrequency || 'NONE'}</td><td>${h.reinvestDividends ? 'Yes' : 'No'}</td><td><button class="danger" onclick="deleteAccountHolding('${entity.id}','${h.id}')">Delete</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">No holdings yet. Add a ticker above.</td></tr>';
        $('accountTab').innerHTML = header + cards + `<div class="panel"><h3>Investment Account Details</h3><form id="entityDetailsForm" class="form"><label>Expected annual account growth %<input name="expectedAnnualGrowthPercent" type="number" step="any" value="${entity.expectedAnnualGrowthPercent || 0}"></label><label>Annual contribution amount<input name="annualContribution" type="number" step="any" min="0" value="${entity.annualContribution || 0}"></label><label><input name="includeInOverview" type="checkbox" ${entity.includeInOverview !== false ? 'checked' : ''}> Include in Overview</label><button>Save account settings</button></form></div><div class="panel"><h3>Add Holding</h3><p class="muted">Use lookup to populate display name, current price, and dividend details. Enter shares manually.</p><form id="accountHoldingForm" class="form">${field('ticker', 'Ticker symbol', 'text', { required: true, pattern: '[A-Za-z.]{1,10}' })}${field('name', 'Display name', 'text', {})}${field('shares', 'Shares owned', 'number', { required: true, min: 0.000001 })}${field('currentPrice', 'Current share price', 'number', { min: 0 })}${field('dividendAmount', 'Dividend per payment', 'number', { min: 0 })}<label>Dividend frequency<select name="dividendFrequency">${frequencies.map(x => `<option>${x}</option>`).join('')}</select></label><label><input type="checkbox" name="reinvestDividends" checked> Reinvest dividends</label><button type="button" onclick="lookupAccountHolding('${entity.id}')">Lookup ticker</button><button type="submit">Add holding</button></form></div><div class="panel"><h3>Holdings</h3><div class="table-wrap"><table><thead><tr><th>Ticker</th><th>Name</th><th>Shares</th><th>Price</th><th>Market value</th><th>Dividend</th><th>Frequency</th><th>Reinvest</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
        wireEntityDetailsForm(entity);
        $('accountHoldingForm').onsubmit = async event => {
            event.preventDefault();
            if (!event.target.reportValidity()) return;
            const data = new FormData(event.target);
            const holding = Object.fromEntries(data);
            if (!holding.name || !holding.name.trim()) holding.name = holding.ticker;
            holding.shares = Number(holding.shares || 0);
            holding.currentPrice = Number(holding.currentPrice || 0);
            holding.dividendAmount = Number(holding.dividendAmount || 0);
            holding.dividendFrequency = holding.dividendFrequency || 'NONE';
            holding.reinvestDividends = data.has('reinvestDividends');
            holding.expectedAnnualPriceGrowthPercent = entity.expectedAnnualGrowthPercent || 6;
            holding.expectedAnnualDividendGrowthPercent = 0;
            state = await api(`/api/accounts/${entity.id}/holdings`, { method: 'POST', body: JSON.stringify(holding) });
            showTab(entity.id);
            await refreshProjection();
        };
        return;
    }

    const isSavings = type === 'Savings Account';
    $('accountTab').innerHTML = header + cards + `<div class="panel"><h3>${isSavings ? 'Savings Details' : 'Asset Details'}</h3><form id="entityDetailsForm" class="form"><label>${isSavings ? 'Current balance' : 'Estimated current value'}<input name="currentValue" type="number" step="any" min="0" value="${entity.currentValue || 0}"></label><label>${isSavings ? 'Expected annual interest rate %' : 'Expected annual appreciation/depreciation %'}<input name="expectedAnnualGrowthPercent" type="number" step="any" value="${entity.expectedAnnualGrowthPercent || 0}"></label>${isSavings ? `<label>Monthly contribution<input name="monthlyContribution" type="number" step="any" min="0" value="${entity.monthlyContribution || 0}"></label><label>Yearly contribution<input name="yearlyContribution" type="number" step="any" min="0" value="${entity.yearlyContribution || 0}"></label>` : ''}<label><input name="includeInOverview" type="checkbox" ${entity.includeInOverview !== false ? 'checked' : ''}> Include in Overview</label><button>Save ${isSavings ? 'savings' : 'asset'}</button></form></div>`;
    wireEntityDetailsForm(entity);
}

function wireEntityDetailsForm(entity) {
    const form = $('entityDetailsForm');
    if (!form) return;
    form.onsubmit = async event => {
        event.preventDefault();
        const data = new FormData(event.target);
        const updated = {
            ...entity,
            currentValue: +(data.get('currentValue') ?? entity.currentValue ?? 0),
            annualContribution: +(data.get('annualContribution') ?? entity.annualContribution ?? 0),
            monthlyContribution: +(data.get('monthlyContribution') ?? entity.monthlyContribution ?? 0),
            yearlyContribution: +(data.get('yearlyContribution') ?? entity.yearlyContribution ?? 0),
            expectedAnnualGrowthPercent: +(data.get('expectedAnnualGrowthPercent') ?? entity.expectedAnnualGrowthPercent ?? 0),
            includeInOverview: data.has('includeInOverview')
        };
        state = await api(`/api/accounts/${entity.id}`, { method: 'PUT', body: JSON.stringify(updated) });
        showTab(entity.id);
        await refreshProjection();
    };
}
