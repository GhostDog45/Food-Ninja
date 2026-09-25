from flask import Blueprint, request, jsonify
from db import get_connection, load_query
import auth
import psycopg

admin_bp = Blueprint("admin", __name__)


def approved_admin_required():
    payload = auth.get_user_info()
    if not auth.is_approved_admin(payload):
        return None, (jsonify({"success": False, "message": "Approved admin authorization required"}), 403)
    return payload, None


@admin_bp.route("/admin/status", methods=["GET"])
def admin_status():
    payload = auth.get_user_info()
    if payload is None or payload.get("user_type") != "admin":
        return jsonify({"success": False, "message": "Admin authorization required"}), 403

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("admin.sql", "get_admin_status"), (payload["username"],))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "message": "Admin not found"}), 404
            return jsonify({"success": True, "status": row["status"]}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/pending_admins", methods=["GET"])
def admin_pending_admins():
    _, error = approved_admin_required()
    if error:
        return error
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("admin.sql", "get_all_admins"))
            return jsonify({"success": True, "admins": cur.fetchall() or []}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/verify_admin", methods=["POST"])
def admin_verify_admin():
    _, error = approved_admin_required()
    if error:
        return error
    data = request.get_json() or {}
    username = data.get("username")
    status = data.get("status")
    if not username or status not in ("approved", "banned", "pending"):
        return jsonify({"success": False, "message": "Invalid admin verification data"}), 400
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("admin.sql", "verify_admin"), (status, username))
            conn.commit()
            return jsonify({"success": True, "message": f"Admin status updated to {status}"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/users", methods=["GET"])
def admin_get_users():
    _, error = approved_admin_required()
    if error:
        return error

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                query = load_query("admin.sql", "get_all_users")
                cur.execute(query)
                rows = cur.fetchall() or []

                return jsonify({
                    "success": True,
                    "users": rows
                }), 200

    except psycopg.Error:
        return jsonify({
            "success": False,
            "message": "Database error"
        }), 500


@admin_bp.route("/admin/directory/<resource>", methods=["GET"])
def admin_directory(resource):
    _, error = approved_admin_required()
    if error:
        return error

    resource_queries = {
        "admins": ("get_admins_by_status", "admins"),
        "owners": ("get_owners_by_status", "owners"),
        "restaurants": ("get_restaurants_by_status", "restaurants"),
        "riders": ("get_riders_by_status", "riders"),
        "users": ("get_users_by_status", "users"),
    }
    query_info = resource_queries.get(resource)
    if not query_info:
        return jsonify({"success": False, "message": "Invalid directory resource"}), 404

    status = request.args.get("status", "").strip().lower()
    search = request.args.get("search", "").strip()
    try:
        offset = max(int(request.args.get("offset", "0")), 0)
    except ValueError:
        return jsonify({"success": False, "message": "Invalid directory offset"}), 400
    valid_statuses = {
        "admins": {"pending", "approved", "banned"},
        "owners": {"pending", "approved", "banned"},
        "restaurants": {"pending", "approved", "banned"},
        "riders": {"pending", "approved", "banned"},
        "users": {"active", "banned"},
    }
    if status not in valid_statuses[resource]:
        return jsonify({"success": False, "message": "Invalid directory status"}), 400

    try:
        with get_connection() as conn, conn.cursor() as cur:
            query_name, response_key = query_info
            if resource in ("admins", "owners"):
                params = (status, search, search, search, search, offset)
            elif resource == "users":
                params = ("banned", "banned", status, search, search, search, search, offset)
            elif resource == "restaurants":
                params = (status, status, search, search, search, search, search, offset)
            else:
                params = (status, status, search, search, search, search, offset)
            cur.execute(load_query("admin.sql", query_name), params)
            return jsonify({"success": True, response_key: cur.fetchall() or []}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/summary", methods=["GET"])
def admin_summary():
    _, error = approved_admin_required()
    if error:
        return error
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("admin.sql", "get_admin_summary"))
            return jsonify({"success": True, "summary": cur.fetchone() or {}}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/directory/<resource>/status", methods=["POST"])
def admin_directory_status(resource):
    _, error = approved_admin_required()
    if error:
        return error

    update_queries = {
        "admins": ("update_admin_status", "username"),
        "owners": ("update_owner_status", "owner_id"),
        "restaurants": ("update_restaurant_status", "restaurant_id"),
        "riders": ("update_rider_status", "username"),
        "users": ("update_user_status", "username"),
    }
    query_info = update_queries.get(resource)
    if not query_info:
        return jsonify({"success": False, "message": "Invalid directory resource"}), 404

    data = request.get_json() or {}
    identifier = data.get("identifier")
    status = data.get("status")
    valid_statuses = {
        "admins": {"approved", "banned"},
        "owners": {"approved", "rejected", "banned"},
        "restaurants": {"closed", "banned"},
        "riders": {"offline", "banned"},
        "users": {"ok", "banned"},
    }
    if not isinstance(identifier, str) or not identifier or status not in valid_statuses[resource]:
        return jsonify({"success": False, "message": "Invalid directory status update"}), 400

    try:
        with get_connection() as conn, conn.cursor() as cur:
            query_name, _ = query_info
            cur.execute(load_query("admin.sql", query_name), (status, identifier))
            conn.commit()
            return jsonify({"success": True, "message": "Status updated"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/restaurants/<restaurant_id>", methods=["GET"])
def admin_restaurant_detail(restaurant_id):
    _, error = approved_admin_required()
    if error:
        return error
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("admin.sql", "get_admin_restaurant_details"), (restaurant_id,))
            restaurant = cur.fetchone()
            if not restaurant:
                return jsonify({"success": False, "message": "Restaurant not found"}), 404
            cur.execute(load_query("admin.sql", "get_admin_restaurant_foods"), (restaurant_id,))
            return jsonify({"success": True, "restaurant": restaurant, "foods": cur.fetchall() or []}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/profiles/<resource>/<identifier>", methods=["GET"])
def admin_profile_detail(resource, identifier):
    _, error = approved_admin_required()
    if error:
        return error
    queries = {
        "users": "get_admin_user_details",
        "riders": "get_admin_rider_details",
        "owners": "get_admin_owner_details",
        "admins": "get_admin_admin_details",
    }
    query_name = queries.get(resource)
    if not query_name:
        return jsonify({"success": False, "message": "Invalid profile resource"}), 404
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("admin.sql", query_name), (identifier,))
            profile = cur.fetchone()
            if not profile:
                return jsonify({"success": False, "message": "Profile not found"}), 404
            return jsonify({"success": True, "profile": profile}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/owners", methods=["GET"])
@admin_bp.route("/admin/pending_owners", methods=["GET"])
def admin_pending_owners():
    _, error = approved_admin_required()
    if error:
        return error

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                query = load_query("admin.sql", "get_all_owners")
                cur.execute(query)
                rows = cur.fetchall() or []

                return jsonify({
                    "success": True,
                    "owners": rows
                }), 200

    except psycopg.Error:
        return jsonify({
            "success": False,
            "message": "Database error"
        }), 500


@admin_bp.route("/admin/verify_owner", methods=["POST"])
def admin_verify_owner():
    _, error = approved_admin_required()
    if error:
        return error

    data = request.get_json() or {}
    owner_id = data.get("owner_id")
    status = data.get("status")

    if not owner_id or status not in ("approved", "rejected", "banned", "pending"):
        return jsonify({
            "success": False,
            "message": "Invalid owner verification data"
        }), 400

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                query = load_query("admin.sql", "verify_owner")
                cur.execute(query, (status, owner_id))
                conn.commit()

                return jsonify({
                    "success": True,
                    "message": f"Owner {status} successfully"
                }), 200

    except psycopg.Error:
        return jsonify({
            "success": False,
            "message": "Database error"
        }), 500


@admin_bp.route("/admin/pending_restaurants", methods=["GET"])
def admin_pending_restaurants():
    _, error = approved_admin_required()
    if error:
        return error

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                query = load_query("admin.sql", "get_all_restaurants")
                cur.execute(query)
                rows = cur.fetchall() or []

                return jsonify({
                    "success": True,
                    "restaurants": rows
                }), 200

    except psycopg.Error:
        return jsonify({
            "success": False,
            "message": "Database error"
        }), 500


@admin_bp.route("/admin/pending_riders", methods=["GET"])
def admin_pending_riders():
    _, error = approved_admin_required()
    if error:
        return error

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("admin.sql", "get_all_riders"))
            return jsonify({"success": True, "riders": cur.fetchall() or []}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/verify_rider", methods=["POST"])
def admin_verify_rider():
    _, error = approved_admin_required()
    if error:
        return error

    data = request.get_json() or {}
    rider_username = data.get("rider_username")
    status = data.get("status")
    if not rider_username or status not in ("offline", "banned", "pending"):
        return jsonify({"success": False, "message": "Invalid rider verification data"}), 400

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("admin.sql", "verify_rider"), (status, rider_username))
            conn.commit()
            return jsonify({"success": True, "message": f"Rider status updated to {status}"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@admin_bp.route("/admin/verify_restaurant", methods=["POST"])
def admin_verify_restaurant():
    _, error = approved_admin_required()
    if error:
        return error

    data = request.get_json() or {}
    restaurant_id = data.get("restaurant_id")
    status = data.get("status")

    if not restaurant_id or status not in ("closed", "banned", "pending"):
        return jsonify({
            "success": False,
            "message": "Invalid restaurant verification data"
        }), 400

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                query = load_query("admin.sql", "verify_restaurant")
                cur.execute(query, (status, restaurant_id))
                conn.commit()

                return jsonify({
                    "success": True,
                    "message": f"Restaurant status updated to {status}"
                }), 200

    except psycopg.Error:
        return jsonify({
            "success": False,
            "message": "Database error"
        }), 500
