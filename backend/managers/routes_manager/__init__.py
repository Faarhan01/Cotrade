"""
Routes Manager - Public Interface
==================================

Public interface for route registration functions.
"""

from .research import register as register_research_routes
from .bot_routes import register as register_bot_routes
from .db_routes import register as register_db_routes

__all__ = [
    'register_research_routes',
    'register_bot_routes',
    'register_db_routes'
]