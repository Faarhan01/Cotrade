import { useEffect, useState, useRef, useCallback } from 'react';
import { AppState, Position, TickData, AccountInfo, TradeCommand, ExecutionLog, RiskGuardConfig } from '../types';
import { api } from './api';

type WebSocketStatus = 'connected' | 'connecting' | 'disconnected';

export function useBridgeData() {
  const [state, setState] = useState<AppState | null>(null);
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>('connecting');
  const [lastPingMs, setLastPingMs] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<any>(null);

  const fetchFullState = useCallback(async () => {
    try {
      const data = await api.getState();
      setState(data);
    } catch (err) {
      console.warn('Initial state fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchFullState();

    let retryTimeout: any = null;
    let isUnmounted = false;

    // Automatic polling heartbeat ensures instant pickup when EA begins streaming.
    // Pause while the tab is hidden to avoid burning CPU/network on a
    // backgrounded page; resume immediately when it becomes visible again.
    const pollInterval = setInterval(() => {
      if (isUnmounted) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchFullState();
    }, 2000);

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !isUnmounted) {
        fetchFullState();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    function connectWs() {
      if (isUnmounted) return;
      setWsStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (isUnmounted) return;
          setWsStatus('connected');
          socket.send(JSON.stringify({ type: 'get_state' }));

          // Measure websocket roundtrip ping
          pingIntervalRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              const pingStart = performance.now();
              const handlePong = (ev: MessageEvent) => {
                try {
                  const m = JSON.parse(ev.data);
                  if (m.type === 'pong') {
                    setLastPingMs(Math.round(performance.now() - pingStart));
                    socket.removeEventListener('message', handlePong);
                  }
                } catch {}
              };
              socket.addEventListener('message', handlePong);
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 5000);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'init') {
              setState(data.payload);
            } else if (data.type === 'tick') {
              const updatedTick: TickData = data.payload;
              setState((prev) => {
                if (!prev) return prev;
                const newTicks = prev.ticks.map((t) => (t.symbol === updatedTick.symbol ? updatedTick : t));
                if (!newTicks.some((t) => t.symbol === updatedTick.symbol)) {
                  newTicks.push(updatedTick);
                }

                // Update history
                const currentHist = prev.tickHistory[updatedTick.symbol] || [];
                const updatedHist = [...currentHist, { time: Date.now(), bid: updatedTick.bid, ask: updatedTick.ask }];
                if (updatedHist.length > 80) updatedHist.shift();

                return {
                  ...prev,
                  ticks: newTicks,
                  tickHistory: {
                    ...prev.tickHistory,
                    [updatedTick.symbol]: updatedHist,
                  },
                };
              });
            } else if (data.type === 'account') {
              const updatedAccount: AccountInfo = data.payload;
              setState((prev) => (prev ? { ...prev, account: updatedAccount } : prev));
            } else if (data.type === 'ea:sync') {
              const sync = data.payload;
              setState((prev) =>
                prev
                  ? {
                      ...prev,
                      account: sync.account || prev.account,
                      positions: sync.positions || prev.positions,
                      ticks: sync.ticks || prev.ticks,
                      currentChart: sync.currentChart !== undefined ? sync.currentChart : prev.currentChart,
                      allSymbols: sync.allSymbols || prev.allSymbols,
                      chartHistory: sync.chartHistory && sync.chartHistory.length > 0 ? sync.chartHistory : prev.chartHistory,
                      connection: sync.connection
                        ? { ...prev.connection, ...sync.connection }
                        : {
                            ...prev.connection,
                            isEaConnected: sync.isEaConnected,
                            lastEaSync: sync.lastEaSync,
                          },
                    }
                  : prev
              );
            } else if (data.type === 'command:queued') {
              const cmd: TradeCommand = data.payload;
              setState((prev) =>
                prev
                  ? {
                      ...prev,
                      commandQueue: [cmd, ...prev.commandQueue.filter((c) => c.id !== cmd.id)].slice(0, 50),
                    }
                  : prev
              );
            } else if (data.type === 'command:result') {
              const res = data.payload;
              setState((prev) => {
                if (!prev) return prev;
                const newQueue = prev.commandQueue.map((cmd) => {
                  if (cmd.id === res.commandId) {
                    return {
                      ...cmd,
                      status: res.success ? ('executed' as const) : ('failed' as const),
                      executedAt: Date.now(),
                      result: res,
                    };
                  }
                  return cmd;
                });
                return { ...prev, commandQueue: newQueue };
              });
            } else if (data.type === 'risk:updated') {
              const risk: RiskGuardConfig = data.payload;
              setState((prev) => (prev ? { ...prev, riskGuard: risk } : prev));
            } else if (data.type === 'risk:kill_switch') {
              setState((prev) =>
                prev
                  ? {
                      ...prev,
                      riskGuard: { ...prev.riskGuard, emergencyKillSwitch: data.payload.active },
                    }
                  : prev
              );
            }
          } catch (err) {
            console.error('Error handling WS message:', err);
          }
        };

        socket.onclose = () => {
          if (isUnmounted) return;
          setWsStatus('disconnected');
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          retryTimeout = setTimeout(connectWs, 2500);
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch (err) {
        setWsStatus('disconnected');
        retryTimeout = setTimeout(connectWs, 3000);
      }
    }

    connectWs();

    return () => {
      isUnmounted = true;
      clearInterval(pollInterval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (retryTimeout) clearTimeout(retryTimeout);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchFullState]);

  return {
    state,
    wsStatus,
    lastPingMs,
    reloadState: fetchFullState,
  };
}
