# Wealth Assessment

A local-first Spring Boot web app for assessing personal wealth across user-created entities such as investment accounts, savings accounts, and assets. The app keeps the existing stock lookup, dividend, reinvestment, contribution, RSU, projection, charting, CSV export, and local JSON persistence behavior while organizing data around wealth entities.

## Features

- Starts with a view-only `Overview` tab and a permanent `+` tab.
- The `+` tab opens a create-entity modal with required entity name, optional description, and required entity type.
- Supported entity types are `Investment Account`, `Asset`, and `Savings Account`.
- User-created entity tabs appear between `Overview` and `+`; no brokerage, 401k, HSA, or funny-money tabs are hardcoded.
- Each entity has name, description, type, and an `Include in Overview` setting. Entity tabs can be edited or deleted with confirmation.
- Overview aggregates only included entities and shows total current net worth, total projected value, current yearly dividends, projected dividend income, breakdown by entity, breakdown by type, and projection/dividend charts.
- Investment Account entities support ticker lookup, stock/ETF holdings, share counts, prices, dividend amount/frequency, reinvestment, expected growth, and annual contributions.
- Asset entities support estimated current value and expected annual appreciation/depreciation without stock-specific forms.
- Savings Account entities support current balance, expected annual interest rate, monthly contribution, and yearly contribution without stock-specific forms.
- Public market-data lookup fills current share price, display name, and estimated dividend information from the external Yahoo Finance chart API (`query1.finance.yahoo.com/v8/finance/chart/{ticker}`), for example `/api/market-data/RTX`.
- Projection horizons support 1, 3, 5, 10, and 20 years plus base, conservative, and aggressive strategies.
- Dark mode is enabled by default.
- CSV export for holdings and projection results.
- Local JSON persistence at `~/.portfolio-calculator/portfolio-data.json`.

## Requirements

- Java 17+
- Maven 3.9+ or IntelliJ IDEA with Maven support

## Run from the command line

```bash
mvn spring-boot:run
```

Open <http://localhost:8080>.

## Run in IntelliJ

1. Open this folder as a Maven project.
2. Use Java 17 or newer for the project SDK.
3. Run `local.portfolio.PortfolioCalculatorApplication`.
4. Open <http://localhost:8080>.

## Data storage and migration

The app persists changes to:

```text
~/.portfolio-calculator/portfolio-data.json
```

On first run, the tab bar starts empty except for `Overview | +`. If older data contains legacy top-level stock holdings from the original Portfolio Forecaster, those holdings are migrated into an `Imported Investment Account` entity so existing stock data is not lost. Delete the JSON file to reset local data.

## Projection model

The projection is intentionally simple for an MVP:

1. Investment Account holdings compound expected annual share-price growth into monthly rates.
2. Dividend growth is compounded monthly, dividends are paid according to each holding's configured frequency, and reinvested dividends buy fractional shares of the same ticker.
3. Investment Account annual contributions are spread monthly and invested evenly across holdings when holdings exist.
4. Asset entities compound estimated current value by expected annual appreciation/depreciation.
5. Savings Account entities compound current balance by expected annual interest and add monthly/yearly contribution assumptions.
6. RSUs retain the existing separate projection behavior: existing shares, annual grant value converted to shares once per year, ticker price growth, and optional inclusion.
7. Overview totals sum included entities and exclude any entity with `Include in Overview` turned off.

Market-data lookup uses the external Yahoo Finance chart API from your local machine when you click the lookup button. The app still stores data locally and does not require cloud hosting. This is not financial advice.
