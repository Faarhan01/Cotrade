import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  FileCode2,
  Download,
  Copy,
  Check,
  Globe,
  Radio,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Terminal,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

export const EaSetupGuide: React.FC = () => {
  const [eaCode, setEaCode] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; latencyMs: number; data?: any } | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  useEffect(() => {
    async function loadCode() {
      try {
        const res = await api.getEaCode();
        if (res.code) setEaCode(res.code);
      } catch (e) {
        console.error('Failed to load EA code:', e);
      }
    }
    loadCode();
    handlePingTest();
  }, []);

  const handleCopyCode = () => {
    if (!eaCode) return;
    navigator.clipboard.writeText(eaCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handlePingTest = async () => {
    setIsPinging(true);
    try {
      const res = await api.checkBridgeHealth('/health');
      setPingResult(res);
    } catch {
      setPingResult({ ok: false, latencyMs: 0 });
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/30 to-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <FileCode2 className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                MetaTrader 5 Expert Advisor Bridge Setup
              </h1>
            </div>
            <p className="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
              The <code className="text-cyan-400 font-mono">AIMT5Bridge.mq5</code> Expert Advisor runs directly inside
              MetaTrader 5. It streams live tick quotes, pushes position updates, and polls the local bridge endpoint
              at <code className="text-cyan-400 font-mono">http://127.0.0.1:7777</code> for pending AI trade commands.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/ea/download"
              download="AIMT5Bridge.mq5"
              className="px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-cyan-950/50"
            >
              <Download className="h-4 w-4" />
              Download .mq5 File
            </a>
          </div>
        </div>
      </div>

      {/* Step by Step Setup Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Step 1 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="h-5 w-5 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-[11px]">
              1
            </span>
            <span>Allow MT5 WebRequest</span>
          </div>
          <h3 className="text-sm font-bold text-white">Whitelist Bridge URL in MT5</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            MT5 restricts HTTP requests by default. Open MT5:
          </p>
          <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs font-mono text-slate-300 space-y-1">
            <p>1. Menu: <strong className="text-white">Tools → Options</strong> (Ctrl+O)</p>
            <p>2. Tab: <strong className="text-white">Expert Advisors</strong></p>
            <p>3. Check: <strong className="text-emerald-400">Allow WebRequest for listed URL:</strong></p>
          </div>
          <div className="flex items-center justify-between p-2 bg-slate-950/90 border border-slate-800 rounded text-xs font-mono">
            <span className="text-cyan-400 font-bold truncate">http://127.0.0.1:7777</span>
            <button
              onClick={() => handleCopyUrl('http://127.0.0.1:7777')}
              className="text-slate-400 hover:text-white ml-2 flex items-center gap-1 text-[11px]"
            >
              {copiedUrl ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="h-5 w-5 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-[11px]">
              2
            </span>
            <span>Copy EA to MT5 Folder</span>
          </div>
          <h3 className="text-sm font-bold text-white">Paste into MQL5/Experts</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Save the file into your MetaTrader 5 directory:
          </p>
          <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs font-mono text-slate-300 space-y-1">
            <p>1. Click <strong className="text-white">File → Open Data Folder</strong> in MT5</p>
            <p>2. Open <strong className="text-white">MQL5</strong> → <strong className="text-white">Experts</strong></p>
            <p>3. Copy <code className="text-cyan-400">AIMT5Bridge.mq5</code> there</p>
            <p>4. In MT5 Navigator (<strong className="text-white">Ctrl+N</strong>), right click Experts → <strong className="text-white">Refresh</strong></p>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="h-5 w-5 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-[11px]">
              3
            </span>
            <span>Attach EA & Enable Trading</span>
          </div>
          <h3 className="text-sm font-bold text-white">Attach to Any Active Chart</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Drag the EA onto your chart (e.g. EURUSD):
          </p>
          <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs font-mono text-slate-300 space-y-1">
            <p>1. Ensure <strong className="text-emerald-400">Algo Trading</strong> is enabled (Green icon)</p>
            <p>2. Check "Allow Algo Trading" in EA properties</p>
            <p>3. Default URL: <code className="text-cyan-400">http://127.0.0.1:7777</code></p>
            <p>4. Check MT5 <strong>Experts tab</strong> for "Connected" log</p>
          </div>
        </div>
      </div>

      {/* Live Bridge Connection Diagnostic Tool */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Live Bridge Diagnostics (http://127.0.0.1:7777)
            </h2>
          </div>

          <button
            onClick={handlePingTest}
            disabled={isPinging}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 flex items-center gap-2 transition-colors self-start sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPinging ? 'animate-spin' : ''}`} />
            <span>Test Bridge Ping</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] font-mono text-slate-500 block uppercase">Endpoint Status</span>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  pingResult?.ok ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <span className="font-mono text-xs font-bold text-white">
                {pingResult?.ok ? '200 OK (Bridge Active)' : 'Offline / Checking...'}
              </span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] font-mono text-slate-500 block uppercase">Round-Trip Latency</span>
            <div className="font-mono text-xs font-bold text-cyan-300 mt-1">
              {pingResult ? `${pingResult.latencyMs} ms` : 'Testing...'}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] font-mono text-slate-500 block uppercase">EA WebRequest Target</span>
            <div className="font-mono text-xs font-bold text-slate-200 mt-1">
              http://127.0.0.1:7777/sync
            </div>
          </div>
        </div>
      </div>

      {/* Full MQL5 Source Code Viewer */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              backend/ea/AIMT5Bridge.mq5 Source Code
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              {copiedCode ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
            <a
              href="/api/ea/download"
              download="AIMT5Bridge.mq5"
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </a>
          </div>
        </div>

        <div className="relative">
          <pre className="bg-slate-950 border border-slate-800/90 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[460px] leading-relaxed selection:bg-cyan-900">
            {eaCode || '// Loading EA source code...'}
          </pre>
        </div>
      </div>
    </div>
  );
};
