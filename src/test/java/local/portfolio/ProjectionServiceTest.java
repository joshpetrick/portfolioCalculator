package local.portfolio;

import org.junit.jupiter.api.Test;
import java.util.List;
import static local.portfolio.PortfolioModels.*;
import static org.assertj.core.api.Assertions.assertThat;

class ProjectionServiceTest {
    @Test
    void projectsDividendReinvestmentContributionsAndRsus() {
        var holding = new Holding("1", "ABC", "ABC Co", 10, 100, 1, DividendFrequency.MONTHLY, true, 0.0, 0.0);
        var scenario = new Scenario("s", "Base", new Assumptions(120, PaycheckFrequency.MONTHLY, 1000, 12, true), new RsuSettings("ABC", 100, 5, 5000, 0, true));
        var result = new ProjectionService().project(new PortfolioState(List.of(holding), scenario, List.of(scenario), List.of(new InvestmentAccount("a", "401k", "Retirement", "Retirement", 1000, 1200, 0, List.of()))), 1, "base");
        assertThat(result.points()).hasSize(12);
        assertThat(result.summary().dividendIncome()).isGreaterThan(120);
        assertThat(result.summary().contributions()).isEqualTo(2440);
        assertThat(result.summary().shareCount()).isGreaterThan(10);
        assertThat(result.summary().rsuValue()).isEqualTo(5500);
        assertThat(result.summary().otherAccountsValue()).isEqualTo(2200);
        assertThat(result.summary().combinedValue()).isGreaterThan(result.summary().portfolioValue());
    }
}
