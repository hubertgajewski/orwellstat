#!/usr/bin/env python3
"""Shared helpers for detecting shell -c / clustered short-option command wrappers."""


def short_option_includes_c(token: str) -> bool:
    return token.startswith("-") and not token.startswith("--") and "c" in token[1:]


def inline_c_command(token: str) -> str | None:
    """Return a command embedded in -c… or clustered short options (-lc…, -ilc…)."""
    if not token.startswith("-") or token.startswith("--"):
        return None
    if token.startswith("-c") and len(token) > 2:
        return token[2:]
    if short_option_includes_c(token):
        c_index = token.index("c")
        if c_index + 1 < len(token):
            inner = token[c_index + 1 :]
            if inner:
                return inner
    return None
