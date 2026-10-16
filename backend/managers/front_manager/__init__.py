"""
Front Manager - Public Interface
=================================

Public interface for frontend/dashboard integration.
"""

from .frontconnect import register as register_frontend
from .frontconnect import assets as frontend_assets

__all__ = ['register_frontend', 'frontend_assets']