"""Image generation and storage service."""
import aiohttp
import asyncio
import base64
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from .db.settings import get_setting, set_setting


# Base directory for image storage (relative to project root)
IMAGES_BASE = Path(__file__).parent.parent / "data" / "images"


def _ensure_images_dir() -> None:
    """Ensure the images directory exists."""
    IMAGES_BASE.mkdir(parents=True, exist_ok=True)


def _image_dir_for_record(record_id: int) -> Path:
    """Return the subdirectory path for a given image record id."""
    now = datetime.now()
    subdir = IMAGES_BASE / now.strftime("%Y-%m")
    subdir.mkdir(parents=True, exist_ok=True)
    return subdir


def _mime_type_from_ext(ext: str) -> str:
    """Map file extension to MIME type."""
    return {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
    }.get(ext.lower(), "application/octet-stream")


def _ext_from_mime(mime: str) -> str:
    """Map MIME type to file extension."""
    return {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
    }.get(mime.lower(), "png")


# =============================================================================
# Size ratio mapping per provider
# =============================================================================

def _map_size_ratio(api_base: str, size_ratio: str) -> Dict[str, Any]:
    """Map unified size_ratio to provider-specific API parameters.

    Providers:
    - OpenAI-compatible (openai.com): size param
    - SiliconFlow: image_size param
    - OpenRouter: aspect_ratio + resolution
    - Default: OpenAI format
    """
    if "siliconflow" in api_base.lower():
        size_map = {
            "1:1":   "1024x1024",
            "16:9":  "1280x768",
            "9:16":  "768x1280",
        }
    elif "openrouter" in api_base.lower():
        return {"aspect_ratio": size_ratio, "resolution": "1K"}
    else:
        # Default to OpenAI format
        size_map = {
            "1:1":   "1024x1024",
            "16:9":  "1792x1024",
            "9:16":  "1024x1792",
        }
    return {"size": size_map.get(size_ratio, "1024x1024")}


# =============================================================================
# Image generation
# =============================================================================

async def get_active_image_provider() -> Optional[Dict[str, Any]]:
    """Get the active image provider config from DB, or None if not set."""
    provider_id_str = await get_setting("active_image_provider_id")
    if not provider_id_str:
        return None
    try:
        from .db import get_ai_provider
        provider_id = int(provider_id_str)
        provider = await get_ai_provider(provider_id)
        if provider and provider.get("image_model"):
            return provider
        return None
    except (ValueError, TypeError):
        return None


async def generate_image(
    prompt: str,
    size_ratio: str = "1:1",
    provider_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Generate an image via OpenAI-compatible API and save to disk.

    Args:
        prompt: Image description text
        size_ratio: Aspect ratio - "1:1", "16:9", or "9:16"
        provider_config: Optional provider dict (if None, use active image provider)

    Returns:
        Image record dict with id, file_path, mime_type, width, height, created_at, etc.

    Raises:
        ValueError: If no active image provider or provider has no image_model
        RuntimeError: If API call fails
    """
    if provider_config is None:
        provider_config = await get_active_image_provider()
        if provider_config is None:
            raise ValueError("未设置生图 provider，请先在设置中配置并激活生图供应商")

    api_base = provider_config.get("image_api_base") or provider_config.get("api_base", "")
    image_model = provider_config.get("image_model", "")
    api_key = provider_config.get("api_key", "")

    if not api_base or not image_model:
        raise ValueError("所选 provider 不支持生图功能")

    # Map size ratio to API-specific params
    size_params = _map_size_ratio(api_base, size_ratio)

    payload = {
        "model": image_model,
        "prompt": prompt,
        "n": 1,
        "response_format": "b64_json",
    }
    payload.update(size_params)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    image_bytes: Optional[bytes] = None
    used_url_fallback = False

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
            async with session.post(
                f"{api_base}/images/generations",
                headers=headers,
                json=payload,
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise RuntimeError(f"生图 API 失败（HTTP {resp.status}）：{error_text}")

                data = await resp.json()
                # Try b64_json first
                b64 = data.get("data", [{}])[0].get("b64_json")
                if b64:
                    image_bytes = base64.b64decode(b64)
                else:
                    # Fallback to URL — download the image
                    image_url = data.get("data", [{}])[0].get("url")
                    if not image_url:
                        raise RuntimeError("API 响应中既无 b64_json 也无 url")
                    used_url_fallback = True
                    async with session.get(image_url) as img_resp:
                        if img_resp.status != 200:
                            raise RuntimeError(f"下载图片失败（HTTP {img_resp.status}）")
                        image_bytes = await img_resp.read()
    except asyncio.TimeoutError:
        raise RuntimeError("生图请求超时（60s），请稍后重试")
    except aiohttp.ClientError as e:
        raise RuntimeError(f"生图请求失败：{e}")

    if image_bytes is None:
        raise RuntimeError("未能获取图片数据")

    # Save to disk — get a placeholder ID first (will update with real ID after DB insert)
    _ensure_images_dir()
    from .db._connection import DB_PATH
    import aiosqlite

    # Determine MIME type from response or default
    mime_type = "image/png"
    if used_url_fallback and data.get("data", [{}])[0].get("url"):
        url = data["data"][0]["url"]
        for ext in ["png", "jpg", "jpeg", "gif", "webp"]:
            if f".{ext}" in url:
                mime_type = _mime_type_from_ext(ext)
                break

    # Parse width/height from size param if available
    width = height = None
    if "size" in size_params:
        wh = size_params["size"].split("x")
        if len(wh) == 2:
            width, height = int(wh[0]), int(wh[1])

    ext = _ext_from_mime(mime_type)

    # Insert DB record first to get ID
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO images (source, prompt, model, file_path, mime_type, file_size, width, height, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("generated", prompt, image_model, "", mime_type, len(image_bytes), width, height, now),
        )
        await db.commit()
        image_id = cursor.lastrowid

    # Build relative path and save file
    subdir = IMAGES_BASE / now[:7]  # YYYY-MM
    subdir.mkdir(parents=True, exist_ok=True)
    rel_path = f"data/images/{now[:7]}/{image_id}.{ext}"
    file_path = Path(__file__).parent.parent / rel_path

    with open(file_path, "wb") as f:
        f.write(image_bytes)

    # Update record with correct file_path
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE images SET file_path = ? WHERE id = ?",
            (rel_path, image_id),
        )
        await db.commit()

    return {
        "id": image_id,
        "source": "generated",
        "prompt": prompt,
        "model": image_model,
        "file_path": rel_path,
        "mime_type": mime_type,
        "file_size": len(image_bytes),
        "width": width,
        "height": height,
        "created_at": now,
    }


async def test_image_provider(api_base: str, image_model: str, api_key: str) -> Dict[str, Any]:
    """Test connectivity of an image provider with minimal request.

    Returns {"success": bool, "message": str}
    """
    payload = {
        "model": image_model,
        "prompt": "a small red circle",
        "n": 1,
        "size": "512x512",
        "response_format": "b64_json",
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{api_base}/images/generations",
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status == 200:
                    return {"success": True, "message": "连接成功"}
                error_text = await resp.text()
                try:
                    err_json = await resp.json()
                    err_msg = err_json.get("error", {}).get("message", error_text)
                except Exception:
                    err_msg = error_text
                return {"success": False, "message": f"HTTP {resp.status}: {err_msg}"}
    except asyncio.TimeoutError:
        return {"success": False, "message": "请求超时（30s）"}
    except aiohttp.ClientError as e:
        return {"success": False, "message": f"连接失败：{e}"}


# =============================================================================
# Image file management
# =============================================================================

async def save_uploaded_image(
    file_bytes: bytes,
    mime_type: str,
    source: str = "note_attachment",
) -> Dict[str, Any]:
    """Save an uploaded image file and insert DB record.

    Returns image record dict.
    """
    _ensure_images_dir()
    now = datetime.now()
    now_iso = now.isoformat()
    ext = _ext_from_mime(mime_type)
    subdir = IMAGES_BASE / now.strftime("%Y-%m")
    subdir.mkdir(parents=True, exist_ok=True)

    import aiosqlite
    from .db._connection import DB_PATH

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO images (source, file_path, mime_type, file_size, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (source, "", mime_type, len(file_bytes), now_iso),
        )
        await db.commit()
        image_id = cursor.lastrowid

    rel_path = f"data/images/{now.strftime('%Y-%m')}/{image_id}.{ext}"
    file_path = Path(__file__).parent.parent / rel_path
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE images SET file_path = ? WHERE id = ?",
            (rel_path, image_id),
        )
        await db.commit()

    return {
        "id": image_id,
        "source": source,
        "file_path": rel_path,
        "mime_type": mime_type,
        "file_size": len(file_bytes),
        "created_at": now_iso,
    }


async def get_image_record(image_id: int) -> Optional[Dict[str, Any]]:
    """Get image record by id."""
    from .db._connection import DB_PATH
    import aiosqlite
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM images WHERE id = ?", (image_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def list_images(
    source: Optional[str] = None,
    model: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Dict[str, Any]]:
    """List image records with optional filters."""
    from .db._connection import DB_PATH
    import aiosqlite
    query = "SELECT * FROM images WHERE 1=1"
    params = []
    if source:
        query += " AND source = ?"
        params.append(source)
    if model:
        query += " AND model = ?"
        params.append(model)
    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def delete_image(image_id: int) -> bool:
    """Delete image record and the corresponding file."""
    record = await get_image_record(image_id)
    if not record:
        return False

    # Delete file
    if record["file_path"]:
        file_path = Path(__file__).parent.parent / record["file_path"]
        if file_path.exists():
            file_path.unlink()

    # Delete DB record
    from .db._connection import DB_PATH
    import aiosqlite
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM images WHERE id = ?", (image_id,))
        await db.commit()

    return True


async def set_active_image_provider(provider_id: Optional[int]) -> None:
    """Set the active image provider by id. Pass None to clear."""
    if provider_id is None:
        await set_setting("active_image_provider_id", "")
    else:
        await set_setting("active_image_provider_id", str(provider_id))


async def get_active_image_provider_id() -> Optional[int]:
    """Get the active image provider id, or None."""
    val = await get_setting("active_image_provider_id")
    if not val:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
