import os
import uuid
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from db import get_connection, load_query
import auth

uploads_bp = Blueprint("uploads", __name__)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 Megabytes
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}

BACKEND_UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

for folder in ["profiles", "foods", "categories"]:
    os.makedirs(os.path.join(BACKEND_UPLOADS_DIR, folder), exist_ok=True)


def _allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _save_file(file_storage, subfolder: str, prefix: str):
    """
    Validates file size (<= 5MB) and extension, saves to backend uploads folder.
    Returns (relative_url, error_message)
    """
    if not file_storage or not file_storage.filename:
        return None, "No file provided"

    if not _allowed_file(file_storage.filename):
        return None, f"Unsupported file type. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"

    # Read bytes and check size limit (5MB)
    content = file_storage.read()
    if len(content) > MAX_FILE_SIZE:
        return None, f"Picture size exceeds the 5 MB limit (file size: {len(content) / (1024 * 1024):.2f} MB)"

    ext = file_storage.filename.rsplit(".", 1)[1].lower()
    clean_prefix = secure_filename(prefix)
    filename = f"{clean_prefix}_{uuid.uuid4().hex[:8]}.{ext}"

    # Save to Backend/uploads/<subfolder>/
    backend_dest = os.path.join(BACKEND_UPLOADS_DIR, subfolder, filename)
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
                SELECT username, name, email, phone, vehicle, balance, pfp_url, status, reg_date::text AS reg_date
                FROM rider WHERE username = %s
                """,
                (username,)
            )
            rider_row = cur.fetchone()
            if not rider_row:
                return jsonify({"success": False, "message": "Rider not found"}), 404

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

