package local.portfolio;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MarketDataServiceTest {
    @Test
    void parsesRtxChartApiResponse() throws Exception {
        String rtxChartFixture = """
                {"chart":{"result":[{"meta":{"currency":"USD","symbol":"RTX","regularMarketPrice":142.25},"events":{"dividends":{"1714061400":{"amount":0.63,"date":1714061400},"1722000600":{"amount":0.63,"date":1722000600},"1729863000":{"amount":0.63,"date":1729863000},"1737729000":{"amount":0.63,"date":1737729000}}}}],"error":null}}
                """;

        var service = new MarketDataService();
        var result = service.lookupFromChartResult("RTX", service.parseChartResult("RTX", rtxChartFixture));

        assertThat(result.ticker()).isEqualTo("RTX");
        assertThat(result.currentPrice()).isEqualTo(142.25);
        assertThat(result.dividendFrequency()).isEqualTo(PortfolioModels.DividendFrequency.QUARTERLY);
        assertThat(result.dividendAmount()).isEqualTo(0.63);
    }
}
