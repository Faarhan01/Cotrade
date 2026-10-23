export interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  scheduledTime: number; // Unix timestamp
  scheduledTimeIso: string;
  forecast?: string;
  previous?: string;
  actual?: string;
  affectedSymbols: string[];
  description: string;
  category?: 'CENTRAL_BANK' | 'INFLATION' | 'EMPLOYMENT' | 'GDP' | 'TRADE' | 'COMMODITY' | 'CRYPTO';
}

export function getUpcomingEconomicEvents(symbol?: string): {
  events: EconomicEvent[];
  activeAlerts: string[];
  dataQuality: 'SIMULATED';
} {
  const now = Date.now();
  const oneMinute = 60 * 1000;
  const oneHour = 60 * oneMinute;

  // Real-world representative macroeconomic and crypto calendar items
  const baseCalendar: Array<
    Omit<EconomicEvent, 'scheduledTime' | 'scheduledTimeIso'> & {
      offsetMinutes: number;
    }
  > = [
    {
      id: 'evt-cpi-us',
      title: 'US Consumer Price Index (CPI YoY)',
      country: 'United States',
      currency: 'USD',
      impact: 'HIGH',
      forecast: '2.8%',
      previous: '2.9%',
      affectedSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US30'],
      description: 'Primary gauge of US consumer inflation. Higher reading boosts USD bond yields and puts immediate downside pressure on Gold, Euro, and Crypto.',
      category: 'INFLATION',
      offsetMinutes: 25, // Imminent in 25 minutes!
    },
    {
      id: 'evt-fomc-rate',
      title: 'FOMC Federal Funds Rate Decision & Policy Statement',
      country: 'United States',
      currency: 'USD',
      impact: 'HIGH',
      forecast: '4.75%',
      previous: '5.00%',
      affectedSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US30'],
      description: 'Federal Reserve monetary policy stance and forward guidance. Triggers aggressive multi-asset repositioning.',
      category: 'CENTRAL_BANK',
      offsetMinutes: 180, // In 3 hours
    },
    {
      id: 'evt-ecb-rate',
      title: 'ECB Main Refinancing Rate Decision & Press Conference',
      country: 'Eurozone',
      currency: 'EUR',
      impact: 'HIGH',
      forecast: '3.25%',
      previous: '3.50%',
      actual: '3.25%',
      affectedSymbols: ['EURUSD', 'EURGBP', 'EURJPY', 'GER40'],
      description: 'European Central Bank benchmark interest rate adjustment and Lagarde monetary statement.',
      category: 'CENTRAL_BANK',
      offsetMinutes: -45, // Completed 45 mins ago
    },
    {
      id: 'evt-nfp-us',
      title: 'US Non-Farm Payrolls & Unemployment Rate',
      country: 'United States',
      currency: 'USD',
      impact: 'HIGH',
      forecast: '+165K',
      previous: '+142K',
      affectedSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US30'],
      description: 'Crucial monthly labor market report dictating near-term Fed policy trajectories and dollar liquidity.',
      category: 'EMPLOYMENT',
      offsetMinutes: 480, // In 8 hours
    },
    {
      id: 'evt-boj-rate',
      title: 'Bank of Japan Policy Rate & Yield Curve Guidance',
      country: 'Japan',
      currency: 'JPY',
      impact: 'HIGH',
      forecast: '0.25%',
      previous: '0.25%',
      affectedSymbols: ['USDJPY', 'EURJPY', 'GBPJPY', 'JPN225'],
      description: 'BOJ policy rate decision. Hawkish undertones cause rapid appreciation in Yen and sharp downside tests on USDJPY.',
      category: 'CENTRAL_BANK',
      offsetMinutes: 720, // In 12 hours
    },
    {
      id: 'evt-uk-gdp',
      title: 'UK Gross Domestic Product (GDP MoM)',
      country: 'United Kingdom',
      currency: 'GBP',
      impact: 'MEDIUM',
      forecast: '0.2%',
      previous: '0.0%',
      actual: '0.3%',
      affectedSymbols: ['GBPUSD', 'EURGBP', 'GBPJPY'],
      description: 'Broad measure of UK economic output. Outperformance provides upside tailwinds to Pound sterling.',
      category: 'GDP',
      offsetMinutes: -90, // Completed 90 mins ago
    },
    {
      id: 'evt-btc-etf-flow',
      title: 'US Spot Bitcoin ETF Daily Net Capital Flow Report',
      country: 'Global',
      currency: 'BTC',
      impact: 'MEDIUM',
      forecast: '+$180M',
      previous: '+$215M',
      affectedSymbols: ['BTCUSD', 'ETHUSD', 'SOLUSD'],
      description: 'Institutional institutional ETF net inflow barometer indicating systemic spot demand for digital assets.',
      category: 'CRYPTO',
      offsetMinutes: 120, // In 2 hours
    },
    {
      id: 'evt-oil-inventory',
      title: 'EIA Weekly Crude Oil Stocks Change',
      country: 'United States',
      currency: 'USD',
      impact: 'MEDIUM',
      forecast: '-1.8M',
      previous: '+2.1M',
      affectedSymbols: ['USOIL', 'BRENT', 'USDCAD'],
      description: 'Energy Information Administration inventory report directly driving WTI/Brent and Canadian Dollar volatility.',
      category: 'COMMODITY',
      offsetMinutes: 300, // In 5 hours
    },
    {
      id: 'evt-aud-rba',
      title: 'RBA Cash Rate Decision & Monetary Outlook',
      country: 'Australia',
      currency: 'AUD',
      impact: 'HIGH',
      forecast: '4.35%',
      previous: '4.35%',
      affectedSymbols: ['AUDUSD', 'AUDJPY', 'EURAUD'],
      description: 'Reserve Bank of Australia interest rate announcement governing commodity currency risk appetite.',
      category: 'CENTRAL_BANK',
      offsetMinutes: 1440, // In 24 hours
    },
  ];

  // Distribute events realistically
  const scheduledEvents: EconomicEvent[] = baseCalendar.map((evt) => {
    const scheduledTime = now + evt.offsetMinutes * oneMinute;
    const { offsetMinutes, ...rest } = evt;
    return {
      ...rest,
      scheduledTime,
      scheduledTimeIso: new Date(scheduledTime).toISOString(),
    };
  });

  // Filter by symbol if requested
  const filteredEvents = symbol
    ? scheduledEvents.filter((e) => {
        const clean = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        return (
          e.affectedSymbols.some((s) => clean.includes(s) || s.includes(clean)) ||
          clean.includes(e.currency)
        );
      })
    : scheduledEvents;

  // Active risk alerts (events happening within 30 minutes)
  const activeAlerts: string[] = [];
  for (const evt of filteredEvents) {
    const diffMinutes = (evt.scheduledTime - now) / oneMinute;
    if (diffMinutes >= -15 && diffMinutes <= 30) {
      if (evt.impact === 'HIGH') {
        const mins = Math.round(diffMinutes);
        activeAlerts.push(
          `HIGH IMPACT ALERT: ${evt.title} (${evt.country}) ${mins > 0 ? `occurs in ${mins}m` : 'is in progress'}. Expect 3x spread expansion & execution slippage.`
        );
      }
    }
  }

  return {
    events: filteredEvents,
    activeAlerts,
    dataQuality: 'SIMULATED',
  };
}
