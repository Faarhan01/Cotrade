"""Composition objects for the application layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from core.application.ports import (
    MT5Port,
    MarketDataPort,
    AccountPort,
    TradingPort,
    StrategyRepository,
    ReportRepository,
    PatternHitRepository,
    ConnectionPort,
)
from database import repositories as _repos


@dataclass
class AppContainer:
    """Wires infrastructure implementations to application services."""

    config: Any
    engine: MT5Port
    market_data: MarketDataPort
    account: AccountPort
    trading: TradingPort
    connection: ConnectionPort
    strategy_repo: StrategyRepository
    report_repo: ReportRepository
    pattern_hit_repo: PatternHitRepository
    backtest: Optional[Any] = None
    pattern_scan: Optional[Any] = None
    validation: Optional[Any] = None
    sizing: Optional[Any] = None


def build_container(config, engine) -> AppContainer:
    """Wire every concrete implementation and service into the container."""
    from managers.services_manager import (
        BacktestService,
        PatternScanService,
        ValidationService,
        SizingService
    )
    from managers.api_manager.api import Research

    # The Research service needs a data fetcher. We use the engine's candle
    # capability through a thin adapter so the knowledgebase stays free of
    # transport details.
    def _fetch(symbol, timeframe, count=2000, days=None):
        from tools.bot import datafeed
        return datafeed.bars(symbol, timeframe, count=count, days=days)

    from database.store import Store
    store = Store(config.db_path)
    research = Research(fetch=_fetch, store=store)

    return AppContainer(
        config=config,
        engine=engine,
        market_data=engine,
        account=engine,
        trading=engine,
        connection=engine,
        strategy_repo=_repos.SqliteStrategyRepository(config),
        report_repo=_repos.SqliteReportRepository(config),
        pattern_hit_repo=_repos.SqlitePatternHitRepository(config),
        backtest=BacktestService(research),
        pattern_scan=PatternScanService(research),
        validation=ValidationService(research),
        sizing=SizingService(),
    )
