import React, { useEffect, useState } from 'react';
import { MCP_TOOLS as FALLBACK_MCP_TOOLS } from '../../constants/mcpTools';
import { api } from '../../services/api';
import type { MCPToolDefinition } from '../../types';
import {
  Cpu,
  Terminal,
  Play,
  Copy,
  Check,
  Code2,
  FileJson,
  Sparkles,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

export const McpConsole: React.FC = () => {
  // Tools are fetched from the backend at runtime so the console never drifts
  // from the authoritative registry in backend/mcp/mcpServer.ts. The
  // static list is only a fallback for when the dev server is unreachable.
  const [tools, setTools] = useState<MCPToolDefinition[]>(FALLBACK_MCP_TOOLS);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMcpTools()
      .then((res) => {
        if (cancelled) return;
        if (Array.isArray(res?.tools) && res.tools.length > 0) {
          setTools(res.tools);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setToolsError(err?.message || 'Failed to load MCP tools from the bridge.');
      })
      .finally(() => {
        if (!cancelled) setToolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [selectedTool, setSelectedTool] = useState<MCPToolDefinition>(
    FALLBACK_MCP_TOOLS[3]
  );

  // Keep the selection valid when the tool list changes (e.g. after the
  // runtime fetch replaces the static fallback).
  useEffect(() => {
    if (tools.length === 0) return;
    if (!tools.some((t) => t.name === selectedTool.name)) {
      setSelectedTool(tools.find((t) => t.name === 'mt5_execute_trade') || tools[0]);
    }
  }, [tools, selectedTool.name]);

  const MCP_TOOLS = tools;
  const [toolArgsJson, setToolArgsJson] = useState(
    JSON.stringify(
      {
        symbol: 'EURUSD',
        orderType: 'BUY',
        volume: 0.1,
        sl: 1.0825,
        tp: 1.092,
        comment: 'AI_MCP_MOMENTUM',
      },
      null,
      2
    )
  );
  const [testResult, setTestResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [configType, setConfigType] = useState<'claude' | 'stdio' | 'cli' | 'cursor' | 'python'>('stdio');
  const [toolCategory, setToolCategory] = useState<'all' | 'knowledge' | 'execution' | 'data'>('all');

  const stdioConfig = JSON.stringify(
    {
      mcpServers: {
        'mt5-bridge': {
          command: 'node',
          args: ['backend/mcp/tool/stdio.js'],
          env: {
            MCP_URL: 'http://127.0.0.1:3000/api/mcp',
          },
        },
      },
    },
    null,
    2
  );

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        'mt5-bridge': {
          url: 'http://127.0.0.1:3000/api/mcp/sse',
        },
      },
    },
    null,
    2
  );

  const cliSnippet = `# Fast AI CLI commands (backend/mcp/tool/cli.js)
# 1. Inspect live status
node backend/mcp/tool/cli.js status

# 2. Get live quote & spread
node backend/mcp/tool/cli.js quote EURUSD

# 3. List active positions & pending orders
node backend/mcp/tool/cli.js positions
node backend/mcp/tool/cli.js orders

# 4. Instant trade dispatch with SL/TP
node backend/mcp/tool/cli.js buy EURUSD 0.10 1.0820 1.0920 "AI_ENTRY"
node backend/mcp/tool/cli.js sell XAUUSD 0.05 2640.50 2615.00 "MOMENTUM"

# 5. Close position or cancel pending order
node backend/mcp/tool/cli.js close 123456
node backend/mcp/tool/cli.js cancel 789101

# 6. Technical indicators & chart history
node backend/mcp/tool/cli.js indicators EURUSD M1
node backend/mcp/tool/cli.js candles EURUSD M1 60

# 7. Purge 24h+ unexecuted orders from database
node backend/mcp/tool/cli.js prune`;

  const pythonSnippet = `# Connect your External Python AI Agent to MT5 Bridge MCP endpoint
import requests

BRIDGE_MCP_URL = "http://127.0.0.1:3000/api/mcp"

def call_mt5_mcp(tool_name: str, args: dict):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": args
        }
    }
    response = requests.post(BRIDGE_MCP_URL, json=payload)
    return response.json()

# 1. External AI inspects live market data from MT5 EA
market_data = call_mt5_mcp("mt5_get_market_data", {"symbol": "EURUSD"})
print("Market Price Quote:", market_data)

# 2. External AI inspects real open positions in MT5
open_positions = call_mt5_mcp("mt5_get_open_positions", {})
print("Open Positions:", open_positions)

# 3. External AI executes or modifies trades based on incoming analysis
trade_res = call_mt5_mcp("mt5_execute_trade", {
    "symbol": "EURUSD",
    "orderType": "BUY",
    "volume": 0.1,
    "sl": 1.0820,
    "tp": 1.0920,
    "comment": "EXTERNAL_AI_MCP_SIGNAL"
})
print("Asynchronous Order Dispatched to EA:", trade_res)
`;

  const cursorSnippet = JSON.stringify(
    {
      mcpServers: {
        'mt5-ai-bridge': {
          command: 'node',
          args: ['backend/mcp/tool/stdio.js'],
        },
      },
    },
    null,
    2
  );

  const copyConfigSnippet = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  const handleSelectTool = (tool: (typeof MCP_TOOLS)[0]) => {
    setSelectedTool(tool);
    // Build default arguments template
    const defaults: Record<string, any> = {};
    if (tool.name === 'mt5_execute_trade') {
      defaults.symbol = 'EURUSD';
      defaults.orderType = 'BUY';
      defaults.volume = 0.1;
      defaults.sl = 1.0825;
      defaults.tp = 1.092;
      defaults.comment = 'AI_TEST_ORDER';
    } else if (tool.name === 'mt5_modify_position') {
      defaults.ticket = 10928374;
      defaults.sl = 1.083;
      defaults.tp = 1.0925;
    } else if (tool.name === 'mt5_close_position') {
      defaults.ticket = 10928374;
      defaults.volume = 0;
    } else if (tool.name === 'mt5_close_all') {
      defaults.symbol = 'ALL';
    } else if (tool.name === 'mt5_get_market_data') {
      defaults.symbol = 'EURUSD';
    } else if (tool.name === 'mt5_configure_risk_guard') {
      defaults.globalTakeProfitUSD = 2000;
      defaults.globalStopLossUSD = 1000;
      defaults.trailingStopEnabled = true;
      defaults.trailingStopDistancePoints = 150;
    } else if (tool.name === 'mt5_knowledge_auto_detect') {
      defaults.symbol = 'EURUSD';
    } else if (tool.name === 'mt5_knowledge_detect_patterns') {
      defaults.symbol = 'EURUSD';
      defaults.timeframe = 'M1';
    } else if (tool.name === 'mt5_knowledge_get_news_and_events') {
      defaults.symbol = 'EUR';
      defaults.category = 'ALL';
    } else if (tool.name === 'mt5_knowledge_get_symbol_impact') {
      defaults.symbol = 'EURUSD';
    } else if (tool.name === 'mt5_knowledge_calculate_indicators') {
      defaults.symbol = 'EURUSD';
      defaults.timeframe = 'M1';
    } else if (tool.name === 'mt5_knowledge_get_strategy_templates') {
      // no required arguments
    } else if (tool.name === 'mt5_knowledge_get_market_speed') {
      defaults.symbol = 'EURUSD';
    } else if (tool.name === 'mt5_get_backtest_history') {
      defaults.limit = 10;
    }
    setToolArgsJson(JSON.stringify(defaults, null, 2));
    setTestResult(null);
  };

  const handleRunTool = async () => {
    try {
      setIsRunning(true);
      setTestResult(null);
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolArgsJson);
      } catch {
        throw new Error('Invalid JSON arguments syntax');
      }

      // Execute via JSON-RPC 2.0 to verify MCP protocol conformity
      const rpcPayload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: selectedTool.name,
          arguments: parsedArgs,
        },
      };

      const res = await api.callMcpJsonRpc(rpcPayload);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ error: err?.message || String(err) });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Cpu className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Model Context Protocol (MCP) Integration Hub
              </h1>
            </div>
            <p className="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
              Connect external AI models (Claude, ChatGPT, Gemini, Cursor, or autonomous Python agents)
              to MetaTrader 5 with full tool-calling capabilities: live tick streaming, asynchronous trade execution,
              position management, and dynamic risk guard enforcement.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-400">
            <span className="text-slate-500 block text-[10px]">MCP JSON-RPC Endpoint:</span>
            <span className="text-cyan-400 font-bold">http://127.0.0.1:3000/api/mcp</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Registered MCP Tools List (4 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Registered MCP Tools ({MCP_TOOLS.length})
                </h2>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                JSON-RPC 2.0
              </span>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 text-[11px] font-mono">
              <button
                onClick={() => setToolCategory('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  toolCategory === 'all'
                    ? 'bg-cyan-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                All ({MCP_TOOLS.length})
              </button>
              <button
                onClick={() => setToolCategory('knowledge')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  toolCategory === 'knowledge'
                    ? 'bg-purple-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                KnowledgeBase & AI ({MCP_TOOLS.filter((t) => t.name.startsWith('mt5_knowledge_') || t.name === 'mt5_get_backtest_history').length})
              </button>
              <button
                onClick={() => setToolCategory('execution')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  toolCategory === 'execution'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Execution ({MCP_TOOLS.filter((t) => t.name.includes('trade') || t.name.includes('position') || t.name.includes('order')).length})
              </button>
              <button
                onClick={() => setToolCategory('data')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  toolCategory === 'data'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Market & Risk
              </button>
            </div>

            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {MCP_TOOLS.filter((tool) => {
                if (toolCategory === 'knowledge') {
                  return tool.name.startsWith('mt5_knowledge_') || tool.name === 'mt5_get_backtest_history';
                }
                if (toolCategory === 'execution') {
                  return tool.name.includes('trade') || tool.name.includes('position') || tool.name.includes('order');
                }
                if (toolCategory === 'data') {
                  return (
                    !tool.name.startsWith('mt5_knowledge_') &&
                    tool.name !== 'mt5_get_backtest_history' &&
                    !tool.name.includes('trade') &&
                    !tool.name.includes('position') &&
                    !tool.name.includes('order')
                  );
                }
                return true;
              }).map((tool) => {
                const isSelected = selectedTool.name === tool.name;
                const isKb = tool.name.startsWith('mt5_knowledge_') || tool.name === 'mt5_get_backtest_history';
                return (
                  <div
                    key={tool.name}
                    onClick={() => handleSelectTool(tool)}
                    className={`cursor-pointer p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-slate-800/90 border-cyan-500 shadow-md ring-1 ring-cyan-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-cyan-300">
                          {tool.name}
                        </span>
                        {isKb && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                            KB
                          </span>
                        )}
                      </div>
                      {tool.inputSchema.required && tool.inputSchema.required.length > 0 && (
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                          {tool.inputSchema.required.length} required
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Tool Runner & Config Snippets (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Interactive Tool Runner */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-mono block">Testing Tool:</span>
                <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-cyan-400" />
                  {selectedTool.name}
                </h3>
              </div>
              <button
                onClick={handleRunTool}
                disabled={isRunning}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs font-mono uppercase tracking-wide flex items-center gap-2 transition-all shadow-md shadow-cyan-950/50"
              >
                <Play className="h-3.5 w-3.5" />
                {isRunning ? 'Invoking MCP...' : 'Execute Tool via MCP'}
              </button>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
              {selectedTool.description}
            </p>

            {/* Input Arguments Editor */}
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">
                JSON-RPC Arguments (`params.arguments`):
              </label>
              <textarea
                rows={5}
                value={toolArgsJson}
                onChange={(e) => setToolArgsJson(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Execution Result Box */}
            {testResult && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Server JSON-RPC Response:</span>
                  <span className="text-emerald-400">Protocol 2024-11-05</span>
                </div>
                <pre className="bg-slate-950 border border-slate-800/90 rounded-lg p-3 text-xs font-mono text-cyan-300 overflow-x-auto max-h-60">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* External AI Configuration Snippet Generator */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  AI Agent Connection Snippet
                </h3>
              </div>

              {/* Snippet Type Selector */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 flex-wrap">
                <button
                  onClick={() => setConfigType('stdio')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    configType === 'stdio'
                      ? 'bg-slate-800 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Stdio MCP (stdio.js)
                </button>
                <button
                  onClick={() => setConfigType('cli')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    configType === 'cli'
                      ? 'bg-slate-800 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  CLI Shortcuts (cli.js)
                </button>
                <button
                  onClick={() => setConfigType('claude')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    configType === 'claude'
                      ? 'bg-slate-800 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Claude Desktop (SSE)
                </button>
                <button
                  onClick={() => setConfigType('cursor')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    configType === 'cursor'
                      ? 'bg-slate-800 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Cursor IDE
                </button>
                <button
                  onClick={() => setConfigType('python')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    configType === 'python'
                      ? 'bg-slate-800 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Python Agent
                </button>
              </div>
            </div>

            <div className="relative">
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto max-h-64">
                {configType === 'stdio'
                  ? stdioConfig
                  : configType === 'cli'
                  ? cliSnippet
                  : configType === 'claude'
                  ? claudeDesktopConfig
                  : configType === 'cursor'
                  ? cursorSnippet
                  : pythonSnippet}
              </pre>
              <button
                onClick={() =>
                  copyConfigSnippet(
                    configType === 'stdio'
                      ? stdioConfig
                      : configType === 'cli'
                      ? cliSnippet
                      : configType === 'claude'
                      ? claudeDesktopConfig
                      : configType === 'cursor'
                      ? cursorSnippet
                      : pythonSnippet
                  )
                }
                className="absolute top-2 right-2 px-2.5 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 hover:text-white font-mono flex items-center gap-1.5 transition-colors"
              >
                {copiedConfig ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy Snippet</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed pt-1">
              {configType === 'claude' && (
                <p>
                  Paste into your <code>claude_desktop_config.json</code> under the{' '}
                  <code>mcpServers</code> key. Claude will immediately receive tool definitions to inspect
                  ticks and trade in MT5.
                </p>
              )}
              {configType === 'cursor' && (
                <p>
                  Add to Cursor Settings → Features → MCP Servers. The AI in Cursor composer can
                  query MT5 open positions and review trade outcomes in real-time.
                </p>
              )}
              {configType === 'python' && (
                <p>
                  Use this lightweight Python script to invoke trades from custom algorithmic models,
                  Reinforcement Learning environments, or FinGPT agents.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
