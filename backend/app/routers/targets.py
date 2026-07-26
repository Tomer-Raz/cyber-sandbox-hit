import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.ssrf import UnsafeTargetURLError, validate_target_url
from app.db.session import get_db
from app.models.target import Target
from app.models.user import User
from app.schemas.target import TargetCreate, TargetOut

router = APIRouter(prefix="/api/targets", tags=["targets"])


@router.get("/", response_model=list[TargetOut])
async def list_targets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Target]:
    result = await db.execute(
        select(Target).where(Target.user_id == user.id).order_by(Target.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/", response_model=TargetOut, status_code=status.HTTP_201_CREATED)
async def create_target(
    body: TargetCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Target:
    try:
        url = validate_target_url(body.url)
    except UnsafeTargetURLError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # No separate approval route exists (requirements.md §7) — clearing the
    # SSRF check above is the real gate, so approval is granted here.
    target = Target(user_id=user.id, url=url, description=body.description, approved=True)
    db.add(target)
    await db.commit()
    await db.refresh(target)
    return target


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_target(
    target_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(Target).where(Target.id == target_id, Target.user_id == user.id)
    )
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")

    await db.delete(target)
    await db.commit()
