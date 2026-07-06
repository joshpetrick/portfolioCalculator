package local.portfolio;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import static local.portfolio.PortfolioModels.*;

@Repository
public class PortfolioStore {
    private final ObjectMapper mapper = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    private final Path dataFile = Paths.get(System.getProperty("user.home"), ".portfolio-calculator", "portfolio-data.json");
    private PortfolioState state;

    public synchronized PortfolioState load() {
        if (state != null) return state;
        try {
            if (Files.exists(dataFile)) state = mapper.readValue(dataFile.toFile(), PortfolioState.class);
            else { state = seed(); save(state); }
            return state;
        } catch (IOException e) { throw new IllegalStateException("Unable to load portfolio data", e); }
    }

    public synchronized PortfolioState save(PortfolioState newState) {
        try {
            Files.createDirectories(dataFile.getParent());
            state = newState;
            mapper.writeValue(dataFile.toFile(), state);
            return state;
        } catch (IOException e) { throw new IllegalStateException("Unable to save portfolio data", e); }
    }

    private PortfolioState seed() {
        var holdings = List.of(
                new Holding(UUID.randomUUID().toString(), "VTI", "Vanguard Total Stock Market ETF", 25, 260, 0.91, DividendFrequency.QUARTERLY, true, 7.0, 4.0),
                new Holding(UUID.randomUUID().toString(), "SCHD", "Schwab U.S. Dividend Equity ETF", 80, 78, 0.74, DividendFrequency.QUARTERLY, true, 6.0, 6.0),
                new Holding(UUID.randomUUID().toString(), "MSFT", "Microsoft", 10, 420, 0.75, DividendFrequency.QUARTERLY, false, 8.0, 8.0)
        );
        var base = new Scenario(UUID.randomUUID().toString(), "Base plan", new Assumptions(350, PaycheckFrequency.BIWEEKLY, 6500, 1, true), new RsuSettings("MSFT", 420, 15, 20000, 5.0, true));
        var conservative = new Scenario(UUID.randomUUID().toString(), "Conservative", new Assumptions(250, PaycheckFrequency.BIWEEKLY, 3000, 1, true), new RsuSettings("MSFT", 420, 10, 12000, 2.0, true));
        return new PortfolioState(new ArrayList<>(holdings), base, new ArrayList<>(List.of(base, conservative)));
    }
}
