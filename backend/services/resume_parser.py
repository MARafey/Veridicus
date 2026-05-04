import io

import pdfplumber


def parse_resume_bytes(content: bytes, filename: str) -> str:
    """Extract plain text from uploaded resume (PDF or TXT)."""
    if filename.lower().endswith(".pdf"):
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                parts = []
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        parts.append(text)
                return "\n".join(parts)
        except Exception as e:
            raise ValueError(f"Failed to parse PDF: {e}")
    else:
        # Assume UTF-8 text
        return content.decode("utf-8", errors="replace")
