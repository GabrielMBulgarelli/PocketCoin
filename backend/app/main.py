from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import router
from app.services.reference_data import DomainValidationError, NotFoundError

app = FastAPI(title="PocketCoin API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
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
