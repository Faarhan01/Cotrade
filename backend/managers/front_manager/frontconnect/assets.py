"""
dashboard — Assets
====================

Serves `frontend/assets/` and `frontend/pages/`.

The frontend lives outside `backend/` on purpose. It is plain HTML, CSS and
JavaScript with no build step, so it can be edited, version-controlled or
handed to someone else without knowing anything about the Python side. This
module is the only thing that knows where it is.

Two details that are easy to get wrong and are handled here once:

* Path traversal. `get_symbols/../../../secrets` style requests are resolved
  to a real path and then checked to be *inside* the allowed root. A string
  prefix test alone is not enough, because `/srv/site-evil` starts with
  `/srv/site`.

* Charset. CSS and JavaScript are served as UTF-8 explicitly. Leaving it to a
  default means a page with a non-ASCII comment can be decoded differently by
  different clients.
"""

import mimetypes
import os
from typing import Optional, Tuple

# frontend/ sits next to backend/, so it is two levels above this package.
# Overridable so a deployment can point at a built or vendored copy.
from core.config import GatewayConfig

_repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

def _find_frontend_dir() -> str:
    env_dir = GatewayConfig.from_env().frontend_dir or os.environ.get("CONY_FRONTEND_DIR")
    if env_dir and os.path.isdir(env_dir):
        return env_dir
    curr = os.path.abspath(__file__)
    for _ in range(6):
        curr = os.path.dirname(curr)
        candidate = os.path.join(curr, "frontend")
        if os.path.isdir(candidate):
            return candidate
    return os.path.join(curr, "frontend")

FRONTEND_DIR = _find_frontend_dir()
ASSETS_DIR = os.path.join(FRONTEND_DIR, "assets")
PAGES_DIR = os.path.join(FRONTEND_DIR, "pages")
PARTIALS_DIR = os.path.join(FRONTEND_DIR, "partials")

# Optional built SPA (Vite output). When present, serve it on the same origin.
DIST_DIR = os.path.join(_repo_root, "dist")
DIST_ASSETS_DIR = os.path.join(DIST_DIR, "assets")
DIST_INDEX = os.path.join(DIST_DIR, "index.html")

TEXTUAL = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
}


def content_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in TEXTUAL:
        return TEXTUAL[ext]
    guessed, _ = mimetypes.guess_type(path)
    return guessed or "application/octet-stream"


def _read_inside(root: str, relpath: str) -> Optional[Tuple[bytes, str]]:
    """Read a file from `root`, refusing anything that resolves outside it."""
    real_root = os.path.realpath(root)
    target = os.path.realpath(os.path.join(real_root, relpath.lstrip("/")))
    # Compare with a trailing separator so `/srv/site-evil` cannot pass a
    # check written as `target.startswith(real_root)`.
    if target != real_root and not target.startswith(real_root + os.sep):
        return None
    if not os.path.isfile(target):
        return None
    with open(target, "rb") as handle:
        return handle.read(), content_type(target)


def read_asset(relpath: str) -> Optional[Tuple[bytes, str]]:
    # Prefer built SPA assets when available.
    if os.path.isdir(DIST_ASSETS_DIR):
        found = _read_inside(DIST_ASSETS_DIR, relpath)
        if found is not None:
            return found
    return _read_inside(ASSETS_DIR, relpath)


def read_page(relpath: str) -> Optional[Tuple[bytes, str]]:
    # Serve the built SPA index when available.
    if os.path.isfile(DIST_INDEX) and relpath in ("index", "index.html"):
        return _read_inside(DIST_DIR, "index.html")
    return _read_inside(PAGES_DIR, relpath)


def read_dist_index() -> Optional[Tuple[bytes, str]]:
    if not os.path.isfile(DIST_INDEX):
        return None
    return _read_inside(DIST_DIR, "index.html")


def read_partial(name: str) -> Optional[str]:
    found = _read_inside(PARTIALS_DIR, name if name.endswith(".html") else name + ".html")
    return found[0].decode("utf-8") if found else None


def frontend_available() -> bool:
    if os.path.isfile(DIST_INDEX):
        return True
    return os.path.isdir(PAGES_DIR)


def available_pages() -> list:
    """Page names without the extension, for diagnostics and the nav."""
    if os.path.isfile(DIST_INDEX):
        return ["index"]
    if not os.path.isdir(PAGES_DIR):
        return []
    return sorted(
        os.path.splitext(name)[0]
        for name in os.listdir(PAGES_DIR)
        if name.endswith(".html")
    )
