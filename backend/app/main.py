import logging

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.routers import api
from app.services.base import AIProvider
from app.services.factory import create_provider

logger = logging.getLogger(__name__)
settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0")
api_router = APIRouter(prefix="/api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def get_provider(config: Settings = Depends(get_settings)) -> AIProvider:
    return create_provider(config)


app.include_router(api.router)
