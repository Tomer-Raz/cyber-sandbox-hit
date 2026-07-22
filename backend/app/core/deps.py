from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import InvalidCredential, verify_google_id_token
from app.db.session import get_db
from app.models.user import User

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        claims = verify_google_id_token(credentials.credentials)
    except InvalidCredential as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired credential",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    sub = claims["sub"]
    result = await db.execute(select(User).where(User.google_sub == sub))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            google_sub=sub,
            email=claims.get("email", ""),
            name=claims.get("name") or claims.get("email", "Member"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif user.email != claims.get("email", user.email) or user.name != (
        claims.get("name") or user.name
    ):
        user.email = claims.get("email", user.email)
        user.name = claims.get("name") or user.name
        await db.commit()
        await db.refresh(user)

    return user
