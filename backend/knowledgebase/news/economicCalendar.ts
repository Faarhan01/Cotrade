import { dbSaveEconomicEvents, dbGetEconomicEvents } from '../../database/db.js';

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
  dataQuality?: 'LIVE' | 'SIMULATED';
}

function mapCurrencyToAffectedSymbols(currency: string, title: string): string[] {
  const c = currency.toUpperCase().trim();
  const t = title.toUpperCase();

  const syms = new Set<string>();

  if (c === 'USD') {
    syms.add('EURUSD');
    syms.add('GBPUSD');
    syms.add('USDJPY');
    syms.add('USDCHF');
    syms.add('USDCAD');
    syms.add('AUDUSD');
    syms.add('NZDUSD');
    syms.add('XAUUSD');
    syms.add('BTCUSD');
    syms.add('US30');
    syms.add('NAS100');
    syms.add('SPX500');
  } else if (c === 'EUR') {
    syms.add('EURUSD');
    syms.add('EURGBP');
    syms.add('EURJPY');
    syms.add('EURAUD');
    syms.add('EURCAD');
    syms.add('EURCHF');
    syms.add('GER40');
  } else if (c === 'GBP') {
    syms.add('GBPUSD');
    syms.add('EURGBP');
    syms.add('GBPJPY');
    syms.add('GBPAUD');
    syms.add('GBPCAD');
    syms.add('GBPCHF');
    syms.add('UK100');
  } else if (c === 'JPY') {
    syms.add('USDJPY');
    syms.add('EURJPY');
    syms.add('GBPJPY');
    syms.add('AUDJPY');
    syms.add('CADJPY');
    syms.add('CHFJPY');
    syms.add('JPN225');
  } else if (c === 'AUD') {
    syms.add('AUDUSD');
    syms.add('AUDJPY');
    syms.add('EURAUD');
    syms.add('GBPAUD');
    syms.add('AUDCAD');
    syms.add('AUDNZD');
  } else if (c === 'CAD') {
    syms.add('USDCAD');
    syms.add('EURCAD');
    syms.add('GBPCAD');
    syms.add('CADJPY');
    syms.add('AUDCAD');
  } else if (c === 'CHF') {
    syms.add('USDCHF');
    syms.add('EURCHF');
    syms.add('GBPCHF');
    syms.add('CHFJPY');
  } else if (c === 'NZD') {
    syms.add('NZDUSD');
    syms.add('AUDNZD');
    syms.add('NZDJPY');
  } else if (c === 'CNY') {
    syms.add('USDCNH');
    syms.add('AUDUSD');
  }

  if (t.includes('OIL') || t.includes('CRUDE') || t.includes('PETROLEUM')) {
    syms.add('USOIL');
    syms.add('BRENT');
    syms.add('USDCAD');
  }
  if (t.includes('GOLD') || t.includes('PRECIOUS')) {
    syms.add('XAUUSD');
    syms.add('XAGUSD');
  }
  if (t.includes('CRYPTO') || t.includes('BITCOIN') || t.includes('ETF')) {
    syms.add('BTCUSD');
    syms.add('ETHUSD');
  }

  return Array.from(syms);
}

function detectCategory(title: string): EconomicEvent['category'] {
  const t = title.toUpperCase();
  if (
    t.includes('RATE') ||
    t.includes('FOMC') ||
    t.includes('ECB') ||
    t.includes('BOJ') ||
    t.includes('RBA') ||
    t.includes('SNB') ||
    t.includes('POWELL') ||
    t.includes('LAGARDE') ||
    t.includes('CENTRAL BANK') ||
    t.includes('MONETARY')
  ) {
    return 'CENTRAL_BANK';
  }
  if (t.includes('CPI') || t.includes('INFLATION') || t.includes('PPI') || t.includes('PCE')) {
    return 'INFLATION';
  }
  if (
    t.includes('PAYROLL') ||
    t.includes('EMPLOY') ||
    t.includes('JOBLESS') ||
    t.includes('CLAIMS') ||
    t.includes('LABOR')
  ) {
    return 'EMPLOYMENT';
  }
  if (t.includes('GDP') || t.includes('GROWTH')) {
    return 'GDP';
  }
  if (t.includes('TRADE') || t.includes('EXPORT') || t.includes('IMPORT') || t.includes('CURRENT ACCOUNT')) {
    return 'TRADE';
  }
  if (t.includes('OIL') || t.includes('CRUDE') || t.includes('ENERGY') || t.includes('GAS') || t.includes('INVENTORY')) {
    return 'COMMODITY';
  }
  if (t.includes('BITCOIN') || t.includes('CRYPTO')) {
    return 'CRYPTO';
  }
  return 'CENTRAL_BANK';
}

// In-memory state cache
let g_cachedEvents: EconomicEvent[] = [];
let g_cachedDataQuality: 'LIVE' | 'SIMULATED' = 'SIMULATED';
let g_lastFetchTime = 0;

// Base calendar fallback in case of no internet access
const BASE_CALENDAR_DEFINITIONS: Array<
  Omit<EconomicEvent, 'scheduledTime' | 'scheduledTimeIso'> & { offsetMinutes: number }
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
    offsetMinutes: 25,
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
    offsetMinutes: 180,
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
    offsetMinutes: -45,
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
    offsetMinutes: 480,
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
    offsetMinutes: 720,
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
    offsetMinutes: -90,
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
    offsetMinutes: 300,
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
    offsetMinutes: 1440,
  },
];

function generateFallbackCalendar(): EconomicEvent[] {
  const now = Date.now();
  const oneMinute = 60 * 1000;
  return BASE_CALENDAR_DEFINITIONS.map((evt) => {
    const scheduledTime = now + evt.offsetMinutes * oneMinute;
    const { offsetMinutes, ...rest } = evt;
    return {
      ...rest,
      scheduledTime,
      scheduledTimeIso: new Date(scheduledTime).toISOString(),
      dataQuality: 'SIMULATED' as const,
    };
  });
}

/**
 * Proactively fetches live Forex Factory weekly economic calendar.
 * Caches events in SQLite and memory so all bot filters and UI displays
 * use genuine macroeconomic schedules.
 */
export async function refreshLiveEconomicCalendar(): Promise<EconomicEvent[]> {
  const now = Date.now();
  // Don't hammer the endpoint more than once every 5 minutes
  if (g_lastFetchTime > 0 && now - g_lastFetchTime < 5 * 60 * 1000 && g_cachedEvents.length > 0) {
    return g_cachedEvents;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ForexTradingBridge/2.5',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const rawEvents: any[] = await res.json();
      if (Array.isArray(rawEvents) && rawEvents.length > 0) {
        const parsed: EconomicEvent[] = rawEvents.map((item, idx) => {
          const rawImpact = String(item.impact || 'Low').trim().toLowerCase();
          let impact: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
          if (rawImpact === 'high') impact = 'HIGH';
          else if (rawImpact === 'medium') impact = 'MEDIUM';

          const currency = String(item.country || 'USD').toUpperCase().trim();
          const title = String(item.title || 'Economic Release').trim();
          const scheduledTime = new Date(item.date).getTime();
          const affected = mapCurrencyToAffectedSymbols(currency, title);
          const category = detectCategory(title);

          return {
            id: `ff-${idx}-${scheduledTime}-${currency}`,
            title,
            country: currency,
            currency,
            impact,
            scheduledTime,
            scheduledTimeIso: new Date(scheduledTime).toISOString(),
            forecast: item.forecast || '',
            previous: item.previous || '',
            actual: item.actual || '',
            affectedSymbols: affected,
            description: `${title} macroeconomic release for ${currency}. Impact rating: ${impact}.`,
            category,
            dataQuality: 'LIVE',
          };
        });

        // Sort chronologically
        parsed.sort((a, b) => a.scheduledTime - b.scheduledTime);

        g_cachedEvents = parsed;
        g_cachedDataQuality = 'LIVE';
        g_lastFetchTime = now;

        // Persist to SQLite
        dbSaveEconomicEvents(parsed).catch((err) =>
          console.warn('[EconomicCalendar] DB save error:', err?.message || err)
        );

        console.log(`[EconomicCalendar] Successfully refreshed ${parsed.length} live Forex events from Forex Factory`);
        return parsed;
      }
    }
  } catch (err: any) {
    console.warn(`[EconomicCalendar] Live calendar fetch failed (${err?.message || 'timeout'}). Checking SQLite cache...`);
  }

  // Fallback 1: Read from SQLite cached events
  try {
    const dbEvents = await dbGetEconomicEvents('ALL', 150);
    if (dbEvents && dbEvents.length > 0) {
      g_cachedEvents = dbEvents;
      g_cachedDataQuality = 'LIVE';
      g_lastFetchTime = now;
      return dbEvents;
    }
  } catch {}

  // Fallback 2: Static representative calendar
  if (g_cachedEvents.length === 0) {
    g_cachedEvents = generateFallbackCalendar();
    g_cachedDataQuality = 'SIMULATED';
  }
  return g_cachedEvents;
}

export function getUpcomingEconomicEvents(symbol?: string): {
  events: EconomicEvent[];
  activeAlerts: string[];
  dataQuality: 'LIVE' | 'SIMULATED';
} {
  const now = Date.now();
  const oneMinute = 60 * 1000;

  if (g_cachedEvents.length === 0) {
    // If not yet hydrated, initialize with fallback
    g_cachedEvents = generateFallbackCalendar();
    // Proactively kick off live refresh
    refreshLiveEconomicCalendar().catch(() => {});
  }

  const events = g_cachedEvents;

  // Filter by symbol if requested
  const filteredEvents = symbol
    ? events.filter((e) => {
        const clean = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        return (
          e.affectedSymbols.some((s) => clean.includes(s) || s.includes(clean)) ||
          clean.includes(e.currency)
        );
      })
    : events;

  // Active risk alerts (events happening within 30 minutes or completed in the last 15 minutes)
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
    dataQuality: g_cachedDataQuality,
  };
}
