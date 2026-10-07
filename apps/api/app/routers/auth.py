"""Cookie-based auth. Tokens never touch localStorage the browser holds only
opaque httpOnly cookies."""

import uuid

import jwt
from fastapi import APIRouter, Request, Response, status

from app.deps import ACCESS_COOKIE, REFRESH_COOKIE, CurrentUser, SessionDep
from contentcal.config import get_settings
from contentcal.errors import UnauthorizedError
from contentcal.models import User
from contentcal.schemas.auth import LoginRequest, RegisterRequest, UserOut
from contentcal.security import create_access_token, create_refresh_token, decode_token
from contentcal.services.auth import authenticate, register_user

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _set_auth_cookies(response: Response, user_id: uuid.UUID) -> None:
    access = create_access_token(user_id)
    refresh, _ = create_refresh_token(user_id)
    common = {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": "lax",
        "path": "/",
    }
    if settings.cookie_domain:
        common["domain"] = settings.cookie_domain
    response.set_cookie(ACCESS_COOKIE, access, max_age=settings.access_token_ttl_minutes * 60, **common)
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=settings.refresh_token_ttl_days * 86400, **common)


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, response: Response, session: SessionDep):
    user, _workspace = await register_user(
        session, email=data.email, password=data.password, full_name=data.full_name, workspace_name=data.workspace_name
    )
    _set_auth_cookies(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
async def login(data: LoginRequest, response: Response, session: SessionDep):
    user = await authenticate(session, email=data.email, password=data.password)
    _set_auth_cookies(response, user.id)
    return user


@router.post("/refresh", response_model=UserOut)
async def refresh(request: Request, response: Response, session: SessionDep):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise UnauthorizedError("No refresh token")
    try:
        user_id = decode_token(token, expected_type="refresh")
    except jwt.PyJWTError:
        raise UnauthorizedError("Refresh token invalid or expired") from None
    user = await session.get(User, user_id)
    if user is None:
        raise UnauthorizedError("User no longer exists")
    _set_auth_cookies(response, user.id)  # rotation: new pair every refresh
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user
