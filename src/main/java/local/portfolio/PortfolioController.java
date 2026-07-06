package local.portfolio;

import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

import static local.portfolio.PortfolioModels.*;

@RestController
@RequestMapping("/api")
public class PortfolioController {
    private final PortfolioStore store;
    private final ProjectionService projections;
    private final MarketDataService marketData;

    public PortfolioController(PortfolioStore store, ProjectionService projections, MarketDataService marketData) {
        this.store = store;
        this.projections = projections;
        this.marketData = marketData;
    }

    @GetMapping("/portfolio")
    PortfolioState portfolio() {
        return store.load();
    }

    @PutMapping("/portfolio")
    PortfolioState save(@Valid @RequestBody PortfolioState state) {
        return store.save(state);
    }

    @GetMapping("/market-data/{ticker}")
    ResponseEntity<?> marketData(@PathVariable("ticker") String ticker) {
        try {
            return ResponseEntity.ok(marketData.lookup(ticker));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage(), "provider", MarketDataService.PROVIDER_NAME));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("message", e.getMessage(), "provider", MarketDataService.PROVIDER_NAME));
        }
    }

    @PostMapping("/holdings")
    PortfolioState addHolding(@Valid @RequestBody Holding holding) {
        var state = store.load();
        var holdings = new ArrayList<>(state.holdings());
        holdings.add(holding.withId(UUID.randomUUID().toString()));
        return store.save(new PortfolioState(holdings, state.activeScenario(), state.savedScenarios(), state.accounts()));
    }

    @PutMapping("/holdings/{id}")
    PortfolioState updateHolding(@PathVariable("id") String id, @Valid @RequestBody Holding holding) {
        var state = store.load();
        var holdings = state.holdings().stream()
                .map(h -> h.id().equals(id) ? holding.withId(id) : h)
                .toList();
        return store.save(new PortfolioState(holdings, state.activeScenario(), state.savedScenarios(), state.accounts()));
    }

    @DeleteMapping("/holdings/{id}")
    PortfolioState deleteHolding(@PathVariable("id") String id) {
        var state = store.load();
        var holdings = state.holdings().stream()
                .filter(h -> !h.id().equals(id))
                .toList();
        return store.save(new PortfolioState(holdings, state.activeScenario(), state.savedScenarios(), state.accounts()));
    }


    @PostMapping("/accounts")
    PortfolioState addAccount(@Valid @RequestBody InvestmentAccount account) {
        var state = store.load();
        var accounts = new ArrayList<>(state.accounts());
        accounts.add(new InvestmentAccount(UUID.randomUUID().toString(), account.name(), account.type(), account.currentValue(), account.annualContribution(), account.expectedAnnualGrowthPercent()));
        return store.save(new PortfolioState(state.holdings(), state.activeScenario(), state.savedScenarios(), accounts));
    }

    @PutMapping("/accounts/{id}")
    PortfolioState updateAccount(@PathVariable("id") String id, @Valid @RequestBody InvestmentAccount account) {
        var state = store.load();
        var accounts = state.accounts().stream()
                .map(a -> a.id().equals(id) ? new InvestmentAccount(id, account.name(), account.type(), account.currentValue(), account.annualContribution(), account.expectedAnnualGrowthPercent()) : a)
                .toList();
        return store.save(new PortfolioState(state.holdings(), state.activeScenario(), state.savedScenarios(), accounts));
    }

    @DeleteMapping("/accounts/{id}")
    PortfolioState deleteAccount(@PathVariable("id") String id) {
        var state = store.load();
        var accounts = state.accounts().stream().filter(a -> !a.id().equals(id)).toList();
        return store.save(new PortfolioState(state.holdings(), state.activeScenario(), state.savedScenarios(), accounts));
    }

    @PutMapping("/scenario")
    PortfolioState scenario(@Valid @RequestBody Scenario scenario) {
        var state = store.load();
        var normalized = new Scenario(
                scenario.id() == null || scenario.id().isBlank() ? UUID.randomUUID().toString() : scenario.id(),
                scenario.name(),
                scenario.assumptions(),
                scenario.rsuSettings().normalized()
        );
        var saved = new ArrayList<>(state.savedScenarios());
        saved.removeIf(s -> s.id().equals(normalized.id()));
        saved.add(normalized);
        return store.save(new PortfolioState(state.holdings(), normalized, saved, state.accounts()));
    }

    @PostMapping("/scenario/duplicate")
    PortfolioState duplicate() {
        var state = store.load();
        var s = state.activeScenario();
        var copy = new Scenario(UUID.randomUUID().toString(), s.name() + " copy", s.assumptions(), s.rsuSettings());
        var saved = new ArrayList<>(state.savedScenarios());
        saved.add(copy);
        return store.save(new PortfolioState(state.holdings(), copy, saved, state.accounts()));
    }

    @GetMapping("/projection")
    ProjectionResult projection(@RequestParam(name = "years", defaultValue = "10") int years,
                                @RequestParam(name = "scenario", defaultValue = "base") String scenario) {
        return projections.project(store.load(), years, scenario);
    }

    @GetMapping(value = "/export/holdings.csv", produces = "text/csv")
    ResponseEntity<String> exportHoldings() {
        String header = "Ticker,Name,Shares,Current Price,Dividend Amount,Dividend Frequency,Reinvest,Price Growth %,Dividend Growth %\n";
        String rows = store.load().holdings().stream()
                .map(h -> csv(h.ticker(), h.name(), h.shares(), h.currentPrice(), h.dividendAmount(), h.dividendFrequency(), h.reinvestDividends(), h.expectedAnnualPriceGrowthPercent(), h.expectedAnnualDividendGrowthPercent()))
                .collect(Collectors.joining("\n"));
        return csvResponse("holdings.csv", header + rows + "\n");
    }

    @GetMapping(value = "/export/projection.csv", produces = "text/csv")
    ResponseEntity<String> exportProjection(@RequestParam(name = "years", defaultValue = "10") int years) {
        String header = "Month,Year,Portfolio Value,Dividend Income,Share Count,Contributions,RSU Value,Other Accounts Value,Combined Value,Growth Value\n";
        String rows = projections.project(store.load(), years, "base").points().stream()
                .map(p -> csv(p.month(), p.year(), p.portfolioValue(), p.dividendIncome(), p.shareCount(), p.contributions(), p.rsuValue(), p.otherAccountsValue(), p.combinedValue(), p.growthValue()))
                .collect(Collectors.joining("\n"));
        return csvResponse("projection.csv", header + rows + "\n");
    }

    private ResponseEntity<String> csvResponse(String name, String body) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + name)
                .contentType(MediaType.valueOf("text/csv"))
                .body(body);
    }

    private String csv(Object... vals) {
        return Arrays.stream(vals)
                .map(v -> v == null ? "" : v.toString().replace("\"", "\"\""))
                .map(v -> v.contains(",") ? "\"" + v + "\"" : v)
                .collect(Collectors.joining(","));
    }
}
