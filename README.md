# Portfolio Calculator

A local-first Spring Boot web app for tracking stock holdings and forecasting a personal portfolio with dividend reinvestment, recurring contributions, yearly contributions, and RSU grants.

## Features

- Dynamic overview tabs for the whole investment picture plus named tabs for portfolios, employer stock, 401k, HSA, assets such as houses/vehicles, income, or future account types.
- Overview dashboard with agnostic total overall current value and total overall projected value, with details available inside each tab.
- Add, edit, delete, and inline-edit holdings. Ticker and shares are required before adding a holding; the display name is optional and can be filled by lookup.
- Dividend frequency support: monthly, quarterly, semiannual, annual, and none.
- Per-holding price growth and dividend growth assumptions.
- Paycheck and yearly contribution assumptions in a dedicated section; projected contributions are invested evenly across all portfolio holdings, including dividend stocks.
- RSU forecast section with a stock-symbol picker, current RSU share count, estimated annual RSU value, share price lookup, annual vesting, and optional inclusion.
- Add/edit/delete additional tabs with name, category, type, current value, annual contribution or income, expected growth, and optional stock holdings via ticker lookup.
- Projection slider for 1-20 years plus scenario selector for base, conservative, and aggressive views.
- Charts for portfolio value, dividend income, contributions, growth, RSUs, and combined value.
- Public market-data lookup can fill current share price and estimated dividend information after you enter a ticker. The backend calls the external Yahoo Finance chart API (`query1.finance.yahoo.com/v8/finance/chart/{ticker}`), for example `/api/market-data/RTX`.
- CSV export for holdings and projection results.
- Dark mode is enabled by default, plus seed/example data.
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

## Data storage

The app creates seed data the first time it starts and persists changes to:

```text
~/.portfolio-calculator/portfolio-data.json
```

Delete that file to reset to the bundled example portfolio.

## Projection model

The projection is intentionally simple for an MVP:

1. Each month compounds each holding's expected annual share-price growth into a monthly rate.
2. Each month compounds expected annual dividend growth into a monthly rate.
3. Dividends are paid according to the configured frequency.
4. Reinvested dividends buy fractional shares of the same ticker at the simulated current price.
5. Recurring paycheck contributions and yearly contributions buy fractional shares evenly across all holdings in the regular portfolio.
6. RSUs use their own ticker/share price, include existing RSU shares, convert estimated annual grant value into shares once per year, and are tracked separately from the dividend portfolio.
7. Additional tabs such as 401k/HSA/assets/income compound monthly with annual contribution or income assumptions spread across the year; portfolio-style tabs can also hold ticker-based stocks.
8. Charts show regular portfolio, RSU value, other accounts, combined value, contributions, dividends, and growth value.

Market-data lookup uses the external Yahoo Finance chart API from your local machine when you click the lookup button. The app still stores data locally and does not require cloud hosting. This is not financial advice.
