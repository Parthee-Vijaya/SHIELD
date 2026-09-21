"""Authenticated intake of supplier documentation into a municipal case."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from src.api.workspace import WORKSPACE_ACCESS
from src.auth import UserPrincipal
from src.database.cases import get_case
from src.database.connection import get_db
from src.services.safe_public_fetch import MAX_SOURCE_BYTES
from src.services.analysis_limits import public_analysis_limits
from src.services.source_material import (
    list_case_source_material,
    save_case_source,
    save_case_url,
)


router = APIRouter(tags=["source-material"])


class SourceURLRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    url: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=500)
    category: str = "supplier_documentation"


def _check_case(db: Session, case_id: str):
    if get_case(db, case_id) is None:
        raise HTTPException(status_code=404, detail="Sagen findes ikke.")


@router.get("/api/v3/cases/{case_id}/source-material")
def get_source_material(
    case_id: str,
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
):
    _check_case(db, case_id)
    items = list_case_source_material(db, case_id)
    return {
        "items": items,
        "count": len(items),
        "analysis_limits": public_analysis_limits(),
    }


@router.post("/api/v3/cases/{case_id}/source-material", status_code=201)
async def upload_source_material(
    case_id: str,
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    category: Annotated[str, Form()] = "supplier_documentation",
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
):
    try:
        _check_case(db, case_id)
        content = await file.read(MAX_SOURCE_BYTES + 1)
        if len(content) > MAX_SOURCE_BYTES:
            raise HTTPException(status_code=413, detail="Filen må højst fylde 5 MB.")
        return await run_in_threadpool(
            save_case_source,
            db,
            case_id,
            filename=file.filename or "",
            content=content,
            actor=user.name[:128],
            title=title,
            category=category,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Kildematerialet kunne ikke gemmes samlet. Prøv igen.",
        ) from exc
    finally:
        await file.close()


@router.post("/api/v3/cases/{case_id}/source-material/url", status_code=201)
def add_source_url(
    case_id: str,
    body: SourceURLRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
):
    _check_case(db, case_id)
    try:
        return save_case_url(
            db,
            case_id,
            url=body.url,
            actor=user.name[:128],
            title=body.title,
            category=body.category,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Kildematerialet kunne ikke gemmes samlet. Prøv igen.",
        ) from exc
