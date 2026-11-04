"""The old name of chatlens_links.py, from when the project was called SkypeLens.

Existing scripts that ``from skypelens_links import ...`` keep working: everything in
chatlens_links is available here, plus the old SkypeLens-named functions and constants.
New code should import chatlens_links. Two things differ from before the rename:

- ``add_cli_arguments`` stores ``args.skypelens_base_url`` and
  ``args.skypelens_conversation_id`` (as before). chatlens_links stores
  ``args.chatlens_*``.
- Links open in the browser tab named ``chatlens``, which ChatLens looks for.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any, Iterable, MutableMapping, Optional

try:
    # Imported as tools.skypelens_links, e.g. from the repository root
    from . import chatlens_links
    from .chatlens_links import *  # noqa: F401,F403  (the whole public API, same names)
except ImportError:
    # Imported as skypelens_links (tools/ on sys.path), or run as a script
    import chatlens_links
    from chatlens_links import *  # noqa: F401,F403

DEFAULT_SKYPELENS_BASE_URL = chatlens_links.DEFAULT_CHATLENS_BASE_URL
SKYPELENS_BASE_URL_ENV = chatlens_links.LEGACY_BASE_URL_ENV
SKYPELENS_WINDOW_NAME = chatlens_links.CHATLENS_WINDOW_NAME

build_skypelens_url = chatlens_links.build_chatlens_url


def add_skypelens_links(
    findings: Iterable[MutableMapping[str, Any]],
    conversation_id: Optional[str],
    base_url: str = DEFAULT_SKYPELENS_BASE_URL,
) -> list:
    """Like ``add_chatlens_links``, and also stores the URL as ``skypelens_url``."""
    result = chatlens_links.add_chatlens_links(findings, conversation_id, base_url)
    for finding in result:
        finding[chatlens_links.LEGACY_URL_FIELD] = finding.get("chatlens_url")
    return result


def add_cli_arguments(parser: argparse.ArgumentParser) -> None:
    """Register --skypelens-base-url and --skypelens-conversation-id on a parser."""
    parser.add_argument(
        "--skypelens-base-url",
        "--chatlens-base-url",
        dest="skypelens_base_url",
        default=chatlens_links.default_base_url(),
        help=(
            "ChatLens URL used for 'View in ChatLens' links "
            f"(default: ${chatlens_links.CHATLENS_BASE_URL_ENV} or "
            f"{chatlens_links.DEFAULT_CHATLENS_BASE_URL})"
        ),
    )
    parser.add_argument(
        "--skypelens-conversation-id",
        "--chatlens-conversation-id",
        dest="skypelens_conversation_id",
        default=None,
        help="Conversation.id to link to when the input JSON holds several conversations",
    )


if __name__ == "__main__":
    sys.exit(chatlens_links.main())
