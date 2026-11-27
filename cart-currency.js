(function() {
  const supportedCurrencies = new Set(["USD", "GBP", "EUR", "GHS"]);
  const cacheKey = "tenaciousLiveExchangeRates";

  function getSelectedCurrency() {
    try {
      const selected = localStorage.getItem("tenaciousCurrency");
      return supportedCurrencies.has(selected) ? selected : "USD";
    } catch (error) {
      console.error("Could not read the selected currency:", error);
      return "USD";
    }
  }

  function isValidRates(rates) {
    return rates && ["USD", "GBP", "EUR", "GHS"].every(currency =>
      Number.isFinite(rates[currency]) && rates[currency] > 0
    );
  }

  function readCachedRates() {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      return cached && isValidRates(cached.rates) ? cached : null;
    } catch (error) {
      console.error("Could not read cached exchange rates:", error);
      return null;
    }
  }

  async function getRates() {
    const cached = readCachedRates();
    if (cached && Date.now() < cached.expiresAt) {
      return cached.rates;
    }

    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!response.ok) {
        throw new Error("Live exchange rates are unavailable.");
      }

      const data = await response.json();
      const rates = {
        USD: 1,
        GBP: Number(data && data.rates && data.rates.GBP),
        EUR: Number(data && data.rates && data.rates.EUR),
        GHS: Number(data && data.rates && data.rates.GHS)
      };
      if (data.result !== "success" || !isValidRates(rates)) {
        throw new Error("The live exchange-rate response was invalid.");
      }

      const expiresAt = Number(data.time_next_update_unix) * 1000;
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new Error("The live exchange-rate response has expired.");
      }

      const value = { rates, expiresAt };
      try {
        localStorage.setItem(cacheKey, JSON.stringify(value));
      } catch (error) {
        console.error("Could not cache live exchange rates:", error);
      }
      return rates;
    } catch (error) {
      if (cached) {
        console.error("Live exchange-rate refresh failed; using cached rates:", error);
        return cached.rates;
      }
      throw error;
    }
  }

  function format(amount, currency, rates) {
    const rate = rates && rates[currency];
    if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) {
      return `${currency} estimate unavailable`;
    }

    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount * rate);
  }

  window.TenaciousCurrency = {
    getSelectedCurrency,
    getRates,
    format
  };
})();
