package local.portfolio;

import org.springframework.stereotype.Service;

import java.util.*;

import static local.portfolio.PortfolioModels.*;

@Service
public class ProjectionService {
    public ProjectionResult project(PortfolioState state, int years, String scenarioName) {
        Scenario scenario = scenarioName == null || scenarioName.isBlank()
                ? state.activeScenario()
                : deriveScenario(state.activeScenario(), scenarioName);
        int months = Math.max(1, Math.min(50, years)) * 12;
        double scenarioGrowthBump = growthBump(scenarioName);
        List<HoldingRuntime> holdings = state.holdings().stream()
                .map(h -> new HoldingRuntime(h, scenarioGrowthBump))
                .toList();
        RsuRuntime rsus = new RsuRuntime(scenario.rsuSettings().normalized(), scenarioGrowthBump);
        List<ProjectionPoint> points = new ArrayList<>();
        double totalContributions = 0, totalDividends = 0;
        double startingValue = holdings.stream().mapToDouble(HoldingRuntime::value).sum();

        for (int month = 1; month <= months; month++) {
            double monthlyDividends = 0;
            for (HoldingRuntime h : holdings) {
                // Price and dividend growth are annual assumptions converted to monthly compounding rates.
                h.price *= Math.pow(1 + h.priceGrowth / 100.0, 1.0 / 12.0);
                h.dividend *= Math.pow(1 + h.dividendGrowth / 100.0, 1.0 / 12.0);
                if (paysDividend(h.frequency, month)) {
                    double cash = h.shares * h.dividend;
                    monthlyDividends += cash;
                    // Reinvestment uses the current simulated share price to buy fractional shares.
                    if (h.reinvest && h.price > 0) h.shares += cash / h.price;
                }
            }
            totalDividends += monthlyDividends;

            if (scenario.assumptions().contributionsEnabled()) {
                double contributionCash = monthlyContribution(scenario.assumptions());
                if (month % 12 == scenario.assumptions().yearlyContributionMonth() % 12) {
                    contributionCash += scenario.assumptions().yearlyContributionAmount();
                }
                totalContributions += contributionCash;
                // Paycheck/yearly contributions are invested evenly across every holding, including dividend stocks.
                investEvenly(holdings, contributionCash);
            }

            if (scenario.rsuSettings().includeInProjection()) {
                rsus.price *= Math.pow(1 + rsus.growth / 100.0, 1.0 / 12.0);
                if (month % 12 == 0) rsus.shares += rsus.price > 0 ? scenario.rsuSettings().annualGrantValue() / rsus.price : 0;
            }

            double portfolio = holdings.stream().mapToDouble(HoldingRuntime::value).sum();
            double shares = holdings.stream().mapToDouble(h -> h.shares).sum();
            double rsuValue = scenario.rsuSettings().includeInProjection() ? rsus.value() : 0;
            points.add(new ProjectionPoint(
                    month,
                    (int) Math.ceil(month / 12.0),
                    round(portfolio),
                    round(totalDividends),
                    round(shares),
                    round(totalContributions),
                    round(rsuValue),
                    round(portfolio + rsuValue),
                    round(portfolio - startingValue - totalContributions)
            ));
        }
        return new ProjectionResult(scenario.name(), points, points.get(points.size() - 1));
    }

    private Scenario deriveScenario(Scenario base, String name) {
        double priceBump = growthBump(name);
        RsuSettings rsu = base.rsuSettings().normalized();
        return new Scenario(base.id(), capitalize(name), base.assumptions(), new RsuSettings(
                rsu.ticker(),
                rsu.currentSharePrice(),
                rsu.currentShares(),
                rsu.annualGrantValue(),
                rsu.expectedAnnualGrowthPercent() + priceBump,
                rsu.includeInProjection()
        ));
    }

    private void investEvenly(List<HoldingRuntime> holdings, double contributionCash) {
        if (contributionCash <= 0 || holdings.isEmpty()) return;
        double allocation = contributionCash / holdings.size();
        for (HoldingRuntime h : holdings) {
            if (h.price > 0) h.shares += allocation / h.price;
        }
    }

    private double growthBump(String name) {
        return name == null ? 0 : switch (name.toLowerCase(Locale.US)) {
            case "conservative" -> -2;
            case "aggressive" -> 3;
            default -> 0;
        };
    }

    private double monthlyContribution(Assumptions a) {
        return switch (a.paycheckFrequency()) {
            case WEEKLY -> a.contributionPerPaycheck() * 52 / 12;
            case BIWEEKLY -> a.contributionPerPaycheck() * 26 / 12;
            case MONTHLY -> a.contributionPerPaycheck();
        };
    }

    private boolean paysDividend(DividendFrequency f, int month) {
        return switch (f) {
            case MONTHLY -> true;
            case QUARTERLY -> month % 3 == 0;
            case SEMIANNUAL -> month % 6 == 0;
            case ANNUAL -> month % 12 == 0;
            case NONE -> false;
        };
    }

    private double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private String capitalize(String s) {
        return s.substring(0, 1).toUpperCase(Locale.US) + s.substring(1).toLowerCase(Locale.US);
    }

    static class HoldingRuntime {
        double shares, price, dividend, priceGrowth, dividendGrowth;
        DividendFrequency frequency;
        boolean reinvest;

        HoldingRuntime(Holding h, double scenarioGrowthBump) {
            shares = h.shares();
            price = h.currentPrice();
            dividend = h.dividendAmount();
            frequency = h.dividendFrequency();
            reinvest = h.reinvestDividends();
            priceGrowth = Optional.ofNullable(h.expectedAnnualPriceGrowthPercent()).orElse(6.0) + scenarioGrowthBump;
            dividendGrowth = Optional.ofNullable(h.expectedAnnualDividendGrowthPercent()).orElse(3.0) + scenarioGrowthBump;
        }

        double value() {
            return shares * price;
        }
    }

    static class RsuRuntime {
        double shares, price, growth;

        RsuRuntime(RsuSettings settings, double scenarioGrowthBump) {
            shares = settings.currentShares();
            price = settings.currentSharePrice();
            growth = settings.expectedAnnualGrowthPercent() + scenarioGrowthBump;
        }

        double value() {
            return shares * price;
        }
    }
}
