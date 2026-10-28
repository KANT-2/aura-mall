"""Only copied into the disposable DB test image; never included in the product image."""

import asyncio
import re
from pathlib import Path
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.infra.database import get_session
from aura_api.main import create_app

app = create_app()
Session = Annotated[AsyncSession, Depends(get_session)]


@app.post("/ha-write")
async def ha_write(tag: str, session: Session):
    if not re.fullmatch(r"[a-f0-9]{16}", tag):
        raise HTTPException(400)
    release = Path("/run/aura-db-runtime") / f"release-{tag}"
    async with session.begin():
        await session.execute(
            text("SELECT set_config('application_name', :tag, true)"), {"tag": tag}
        )
        await session.execute(text("INSERT INTO inflight_writes(tag) VALUES (:tag)"), {"tag": tag})
        async with asyncio.timeout(15):
            while not release.exists():
                await asyncio.sleep(0.05)
    return {"committed": True}


@app.get("/rotation-probe")
async def probe(request: Request, session: Session):
    orm_user = await session.scalar(text("SELECT current_user"))
    async with request.app.state.auth_repository._connection(check_schema=False) as connection:
        auth_user = (await (await connection.execute("SELECT current_user")).fetchone())[
            "current_user"
        ]
    return {"orm_user": orm_user, "auth_user": auth_user}


@app.get("/rotation-inflight")
async def inflight(request: Request, tag: str, session: Session):
    if not re.fullmatch(r"[a-f0-9]{16}", tag):
        raise HTTPException(400)
    release = Path("/run/aura-db-runtime") / f"release-{tag}"
    async with session.begin():
        orm_user = await session.scalar(text("SELECT current_user"))
        await session.execute(
            text("SELECT set_config('application_name', :tag, true)"), {"tag": tag}
        )
        await session.execute(text("UPDATE rotation_lock SET value=value+1 WHERE id=1"))
        await session.execute(text("INSERT INTO inflight_writes(tag) VALUES (:tag)"), {"tag": tag})
        async with request.app.state.auth_repository._connection(check_schema=False) as connection:
            auth_user = (await (await connection.execute("SELECT current_user")).fetchone())[
                "current_user"
            ]
            await connection.execute("SELECT set_config('application_name', %s, true)", (tag,))
            # Keep both real DB transactions open across publication and worker pool swaps.
            async with asyncio.timeout(90):
                while not release.exists():
                    await asyncio.sleep(0.05)
            await connection.execute("INSERT INTO inflight_auth_writes(tag) VALUES (%s)", (tag,))
    release.unlink(missing_ok=True)
    return {"orm_user": orm_user, "auth_user": auth_user, "committed": True}


@app.get("/rotation-locked")
async def locked(tag: str, session: Session):
    if not re.fullmatch(r"[a-f0-9]{16}", tag):
        raise HTTPException(400)
    async with session.begin():
        orm_user = await session.scalar(text("SELECT current_user"))
        await session.execute(
            text("SELECT set_config('application_name', :tag, true)"), {"tag": tag}
        )
        # This is a real PostgreSQL row-lock wait, not an asyncio sleep or a mocked pool.
        await session.execute(text("UPDATE rotation_lock SET value=value+1 WHERE id=1"))
        await session.execute(text("INSERT INTO inflight_writes(tag) VALUES (:tag)"), {"tag": tag})
    return {"orm_user": orm_user, "committed": True}
