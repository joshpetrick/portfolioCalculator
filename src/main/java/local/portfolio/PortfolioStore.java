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
            if (Files.exists(dataFile)) state = normalize(mapper.readValue(dataFile.toFile(), PortfolioState.class));
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

    private PortfolioState normalize(PortfolioState loaded) {
        var accounts = loaded.accounts() == null ? new ArrayList<InvestmentAccount>() : new ArrayList<>(loaded.accounts().stream().map(InvestmentAccount::normalized).toList());
        var legacyHoldings = loaded.holdings() == null ? new ArrayList<Holding>() : new ArrayList<>(loaded.holdings());
        if (!legacyHoldings.isEmpty()) {
            accounts.add(new InvestmentAccount(UUID.randomUUID().toString(), "Imported Investment Account", "Migrated from the original stock portfolio", "Investment Account", true, 0, 0, 0, 0, 6.0, legacyHoldings).normalized());
            legacyHoldings = new ArrayList<>();
        }
        return new PortfolioState(
                legacyHoldings,
                loaded.activeScenario(),
                loaded.savedScenarios() == null ? new ArrayList<>() : loaded.savedScenarios(),
                accounts
        );
    }

    private PortfolioState seed() {
        var base = new Scenario(UUID.randomUUID().toString(), "Base plan", new Assumptions(0, PaycheckFrequency.BIWEEKLY, 0, 1, true), new RsuSettings("", 0, 0, 0, 5.0, true));
        return new PortfolioState(new ArrayList<>(), base, new ArrayList<>(List.of(base)), new ArrayList<>());
    }
}
