"""Thin httpx wrapper around the GitHub REST API."""
import base64
import logging
from typing import List, Optional

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

_BASE = "https://api.github.com"
_MAX_CALLS = 30


def _headers(authenticated: bool = True) -> dict:
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if authenticated and settings.GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return h


def _get(url: str, params: dict | None = None, timeout: int = 15) -> httpx.Response:
    """GET with automatic 401 fallback: if the stored token is rejected, retry anonymously."""
    r = httpx.get(url, params=params, headers=_headers(authenticated=True), timeout=timeout)
    if r.status_code == 401 and settings.GITHUB_TOKEN:
        logger.warning("GitHub token rejected (401) — retrying anonymously. "
                       "Clear or update GITHUB_TOKEN in .env to suppress this warning.")
        r = httpx.get(url, params=params, headers=_headers(authenticated=False), timeout=timeout)
    return r


def get_repos(username: str, calls: List[int]) -> List[dict]:
    """GET /users/{username}/repos — returns up to 100 repos sorted by updated."""
    if calls[0] >= _MAX_CALLS:
        logger.warning("GitHub call cap reached in get_repos")
        return []
    calls[0] += 1
    try:
        r = _get(f"{_BASE}/users/{username}/repos", params={"sort": "updated", "per_page": 100})
        logger.info("get_repos %s → HTTP %s", username, r.status_code)
        r.raise_for_status()
        repos = r.json()
        logger.info("get_repos returned %d repos for %s", len(repos), username)
        return repos
    except Exception as exc:
        logger.error("get_repos failed for %s: %s", username, exc)
        return []


def search_user_repos(username: str, skill_terms: List[str], calls: List[int]) -> List[dict]:
    """Always returns the user's repos via get_repos, then supplements with search results.

    The primary source is always get_repos (general API, 60 req/hour unauthenticated)
    because the Search API has stricter rate limits and ambiguous OR query semantics.
    Search results are merged in to fill any gaps.
    """
    # Step 1: Always get the full public repo list first (robust, no keyword filter issues)
    base_repos = get_repos(username, calls)
    seen_names = {r["name"] for r in base_repos}

    if calls[0] >= _MAX_CALLS or not skill_terms:
        return base_repos

    # Step 2: Try keyword search to catch repos not returned by recency sort
    # Use each term as a separate qualifier to avoid OR-precedence issues
    terms = [t for t in skill_terms if t][:4]
    # Build a safe query: all terms in-topic with user: qualifier repeated isn't supported,
    # so we do one search with the most relevant single term + user: qualifier
    query = f"user:{username} " + " ".join(terms[:3])
    calls[0] += 1
    try:
        r = _get(f"{_BASE}/search/repositories", params={"q": query, "sort": "updated", "per_page": 10})
        logger.info("search_user_repos %s query=%r → HTTP %s", username, query, r.status_code)
        r.raise_for_status()
        for item in r.json().get("items", []):
            # Only add repos actually belonging to the target user
            owner = (item.get("owner") or {}).get("login", "")
            if owner.lower() == username.lower() and item["name"] not in seen_names:
                base_repos.append(item)
                seen_names.add(item["name"])
    except Exception as exc:
        logger.warning("search_user_repos search failed for %s: %s", username, exc)

    return base_repos


def search_repos_by_language(username: str, language: str, calls: List[int]) -> List[dict]:
    """Search a user's repos filtered by primary programming language."""
    if calls[0] >= _MAX_CALLS:
        return []
    calls[0] += 1
    query = f"user:{username} language:{language}"
    try:
        r = _get(f"{_BASE}/search/repositories", params={"q": query, "sort": "stars", "per_page": 5})
        logger.info("search_repos_by_language %s lang=%s → HTTP %s", username, language, r.status_code)
        r.raise_for_status()
        items = r.json().get("items", [])
        # Filter to only this user's repos (safety guard against OR-precedence issues)
        return [i for i in items if (i.get("owner") or {}).get("login", "").lower() == username.lower()]
    except Exception as exc:
        logger.warning("search_repos_by_language failed for %s/%s: %s", username, language, exc)
        return []


def get_branches(owner: str, repo: str, calls: List[int]) -> List[str]:
    """GET /repos/{owner}/{repo}/branches — returns branch names."""
    if calls[0] >= _MAX_CALLS:
        return []
    calls[0] += 1
    try:
        r = _get(f"{_BASE}/repos/{owner}/{repo}/branches")
        r.raise_for_status()
        return [b["name"] for b in r.json()]
    except Exception:
        return []


def get_file_tree(owner: str, repo: str, branch: str, calls: List[int]) -> List[str]:
    """GET git tree recursively — returns list of blob file paths."""
    if calls[0] >= _MAX_CALLS:
        return []
    calls[0] += 1
    try:
        r = _get(f"{_BASE}/repos/{owner}/{repo}/git/trees/{branch}", params={"recursive": "1"}, timeout=20)
        r.raise_for_status()
        data = r.json()
        return [item["path"] for item in data.get("tree", []) if item.get("type") == "blob"]
    except Exception:
        return []


def get_file_content(
    owner: str, repo: str, path: str, branch: str, calls: List[int], max_chars: int = 8000
) -> str:
    """GET file contents, base64-decoded, capped at max_chars."""
    if calls[0] >= _MAX_CALLS:
        return ""
    calls[0] += 1
    try:
        r = _get(f"{_BASE}/repos/{owner}/{repo}/contents/{path}", params={"ref": branch})
        r.raise_for_status()
        data = r.json()
        if data.get("encoding") == "base64":
            content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
            return content[:max_chars]
        return ""
    except Exception:
        return ""


def get_readme(owner: str, repo: str, calls: List[int]) -> str:
    """GET README content — returns "" on 404."""
    if calls[0] >= _MAX_CALLS:
        return ""
    calls[0] += 1
    try:
        r = _get(f"{_BASE}/repos/{owner}/{repo}/readme")
        if r.status_code == 404:
            return ""
        r.raise_for_status()
        data = r.json()
        if data.get("encoding") == "base64":
            content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
            return content[:3000]
        return ""
    except Exception:
        return ""
