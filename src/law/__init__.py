"""
Lov Assistent module - Danish law search and AI assistant
"""

from .law_data import search_laws, get_all_laws, get_law_by_slug, get_categories
from .law_assistant import LawAssistant

__all__ = [
    'search_laws',
    'get_all_laws',
    'get_law_by_slug',
    'get_categories',
    'LawAssistant',
]
