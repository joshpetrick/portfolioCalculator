package local.portfolio;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriUtils;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;

import static local.portfolio.PortfolioModels.*;

@Service
public class MarketDataService {
    private static final String QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=";

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public QuoteInfo lookup(String rawTicker) {
        String ticker = normalizeTicker(rawTicker);
        HttpRequest request = HttpRequest.newBuilder(URI.create(QUOTE_URL + UriUtils.encode(ticker, StandardCharsets.UTF_8)))
                .timeout(Duration.ofSeconds(8))
                .header("User-Agent", "portfolio-calculator-local-app")
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Market data lookup failed with HTTP " + response.statusCode());
            }

            JsonNode quote = mapper.readTree(response.body())
                    .path("quoteResponse")
                    .path("result")
                    .path(0);
            if (quote.isMissingNode() || quote.isEmpty()) {
                throw new IllegalArgumentException("No public market data found for ticker " + ticker);
            }

            double annualDividend = number(quote, "trailingAnnualDividendRate")
                    .or(() -> number(quote, "dividendRate"))
                    .orElse(0.0);
            DividendFrequency frequency = annualDividend > 0 ? DividendFrequency.QUARTERLY : DividendFrequency.NONE;
            double dividendPerPayment = frequency == DividendFrequency.NONE ? 0.0 : round(annualDividend / 4.0);

            return new QuoteInfo(
                    text(quote, "symbol").orElse(ticker),
                    text(quote, "longName").or(() -> text(quote, "shortName")).orElse(ticker),
                    number(quote, "regularMarketPrice").orElse(0.0),
                    dividendPerPayment,
                    frequency,
                    annualDividend,
                    text(quote, "currency").orElse("USD")
            );
        } catch (IOException e) {
            throw new IllegalStateException("Unable to read public market data for " + ticker, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Market data lookup was interrupted", e);
        }
    }

    private String normalizeTicker(String rawTicker) {
        if (rawTicker == null || rawTicker.isBlank()) {
            throw new IllegalArgumentException("Ticker is required before lookup");
        }
        return rawTicker.trim().toUpperCase(Locale.US);
    }

    private Optional<String> text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() && !value.asText().isBlank() ? Optional.of(value.asText()) : Optional.empty();
    }

    private Optional<Double> number(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isNumber() ? Optional.of(value.asDouble()) : Optional.empty();
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
