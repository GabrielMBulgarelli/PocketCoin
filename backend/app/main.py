from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.database import SessionLocal
from app.routers import router
from app.services.imports import expire_pending_previews
from app.services.planned_payments import materialize_due_recurrences
from app.services.reference_data import DomainValidationError, NotFoundError


@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as session:
        expire_pending_previews(session)
        materialize_due_recurrences(session)
        session.commit()
    yield


app = FastAPI(title="PocketCoin API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["content-type"],
)


@app.exception_handler(DomainValidationError)
def domain_validation_error(_: Request, error: DomainValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"code": "validation_error", "message": str(error), "field": error.field},
    )


@app.exception_handler(NotFoundError)
def not_found_error(_: Request, error: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"code": "not_found", "message": str(error)})


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return the availability of the local API."""
    return {"status": "ok"}


app.include_router(router)

frontend_directory = Path(__file__).resolve().parents[2] / "frontend" / "dist"
assets_directory = frontend_directory / "assets"
if assets_directory.is_dir():
    app.mount("/assets", StaticFiles(directory=assets_directory), name="assets")


@app.api_route("/{application_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def serve_frontend(application_path: str) -> FileResponse:
    if application_path == "api" or application_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    index = frontend_directory / "index.html"
    if not index.is_file():
        raise HTTPException(
            status_code=404,
            detail="Frontend build is unavailable. Run `make build` for release serving.",
        )
    return FileResponse(index)
