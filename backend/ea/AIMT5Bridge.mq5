//+------------------------------------------------------------------+
//|                                                AIMT5Bridge.mq5   |
//|                         AI Copilot & Model Context Protocol (MCP)|
//|                                    Copyright 2026, AI MT5 Bridge |
//|                                        http://127.0.0.1:7777     |
//+------------------------------------------------------------------+
#property copyright "AI MT5 Bridge"
#property link      "http://127.0.0.1:7777"
#property version   "2.40"
#property description "Connects MetaTrader 5 to external AI via Local MCP/REST Bridge (http://127.0.0.1:7777 or :3000)"
#property description "Enables asynchronous AI trade execution, real-time tick streaming, spread protection, and position management."

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\AccountInfo.mqh>
#include <Trade\SymbolInfo.mqh>

//--- Input parameters
input group "=== Bridge Connection Settings ==="
input string   InpBridgeUrl         = "http://127.0.0.1:3000"; // Primary Bridge URL (Unified Port 3000)
input string   InpBridgeUrlFallback = "http://127.0.0.1:7777"; // Fallback URL (Port 7777)
input string   InpApiKey            = "mt5_bridge_secret_key"; // Bridge API Secret
input int      InpTimerIntervalMs   = 500;                     // Polling & sync interval (milliseconds)

input group "=== Trade & Execution Parameters ==="
input ulong    InpMagicNumber       = 889900;                  // EA Magic Number for AI Orders
input ulong    InpDefaultSlippage   = 10;                      // Slippage points
input string   InpSymbolsToTrack    = "EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD"; // Symbols for live stream (comma-separated)
input int      InpHistoryCandles    = 60;                      // Past chart candles (OHLCV) to transmit
input int      InpMaxTrackedSymbols = 300;                     // Max Market Watch & auto-discovered symbols to track

input group "=== Risk & Spread Guard ==="
input int      InpMaxSpreadPoints   = 80;                      // Max allowable spread (points) for execution (0 to disable)
input bool     InpEnableBreakeven   = true;                    // Enable Automatic Breakeven Protection
input int      InpBreakevenTrigger  = 120;                     // Profit in points to trigger Breakeven move
input int      InpBreakevenLock     = 15;                      // Lock-in profit in points above entry

input group "=== Trailing Stop & Risk Guard ==="
input bool     InpEnableTrailing    = true;                    // Enable Trailing Stop Engine
input int      InpTrailingPoints    = 150;                     // Trailing Stop Distance (points)
input int      InpTrailingStep      = 30;                      // Trailing Step (points)
input bool     InpTrailAllPositions = true;                    // Trail ALL positions (including manual & Web UI)
input bool     InpAdaptiveTrailing  = true;                    // Automatically adapt trailing distance to symbol scale
input bool     InpAutoSyncTicks     = true;                    // Stream live tick data to Bridge

//--- Global objects
CTrade         m_trade;
CPositionInfo  m_position;
CAccountInfo   m_account;
CSymbolInfo    m_symbol;

//--- State tracking
datetime       g_lastSyncTime = 0;
bool           g_isSyncing = false;
string         g_trackedSymbols[];
int            g_trackedCount = 0;
string         g_onDemandHistoryJson = "";

//--- Mutable runtime copies of risk/trailing parameters.
// MQL5 `input` values are read-only constants, so the bridge cannot rewrite
// them at runtime. These mirrors are the single source of truth once the EA
// starts, and the SET_RISK_GUARD command updates them instead.
int    g_TrailingPoints     = InpTrailingPoints;
int    g_TrailingStep       = InpTrailingStep;
bool   g_EnableTrailing     = InpEnableTrailing;
bool   g_EnableBreakeven    = InpEnableBreakeven;
int    g_BreakevenTrigger   = InpBreakevenTrigger;
int    g_BreakevenLock      = InpBreakevenLock;

//+------------------------------------------------------------------+
//| Convert string timeframe to ENUM_TIMEFRAMES                      |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES StringToTimeframe(string tf)
{
   if(tf == "M1") return PERIOD_M1;
   if(tf == "M2") return PERIOD_M2;
   if(tf == "M3") return PERIOD_M3;
   if(tf == "M4") return PERIOD_M4;
   if(tf == "M5") return PERIOD_M5;
   if(tf == "M6") return PERIOD_M6;
   if(tf == "M10") return PERIOD_M10;
   if(tf == "M12") return PERIOD_M12;
   if(tf == "M15") return PERIOD_M15;
   if(tf == "M20") return PERIOD_M20;
   if(tf == "M30") return PERIOD_M30;
   if(tf == "H1") return PERIOD_H1;
   if(tf == "H2") return PERIOD_H2;
   if(tf == "H3") return PERIOD_H3;
   if(tf == "H4") return PERIOD_H4;
   if(tf == "H6") return PERIOD_H6;
   if(tf == "H8") return PERIOD_H8;
   if(tf == "H12") return PERIOD_H12;
   if(tf == "D1") return PERIOD_D1;
   if(tf == "W1") return PERIOD_W1;
   if(tf == "MN1") return PERIOD_MN1;
   return Period();
}

//+------------------------------------------------------------------+
//| Convert ENUM_TIMEFRAMES to the canonical application code (M1,   |
//| H1, D1, ...) so the bridge never has to translate PERIOD_ enum   |
//| names. Keeps the EA and the server on one vocabulary.            |
//+------------------------------------------------------------------+
string TimeframeToString(ENUM_TIMEFRAMES tf)
{
   switch(tf)
   {
      case PERIOD_M1: return "M1";
      case PERIOD_M2: return "M2";
      case PERIOD_M3: return "M3";
      case PERIOD_M4: return "M4";
      case PERIOD_M5: return "M5";
      case PERIOD_M6: return "M6";
      case PERIOD_M10: return "M10";
      case PERIOD_M12: return "M12";
      case PERIOD_M15: return "M15";
      case PERIOD_M20: return "M20";
      case PERIOD_M30: return "M30";
      case PERIOD_H1: return "H1";
      case PERIOD_H2: return "H2";
      case PERIOD_H3: return "H3";
      case PERIOD_H4: return "H4";
      case PERIOD_H6: return "H6";
      case PERIOD_H8: return "H8";
      case PERIOD_H12: return "H12";
      case PERIOD_D1: return "D1";
      case PERIOD_W1: return "W1";
      case PERIOD_MN1: return "MN1";
   }
   return EnumToString(tf);
}

//+------------------------------------------------------------------+
//| Convert datetime to standardized ISO-8601 string                 |
//+------------------------------------------------------------------+
string TimeToISO(datetime t)
{
   if(t <= 0) t = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(t, dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

//--- Execution Result Queue
struct TradeResultItem
{
   string commandId;
   bool   success;
   ulong  dealTicket;
   ulong  orderTicket;
   double executionPrice;
   int    errorCode;
   string errorMessage;
   int    executionTimeMs;
   int    slippagePoints;
   string timestampIso;
};
TradeResultItem g_resultQueue[20];
int             g_resultCount = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("=========================================================");
   Print("  AI MT5 Bridge EA Starting Up...                       ");
   Print("  Target Bridge URL: ", InpBridgeUrl);
   Print("  Magic Number: ", InpMagicNumber);
   Print("=========================================================");

   // Configure trade object
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(InpDefaultSlippage);
   m_trade.SetTypeFilling(ORDER_FILLING_IOC);

   // Parse symbols to track
   ParseSymbols();

   // Verify WebRequest capability
   char postData[], resultData[];
   string resultHeaders;
   int res = WebRequest("GET", InpBridgeUrl + "/health", "", 1000, postData, resultData, resultHeaders);
   if(res == -1)
   {
      int err = GetLastError();
      Print("WARNING: WebRequest test failed! Error code: ", err);
      Print("IMPORTANT: In MT5, go to: Tools -> Options -> Expert Advisors");
      Print("Check 'Allow WebRequest for listed URL' and add: ", InpBridgeUrl);
      Print("Also add fallback URL if needed: http://127.0.0.1:3000");
   }
   else
   {
      Print("SUCCESS: Connected to AI MT5 Bridge at ", InpBridgeUrl, " (HTTP ", res, ")");
   }

   // Subscribe to Depth of Market / Order Book if supported
   MarketBookAdd(_Symbol);

   // Initialize millisecond timer for ultra-fast asynchronous execution
   EventSetMillisecondTimer(InpTimerIntervalMs);

   // Perform immediate initial synchronization to register connection instantly
   SyncWithBridge();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   MarketBookRelease(_Symbol);
   Print("AI MT5 Bridge EA Deinitialized. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Expert timer function (High frequency sync)                      |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(g_isSyncing) return;
   g_isSyncing = true;

   // 1. Process local trailing stops if enabled
   if(g_EnableTrailing)
   {
      ProcessTrailingStops();
   }

   // 2. Process local breakeven protection if enabled
   if(g_EnableBreakeven)
   {
      ProcessBreakevenProtection();
   }

   // 3. Synchronize with Bridge server
   SyncWithBridge();

   g_isSyncing = false;
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Sub-millisecond tick execution: trail stops and lock in profits the instant price moves favorably
   if(g_EnableBreakeven)
   {
      ProcessBreakevenProtection();
   }
   if(g_EnableTrailing)
   {
      ProcessTrailingStops();
   }
}


//+------------------------------------------------------------------+
//| Parse comma-separated symbols                                    |
//+------------------------------------------------------------------+
void ParseSymbols()
{
   string temp = InpSymbolsToTrack;
   StringTrimLeft(temp);
   StringTrimRight(temp);
   g_trackedCount = 0;
   
   string sep = ",";
   ushort u_sep = StringGetCharacter(sep, 0);
   StringSplit(temp, u_sep, g_trackedSymbols);
   g_trackedCount = ArraySize(g_trackedSymbols);

   // Always ensure current chart symbol is included
   bool hasCurrent = false;
   for(int i = 0; i < g_trackedCount; i++)
   {
      StringTrimLeft(g_trackedSymbols[i]);
      StringTrimRight(g_trackedSymbols[i]);
      if(g_trackedSymbols[i] == _Symbol) hasCurrent = true;
   }
   if(!hasCurrent)
   {
      ArrayResize(g_trackedSymbols, g_trackedCount + 1);
      g_trackedSymbols[g_trackedCount] = _Symbol;
      g_trackedCount++;
   }

   // Auto-discover Market Watch symbols from terminal (up to InpMaxTrackedSymbols)
   int totalMW = SymbolsTotal(true);
   for(int m = 0; m < totalMW && g_trackedCount < InpMaxTrackedSymbols; m++)
   {
      string mwSym = SymbolName(m, true);
      bool alreadyAdded = false;
      for(int k = 0; k < g_trackedCount; k++)
      {
         if(g_trackedSymbols[k] == mwSym) { alreadyAdded = true; break; }
      }
      if(!alreadyAdded && mwSym != "")
      {
         ArrayResize(g_trackedSymbols, g_trackedCount + 1);
         g_trackedSymbols[g_trackedCount] = mwSym;
         g_trackedCount++;
      }
   }
}

//+------------------------------------------------------------------+
//| Add a symbol to the tracked list dynamically                     |
//+------------------------------------------------------------------+
bool AddTrackedSymbol(string sym)
{
   if(sym == "") return false;
   StringTrimLeft(sym);
   StringTrimRight(sym);
   for(int i = 0; i < g_trackedCount; i++)
   {
      if(g_trackedSymbols[i] == sym) return true;
   }
   // Select symbol into Market Watch if not already there
   SymbolSelect(sym, true);
   ArrayResize(g_trackedSymbols, g_trackedCount + 1);
   g_trackedSymbols[g_trackedCount] = sym;
   g_trackedCount++;
   return true;
}

//+------------------------------------------------------------------+
//| Sync state with Bridge and receive AI commands                   |
//+------------------------------------------------------------------+
void SyncWithBridge()
{
   string payload = BuildSyncJson();
   char postData[];
   char resultData[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";
   
   StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   // Exclude terminating null char from POST body
   int dataLen = ArraySize(postData) - 1;
   if(dataLen > 0) ArrayResize(postData, dataLen);

   string targetUrl = InpBridgeUrl + "/sync";
   int httpCode = WebRequest("POST", targetUrl, headers, 1500, postData, resultData, resultHeaders);
   
   // Try fallback if primary fails
   if(httpCode == -1 && InpBridgeUrlFallback != "")
   {
      targetUrl = InpBridgeUrlFallback + "/sync";
      httpCode = WebRequest("POST", targetUrl, headers, 1500, postData, resultData, resultHeaders);
   }

   if(httpCode == 200)
   {
      g_lastSyncTime = TimeCurrent();
      // Clear reported execution results
      g_resultCount = 0;

      string responseStr = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      ProcessServerResponse(responseStr);
   }
   else
   {
      // Connection issue or waiting for bridge
      static datetime lastErrLog = 0;
      if(TimeCurrent() - lastErrLog > 10)
      {
         lastErrLog = TimeCurrent();
         Print("Bridge sync waiting... (HTTP code: ", httpCode, ", LastError: ", GetLastError(), ")");
      }
   }
}

//+------------------------------------------------------------------+
//| Build full JSON string of account, open positions, ticks         |
//+------------------------------------------------------------------+
string BuildSyncJson()
{
   string json = "{";
   
   // API Key & Meta
   datetime curTime = TimeCurrent();
   datetime gmtTime = TimeGMT();
   datetime locTime = TimeLocal();
   int tzOffset = (int)((curTime - gmtTime) / 3600);

   json += "\"apiKey\":\"" + InpApiKey + "\",";
   json += "\"eaVersion\":\"2.30\",";
   json += "\"mt5Time\":" + IntegerToString((long)curTime) + ",";
   json += "\"mt5TimeIso\":\"" + TimeToISO(curTime) + "\",";
   json += "\"gmtTime\":" + IntegerToString((long)gmtTime) + ",";
   json += "\"gmtTimeIso\":\"" + TimeToISO(gmtTime) + "\",";
   json += "\"localTime\":" + IntegerToString((long)locTime) + ",";
   json += "\"timezoneOffsetHours\":" + IntegerToString(tzOffset) + ",";
   json += "\"terminalName\":\"" + EscapeJson(TerminalInfoString(TERMINAL_NAME)) + "\",";
   json += "\"terminalCompany\":\"" + EscapeJson(TerminalInfoString(TERMINAL_COMPANY)) + "\",";
   json += "\"terminalBuild\":" + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + ",";
   json += "\"terminalMaxBars\":" + IntegerToString(TerminalInfoInteger(TERMINAL_MAXBARS)) + ",";
   json += "\"terminalDllsAllowed\":" + ((TerminalInfoInteger(TERMINAL_DLLS_ALLOWED) != 0) ? "true" : "false") + ",";
   json += "\"terminalTradeApiDisabled\":" + ((TerminalInfoInteger(TERMINAL_TRADEAPI_DISABLED) != 0) ? "true" : "false") + ",";
   json += "\"terminalPingLast\":" + IntegerToString(TerminalInfoInteger(TERMINAL_PING_LAST)) + ",";
   json += "\"totalBrokerSymbols\":" + IntegerToString(SymbolsTotal(false)) + ",";
   json += "\"marketWatchSymbolsCount\":" + IntegerToString(SymbolsTotal(true)) + ",";

   // Terminal Permissions & Operational Safeguards
   json += "\"terminalPermissions\":{";
   json += "\"terminalConnected\":" + ((TerminalInfoInteger(TERMINAL_CONNECTED) != 0) ? "true" : "false") + ",";
   json += "\"terminalTradeAllowed\":" + ((TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) != 0) ? "true" : "false") + ",";
   json += "\"mqlTradeAllowed\":" + ((MQLInfoInteger(MQL_TRADE_ALLOWED) != 0) ? "true" : "false") + ",";
   json += "\"accountTradeAllowed\":" + ((AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) != 0) ? "true" : "false") + ",";
   json += "\"accountExpertAllowed\":" + ((AccountInfoInteger(ACCOUNT_TRADE_EXPERT) != 0) ? "true" : "false") + ",";
   json += "\"accountLimitOrders\":" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LIMIT_ORDERS)) + ",";
   json += "\"terminalMaxBars\":" + IntegerToString(TerminalInfoInteger(TERMINAL_MAXBARS)) + ",";
   json += "\"terminalDllsAllowed\":" + ((TerminalInfoInteger(TERMINAL_DLLS_ALLOWED) != 0) ? "true" : "false") + ",";
   json += "\"terminalTradeApiDisabled\":" + ((TerminalInfoInteger(TERMINAL_TRADEAPI_DISABLED) != 0) ? "true" : "false") + ",";
   json += "\"terminalPingLast\":" + IntegerToString(TerminalInfoInteger(TERMINAL_PING_LAST)) + ",";
   json += "\"totalBrokerSymbols\":" + IntegerToString(SymbolsTotal(false)) + ",";
   json += "\"marketWatchSymbolsCount\":" + IntegerToString(SymbolsTotal(true));
   json += "},";

   // Current Active Chart Info & Microstructure Telemetry
   MqlRates currentD1[];
   double cSessionOpen = 0.0, cSessionHigh = 0.0, cSessionLow = 0.0;
   long cSessionVolume = 0;
   if(CopyRates(_Symbol, PERIOD_D1, 0, 1, currentD1) > 0)
   {
      cSessionOpen = currentD1[0].open;
      cSessionHigh = currentD1[0].high;
      cSessionLow = currentD1[0].low;
      cSessionVolume = (long)currentD1[0].tick_volume;
   }

   // Current Bar on Chart Timeframe (Bar 0 - active forming candle)
   MqlRates currentTF[];
   datetime curBarTime = 0;
   long curBarTickVol = 0;
   long curBarRealVol = 0;
   if(CopyRates(_Symbol, Period(), 0, 1, currentTF) > 0)
   {
      curBarTime = currentTF[0].time;
      curBarTickVol = (long)currentTF[0].tick_volume;
      curBarRealVol = (long)currentTF[0].real_volume;
   }

   int pSecs = (int)PeriodSeconds(Period());
   int barElapsed = (int)(curTime - curBarTime);
   if(barElapsed < 0) barElapsed = 0;
   int barRemaining = (pSecs > barElapsed) ? (pSecs - barElapsed) : 0;
   double barProgress = (pSecs > 0) ? MathMin(100.0, ((double)barElapsed / (double)pSecs) * 100.0) : 0.0;

   // Chart Window State (visual viewport from terminal)
   int firstVisBar = (int)ChartGetInteger(0, CHART_FIRST_VISIBLE_BAR);
   int visBars = (int)ChartGetInteger(0, CHART_VISIBLE_BARS);
   double pMax = ChartGetDouble(0, CHART_PRICE_MAX);
   double pMin = ChartGetDouble(0, CHART_PRICE_MIN);
   int cScale = (int)ChartGetInteger(0, CHART_SCALE);
   int cMode = (int)ChartGetInteger(0, CHART_MODE);
   bool cAutoscroll = (bool)ChartGetInteger(0, CHART_AUTOSCROLL);

   json += "\"currentChart\":{";
   json += "\"symbol\":\"" + _Symbol + "\",";
   json += "\"timeframe\":\"" + TimeframeToString(Period()) + "\",";
   json += "\"periodSeconds\":" + IntegerToString(pSecs) + ",";
   json += "\"digits\":" + IntegerToString(_Digits) + ",";
   json += "\"point\":" + DoubleToString(_Point, _Digits) + ",";
   json += "\"bid\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_BID), _Digits) + ",";
   json += "\"ask\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_ASK), _Digits) + ",";
   json += "\"spread\":" + IntegerToString((int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD)) + ",";
   json += "\"minLot\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), 2) + ",";
   json += "\"maxLot\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX), 2) + ",";
   json += "\"lotStep\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), 2) + ",";
   json += "\"contractSize\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE), 2) + ",";
   json += "\"tickValue\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE), 4) + ",";
   json += "\"stopsLevel\":" + IntegerToString((int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL)) + ",";
   json += "\"freezeLevel\":" + IntegerToString((int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_FREEZE_LEVEL)) + ",";
   json += "\"tradeAllowed\":" + ((SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE) != SYMBOL_TRADE_MODE_DISABLED) ? "true" : "false") + ",";
   json += "\"sessionOpen\":" + DoubleToString(cSessionOpen, _Digits) + ",";
   json += "\"sessionHigh\":" + DoubleToString(cSessionHigh, _Digits) + ",";
   json += "\"sessionLow\":" + DoubleToString(cSessionLow, _Digits) + ",";
   json += "\"sessionVolume\":" + IntegerToString(cSessionVolume) + ",";
   json += "\"currentBarTime\":" + IntegerToString((long)curBarTime) + ",";
   json += "\"currentBarTimeIso\":\"" + TimeToISO(curBarTime) + "\",";
   json += "\"currentBarSecondsRemaining\":" + IntegerToString(barRemaining) + ",";
   json += "\"currentBarProgressPercent\":" + DoubleToString(barProgress, 1) + ",";
   json += "\"isBarClosed\":false,";
   json += "\"tickVolume\":" + IntegerToString(curBarTickVol) + ",";
   json += "\"realVolume\":" + IntegerToString(curBarRealVol) + ",";
   json += "\"chartFirstVisibleBar\":" + IntegerToString(firstVisBar) + ",";
   json += "\"chartVisibleBars\":" + IntegerToString(visBars) + ",";
   json += "\"chartPriceMax\":" + DoubleToString(pMax, _Digits) + ",";
   json += "\"chartPriceMin\":" + DoubleToString(pMin, _Digits) + ",";
   json += "\"chartScale\":" + IntegerToString(cScale) + ",";
   json += "\"chartMode\":" + IntegerToString(cMode) + ",";
   json += "\"chartAutoscroll\":" + (cAutoscroll ? "true" : "false") + ",";
   json += "\"gmtTime\":" + IntegerToString((long)gmtTime) + ",";
   json += "\"gmtTimeIso\":\"" + TimeToISO(gmtTime) + "\",";
   json += "\"timezoneOffsetHours\":" + IntegerToString(tzOffset) + ",";
   json += "\"description\":\"" + EscapeJson(SymbolInfoString(_Symbol, SYMBOL_DESCRIPTION)) + "\",";
   json += "\"currencyBase\":\"" + SymbolInfoString(_Symbol, SYMBOL_CURRENCY_BASE) + "\",";
   json += "\"currencyProfit\":\"" + SymbolInfoString(_Symbol, SYMBOL_CURRENCY_PROFIT) + "\"";
   json += "},";

   // All Tracked Symbols Detailed Info
   json += "\"allSymbols\":[";
   for(int s = 0; s < g_trackedCount; s++)
   {
      string sym = g_trackedSymbols[s];
      if(SymbolSelect(sym, true))
      {
         if(s > 0) json += ",";
         int sDigits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         MqlRates symD1[];
         double sOpen = 0.0, sHigh = 0.0, sLow = 0.0;
         if(CopyRates(sym, PERIOD_D1, 0, 1, symD1) > 0)
         {
            sOpen = symD1[0].open;
            sHigh = symD1[0].high;
            sLow  = symD1[0].low;
         }
         json += "{";
         json += "\"symbol\":\"" + sym + "\",";
         json += "\"bid\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_BID), sDigits) + ",";
         json += "\"ask\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_ASK), sDigits) + ",";
         json += "\"spread\":" + IntegerToString((int)SymbolInfoInteger(sym, SYMBOL_SPREAD)) + ",";
         json += "\"digits\":" + IntegerToString(sDigits) + ",";
         json += "\"point\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_POINT), sDigits) + ",";
         json += "\"minLot\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), 2) + ",";
         json += "\"maxLot\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX), 2) + ",";
         json += "\"lotStep\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), 2) + ",";
         json += "\"contractSize\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE), 2) + ",";
         json += "\"stopsLevel\":" + IntegerToString((int)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL)) + ",";
         json += "\"freezeLevel\":" + IntegerToString((int)SymbolInfoInteger(sym, SYMBOL_TRADE_FREEZE_LEVEL)) + ",";
         json += "\"tickValue\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE), 4) + ",";
         json += "\"tickSize\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE), sDigits) + ",";
         
         ENUM_SYMBOL_TRADE_MODE sTradeMode = (ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(sym, SYMBOL_TRADE_MODE);
         string sTradeModeStr = "FULL";
         if(sTradeMode == SYMBOL_TRADE_MODE_DISABLED) sTradeModeStr = "DISABLED";
         else if(sTradeMode == SYMBOL_TRADE_MODE_LONGONLY) sTradeModeStr = "LONGONLY";
         else if(sTradeMode == SYMBOL_TRADE_MODE_SHORTONLY) sTradeModeStr = "SHORTONLY";
         else if(sTradeMode == SYMBOL_TRADE_MODE_CLOSEONLY) sTradeModeStr = "CLOSEONLY";

         json += "\"tradeAllowed\":" + ((sTradeMode != SYMBOL_TRADE_MODE_DISABLED && sTradeMode != SYMBOL_TRADE_MODE_CLOSEONLY) ? "true" : "false") + ",";
         json += "\"tradeMode\":\"" + sTradeModeStr + "\",";
         json += "\"spreadFloat\":" + ((SymbolInfoInteger(sym, SYMBOL_SPREAD_FLOAT) != 0) ? "true" : "false") + ",";
         json += "\"fillingMode\":" + IntegerToString((int)SymbolInfoInteger(sym, SYMBOL_FILLING_MODE)) + ",";
         json += "\"bookDepth\":" + ((SymbolInfoInteger(sym, SYMBOL_TICKS_BOOKDEPTH) > 0) ? "true" : "false") + ",";
         json += "\"sessionOpen\":" + DoubleToString(sOpen, sDigits) + ",";
         json += "\"sessionHigh\":" + DoubleToString(sHigh, sDigits) + ",";
         json += "\"sessionLow\":" + DoubleToString(sLow, sDigits) + ",";
         json += "\"isCurrentChart\":" + (sym == _Symbol ? "true" : "false") + ",";
         json += "\"swapLong\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_SWAP_LONG), 2) + ",";
         json += "\"swapShort\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_SWAP_SHORT), 2) + ",";
         json += "\"marginInitial\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_MARGIN_INITIAL), 2) + ",";
         json += "\"marginMaintenance\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_MARGIN_MAINTENANCE), 2) + ",";
         json += "\"description\":\"" + EscapeJson(SymbolInfoString(sym, SYMBOL_DESCRIPTION)) + "\",";
         json += "\"currencyBase\":\"" + SymbolInfoString(sym, SYMBOL_CURRENCY_BASE) + "\",";
         json += "\"currencyProfit\":\"" + SymbolInfoString(sym, SYMBOL_CURRENCY_PROFIT) + "\"";
         json += "}";
      }
   }
   json += "],";

   // Market Depth / DOM for active symbol
   json += "\"marketDepth\":{";
   json += "\"symbol\":\"" + _Symbol + "\",";
   json += "\"items\":[";
   MqlBookInfo book[];
   if(MarketBookGet(_Symbol, book))
   {
      int bookSize = ArraySize(book);
      for(int b = 0; b < bookSize && b < 10; b++)
      {
         if(b > 0) json += ",";
         json += "{";
         json += "\"type\":\"" + (book[b].type == BOOK_TYPE_BUY ? "BUY" : "SELL") + "\",";
         json += "\"price\":" + DoubleToString(book[b].price, _Digits) + ",";
         json += "\"volume\":" + DoubleToString(book[b].volume_real > 0 ? book[b].volume_real : (double)book[b].volume, 2);
         json += "}";
      }
   }
   json += "]},";

   // Chart History (transmits full history on initial sync, then latest bars every 5 seconds to eliminate duplicate payload waste)
   static datetime s_lastHistorySend = 0;
   static bool s_initialHistoryDone = false;
   if(TimeCurrent() - s_lastHistorySend >= 5)
   {
      s_lastHistorySend = TimeCurrent();
      int barsToSend = (!s_initialHistoryDone) ? InpHistoryCandles : 5;
      s_initialHistoryDone = true;
      json += "\"chartHistory\":" + BuildChartHistoryJson(barsToSend) + ",";
   }

   // On-demand history payload if requested by Bridge
   if(g_onDemandHistoryJson != "")
   {
      json += "\"historyPayload\":" + g_onDemandHistoryJson + ",";
      g_onDemandHistoryJson = "";
   }

   // Account Info
   json += "\"account\":{";
   json += "\"login\":" + IntegerToString(m_account.Login()) + ",";
   // Report the short code the backend expects ("DEMO"/"REAL"/"CONTEST")
   // instead of the raw enum name ("ACCOUNT_TRADE_MODE_DEMO").
   string tm = "DEMO";
   ENUM_ACCOUNT_TRADE_MODE tmode = m_account.TradeMode();
   if(tmode == ACCOUNT_TRADE_MODE_REAL) tm = "REAL";
   else if(tmode == ACCOUNT_TRADE_MODE_CONTEST) tm = "CONTEST";
   json += "\"tradeMode\":\"" + tm + "\",";
   json += "\"balance\":" + DoubleToString(m_account.Balance(), 2) + ",";
   json += "\"equity\":" + DoubleToString(m_account.Equity(), 2) + ",";
   json += "\"margin\":" + DoubleToString(m_account.Margin(), 2) + ",";
   json += "\"freeMargin\":" + DoubleToString(m_account.FreeMargin(), 2) + ",";
   json += "\"marginLevel\":" + DoubleToString(m_account.MarginLevel(), 2) + ",";
   json += "\"leverage\":" + IntegerToString(m_account.Leverage()) + ",";
   json += "\"currency\":\"" + m_account.Currency() + "\",";
   json += "\"server\":\"" + m_account.Server() + "\",";
   json += "\"company\":\"" + m_account.Company() + "\",";
   json += "\"profit\":" + DoubleToString(m_account.Profit(), 2) + ",";
   json += "\"lastUpdate\":" + IntegerToString((long)TimeCurrent());
   json += "},";

   // Open Positions
   json += "\"positions\":[";
   int totalPositions = PositionsTotal();
   int addedPositions = 0;
   for(int i = 0; i < totalPositions; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         bool isPosBuy = (m_position.PositionType() == POSITION_TYPE_BUY);
         double pSl = m_position.StopLoss();
         double pOpen = m_position.PriceOpen();
         double pCurr = m_position.PriceCurrent();
         bool isBeLocked = isPosBuy ? (pSl >= pOpen && pSl > 0) : (pSl <= pOpen && pSl > 0);
         string posSym = m_position.Symbol();
         double pPt = SymbolInfoDouble(posSym, SYMBOL_POINT);
         if(pPt <= 0) pPt = _Point;
         int stopDistPts = (pSl > 0) ? (int)MathRound(MathAbs(pCurr - pSl) / pPt) : 0;

         if(addedPositions > 0) json += ",";
         json += "{";
         json += "\"ticket\":" + IntegerToString(ticket) + ",";
         json += "\"symbol\":\"" + m_position.Symbol() + "\",";
         json += "\"type\":\"" + (isPosBuy ? "BUY" : "SELL") + "\",";
         json += "\"volume\":" + DoubleToString(m_position.Volume(), 2) + ",";
         json += "\"openPrice\":" + DoubleToString(m_position.PriceOpen(), 5) + ",";
         json += "\"currentPrice\":" + DoubleToString(m_position.PriceCurrent(), 5) + ",";
         json += "\"sl\":" + DoubleToString(m_position.StopLoss(), 5) + ",";
         json += "\"tp\":" + DoubleToString(m_position.TakeProfit(), 5) + ",";
         json += "\"profit\":" + DoubleToString(m_position.Profit(), 2) + ",";
         json += "\"swap\":" + DoubleToString(m_position.Swap(), 2) + ",";
         json += "\"magic\":" + IntegerToString(m_position.Magic()) + ",";
         json += "\"comment\":\"" + EscapeJson(m_position.Comment()) + "\",";
         json += "\"openTime\":" + IntegerToString((long)m_position.Time()) + ",";
         json += "\"openTimeIso\":\"" + TimeToISO((datetime)m_position.Time()) + "\",";
         json += "\"trailingActive\":" + (g_EnableTrailing ? "true" : "false") + ",";
         json += "\"breakevenLocked\":" + (isBeLocked ? "true" : "false") + ",";
         json += "\"stopDistancePoints\":" + IntegerToString(stopDistPts);
         json += "}";
         addedPositions++;
      }
   }
   json += "],";

   // Pending Orders (Limit / Stop Orders)
   json += "\"pendingOrders\":[";
   int totalOrders = OrdersTotal();
   int addedOrders = 0;
   for(int o = 0; o < totalOrders; o++)
   {
      ulong ordTicket = OrderGetTicket(o);
      if(ordTicket > 0)
      {
         ENUM_ORDER_TYPE otype = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
         string typeStr = "";
         if(otype == ORDER_TYPE_BUY_LIMIT) typeStr = "BUY_LIMIT";
         else if(otype == ORDER_TYPE_SELL_LIMIT) typeStr = "SELL_LIMIT";
         else if(otype == ORDER_TYPE_BUY_STOP) typeStr = "BUY_STOP";
         else if(otype == ORDER_TYPE_SELL_STOP) typeStr = "SELL_STOP";
         else if(otype == ORDER_TYPE_BUY_STOP_LIMIT) typeStr = "BUY_STOP_LIMIT";
         else if(otype == ORDER_TYPE_SELL_STOP_LIMIT) typeStr = "SELL_STOP_LIMIT";

         if(typeStr != "")
         {
            if(addedOrders > 0) json += ",";
            datetime setupTime = (datetime)OrderGetInteger(ORDER_TIME_SETUP);
            json += "{";
            json += "\"ticket\":" + IntegerToString(ordTicket) + ",";
            json += "\"symbol\":\"" + OrderGetString(ORDER_SYMBOL) + "\",";
            json += "\"type\":\"" + typeStr + "\",";
            json += "\"volume\":" + DoubleToString(OrderGetDouble(ORDER_VOLUME_CURRENT), 2) + ",";
            json += "\"priceOpen\":" + DoubleToString(OrderGetDouble(ORDER_PRICE_OPEN), 5) + ",";
            json += "\"currentPrice\":" + DoubleToString(OrderGetDouble(ORDER_PRICE_CURRENT), 5) + ",";
            json += "\"sl\":" + DoubleToString(OrderGetDouble(ORDER_SL), 5) + ",";
            json += "\"tp\":" + DoubleToString(OrderGetDouble(ORDER_TP), 5) + ",";
            json += "\"magic\":" + IntegerToString(OrderGetInteger(ORDER_MAGIC)) + ",";
            json += "\"comment\":\"" + EscapeJson(OrderGetString(ORDER_COMMENT)) + "\",";
            json += "\"timeSetup\":" + IntegerToString((long)setupTime) + ",";
            json += "\"timeSetupIso\":\"" + TimeToISO(setupTime) + "\"";
            json += "}";
            addedOrders++;
         }
      }
   }
   json += "],";

   // Ticks for tracked symbols
   json += "\"ticks\":[";
   int addedTicks = 0;
   for(int s = 0; s < g_trackedCount; s++)
   {
      string sym = g_trackedSymbols[s];
      if(SymbolSelect(sym, true))
      {
         MqlTick tick;
         if(SymbolInfoTick(sym, tick))
         {
            if(addedTicks > 0) json += ",";
            int spread = (int)SymbolInfoInteger(sym, SYMBOL_SPREAD);
            int tDigits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
            json += "{";
            json += "\"symbol\":\"" + sym + "\",";
            json += "\"bid\":" + DoubleToString(tick.bid, tDigits) + ",";
            json += "\"ask\":" + DoubleToString(tick.ask, tDigits) + ",";
            json += "\"last\":" + DoubleToString(tick.last, tDigits) + ",";
            json += "\"spread\":" + IntegerToString(spread) + ",";
            json += "\"volume\":" + IntegerToString((long)tick.volume) + ",";
            json += "\"time\":" + IntegerToString((long)tick.time) + ",";
            json += "\"timeMsc\":" + IntegerToString((long)tick.time_msc) + ",";
            json += "\"flags\":" + IntegerToString((int)tick.flags) + ",";
            json += "\"timeIso\":\"" + TimeToISO(tick.time) + "\"";
            json += "}";
            addedTicks++;
         }
      }
   }
   json += "],";

   // Report execution results
   json += "\"pendingExecutionResults\":[";
   for(int r = 0; r < g_resultCount; r++)
   {
      if(r > 0) json += ",";
      json += "{";
      json += "\"commandId\":\"" + g_resultQueue[r].commandId + "\",";
      json += "\"success\":" + (g_resultQueue[r].success ? "true" : "false") + ",";
      json += "\"dealTicket\":" + IntegerToString(g_resultQueue[r].dealTicket) + ",";
      json += "\"orderTicket\":" + IntegerToString(g_resultQueue[r].orderTicket) + ",";
      json += "\"executionPrice\":" + DoubleToString(g_resultQueue[r].executionPrice, 5) + ",";
      json += "\"errorCode\":" + IntegerToString(g_resultQueue[r].errorCode) + ",";
      json += "\"errorMessage\":\"" + EscapeJson(g_resultQueue[r].errorMessage) + "\",";
      json += "\"executionTimeMs\":" + IntegerToString(g_resultQueue[r].executionTimeMs) + ",";
      json += "\"slippagePoints\":" + IntegerToString(g_resultQueue[r].slippagePoints) + ",";
      json += "\"timestampIso\":\"" + g_resultQueue[r].timestampIso + "\"";
      json += "}";
   }
   json += "]";

   json += "}";
   return json;
}

//+------------------------------------------------------------------+
//| Simple string escape for JSON                                    |
//+------------------------------------------------------------------+
string EscapeJson(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\r", "");
   StringReplace(s, "\n", " ");
   return s;
}

//+------------------------------------------------------------------+
//| Parse commands array and execute asynchronously                  |
//+------------------------------------------------------------------+
void ProcessServerResponse(string json)
{
   int cmdStart = StringFind(json, "\"commands\":");
   if(cmdStart == -1) return;
   
   int arrStart = StringFind(json, "[", cmdStart);
   int arrEnd = StringFind(json, "]", arrStart);
   if(arrStart == -1 || arrEnd == -1 || arrEnd <= arrStart + 1) return;

   string commandsSub = StringSubstr(json, arrStart + 1, arrEnd - arrStart - 1);
   StringTrimLeft(commandsSub);
   StringTrimRight(commandsSub);
   if(StringLen(commandsSub) == 0) return;

   // Process individual command objects inside the array
   int pos = 0;
   while(pos < StringLen(commandsSub))
   {
      int objStart = StringFind(commandsSub, "{", pos);
      if(objStart == -1) break;
      int objEnd = StringFind(commandsSub, "}", objStart);
      if(objEnd == -1) break;

      string cmdObj = StringSubstr(commandsSub, objStart, objEnd - objStart + 1);
      ExecuteSingleCommand(cmdObj);
      pos = objEnd + 1;
   }
}

//+------------------------------------------------------------------+
//| Execute a parsed command                                         |
//+------------------------------------------------------------------+
void ExecuteSingleCommand(string cmd)
{
   uint startTick = GetTickCount();

   string id = ExtractJsonField(cmd, "id");
   string action = ExtractJsonField(cmd, "action");
   string symbol = ExtractJsonField(cmd, "symbol");
   string orderType = ExtractJsonField(cmd, "orderType");
   double volume = StringToDouble(ExtractJsonField(cmd, "volume"));
   double price = StringToDouble(ExtractJsonField(cmd, "price"));
   double sl = StringToDouble(ExtractJsonField(cmd, "sl"));
   double tp = StringToDouble(ExtractJsonField(cmd, "tp"));
   ulong ticket = (ulong)StringToInteger(ExtractJsonField(cmd, "ticket"));
   ulong magic = (ulong)StringToInteger(ExtractJsonField(cmd, "magic"));
   string comment = ExtractJsonField(cmd, "comment");

   if(symbol == "") symbol = _Symbol;
   if(magic == 0) magic = InpMagicNumber;
   if(comment == "") comment = "AI_ORDER";

   m_trade.SetExpertMagicNumber(magic);

   bool success = false;
   ulong dealTicket = 0;
   ulong orderTicket = 0;
   double execPrice = 0.0;
   int errCode = 0;
   string errMsg = "";

   Print(">>> EXECUTING AI COMMAND: ", action, " [ID: ", id, "] Symbol: ", symbol, " Type: ", orderType, " Vol: ", volume);

   if(action == "EXECUTE_TRADE")
   {
      if(!SymbolSelect(symbol, true))
      {
         errCode = 4106;
         errMsg = "Unknown symbol " + symbol;
      }
      else
      {
         // Spread Protection Guard
         int curSpread = (int)SymbolInfoInteger(symbol, SYMBOL_SPREAD);
         if(InpMaxSpreadPoints > 0 && curSpread > InpMaxSpreadPoints)
         {
            errCode = 10015;
            errMsg = StringFormat("Spread Guard triggered: current spread %d pts exceeds max allowed %d pts", curSpread, InpMaxSpreadPoints);
            Print("ORDER REJECTED: ", errMsg);
         }
         else
         {
         // Auto-detect broker supported order filling mode
         uint filling = (uint)SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
         if((filling & SYMBOL_FILLING_IOC) != 0) m_trade.SetTypeFilling(ORDER_FILLING_IOC);
         else if((filling & SYMBOL_FILLING_FOK) != 0) m_trade.SetTypeFilling(ORDER_FILLING_FOK);
         else m_trade.SetTypeFilling(ORDER_FILLING_RETURN);

         int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
         double minLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
         double maxLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
         double stepLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
         if(stepLot > 0) volume = MathFloor(volume / stepLot) * stepLot;
         if(volume < minLot) volume = minLot;
         if(volume > maxLot) volume = maxLot;
         int lotDec = (stepLot < 0.01) ? 3 : (stepLot < 0.1 ? 2 : (stepLot < 1.0 ? 1 : 0));
         volume = NormalizeDouble(volume, lotDec);

         if(sl > 0) sl = NormalizeDouble(sl, digits);
         if(tp > 0) tp = NormalizeDouble(tp, digits);

         MqlTick tick;
         SymbolInfoTick(symbol, tick);

         int stopsLevel = (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL);
         double pt = SymbolInfoDouble(symbol, SYMBOL_POINT);
         double minStopDist = MathMax(stopsLevel, 10) * pt;

         if(orderType == "BUY")
         {
            execPrice = tick.ask;
            if(sl > 0 && (execPrice - sl) < minStopDist) sl = NormalizeDouble(execPrice - minStopDist * 1.5, digits);
            if(tp > 0 && (tp - execPrice) < minStopDist) tp = NormalizeDouble(execPrice + minStopDist * 1.5, digits);
            success = m_trade.Buy(volume, symbol, execPrice, sl, tp, comment);
         }
         else if(orderType == "SELL")
         {
            execPrice = tick.bid;
            if(sl > 0 && (sl - execPrice) < minStopDist) sl = NormalizeDouble(execPrice + minStopDist * 1.5, digits);
            if(tp > 0 && (execPrice - tp) < minStopDist) tp = NormalizeDouble(execPrice - minStopDist * 1.5, digits);
            success = m_trade.Sell(volume, symbol, execPrice, sl, tp, comment);
         }
         else if(orderType == "BUY_LIMIT")
         {
            execPrice = (price > 0) ? NormalizeDouble(price, digits) : tick.ask;
            success = m_trade.BuyLimit(volume, execPrice, symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
         else if(orderType == "SELL_LIMIT")
         {
            execPrice = (price > 0) ? NormalizeDouble(price, digits) : tick.bid;
            success = m_trade.SellLimit(volume, execPrice, symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
         else if(orderType == "BUY_STOP")
         {
            execPrice = (price > 0) ? NormalizeDouble(price, digits) : tick.ask;
            success = m_trade.BuyStop(volume, execPrice, symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
         else if(orderType == "SELL_STOP")
         {
            execPrice = (price > 0) ? NormalizeDouble(price, digits) : tick.bid;
            success = m_trade.SellStop(volume, execPrice, symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }

         if(success)
         {
            dealTicket = m_trade.ResultDeal();
            orderTicket = m_trade.ResultOrder();
            execPrice = m_trade.ResultPrice();
            Print("AI/MANUAL TRADE EXECUTED: Deal #", dealTicket, " at ", execPrice, " (", orderType, " ", volume, " ", symbol, ")");
         }
         else
         {
            errCode = (int)m_trade.ResultRetcode();
            errMsg = TranslateRetcode(errCode);
            Print("TRADE FAILED: ", errMsg, " (Code: ", errCode, ")");
         }
         }
      }
   }
   else if(action == "MODIFY_POSITION")
   {
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         string posSym = m_position.Symbol();
         int digits = (int)SymbolInfoInteger(posSym, SYMBOL_DIGITS);
         if(sl > 0) sl = NormalizeDouble(sl, digits);
         if(tp > 0) tp = NormalizeDouble(tp, digits);
         success = m_trade.PositionModify(ticket, sl, tp);
         if(success)
         {
            Print("POSITION MODIFIED: #", ticket, " SL: ", sl, " TP: ", tp);
         }
         else
         {
            errCode = (int)m_trade.ResultRetcode();
            errMsg = m_trade.ResultRetcodeDescription();
         }
      }
      else
      {
         errCode = 4753;
         errMsg = "Position not found: " + IntegerToString(ticket);
      }
   }
   else if(action == "CLOSE_POSITION")
   {
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         if(volume > 0 && volume < m_position.Volume())
         {
            success = m_trade.PositionClosePartial(ticket, volume);
         }
         else
         {
            success = m_trade.PositionClose(ticket);
         }

         if(success)
         {
            dealTicket = m_trade.ResultDeal();
            Print("AI POSITION CLOSED: #", ticket);
         }
         else
         {
            errCode = (int)m_trade.ResultRetcode();
            errMsg = m_trade.ResultRetcodeDescription();
         }
      }
      else
      {
         errCode = 4753;
         errMsg = "Position ticket not found: " + IntegerToString(ticket);
      }
   }
   else if(action == "CLOSE_ALL")
   {
      int closedCount = 0;
      int total = PositionsTotal();
      for(int i = total - 1; i >= 0; i--)
      {
         ulong t = PositionGetTicket(i);
         if(t > 0 && m_position.SelectByTicket(t))
         {
            if(symbol == "" || symbol == "ALL" || m_position.Symbol() == symbol)
            {
               if(m_trade.PositionClose(t)) closedCount++;
            }
         }
      }
      success = true;
      errMsg = "Closed " + IntegerToString(closedCount) + " positions";
   }
   else if(action == "CANCEL_PENDING")
   {
      if(ticket > 0)
      {
         success = m_trade.OrderDelete(ticket);
         if(success)
         {
            dealTicket = ticket;
            Print("PENDING ORDER CANCELLED: #", ticket);
         }
         else
         {
            errCode = (int)m_trade.ResultRetcode();
            errMsg = m_trade.ResultRetcodeDescription();
         }
      }
      else
      {
         errCode = 4753;
         errMsg = "Missing pending order ticket";
      }
   }
   else if(action == "FETCH_HISTORY")
   {
      // Ensure symbol is active in Market Watch
      SymbolSelect(symbol, true);

      string tfStr = ExtractJsonField(cmd, "timeframe");
      if(tfStr == "") tfStr = "M1";
      string cntStr = ExtractJsonField(cmd, "count");
      string fromStr = ExtractJsonField(cmd, "from");
      string toStr = ExtractJsonField(cmd, "to");

      int count = 100;
      if(cntStr != "") count = (int)StringToInteger(cntStr);
      if(comment != "")
      {
         string tfExt = ExtractJsonField(comment, "timeframe");
         if(tfExt != "") tfStr = tfExt;
         string cntExt = ExtractJsonField(comment, "count");
         if(cntExt != "") count = (int)StringToInteger(cntExt);
         string fromExt = ExtractJsonField(comment, "from");
         if(fromExt != "") fromStr = fromExt;
         string toExt = ExtractJsonField(comment, "to");
         if(toExt != "") toStr = toExt;
      }
      if(count <= 0) count = 100;
      ENUM_TIMEFRAMES tfEnum = StringToTimeframe(tfStr);

      MqlRates reqRates[];
      ArraySetAsSeries(reqRates, false);
      int copied = 0;
      datetime fromTime = (fromStr != "") ? (datetime)StringToInteger(fromStr) : 0;
      datetime toTime = (toStr != "") ? (datetime)StringToInteger(toStr) : 0;

      if(fromTime > 0)
      {
         if(toTime <= 0) toTime = TimeCurrent();
         datetime startTime = MathMin(fromTime, toTime);
         datetime stopTime = MathMax(fromTime, toTime);
         copied = CopyRates(symbol, tfEnum, startTime, stopTime, reqRates);
      }
      else
      {
         copied = CopyRates(symbol, tfEnum, 0, count, reqRates);
      }

      if(copied > 0)
      {
         int sDigits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
         string hJson = "{\"symbol\":\"" + symbol + "\",\"timeframe\":\"" + tfStr + "\",\"candles\":[";
         for(int k = 0; k < copied; k++)
         {
            if(k > 0) hJson += ",";
            hJson += "{";
            hJson += "\"time\":" + IntegerToString((long)reqRates[k].time) + ",";
            hJson += "\"timeIso\":\"" + TimeToISO(reqRates[k].time) + "\",";
            hJson += "\"open\":" + DoubleToString(reqRates[k].open, sDigits) + ",";
            hJson += "\"high\":" + DoubleToString(reqRates[k].high, sDigits) + ",";
            hJson += "\"low\":" + DoubleToString(reqRates[k].low, sDigits) + ",";
            hJson += "\"close\":" + DoubleToString(reqRates[k].close, sDigits) + ",";
            hJson += "\"volume\":" + IntegerToString((long)reqRates[k].tick_volume) + ",";
            hJson += "\"spread\":" + IntegerToString((int)reqRates[k].spread) + ",";
            hJson += "\"realVolume\":" + IntegerToString((long)reqRates[k].real_volume);
            hJson += "}";
         }
         hJson += "]}";
         g_onDemandHistoryJson = hJson;
         success = true;
         Print("ON-DEMAND HISTORY PULLED: ", symbol, " [", tfStr, "] ", copied, " candles");
      }
      else
      {
         errCode = GetLastError();
         errMsg = "Failed to copy rates for " + symbol + " [code: " + IntegerToString(errCode) + "]";
      }
   }
   else if(action == "SET_RISK_GUARD")
   {
      string trExt = ExtractJsonField(comment, "trailingDistancePoints");
      if(trExt != "") g_TrailingPoints = (int)StringToInteger(trExt);
      string stExt = ExtractJsonField(comment, "trailingStepPoints");
      if(stExt != "") g_TrailingStep = (int)StringToInteger(stExt);
      string enExt = ExtractJsonField(comment, "trailingStopEnabled");
      if(enExt != "") g_EnableTrailing = (enExt == "true" || enExt == "1");
      string beExt = ExtractJsonField(comment, "enableBreakeven");
      if(beExt != "") g_EnableBreakeven = (beExt == "true" || beExt == "1");
      string beTrig = ExtractJsonField(comment, "breakevenTriggerPoints");
      if(beTrig != "") g_BreakevenTrigger = (int)StringToInteger(beTrig);
      string beLock = ExtractJsonField(comment, "breakevenLockPoints");
      if(beLock != "") g_BreakevenLock = (int)StringToInteger(beLock);
      success = true;
      Print("RISK GUARD SYNCED TO EA: Trailing = ", g_EnableTrailing, " (Dist: ", g_TrailingPoints, " pts, Step: ", g_TrailingStep, " pts), Breakeven = ", g_EnableBreakeven, " (Trig: ", g_BreakevenTrigger, " pts, Lock: ", g_BreakevenLock, " pts)");
   }
   else if(action == "TRACK_SYMBOL")
   {
      if(symbol != "")
      {
         bool added = AddTrackedSymbol(symbol);
         if(added)
         {
            success = true;
            dealTicket = 1;
            Print("TRACK_SYMBOL: Added ", symbol, " to EA tracking universe. Total symbols: ", g_trackedCount);
         }
         else
         {
            errCode = 404;
            errMsg = "Failed to select symbol: " + symbol;
         }
      }
      else
      {
         errCode = 400;
         errMsg = "Missing symbol name";
      }
   }
   else if(action == "PROTECT_POSITION")
   {
      string ticketStr = ExtractJsonField(cmd, "ticket");
      ulong ticket = (ulong)StringToInteger(ticketStr);
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         string posSymbol = m_position.Symbol();
         double openPrice = m_position.PriceOpen();
         double currentPrice = m_position.PriceCurrent();
         double point = SymbolInfoDouble(posSymbol, SYMBOL_POINT);
         if(point <= 0) point = _Point;
         int stopsLevel = (int)SymbolInfoInteger(posSymbol, SYMBOL_TRADE_STOPS_LEVEL);
         double minStopDist = MathMax(stopsLevel + 5, 10) * point;
         double lockDist = g_BreakevenLock * point;
         if(lockDist < minStopDist) lockDist = minStopDist;

         double newSL = 0.0;
         if(m_position.PositionType() == POSITION_TYPE_BUY)
         {
            newSL = NormalizeDouble(openPrice + lockDist, (int)SymbolInfoInteger(posSymbol, SYMBOL_DIGITS));
            if(currentPrice - newSL >= minStopDist && newSL > m_position.StopLoss())
            {
               success = m_trade.PositionModify(ticket, newSL, m_position.TakeProfit());
            }
            else
            {
               errCode = 10016;
               errMsg = "Price too close to stopsLevel for Breakeven";
            }
         }
         else
         {
            newSL = NormalizeDouble(openPrice - lockDist, (int)SymbolInfoInteger(posSymbol, SYMBOL_DIGITS));
            if(newSL - currentPrice >= minStopDist && (m_position.StopLoss() == 0 || newSL < m_position.StopLoss()))
            {
               success = m_trade.PositionModify(ticket, newSL, m_position.TakeProfit());
            }
            else
            {
               errCode = 10016;
               errMsg = "Price too close to stopsLevel for Breakeven";
            }
         }
         if(success)
         {
            dealTicket = ticket;
            Print("PROTECT_POSITION: Breakeven applied by EA for ticket #", ticket, " SL=", newSL);
         }
         else if(errCode == 0)
         {
            errCode = (int)m_trade.ResultRetcode();
            errMsg = m_trade.ResultComment();
         }
      }
      else
      {
         errCode = 4753;
         errMsg = "Position ticket not found";
      }
   }


   // Calculate execution slippage in points if applicable
   int slippagePts = 0;
   if(success && execPrice > 0 && price > 0 && _Point > 0)
   {
      slippagePts = (int)MathRound(MathAbs(execPrice - price) / _Point);
   }

   // Record result in queue to inform Bridge
   if(g_resultCount < 20)
   {
      g_resultQueue[g_resultCount].commandId = id;
      g_resultQueue[g_resultCount].success = success;
      g_resultQueue[g_resultCount].dealTicket = dealTicket;
      g_resultQueue[g_resultCount].orderTicket = orderTicket;
      g_resultQueue[g_resultCount].executionPrice = execPrice;
      g_resultQueue[g_resultCount].errorCode = errCode;
      g_resultQueue[g_resultCount].errorMessage = errMsg;
      g_resultQueue[g_resultCount].executionTimeMs = (int)(GetTickCount() - startTick);
      g_resultQueue[g_resultCount].slippagePoints = slippagePts;
      g_resultQueue[g_resultCount].timestampIso = TimeToISO(TimeCurrent());
      g_resultCount++;
   }
}

//+------------------------------------------------------------------+
//| Build JSON array of past OHLCV chart history candles             |
//+------------------------------------------------------------------+
string BuildChartHistoryJson(int count)
{
   if(count <= 0) count = InpHistoryCandles;
   if(count <= 0) count = 60;
   MqlRates rates[];
   ArraySetAsSeries(rates, false); // Oldest to newest chronological
   int copied = CopyRates(_Symbol, Period(), 0, count, rates);
   if(copied <= 0) return "[]";

   string json = "[";
   for(int i = 0; i < copied; i++)
   {
      if(i > 0) json += ",";
      bool isClosedBar = (i < copied - 1); // Last candle in series is active forming bar 0
      json += "{";
      json += "\"time\":" + IntegerToString((long)rates[i].time) + ",";
      json += "\"timeIso\":\"" + TimeToISO(rates[i].time) + "\",";
      json += "\"open\":" + DoubleToString(rates[i].open, _Digits) + ",";
      json += "\"high\":" + DoubleToString(rates[i].high, _Digits) + ",";
      json += "\"low\":" + DoubleToString(rates[i].low, _Digits) + ",";
      json += "\"close\":" + DoubleToString(rates[i].close, _Digits) + ",";
      json += "\"volume\":" + IntegerToString((long)rates[i].tick_volume) + ",";
      json += "\"spread\":" + IntegerToString((int)rates[i].spread) + ",";
      json += "\"realVolume\":" + IntegerToString((long)rates[i].real_volume) + ",";
      json += "\"isClosed\":" + (isClosedBar ? "true" : "false");
      json += "}";
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| Extract field value from simple flat JSON string (Safe parser)   |
//+------------------------------------------------------------------+
string ExtractJsonField(string json, string key)
{
   string needle = "\"" + key + "\":";
   int pos = StringFind(json, needle);
   if(pos == -1) return "";

   int p = pos + StringLen(needle);
   int len = StringLen(json);
   while(p < len && StringGetCharacter(json, p) == ' ') p++;
   if(p >= len) return "";

   bool inQuotes = false;
   if(StringGetCharacter(json, p) == '\"')
   {
      inQuotes = true;
      p++;
   }

   int start = p;
   int end = p;
   while(end < len)
   {
      ushort c = StringGetCharacter(json, end);
      if(inQuotes && c == '\"')
      {
         if(end > start && StringGetCharacter(json, end - 1) == '\\')
         {
            end++;
            continue;
         }
         break;
      }
      if(!inQuotes && (c == ',' || c == '}' || c == ']' || c == '\r' || c == '\n' || c == ' ')) break;
      end++;
   }

   return StringSubstr(json, start, end - start);
}

//+------------------------------------------------------------------+
//| Dynamic Trailing Stop Engine (Adaptive & Resilient)              |
//+------------------------------------------------------------------+
void ProcessTrailingStops()
{
   if(!g_EnableTrailing) return;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         // Verify magic number permission
         if(!InpTrailAllPositions && InpMagicNumber > 0 && m_position.Magic() != InpMagicNumber) continue;

         string sym = m_position.Symbol();
         double point = SymbolInfoDouble(sym, SYMBOL_POINT);
         int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         int stopsLevel = (int)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL);
         int freezeLevel = (int)SymbolInfoInteger(sym, SYMBOL_TRADE_FREEZE_LEVEL);
         double minStopDist = MathMax(stopsLevel + 5, 10) * point;

         // Adaptive trailing scaling based on symbol scale
         int effTrailingPts = g_TrailingPoints;
         int effStepPts = g_TrailingStep;
         if(InpAdaptiveTrailing)
         {
            if(StringFind(sym, "XAU") >= 0 || StringFind(sym, "GOLD") >= 0)
            {
               effTrailingPts = MathMax(g_TrailingPoints, 300);
               effStepPts = MathMax(g_TrailingStep, 50);
            }
            else if(StringFind(sym, "US30") >= 0 || StringFind(sym, "NAS") >= 0 || StringFind(sym, "SPX") >= 0 || StringFind(sym, "GER40") >= 0)
            {
               effTrailingPts = MathMax(g_TrailingPoints, 250);
               effStepPts = MathMax(g_TrailingStep, 40);
            }
            else if(StringFind(sym, "BTC") >= 0 || StringFind(sym, "ETH") >= 0)
            {
               effTrailingPts = MathMax(g_TrailingPoints, 600);
               effStepPts = MathMax(g_TrailingStep, 100);
            }
         }

         double distance = effTrailingPts * point;
         double step = effStepPts * point;
         double openPrice = m_position.PriceOpen();

         if(m_position.PositionType() == POSITION_TYPE_BUY)
         {
            double bid = SymbolInfoDouble(sym, SYMBOL_BID);
            // Check if price has moved favorably past the trailing threshold
            if(bid - openPrice > distance)
            {
               double newSL = NormalizeDouble(bid - distance, digits);
               // Only move forward and ensure minimum step advancement
               if((m_position.StopLoss() == 0 || (newSL - m_position.StopLoss() >= step)) && (newSL > openPrice))
               {
                  // Obey broker stopsLevel
                  if(bid - newSL >= minStopDist)
                  {
                     if(m_trade.PositionModify(ticket, newSL, m_position.TakeProfit()))
                     {
                        Print("BUY Trailing Stop updated for #", ticket, " [", sym, "] New SL: ", newSL, " Locked Gain: +", DoubleToString((newSL - openPrice) / point, 0), " pts");
                     }
                  }
               }
            }
         }
         else if(m_position.PositionType() == POSITION_TYPE_SELL)
         {
            double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
            // Check if price has dropped favorably past the trailing threshold
            if(openPrice - ask > distance)
            {
               double newSL = NormalizeDouble(ask + distance, digits);
               // Only move downward and ensure minimum step advancement
               if((m_position.StopLoss() == 0 || (m_position.StopLoss() - newSL >= step)) && (newSL < openPrice))
               {
                  // Obey broker stopsLevel
                  if(newSL - ask >= minStopDist)
                  {
                     if(m_trade.PositionModify(ticket, newSL, m_position.TakeProfit()))
                     {
                        Print("SELL Trailing Stop updated for #", ticket, " [", sym, "] New SL: ", newSL, " Locked Gain: +", DoubleToString((openPrice - newSL) / point, 0), " pts");
                     }
                  }
               }
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Automatic Breakeven Protection Engine (Risk-Free Trade Lock)     |
//+------------------------------------------------------------------+
void ProcessBreakevenProtection()
{
   if(!g_EnableBreakeven) return;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         if(!InpTrailAllPositions && InpMagicNumber > 0 && m_position.Magic() != InpMagicNumber) continue;

         string sym = m_position.Symbol();
         double point = SymbolInfoDouble(sym, SYMBOL_POINT);
         int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         int stopsLevel = (int)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL);
         double minStopDist = MathMax(stopsLevel + 5, 10) * point;

         double triggerDist = g_BreakevenTrigger * point;
         double lockDist = g_BreakevenLock * point;
         double openPrice = m_position.PriceOpen();

         if(m_position.PositionType() == POSITION_TYPE_BUY)
         {
            double bid = SymbolInfoDouble(sym, SYMBOL_BID);
            if(bid - openPrice >= triggerDist)
            {
               double beSL = NormalizeDouble(openPrice + lockDist, digits);
               if(m_position.StopLoss() < beSL && (bid - beSL >= minStopDist))
               {
                  if(m_trade.PositionModify(ticket, beSL, m_position.TakeProfit()))
                  {
                     Print("BREAKEVEN ACTIVATED for BUY #", ticket, " [", sym, "] SL locked to: ", beSL, " (+", g_BreakevenLock, " pts)");
                  }
               }
            }
         }
         else if(m_position.PositionType() == POSITION_TYPE_SELL)
         {
            double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
            if(openPrice - ask >= triggerDist)
            {
               double beSL = NormalizeDouble(openPrice - lockDist, digits);
               if((m_position.StopLoss() == 0 || m_position.StopLoss() > beSL) && (beSL - ask >= minStopDist))
               {
                  if(m_trade.PositionModify(ticket, beSL, m_position.TakeProfit()))
                  {
                     Print("BREAKEVEN ACTIVATED for SELL #", ticket, " [", sym, "] SL locked to: ", beSL, " (+", g_BreakevenLock, " pts)");
                  }
               }
            }
         }
      }
   }
}


//+------------------------------------------------------------------+
//| Translate MT5 Retcode to human-readable diagnostic description   |
//+------------------------------------------------------------------+
string TranslateRetcode(int code)
{
   switch(code)
   {
      case 10004: return "Requote - Price changed during transmission";
      case 10006: return "Request rejected by broker execution desk";
      case 10007: return "Request canceled by client";
      case 10008: return "Order placed successfully";
      case 10009: return "Trade executed successfully";
      case 10011: return "Request in progress";
      case 10012: return "Request timed out on broker server";
      case 10013: return "Invalid request parameters";
      case 10014: return "Invalid volume / lot size";
      case 10015: return "Invalid price requested";
      case 10016: return "Invalid stops (SL or TP too close or invalid)";
      case 10017: return "Trade is disabled by broker";
      case 10018: return "Market is currently closed";
      case 10019: return "Insufficient funds / Not enough free margin";
      case 10020: return "Prices changed - new quote received";
      case 10021: return "No quotes available for symbol";
      case 10027: return "AutoTrading / Algo Trading disabled in MetaTrader 5";
      default:    return m_trade.ResultRetcodeDescription();
   }
}
//+------------------------------------------------------------------+
