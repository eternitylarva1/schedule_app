"""Image routes for generation, upload, and retrieval."""
import os
from pathlib import Path
from typing import Optional

from aiohttp import web
from aiohttp.web import FileField

from .response import json_response, error_response
from .. import image_service


# Base path for serving image files
PROJECT_ROOT = Path(__file__).parent.parent.parent
IMAGES_BASE = PROJECT_ROOT / "data" / "images"


def register_routes(app: web.Application) -> None:
    """Register image routes."""
    app.router.add_post("/api/llm/image-generate", handle_image_generate)
    app.router.add_post("/api/images/upload", handle_image_upload)
    app.router.add_get("/api/images", handle_image_list)
    app.router.add_get("/api/images/{id}", handle_image_get)
    app.router.add_delete("/api/images/{id}", handle_image_delete)
    app.router.add_put("/api/settings/active-image-provider/{id}", handle_set_active_image_provider)
    app.router.add_post("/api/llm/image-test", handle_image_test)


# ============= Image Generation =============


async def handle_image_generate(request: web.Request) -> web.Response:
    """POST /api/llm/image-generate — generate an image via AI.

    Body: {prompt, size_ratio?: "1:1"|"16:9"|"9:16", model?: str}
    Returns: {id, url, prompt, model, created_at}
    """
    try:
        data = await request.json()
    except Exception:
        return error_response("无效的请求体", 400)

    prompt = data.get("prompt", "").strip()
    if not prompt:
        return error_response("prompt 不能为空", 400)

    size_ratio = data.get("size_ratio", "1:1")
    if size_ratio not in ("1:1", "16:9", "9:16"):
        return error_response("size_ratio 必须是 1:1、16:9 或 9:16", 400)

    model_override = data.get("model", "").strip() or None

    # If model override is given, find provider with that model
    provider_config = None
    if model_override:
        from ..db import get_ai_providers
        providers = await get_ai_providers()
        for p in providers:
            if p.get("image_model") == model_override:
                provider_config = p
                break
        if not provider_config:
            return error_response(f"未找到支持模型 {model_override} 的 provider", 400)

    try:
        record = await image_service.generate_image(prompt, size_ratio, provider_config)
    except ValueError as e:
        return error_response(str(e), 400)
    except RuntimeError as e:
        return error_response(str(e), 502)

    url = f"/api/images/{record['id']}"
    return json_response({
        "id": record["id"],
        "url": url,
        "prompt": record["prompt"],
        "model": record["model"],
        "mime_type": record["mime_type"],
        "width": record["width"],
        "height": record["height"],
        "created_at": record["created_at"],
    })


async def handle_image_test(request: web.Request) -> web.Response:
    """POST /api/llm/image-test — test image provider connectivity.

    Body: {api_base, image_model, api_key}
    Returns: {success, message}
    """
    try:
        data = await request.json()
    except Exception:
        return error_response("无效的请求体", 400)

    api_base = data.get("api_base", "").strip()
    image_model = data.get("image_model", "").strip()
    api_key = data.get("api_key", "").strip()

    if not api_base or not image_model or not api_key:
        return error_response("api_base、image_model 和 api_key 都不能为空", 400)

    result = await image_service.test_image_provider(api_base, image_model, api_key)
    return json_response(result)


# ============= Image Upload =============


async def handle_image_upload(request: web.Request) -> web.Response:
    """POST /api/images/upload — upload an image file.

    Multipart form-data with 'file' field.
    Returns: {id, url}
    """
    try:
        reader = await request.multipart()
        field = await reader.next()
        if field is None or field.name != "file":
            return error_response("请提供名为 'file' 的文件字段", 400)

        # Read file data
        file_bytes = await field.read()

        if not file_bytes:
            return error_response("文件内容为空", 400)

        # Determine MIME type from filename
        filename = field.filename or "image.png"
        import mimetypes
        content_type, _ = mimetypes.guess_type(filename)
        content_type = content_type or "image/png"

        # Validate it's an image
        if not content_type.startswith("image/"):
            return error_response("只能上传图片文件", 400)

        record = await image_service.save_uploaded_image(file_bytes, content_type)
        url = f"/api/images/{record['id']}"
        return json_response({"id": record["id"], "url": url})
    except Exception as e:
        return error_response(f"上传失败：{e}", 500)


# ============= Image Retrieval =============


async def handle_image_get(request: web.Request) -> web.Response:
    """GET /api/images/{id} — return image binary file.

    Also supports ?token=xxx&fp=yyy for browser <img> tag authentication.
    """
    try:
        image_id = int(request.match_info["id"])
    except ValueError:
        return error_response("无效的图片 ID", 400)

    record = await image_service.get_image_record(image_id)
    if not record:
        return error_response("图片不存在", 404)

    file_path = PROJECT_ROOT / record["file_path"]
    if not file_path.exists():
        return error_response("图片文件不存在", 404)

    mime_type = record["mime_type"] or "application/octet-stream"
    with open(file_path, "rb") as f:
        file_data = f.read()

    return web.Response(
        body=file_data,
        content_type=mime_type,
        headers={
            "Cache-Control": "public, max-age=86400",
        },
    )


async def handle_image_list(request: web.Request) -> web.Response:
    """GET /api/images — list images with optional filters.

    Query params: source?, model?, limit?, offset?
    Returns: list of image records (without binary data).
    """
    source = request.query.get("source", "").strip() or None
    model = request.query.get("model", "").strip() or None
    try:
        limit = int(request.query.get("limit", 50))
        offset = int(request.query.get("offset", 0))
    except ValueError:
        return error_response("limit 和 offset 必须是整数", 400)

    limit = max(1, min(limit, 200))

    records = await image_service.list_images(source=source, model=model, limit=limit, offset=offset)

    # Build URLs for each record
    for r in records:
        r["url"] = f"/api/images/{r['id']}"
        # Strip file_path from response (internal detail)
        r.pop("file_path", None)

    return json_response(records)


async def handle_image_delete(request: web.Request) -> web.Response:
    """DELETE /api/images/{id} — delete an image and its file."""
    try:
        image_id = int(request.match_info["id"])
    except ValueError:
        return error_response("无效的图片 ID", 400)

    deleted = await image_service.delete_image(image_id)
    if not deleted:
        return error_response("图片不存在", 404)

    return json_response({"success": True})


# ============= Active Image Provider =============


async def handle_set_active_image_provider(request: web.Request) -> web.Response:
    """PUT /api/settings/active-image-provider/{id} — set active image provider.

    id="0" or id="" to clear (disable).
    """
    try:
        provider_id_str = request.match_info["id"]
        if provider_id_str in ("0", ""):
            await image_service.set_active_image_provider(None)
            return json_response({"active_image_provider_id": None})
    except Exception:
        pass

    try:
        provider_id = int(request.match_info["id"])
    except ValueError:
        return error_response("无效的 provider ID", 400)

    # Verify provider exists and has image_model
    from ..db import get_ai_provider
    provider = await get_ai_provider(provider_id)
    if not provider:
        return error_response("provider 不存在", 404)
    if not provider.get("image_model"):
        return error_response("该 provider 未配置生图模型（image_model 字段为空）", 400)

    await image_service.set_active_image_provider(provider_id)
    return json_response({"active_image_provider_id": provider_id})
