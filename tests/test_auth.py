"""Auth: registration, login, cookie handling, refresh rotation, rejection cases."""

from conftest import register


async def test_register_login_me_logout(client):
    user = await register(client, email="alice@example.com")
    assert user["email"] == "alice@example.com"

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "alice@example.com"

    login = await client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": "correct horse battery"})
    assert login.status_code == 200
    # Tokens must only ever travel inside httpOnly cookies, never response bodies
    assert "access_token" not in login.text
    assert "cc_access" in login.headers.get("set-cookie", "")

    out = await client.post("/api/v1/auth/logout")
    assert out.status_code == 204
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_wrong_password_rejected(client):
    await register(client, email="bob@example.com")
    resp = await client.post("/api/v1/auth/login", json={"email": "bob@example.com", "password": "wrong-password-123"})
    assert resp.status_code == 401


async def test_duplicate_registration_rejected(client):
    await register(client, email="carol@example.com")
    await client.post("/api/v1/auth/logout")
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "carol@example.com", "password": "another good password", "full_name": "Carol Again", "workspace_name": "Dup"},
    )
    assert resp.status_code == 409


async def test_short_password_rejected(client):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "dave@example.com", "password": "short", "full_name": "Dave", "workspace_name": "X"},
    )
    assert resp.status_code == 422


async def test_refresh_rotates_session(client):
    await register(client, email="erin@example.com")
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 200
    assert resp.json()["email"] == "erin@example.com"
    assert "cc_access" in resp.headers.get("set-cookie", "")


async def test_unauthenticated_requests_rejected(client):
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    assert (await client.get("/api/v1/workspaces")).status_code == 401
