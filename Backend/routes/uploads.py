import os
import uuid
import io
import logging
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from db import get_connection, load_query
import auth

try:
    import cloudinary
    import cloudinary.uploader
    CLOUDINARY_AVAILABLE = True
except ImportError:
    CLOUDINARY_AVAILABLE = False

logger = logging.getLogger(__name__)

uploads_bp = Blueprint("uploads", __name__)

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 Megabytes
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}

BACKEND_UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

for folder in ["profiles", "foods", "categories"]:
    os.makedirs(os.path.join(BACKEND_UPLOADS_DIR, folder), exist_ok=True)


def _get_clean_cloudinary_url():
    raw = os.getenv("CLOUDINARY_URL") or ""
    val = raw.strip()
    if val.startswith("CLOUDINARY_URL="):
        val = val[len("CLOUDINARY_URL="):].strip()
    val = val.replace("<", "").replace(">", "").strip("'\"")
    return val if val.startswith("cloudinary://") else None


def _allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _save_file(file_storage, subfolder: str, prefix: str):
    """
    Validates file size (<= 5MB) and extension.
    If Cloudinary is configured via CLOUDINARY_URL, uploads directly to Cloudinary and returns secure HTTPS URL.
    Otherwise, saves to backend uploads folder (Backend/uploads/<subfolder>/...) and returns relative path.
    Returns (url, error_message)
    """
    if not file_storage or not file_storage.filename:
        return None, "No file provided"

    if not _allowed_file(file_storage.filename):
        return None, f"Unsupported file type. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"

    # Read bytes and check size limit (25MB)
    content = file_storage.read()
    if len(content) > MAX_FILE_SIZE:
        return None, f"Picture size exceeds the 25 MB limit (file size: {len(content) / (1024 * 1024):.2f} MB)"

    clean_prefix = secure_filename(prefix)
    public_id = f"{clean_prefix}_{uuid.uuid4().hex[:8]}"

    # 1. Try Cloudinary upload if configured (ideal for Render and production hosting)
    c_url = _get_clean_cloudinary_url()
    if CLOUDINARY_AVAILABLE and c_url:
        try:
            cloudinary.reset_config()
            os.environ["CLOUDINARY_URL"] = c_url
            upload_res = cloudinary.uploader.upload(
                io.BytesIO(content),
                folder=f"food_ninja/{subfolder}",
                public_id=public_id,
                resource_type="image",
                overwrite=True
            )
            secure_url = upload_res.get("secure_url") or upload_res.get("url")
            if secure_url:
                return secure_url, None
        except Exception as e:
            logger.warning(f"Cloudinary upload failed: {e}. Falling back to local storage.")

    # 2. Local filesystem storage (fallback or local development)
    ext = file_storage.filename.rsplit(".", 1)[1].lower()
    filename = f"{public_id}.{ext}"

    target_dir = os.path.join(BACKEND_UPLOADS_DIR, subfolder)
    os.makedirs(target_dir, exist_ok=True)
    backend_dest = os.path.join(target_dir, filename)
    with open(backend_dest, "wb") as f:
        f.write(content)

    relative_url = f"/uploads/{subfolder}/{filename}"
    return relative_url, None


# -----------------------------------------------------------------------------
# 1. User Profile Picture Upload & Profile Detail
# -----------------------------------------------------------------------------
@uploads_bp.route("/users/me/profile", methods=["GET"])
def get_user_profile():
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "user":
        return jsonify({"success": False, "message": "Customer authorization required"}), 401

    username = payload["username"]
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT username, name, email, phone, pfp_url,
                       ST_Y(location::geometry) AS latitude,
                       ST_X(location::geometry) AS longitude,
                       status, reg_date::text AS reg_date
                FROM users WHERE username = %s
                """,
                (username,)
            )
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({"success": False, "message": "User not found"}), 404

            return jsonify({"success": True, "profile": user_row}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@uploads_bp.route("/users/me/pfp", methods=["POST"])
def upload_user_pfp():
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "user":
        return jsonify({"success": False, "message": "Customer authorization required"}), 401

    username = payload["username"]
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file field 'file' in upload request"}), 400

    file_obj = request.files["file"]
    relative_url, err = _save_file(file_obj, "profiles", f"user_{username}")
    if err:
        return jsonify({"success": False, "message": err}), 400

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("UPDATE users SET pfp_url = %s WHERE username = %s", (relative_url, username))
            conn.commit()

        return jsonify({
            "success": True,
            "message": "Profile picture updated successfully!",
            "pfp_url": relative_url
        }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# -----------------------------------------------------------------------------
# 2. Rider Profile Picture Upload & Profile Detail
# -----------------------------------------------------------------------------
@uploads_bp.route("/rider/me/profile", methods=["GET"])
def get_rider_profile():
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 401

    username = payload["username"]
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT username, name, email, phone, vehicle, balance, due_amount,
                       ST_Y(location::geometry) AS latitude,
                       ST_X(location::geometry) AS longitude,
                       pfp_url, status, reg_date::text AS reg_date
                FROM rider WHERE username = %s
                """,
                (username,)
            )
            rider_row = cur.fetchone()
            if not rider_row:
                return jsonify({"success": False, "message": "Rider not found"}), 404

            rider_row["balance"] = float(rider_row.get("balance") or 0)
            rider_row["due_amount"] = float(rider_row.get("due_amount") or 0)
            if rider_row.get("latitude") is not None:
                rider_row["latitude"] = float(rider_row["latitude"])
            if rider_row.get("longitude") is not None:
                rider_row["longitude"] = float(rider_row["longitude"])

            return jsonify({"success": True, "profile": rider_row}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@uploads_bp.route("/rider/me/pfp", methods=["POST"])
def upload_rider_pfp():
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 401

    username = payload["username"]
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file field 'file' in upload request"}), 400

    file_obj = request.files["file"]
    relative_url, err = _save_file(file_obj, "profiles", f"rider_{username}")
    if err:
        return jsonify({"success": False, "message": err}), 400

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("UPDATE rider SET pfp_url = %s WHERE username = %s", (relative_url, username))
            conn.commit()

        return jsonify({
            "success": True,
            "message": "Rider profile picture updated successfully!",
            "pfp_url": relative_url
        }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# -----------------------------------------------------------------------------
# 3. Owner Food Picture Upload
# -----------------------------------------------------------------------------
@uploads_bp.route("/owner/restaurants/<restaurant_id>/foods/<food_id>/picture", methods=["POST"])
def upload_food_picture(restaurant_id, food_id):
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "owner":
        return jsonify({"success": False, "message": "Restaurant owner authorization required"}), 401

    owner_id = payload["username"]
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file field 'file' in upload request"}), 400

    file_obj = request.files["file"]
    relative_url, err = _save_file(file_obj, "foods", f"food_{food_id}")
    if err:
        return jsonify({"success": False, "message": err}), 400

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE foods F
                SET picture_url = %s
                WHERE F.food_id = %s AND F.restaurant_id = %s
                  AND EXISTS (SELECT 1 FROM restaurant R WHERE R.restaurant_id = F.restaurant_id AND R.owner_id = %s)
                """,
                (relative_url, food_id, restaurant_id, owner_id)
            )
            if cur.rowcount == 0:
                return jsonify({"success": False, "message": "Food item or restaurant not found under your ownership"}), 404

            conn.commit()

        return jsonify({
            "success": True,
            "message": "Food picture uploaded successfully!",
            "picture_url": relative_url
        }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@uploads_bp.route("/admin/categories", methods=["POST"])
def upsert_food_category():
    payload = auth.get_user_info()
    if not auth.is_approved_admin(payload):
        return jsonify({"success": False, "message": "Approved admin authorization required"}), 403

    category = (request.form.get("category") or "").strip()
    if not category or len(category) > 50:
        return jsonify({"success": False, "message": "Category must contain 1 to 50 characters"}), 400
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file field 'file' in upload request"}), 400

    picture_url, err = _save_file(request.files["file"], "categories", f"category_{category}")
    if err:
        return jsonify({"success": False, "message": err}), 400
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("admin.sql", "insert_food_category"), (category, picture_url))
            conn.commit()
            return jsonify({"success": True, "category": cur.fetchone(), "picture_url": picture_url}), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# -----------------------------------------------------------------------------
# 4. Owner Restaurant Picture Upload & Delete
# -----------------------------------------------------------------------------
@uploads_bp.route("/owner/restaurants/<restaurant_id>/picture", methods=["POST", "DELETE"])
def manage_restaurant_picture(restaurant_id):
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "owner":
        return jsonify({"success": False, "message": "Restaurant owner authorization required"}), 401

    owner_id = payload["username"]

    if request.method == "DELETE":
        try:
            with get_connection() as conn, conn.cursor() as cur:
                cur.execute(
                    "UPDATE restaurant SET picture_url = NULL WHERE restaurant_id = %s AND owner_id = %s",
                    (restaurant_id, owner_id)
                )
                if cur.rowcount == 0:
                    return jsonify({"success": False, "message": "Restaurant not found under your ownership"}), 404
                conn.commit()

            return jsonify({
                "success": True,
                "message": "Restaurant picture removed successfully!",
                "picture_url": None
            }), 200
        except Exception as e:
            return jsonify({"success": False, "message": str(e)}), 500

    # POST - Upload or change picture
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file field 'file' in upload request"}), 400

    file_obj = request.files["file"]
    picture_url, err = _save_file(file_obj, "restaurants", f"restaurant_{restaurant_id}")
    if err:
        return jsonify({"success": False, "message": err}), 400

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE restaurant SET picture_url = %s WHERE restaurant_id = %s AND owner_id = %s",
                (picture_url, restaurant_id, owner_id)
            )
            if cur.rowcount == 0:
                return jsonify({"success": False, "message": "Restaurant not found under your ownership"}), 404
            conn.commit()

        return jsonify({
            "success": True,
            "message": "Restaurant picture updated successfully!",
            "picture_url": picture_url
        }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


