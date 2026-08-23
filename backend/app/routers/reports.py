import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.report import ScanReport
from app.services import report_service

from app.core.crypto import get_report_signer

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/{scan_id}", response_model=ScanReport)
async def get_report(
    scan_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanReport:
    return await report_service.build_scan_report(scan_id, user, db)


@router.get("/{scan_id}/export")
async def export_report(
    scan_id: uuid.UUID,
    format: str = "json",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    if format not in ("json", "pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="format must be 'json' or 'pdf'"
        )

    report = await report_service.build_scan_report(scan_id, user, db)

    if format == "pdf":
        body, media_type, suffix = report_service.render_pdf(report), "application/pdf", "pdf"
    else:
        body, media_type, suffix = (
            report.model_dump_json(indent=2).encode("utf-8"),
            "application/json",
            "json",
        )

    return Response(
        content=body,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="scan-{scan_id}.{suffix}"',
            **_signature_headers(body),
        },
    )


def _signature_headers(body: bytes) -> dict[str, str]:
    """Signs the exact bytes being returned, when a key is configured.

    Absent a key there are no headers at all: a signature the caller cannot
    check against anything they already trust is worse than none, because it
    invites them to trust it.
    """
    signer = get_report_signer()
    if signer is None:
        return {}
    return {
        "X-Report-Signature": signer.sign_report(body),
        "X-Report-Public-Key": signer.export_public_key_pem().replace("\n", "\\n"),
    }