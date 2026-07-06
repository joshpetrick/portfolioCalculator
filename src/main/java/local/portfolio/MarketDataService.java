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
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static local.portfolio.PortfolioModels.*;

@Service
public class MarketDataService {
    static final String PROVIDER_NAME = "Yahoo Finance chart API";
    private static final String CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public QuoteInfo lookup(String rawTicker) {
        String ticker = normalizeTicker(rawTicker);
        return lookupFromChartResult(ticker, fetchChart(ticker));
    }


    QuoteInfo lookupFromChartResult(String ticker, JsonNode result) {
        JsonNode meta = result.path("meta");
        double price = firstNumber(meta, "regularMarketPrice", "previousClose", "chartPreviousClose").orElse(0.0);
        DividendEstimate dividend = estimateDividend(result.path("events").path("dividends"));

        if (price <= 0 && dividend.annualDividendRate() <= 0) {
            throw new IllegalStateException("No usable quote data returned for " + ticker + " from " + PROVIDER_NAME);
        }

        return new QuoteInfo(
                text(meta, "symbol").orElse(ticker),
                ticker,
                price,
                dividend.dividendAmount(),
                dividend.frequency(),
                dividend.annualDividendRate(),
                text(meta, "currency").orElse("USD")
        );
    }

    private JsonNode fetchChart(String ticker) {
        String encodedTicker = UriUtils.encodePathSegment(ticker, StandardCharsets.UTF_8);
        String url = CHART_URL + encodedTicker + "?range=5y&interval=1mo&events=div";
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("Accept", "application/json")
                .header("User-Agent", "Mozilla/5.0 portfolio-calculator-local-app")
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException(PROVIDER_NAME + " returned HTTP " + response.statusCode() + " for " + ticker);
            }
            return parseChartResult(ticker, response.body());
        } catch (IOException e) {
            throw new IllegalStateException("Unable to read public market data from " + PROVIDER_NAME + " for " + ticker, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Market data lookup was interrupted", e);
        }
    }

    JsonNode parseChartResult(String ticker, String responseBody) throws IOException {
        JsonNode chart = mapper.readTree(responseBody).path("chart");
        JsonNode error = chart.path("error");
        if (!error.isMissingNode() && !error.isNull()) {
            throw new IllegalArgumentException(error.path("description").asText("No public market data found for " + ticker));
        }
        JsonNode result = chart.path("result").path(0);
        if (result.isMissingNode() || result.isEmpty()) {
            throw new IllegalArgumentException("No public market data found for ticker " + ticker);
        }
        return result;
    }

    private DividendEstimate estimateDividend(JsonNode dividends) {
        if (!dividends.isObject() || dividends.isEmpty()) {
            return new DividendEstimate(0.0, DividendFrequency.NONE, 0.0);
        }

        List<DividendPayment> payments = new ArrayList<>();
        dividends.fields().forEachRemaining(entry -> {
            JsonNode value = entry.getValue();
            if (value.path("amount").isNumber() && value.path("date").isNumber()) {
                payments.add(new DividendPayment(value.path("date").asLong(), value.path("amount").asDouble()));
            }
        });
        payments.sort(Comparator.comparingLong(DividendPayment::epochSeconds).reversed());
        if (payments.isEmpty()) {
            return new DividendEstimate(0.0, DividendFrequency.NONE, 0.0);
        }

        long oneYearAgo = Instant.now().minus(370, ChronoUnit.DAYS).getEpochSecond();
        List<DividendPayment> recent = payments.stream()
                .filter(payment -> payment.epochSeconds() >= oneYearAgo)
                .toList();
        List<DividendPayment> annualizedWindow = recent.isEmpty() ? payments.stream().limit(4).toList() : recent;
        double annualDividend = annualizedWindow.stream().mapToDouble(DividendPayment::amount).sum();
        DividendFrequency frequency = inferFrequency(annualizedWindow.size());
        double dividendAmount = frequency == DividendFrequency.NONE ? 0.0 : round(annualDividend / paymentsPerYear(frequency));
        return new DividendEstimate(dividendAmount, frequency, round(annualDividend));
    }

    private DividendFrequency inferFrequency(int paymentsInYear) {
        if (paymentsInYear >= 10) return DividendFrequency.MONTHLY;
        if (paymentsInYear >= 3) return DividendFrequency.QUARTERLY;
        if (paymentsInYear == 2) return DividendFrequency.SEMIANNUAL;
        if (paymentsInYear == 1) return DividendFrequency.ANNUAL;
        return DividendFrequency.NONE;
    }

    private int paymentsPerYear(DividendFrequency frequency) {
        return switch (frequency) {
            case MONTHLY -> 12;
            case QUARTERLY -> 4;
            case SEMIANNUAL -> 2;
            case ANNUAL -> 1;
            case NONE -> 0;
        };
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

    private Optional<Double> firstNumber(JsonNode node, String... fields) {
        for (String field : fields) {
            JsonNode value = node.path(field);
            if (value.isNumber()) return Optional.of(value.asDouble());
        }
        return Optional.empty();
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private record DividendPayment(long epochSeconds, double amount) {}
    private record DividendEstimate(double dividendAmount, DividendFrequency frequency, double annualDividendRate) {}
}
