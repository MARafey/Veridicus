import re
import uuid
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import quote_plus, unquote

import httpx
from playwright.sync_api import sync_playwright
from sqlmodel import Session, select

from backend.agents.state import PolygraphState, ScrapedDocument
from backend.config import settings
from backend.database import engine
from backend.models import Claim, SourceDocument
from backend.services.pdf_service import extract_pdf_text

MIN_TEXT_CHARS = 200
MAX_PDFS_PER_SKILL = 3


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


_PDF_URL_RE = re.compile(r'https?://[^\s"\'<>]+\.pdf(?:[?#][^\s"\'<>]*)?', re.IGNORECASE)

# DuckDuckGo HTML endpoint — plain HTML, no JS obfuscation, result hrefs use
# the pattern //duckduckgo.com/l/?uddg=<encoded-destination-url>&...
_DDG_HTML = "https://html.duckduckgo.com/html/"


def _extract_ddg_destination(href: str) -> str:
    """Decode a DuckDuckGo redirect href to get the real destination URL."""
    if "uddg=" in href:
        try:
            uddg = href.split("uddg=")[1].split("&")[0]
            return unquote(uddg)
        except Exception:
            pass
    return href


def _search_pdf_links(skill: str) -> List[str]:
    """Search DuckDuckGo (plain-HTML endpoint) for PDFs related to the skill.

    DuckDuckGo's html.duckduckgo.com serves clean, non-JS-obfuscated HTML.
    Result links use a redirect pattern with the real URL in the `uddg=` param,
    which we decode. We also regex-scan the raw HTML as a fallback.
    """
    seen: set = set()
    links: List[str] = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_extra_http_headers({
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            })
            # POST to DDG HTML endpoint — avoids bot-detection on GET
            page.goto(
                f"{_DDG_HTML}?q={quote_plus(skill + ' filetype:pdf')}&kd=-1",
                timeout=20000,
            )
            page.wait_for_timeout(2000)

            # Strategy 1: decode DDG redirect hrefs → real destination URLs
            hrefs = page.eval_on_selector_all(
                "a.result__a, a[href*='uddg='], a[href*='.pdf']",
                "els => els.map(e => e.getAttribute('href') || '')",
            )
            for href in hrefs:
                if not href:
                    continue
                real = _extract_ddg_destination(href)
                if real.lower().endswith(".pdf") and real.startswith("http"):
                    if real not in seen:
                        seen.add(real)
                        links.append(real)
                    if len(links) >= MAX_PDFS_PER_SKILL:
                        break

            # Strategy 2: regex scan of raw HTML for any .pdf URL
            if len(links) < MAX_PDFS_PER_SKILL:
                html = page.content()
                for raw_url in _PDF_URL_RE.findall(html):
                    url = raw_url.rstrip(".,);")
                    if url not in seen:
                        seen.add(url)
                        links.append(url)
                    if len(links) >= MAX_PDFS_PER_SKILL:
                        break

            browser.close()
    except Exception:
        pass

    return links


def _download_pdf(url: str, skill: str) -> str:
    downloads_dir = Path(settings.DOWNLOADS_DIR)
    downloads_dir.mkdir(exist_ok=True)
    filename = f"{_slug(skill)}_{uuid.uuid4().hex[:8]}.pdf"
    dest = downloads_dir / filename

    try:
        with httpx.Client(timeout=20, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            dest.write_bytes(resp.content)
        return str(dest)
    except Exception:
        return ""


def scraper_node(state: PolygraphState) -> Dict[str, Any]:
    scraped: List[ScrapedDocument] = []

    with Session(engine) as session:
        claims = session.exec(
            select(Claim).where(Claim.candidate_id == state["candidate_id"])
        ).all()

    for claim in claims:
        pdf_links = _search_pdf_links(claim.skill_name)

        for url in pdf_links:
            local_path = _download_pdf(url, claim.skill_name)
            if not local_path:
                continue

            text = extract_pdf_text(local_path)
            if len(text.strip()) < MIN_TEXT_CHARS:
                continue

            doc_title = url.split("/")[-1].replace(".pdf", "")

            with Session(engine) as session:
                src_doc = SourceDocument(
                    claim_id=claim.id,
                    document_title=doc_title,
                    document_url=url,
                    local_path=local_path,
                    extracted_text=text,
                )
                session.add(src_doc)
                session.commit()

            scraped.append(
                ScrapedDocument(
                    skill_name=claim.skill_name,
                    claim_id=claim.id,
                    document_title=doc_title,
                    document_url=url,
                    local_path=local_path,
                    extracted_text=text,
                )
            )

    return {
        "scraped_documents": scraped,
        "pipeline_status": "verifying",
    }
