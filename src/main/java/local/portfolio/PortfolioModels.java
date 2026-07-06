package local.portfolio;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;

public class PortfolioModels {
    public enum DividendFrequency { MONTHLY, QUARTERLY, SEMIANNUAL, ANNUAL, NONE }
    public enum PaycheckFrequency { WEEKLY, BIWEEKLY, MONTHLY }

    public record Holding(
            String id,
            @NotBlank @Pattern(regexp = "^[A-Za-z.]{1,10}$") String ticker,
            String name,
            @Positive double shares,
            @PositiveOrZero double currentPrice,
            @PositiveOrZero double dividendAmount,
            @NotNull DividendFrequency dividendFrequency,
            boolean reinvestDividends,
            Double expectedAnnualPriceGrowthPercent,
            Double expectedAnnualDividendGrowthPercent) {
        public Holding withId(String newId) {
            String normalizedTicker = ticker.toUpperCase(Locale.US);
            String displayName = name == null || name.isBlank() ? normalizedTicker : name;
            return new Holding(newId, normalizedTicker, displayName, shares, currentPrice, dividendAmount, dividendFrequency, reinvestDividends, expectedAnnualPriceGrowthPercent, expectedAnnualDividendGrowthPercent);
        }
    }

    public record Assumptions(
            @PositiveOrZero double contributionPerPaycheck,
            @NotNull PaycheckFrequency paycheckFrequency,
            @PositiveOrZero double yearlyContributionAmount,
            @Min(1) @Max(12) int yearlyContributionMonth,
            boolean contributionsEnabled) {}

    public record RsuSettings(
            String ticker,
            @PositiveOrZero double currentSharePrice,
            @PositiveOrZero double currentShares,
            @PositiveOrZero double annualGrantValue,
            double expectedAnnualGrowthPercent,
            boolean includeInProjection) {
        public RsuSettings normalized() {
            String normalizedTicker = ticker == null || ticker.isBlank() ? "" : ticker.toUpperCase(Locale.US);
            return new RsuSettings(normalizedTicker, currentSharePrice, currentShares, annualGrantValue, expectedAnnualGrowthPercent, includeInProjection);
        }
    }

    public record Scenario(String id, @NotBlank String name, @Valid Assumptions assumptions, @Valid RsuSettings rsuSettings) {}
    public record InvestmentAccount(String id, @NotBlank String name, String category, String type, @PositiveOrZero double currentValue, @PositiveOrZero double annualContribution, double expectedAnnualGrowthPercent, List<@Valid Holding> holdings) {
        public InvestmentAccount normalized() {
            return new InvestmentAccount(id, name, category == null ? "" : category, type == null || type.isBlank() ? "Portfolio" : type, currentValue, annualContribution, expectedAnnualGrowthPercent, holdings == null ? new ArrayList<>() : holdings);
        }
    }
    public record PortfolioState(List<@Valid Holding> holdings, @Valid Scenario activeScenario, List<@Valid Scenario> savedScenarios, List<@Valid InvestmentAccount> accounts) {}
    public record ProjectionRequest(int years, Double customYears, String scenario) {}
    public record ProjectionPoint(int month, int year, double portfolioValue, double dividendIncome, double shareCount, double contributions, double rsuValue, double otherAccountsValue, double combinedValue, double growthValue) {}
    public record ProjectionResult(String scenario, List<ProjectionPoint> points, ProjectionPoint summary) {}
    public record QuoteInfo(String ticker, String name, double currentPrice, double dividendAmount, DividendFrequency dividendFrequency, double annualDividendRate, String currency) {}
}
