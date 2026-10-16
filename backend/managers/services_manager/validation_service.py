from __future__ import annotations

from typing import Any, Dict


class ValidationService:
    """Validates strategy definitions before they are stored or backtested."""

    def __init__(self, research):
        self._research = research

    def validate(self, strategy) -> Dict[str, Any]:
        return self._research.validate_strategy(strategy)
