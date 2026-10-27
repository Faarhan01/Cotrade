import { dbSaveNewsCache, dbGetCachedNews } from '../../database/db.js';

export interface MarketNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: number;
  publishedAtIso: string;
  category: 'FOREX' | 'CRYPTO' | 'COMMODITY' | 'MACRO' | 'CENTRAL_BANK';
  relevantSymbols: string[];
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number; // -100 to +100
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 'LIVE' for items fetched from a real feed, 'SIMULATED' for curated placeholders. */
  dataQuality?: 'LIVE' | 'SIMULATED';
}

// In-memory cache for news items
let cachedNews: MarketNewsItem[] = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Hydrate news from SQLite on server start
(async () => {
  try {
    const saved = await dbGetCachedNews(undefined, undefined, 50);
    if (saved && saved.length > 0) {
      cachedNews = saved.map((s: any) => ({
        id: s.id,
        title: s.title,
        summary: s.summary,
        source: s.source,
        url: s.url || 'https://www.marketwatch.com',
        publishedAt: s.publishedAt || Date.now(),
        publishedAtIso: new Date(s.publishedAt || Date.now()).toISOString(),
        category: s.category || 'MACRO',
        relevantSymbols: s.relevantSymbols || ['EURUSD'],
        sentiment: s.sentiment || 'NEUTRAL',
        sentimentScore: s.sentimentScore || 0,
        impact: s.impact || 'MEDIUM',
        dataQuality: 'LIVE',
      }));
      lastFetchTime = Date.now();
    }
  } catch (err) {
    console.warn('[NewsEngine] Notice hydrating news cache from DB:', err);
  }
})();

/**
 * Curated live feeds and real-world fallback market intelligence
 */
const BASE_MARKET_NEWS: MarketNewsItem[] = [
  {
    id: 'news-fed-rate-cut',
    title: 'Federal Reserve Policy Shift Sparks Massive Dollar Movement',
    summary:
      'Federal Reserve officials reiterated data-dependent stance as inflation cools towards target. Treasury yields pulled back, providing upside lift to EURUSD, Gold (XAUUSD), and major risk assets.',
    source: 'Financial Market Intelligence',
    url: 'https://www.reuters.com/markets',
    publishedAt: Date.now() - 25 * 60 * 1000,
    publishedAtIso: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    category: 'CENTRAL_BANK',
    relevantSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'US30'],
    sentiment: 'BULLISH',
    sentimentScore: 65,
    impact: 'HIGH',
  },
  {
    id: 'news-gold-geopolitics',
    title: 'Gold Breaks Through Resistance Amid Safe-Haven Capital Flows',
    summary:
      'Spot Gold (XAUUSD) sustained strong bids above technical key levels as geopolitical tensions and central bank accumulation bolster demand. Institutional analysts raise targets.',
    source: 'Commodity & Bullion News',
    url: 'https://www.bloomberg.com/markets/commodities',
    publishedAt: Date.now() - 48 * 60 * 1000,
    publishedAtIso: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
    category: 'COMMODITY',
    relevantSymbols: ['XAUUSD', 'XAGUSD', 'USOIL'],
    sentiment: 'BULLISH',
    sentimentScore: 78,
    impact: 'HIGH',
  },
  {
    id: 'news-btc-accumulation',
    title: 'Bitcoin Institutional Holdings Expand as Spot ETF Daily Volumes Surge',
    summary:
      'Digital asset markets maintain bullish structure following consecutive days of net inflows into spot ETFs. On-chain metrics indicate steady coin accumulation by long-term holders.',
    source: 'Crypto Asset Research',
    url: 'https://www.coindesk.com',
    publishedAt: Date.now() - 75 * 60 * 1000,
    publishedAtIso: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    category: 'CRYPTO',
    relevantSymbols: ['BTCUSD', 'ETHUSD', 'SOLUSD'],
    sentiment: 'BULLISH',
    sentimentScore: 72,
    impact: 'MEDIUM',
  },
  {
    id: 'news-ecb-inflation',
    title: 'ECB Monitors Eurozone Wage Growth and Service Sector Price Pressures',
    summary:
      'European Central Bank policymakers signal gradual recalibration of borrowing rates while balancing softening economic momentum in manufacturing.',
    source: 'European Economic Dispatch',
    url: 'https://www.ft.com/europe',
    publishedAt: Date.now() - 110 * 60 * 1000,
    publishedAtIso: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    category: 'FOREX',
    relevantSymbols: ['EURUSD', 'EURGBP', 'EURJPY', 'GER40'],
    sentiment: 'NEUTRAL',
    sentimentScore: 10,
    impact: 'MEDIUM',
  },
  {
    id: 'news-boj-yen-intervention',
    title: 'Bank of Japan Emphasizes Rate Normalization Path as Yen Tests Key Psychological Bounds',
    summary:
      'Ministry of Finance and BOJ leaders issue warnings against speculative currency depreciation. Traders monitor Japanese government bond yields for signs of policy tightening.',
    source: 'Asia Markets Daily',
    url: 'https://asia.nikkei.com',
    publishedAt: Date.now() - 140 * 60 * 1000,
    publishedAtIso: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    category: 'FOREX',
    relevantSymbols: ['USDJPY', 'EURJPY', 'GBPJPY', 'JPN225'],
    sentiment: 'BULLISH',
    sentimentScore: 55,
    impact: 'HIGH',
  },
  {
    id: 'news-oil-supply',
    title: 'Crude Oil Consolidates Following Global Supply Adjustments',
    summary:
      'WTI and Brent crude trade near pivotal technical support zones as refining margins and seasonal demand shifts dictate near-term inventory dynamics.',
    source: 'Energy Intelligence Wire',
    url: 'https://www.reuters.com/business/energy',
    publishedAt: Date.now() - 180 * 60 * 1000,
    publishedAtIso: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    category: 'COMMODITY',
    relevantSymbols: ['USOIL', 'BRENT', 'USDCAD'],
    sentiment: 'NEUTRAL',
    sentimentScore: -5,
    impact: 'MEDIUM',
  },
];

/**
 * Fetch online news articles with multi-feed RSS/HTTP support and real-world fallback
 */
export async function fetchMarketNews(symbol?: string): Promise<MarketNewsItem[]> {
  const now = Date.now();

  if (cachedNews.length > 0 && now - lastFetchTime < CACHE_TTL_MS) {
    return filterNewsBySymbol(cachedNews, symbol);
  }

  // Attempt to fetch fresh live items from external financial RSS feeds
  const feedUrls = [
    { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch Top Stories' },
    { url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines', source: 'Dow Jones Real-Time' },
    { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance' },
  ];

  const aggregatedItems: MarketNewsItem[] = [];
  const seenTitles = new Set<string>();

  for (const feed of feedUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(feed.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const xmlText = await res.text();
        const parsedItems = parseRssItems(xmlText, feed.source);
        for (const item of parsedItems) {
          const normTitle = item.title.toLowerCase().trim();
          if (!seenTitles.has(normTitle)) {
            seenTitles.add(normTitle);
            aggregatedItems.push({ ...item, dataQuality: 'LIVE' });
          }
        }
      }
    } catch {
      // Continue to next feed
    }
  }

  if (aggregatedItems.length > 0) {
    // Sort chronological descending
    aggregatedItems.sort((a, b) => b.publishedAt - a.publishedAt);
    cachedNews = aggregatedItems;
    lastFetchTime = now;

    // Persist live feed items to SQLite
    dbSaveNewsCache(cachedNews).catch((e) => console.warn('[NewsEngine] Failed to persist news to SQLite:', e));
    return filterNewsBySymbol(cachedNews, symbol);
  }

  // If live RSS feeds were temporarily unreachable, check SQLite cache before falling back
  try {
    const fromDb = await dbGetCachedNews(symbol, undefined, 50);
    if (fromDb && fromDb.length > 0) {
      cachedNews = fromDb.map((s: any) => ({
        id: s.id,
        title: s.title,
        summary: s.summary,
        source: s.source,
        url: s.url || 'https://www.marketwatch.com',
        publishedAt: s.publishedAt || Date.now(),
        publishedAtIso: new Date(s.publishedAt || Date.now()).toISOString(),
        category: s.category || 'MACRO',
        relevantSymbols: s.relevantSymbols || ['EURUSD'],
        sentiment: s.sentiment || 'NEUTRAL',
        sentimentScore: s.sentimentScore || 0,
        impact: s.impact || 'MEDIUM',
        dataQuality: 'LIVE',
      }));
      lastFetchTime = now;
      return filterNewsBySymbol(cachedNews, symbol);
    }
  } catch (err) {
    // Fall back to baseline
  }

  // Baseline market intelligence
  cachedNews = BASE_MARKET_NEWS.map((n) => ({ ...n, dataQuality: 'SIMULATED' as const }));
  lastFetchTime = now;
  return filterNewsBySymbol(cachedNews, symbol);
}

/**
 * Robust XML item parser for financial RSS feeds
 */
function parseRssItems(xml: string, sourceName = 'Market Feed'): MarketNewsItem[] {
  const items: MarketNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = itemRegex.exec(xml)) !== null && count < 12) {
    const itemXml = match[1];
    const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
    const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
    const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

    const rawTitle = titleMatch ? titleMatch[1] || titleMatch[2] : '';
    if (!rawTitle) continue;

    const title = rawTitle.replace(/<[^>]*>/g, '').trim();
    const link = linkMatch ? linkMatch[1].trim() : 'https://www.marketwatch.com';
    const summary = descMatch ? (descMatch[1] || descMatch[2] || '').replace(/<[^>]*>/g, '').trim() : '';
    const pubDate = pubDateMatch ? new Date(pubDateMatch[1]).getTime() : Date.now();

    // Determine relevant symbols and category
    const upperText = `${title} ${summary}`.toUpperCase();
    const relevantSymbols: string[] = [];

    // Forex identification
    if (upperText.includes('EUR') || upperText.includes('EURO') || upperText.includes('ECB')) relevantSymbols.push('EURUSD');
    if (upperText.includes('GBP') || upperText.includes('POUND') || upperText.includes('STERLING') || upperText.includes('BOE')) relevantSymbols.push('GBPUSD');
    if (upperText.includes('JPY') || upperText.includes('YEN') || upperText.includes('BOJ')) relevantSymbols.push('USDJPY');
    if (upperText.includes('AUD') || upperText.includes('AUSSIE') || upperText.includes('RBA')) relevantSymbols.push('AUDUSD');
    if (upperText.includes('CAD') || upperText.includes('LOONIE') || upperText.includes('BOC')) relevantSymbols.push('USDCAD');

    // Metals & Commodities
    if (upperText.includes('GOLD') || upperText.includes('XAU') || upperText.includes('BULLION')) relevantSymbols.push('XAUUSD');
    if (upperText.includes('SILVER') || upperText.includes('XAG')) relevantSymbols.push('XAGUSD');
    if (upperText.includes('OIL') || upperText.includes('CRUDE') || upperText.includes('OPEC') || upperText.includes('WTI') || upperText.includes('BRENT')) relevantSymbols.push('USOIL');

    // Crypto
    if (upperText.includes('BITCOIN') || upperText.includes('BTC') || upperText.includes('CRYPTO')) relevantSymbols.push('BTCUSD');
    if (upperText.includes('ETHEREUM') || upperText.includes('ETH')) relevantSymbols.push('ETHUSD');
    if (upperText.includes('SOLANA') || upperText.includes('SOL')) relevantSymbols.push('SOLUSD');

    // Indices
    if (upperText.includes('DOW') || upperText.includes('WALL STREET') || upperText.includes('S&P') || upperText.includes('NASDAQ')) {
      relevantSymbols.push('US30', 'US500', 'NAS100');
    }

    // Default if no specific asset matched
    if (relevantSymbols.length === 0) {
      if (upperText.includes('DOLLAR') || upperText.includes('FED') || upperText.includes('INFLATION') || upperText.includes('TREASURY')) {
        relevantSymbols.push('EURUSD', 'USDJPY', 'XAUUSD');
      } else {
        relevantSymbols.push('EURUSD');
      }
    }

    let category: MarketNewsItem['category'] = 'MACRO';
    if (relevantSymbols.includes('BTCUSD') || relevantSymbols.includes('ETHUSD')) category = 'CRYPTO';
    else if (relevantSymbols.includes('XAUUSD') || relevantSymbols.includes('USOIL')) category = 'COMMODITY';
    else if (upperText.includes('FED') || upperText.includes('ECB') || upperText.includes('BOJ') || upperText.includes('RATE') || upperText.includes('POWELL')) category = 'CENTRAL_BANK';
    else if (relevantSymbols.some((s) => ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'].includes(s))) category = 'FOREX';

    let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let sentimentScore = 0;
    if (
      upperText.includes('SURGE') ||
      upperText.includes('GAIN') ||
      upperText.includes('RECORD') ||
      upperText.includes('RISE') ||
      upperText.includes('RALLY') ||
      upperText.includes('UPBEAT') ||
      upperText.includes('EXPAND') ||
      upperText.includes('BREAKOUT')
    ) {
      sentiment = 'BULLISH';
      sentimentScore = 65;
    } else if (
      upperText.includes('DROP') ||
      upperText.includes('FALL') ||
      upperText.includes('PLUNGE') ||
      upperText.includes('FEAR') ||
      upperText.includes('SLUMP') ||
      upperText.includes('SINK') ||
      upperText.includes('WARN') ||
      upperText.includes('RECESSION')
    ) {
      sentiment = 'BEARISH';
      sentimentScore = -65;
    }

    let impact: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    if (
      upperText.includes('FED') ||
      upperText.includes('RATE CUT') ||
      upperText.includes('RATE HIKE') ||
      upperText.includes('INFLATION') ||
      upperText.includes('CPI') ||
      upperText.includes('PAYROLL') ||
      upperText.includes('WAR') ||
      upperText.includes('SANCTION')
    ) {
      impact = 'HIGH';
    }

    items.push({
      id: `rss-${count}-${pubDate}`,
      title,
      summary: summary.slice(0, 260) + (summary.length > 260 ? '...' : ''),
      source: sourceName,
      url: link,
      publishedAt: pubDate,
      publishedAtIso: new Date(pubDate).toISOString(),
      category,
      relevantSymbols,
      sentiment,
      sentimentScore,
      impact,
      dataQuality: 'LIVE',
    });
    count++;
  }

  return items;
}


function filterNewsBySymbol(news: MarketNewsItem[], symbol?: string): MarketNewsItem[] {
  if (!symbol || symbol === 'ALL') return news;
  const clean = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return news.filter((item) => {
    return (
      item.relevantSymbols.some((s) => clean.includes(s) || s.includes(clean)) ||
      item.title.toUpperCase().includes(clean) ||
      item.summary.toUpperCase().includes(clean)
    );
  });
}
