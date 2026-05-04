"""FastAPI JWT authentication dependency.

NextAuth.js v4 with `session: { strategy: "jwt" }` signs session tokens
using HS256 with NEXTAUTH_SECRET. The payload contains our custom `googleSub`
field that we populate in the jwt() callback in frontend/src/lib/auth.ts.

The frontend attaches this token as `Authorization: Bearer <token>`.
"""
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlmodel import Session, select

from .config import settings
from .database import get_session
from .models.tenant import Organization

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)


def _decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.NEXTAUTH_SECRET, algorithms=["HS256"])
        return payload
    except JWTError:
        return None


def get_current_org(
    token: Optional[str] = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> Organization:
    """Require a valid NextAuth session JWT and return the matching Organization."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # NextAuth stores our custom claim under the key we set in jwt() callback
    google_sub = payload.get("googleSub") or payload.get("sub")
    if not google_sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )

    org = session.exec(
        select(Organization).where(Organization.google_sub == google_sub)
    ).first()

    if not org:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No organization found for this account. Please complete onboarding.",
        )

    return org
