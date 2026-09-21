"""Authentication and role-based authorization for Hammeren."""

from .entra import (
    APP_ROLES,
    AuthSettings,
    UserPrincipal,
    authorize_case_transition,
    get_auth_settings,
    get_current_user,
    require_roles,
)

__all__ = [
    "APP_ROLES",
    "AuthSettings",
    "UserPrincipal",
    "authorize_case_transition",
    "get_auth_settings",
    "get_current_user",
    "require_roles",
]
