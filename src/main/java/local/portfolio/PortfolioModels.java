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
            @NotBlank String name,
            @PositiveOrZero double shares,
            @PositiveOrZero double currentPrice,
            @PositiveOrZero double dividendAmount,
            @NotNull DividendFrequency dividendFrequency,
            boolean reinvestDividends,
            Double expectedAnnualPriceGrowthPercent,
            Double expectedAnnualDividendGrowthPercent) {
        public Holding withId(String newId) { return new Holding(newId, ticker.toUpperCase(Locale.US), name, shares, currentPrice, dividendAmount, dividendFrequency, reinvestDividends, expectedAnnualPriceGrowthPercent, expectedAnnualDividendGrowthPercent); }
    }

    public record Assumptions(
            @PositiveOrZero double contributionPerPaycheck,
            @NotNull PaycheckFrequency paycheckFrequency,
            @PositiveOrZero double yearlyContributionAmount,
            @Min(1) @Max(12) int yearlyContributionMonth,
            boolean contributionsEnabled) {}

    public record RsuSettings(
            @PositiveOrZero double annualGrantValue,
            double expectedAnnualGrowthPercent,
            boolean includeInProjection) {}

    public record Scenario(String id, @NotBlank String name, @Valid Assumptions assumptions, @Valid RsuSettings rsuSettings) {}
    public record PortfolioState(List<@Valid Holding> holdings, @Valid Scenario activeScenario, List<@Valid Scenario> savedScenarios) {}
    public record ProjectionRequest(int years, Double customYears, String scenario) {}
    public record ProjectionPoint(int month, int year, double portfolioValue, double dividendIncome, double shareCount, double contributions, double rsuValue, double combinedValue, double growthValue) {}
    public record ProjectionResult(String scenario, List<ProjectionPoint> points, ProjectionPoint summary) {}
}
