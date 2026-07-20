"""REST API routes for schedule management."""
from aiohttp import web
from ._helpers import json_response, error_response
from .events import register_routes as _register_events
from .stats import register_routes as _register_stats
from .llm import register_routes as _register_llm
from .goals import register_routes as _register_goals
from .settings import register_routes as _register_settings
from .notes import register_routes as _register_notes
from .expenses import register_routes as _register_expenses
from .budgets import register_routes as _register_budgets
from .backup import register_routes as _register_backup
from .learning import register_routes as _register_learning
from .misc import register_routes as _register_misc
from .categories import register_routes as _register_categories

__all__ = ["setup_routes", "json_response", "error_response"]


def setup_routes(app: web.Application) -> None:
    """Setup all routes (composed from sub-modules)."""
    _register_events(app)
    _register_stats(app)
    _register_llm(app)
    _register_goals(app)
    _register_settings(app)
    _register_notes(app)
    _register_expenses(app)
    _register_budgets(app)
    _register_backup(app)
    _register_learning(app)
    _register_misc(app)
    _register_categories(app)
