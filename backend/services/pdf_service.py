import pdfplumber

MAX_CHARS = 50_000


def extract_pdf_text(path: str) -> str:
    try:
        with pdfplumber.open(path) as pdf:
            parts = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    parts.append(text)
            return "\n".join(parts)[:MAX_CHARS]
    except Exception:
        return ""
