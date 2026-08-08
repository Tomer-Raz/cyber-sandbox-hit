import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.report import ScanReport
from app.services import report_service

from app.core.crypto import ReportSigner

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
    signer = ReportSigner()

    if format == "pdf":
        pdf_bytes = report_service.render_pdf(report)
        signature = signer.sign_report(pdf_bytes)
        pub_key = signer.export_public_key_pem().replace("\n", "\\n")

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="scan-{scan_id}.pdf"',
                "X-Report-Signature": signature,
                "X-Report-Public-Key": pub_key,
            },
        )

    json_str = report.model_dump_json(indent=2)
    signature = signer.sign_report(json_str.encode("utf-8"))
    pub_key = signer.export_public_key_pem().replace("\n", "\\n")

    return Response(
        content=json_str,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="scan-{scan_id}.json"',
            "X-Report-Signature": signature,
            "X-Report-Public-Key": pub_key,
        },
    )