from flask import Blueprint, request, jsonify
from db import get_connection, load_query
import auth
import psycopg
import time
import math
import re
import uuid

owner_bp = Blueprint("owner", __name__)


def approved_owner_required():
    payload = auth.get_user_info()
    if payload is None or payload.get("user_type") != "owner":
        return None, (jsonify({"success": False, "message": "Owner authorization required"}), 403)

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("owner.sql", "check_owner_status"), (payload.get("username"),))
            row = cur.fetchone()
            if not row:
                return None, (jsonify({"success": False, "message": "Owner not found"}), 404)
            if row.get("status") == "banned":
                return None, (jsonify({"success": False, "message": "this account is permanently banned"}), 403)
            if row.get("status") != "approved":
                return None, (jsonify({"success": False, "message": "Waiting for admin approval"}), 403)
            return payload, None
    except psycopg.Error:
        return None, (jsonify({"success": False, "message": "Database error"}), 500)


@owner_bp.route("/owner/status", methods=["GET"])
def get_owner_status():
    payload = auth.get_user_info()

    if payload is None or payload.get("user_type") != "owner":
        return jsonify({
            "success": False,
            "message": "Owner authorization required"
        }), 403

    username = payload.get("username")

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                query = load_query("owner.sql", "get_owner_status")
                cur.execute(query, (username,))
                row = cur.fetchone()

                if not row:
                    return jsonify({
                        "success": False,
                        "message": "Owner not found"
                    }), 404

                return jsonify({
                    "success": True,
                    "status": row.get("status", "pending"),
                    "name": row.get("name"),
                    "email": row.get("email"),
                    "phone": row.get("phone"),
                    "nid": row.get("nid")
                }), 200

    except psycopg.Error:
        return jsonify({
            "success": False,
            "message": "Database error"
        }), 500


@owner_bp.route("/owner/restaurants", methods=["GET", "POST"])
def owner_restaurants():
    payload, error = approved_owner_required()
    if error:
        return error

    username = payload.get("username")

    if request.method == "GET":
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    query = load_query("owner.sql", "get_owner_restaurants")
                    cur.execute(query, (username,))
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

    if request.method == "POST":
        data = request.get_json() or {}
        name = data.get("name")
        open_time = data.get("open_time") or "10:00:00"
        close_time = data.get("close_time") or "23:00:00"
        latitude = data.get("latitude") or 23.7925
        longitude = data.get("longitude") or 90.4078

        if not isinstance(name, str) or not name.strip():
            return jsonify({
                "success": False,
                "message": "Restaurant name is required"
            }), 400

        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    # Check whether owner is approved
                    status_query = load_query("owner.sql", "check_owner_status")
                    cur.execute(status_query, (username,))
                    owner_row = cur.fetchone()

                    if not owner_row or owner_row.get("status") != "approved":
                        return jsonify({
                            "success": False,
                            "message": "Your account is pending admin verification. You cannot create a restaurant yet."
                        }), 403

                    restaurant_id = f"REST-{int(time.time())}"
                    insert_query = load_query("owner.sql", "insert_restaurant")
                    cur.execute(
                        insert_query,
                        (
                            restaurant_id,
                            username,
                            name.strip(),
                            float(longitude),
                            float(latitude),
                            open_time,
                            close_time,
                            "pending"
                        )
                    )
                    conn.commit()

                    return jsonify({
                        "success": True,
                        "message": "Restaurant created and submitted for Admin verification",
                        "restaurant": {
                            "restaurant_id": restaurant_id,
                            "name": name.strip(),
                            "open_time": open_time,
                            "close_time": close_time,
                            "status": "pending"
                        }
                    }), 201

        except psycopg.Error:
            return jsonify({
                "success": False,
                "message": "Database error"
            }), 500


@owner_bp.route("/owner/restaurants/<restaurant_id>", methods=["DELETE"])
def delete_owner_restaurant(restaurant_id):
    payload = auth.get_user_info()

    if payload is None:
        return jsonify({
            "success": False,
            "message": "Owner or admin authorization required"
        }), 403

    user_type = payload.get("user_type")
    username = payload.get("username")

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                if user_type == "admin":
                    if not auth.is_approved_admin(payload):
                        return jsonify({
                            "success": False,
                            "message": "Approved admin authorization required"
                        }), 403
                    query = load_query("admin.sql", "delete_restaurant")
                    cur.execute(query, (restaurant_id,))
                elif user_type == "owner":
                    status_query = load_query("owner.sql", "check_owner_status")
                    cur.execute(status_query, (username,))
                    owner_row = cur.fetchone()
                    if not owner_row or owner_row.get("status") != "approved":
                        return jsonify({
                            "success": False,
                            "message": "Approved owner authorization required"
                        }), 403
                    query = load_query("owner.sql", "delete_restaurant_by_owner")
                    cur.execute(query, (restaurant_id, username))
                else:
                    return jsonify({
                        "success": False,
                        "message": "Owner or admin authorization required"
                    }), 403

                conn.commit()
                return jsonify({
                    "success": True,
                    "message": "Restaurant deleted successfully"
                }), 200

    except psycopg.Error:
        return jsonify({
            "success": False,
            "message": "Database error"
        }), 500


@owner_bp.route("/owner/restaurants/<restaurant_id>", methods=["GET", "PATCH"])
def owner_restaurant_detail(restaurant_id):
    payload, error = approved_owner_required()
    if error:
        return error
    owner_id = payload["username"]
    try:
        with get_connection() as conn, conn.cursor() as cur:
            if request.method == "GET":
                cur.execute(load_query("owner.sql", "get_owner_restaurant"), (restaurant_id, owner_id))
                restaurant = cur.fetchone()
                if not restaurant:
                    return jsonify({"success": False, "message": "Restaurant not found"}), 404
                cur.execute(load_query("owner.sql", "get_owner_foods"), (restaurant_id, restaurant_id, owner_id))
                return jsonify({"success": True, "restaurant": restaurant, "foods": cur.fetchall() or []}), 200

            data = request.get_json() or {}
            open_time = data.get("open_time")
            close_time = data.get("close_time")
            status = data.get("status")
            if status not in ("open", "closed", "shutdown"):
                return jsonify({"success": False, "message": "Status must be open, closed, or shutdown"}), 400
            cur.execute(load_query("owner.sql", "update_owner_restaurant"), (open_time, close_time, status, restaurant_id, owner_id))
            if cur.rowcount == 0:
                return jsonify({"success": False, "message": "Restaurant not found"}), 404
            conn.commit()
            return jsonify({"success": True, "message": "Restaurant updated"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@owner_bp.route("/owner/restaurants/<restaurant_id>/foods", methods=["GET", "POST"])
def owner_foods(restaurant_id):
    payload, error = approved_owner_required()
    if error:
        return error

    owner_id = payload["username"]
    try:
        with get_connection() as conn, conn.cursor() as cur:
            if request.method == "GET":
                cur.execute(load_query("owner.sql", "get_owner_foods"), (restaurant_id, restaurant_id, owner_id))
                return jsonify({"success": True, "foods": cur.fetchall() or []}), 200

            data = request.get_json() or {}
            name = data.get("name")
            category = data.get("category")
            subcategory = data.get("subcategory", "")
            description = data.get("description")

            try:
                price = float(data.get("price"))
                discount = float(data.get("discount", 0))
            except (TypeError, ValueError):
                return jsonify({"success": False, "message": "Price and discount must be numbers"}), 400

            if not isinstance(name, str) or not name.strip():
                return jsonify({"success": False, "message": "Food name is required"}), 400
            if not isinstance(category, str) or not category.strip():
                return jsonify({"success": False, "message": "Food category is required"}), 400
            if not math.isfinite(price) or price < 0:
                return jsonify({"success": False, "message": "Price cannot be negative"}), 400
            if not math.isfinite(discount) or discount < 0 or discount > 100:
                return jsonify({"success": False, "message": "Discount must be between 0 and 100"}), 400
            if not isinstance(subcategory, str) or not re.fullmatch(r"[A-Za-z ]*", subcategory):
                return jsonify({"success": False, "message": "Subcategory may contain only letters and spaces"}), 400

            normalized_subcategory = re.sub(r" +", " ", subcategory.strip()).lower() or None
            cur.execute(load_query("owner.sql", "get_owner_restaurant"), (restaurant_id, owner_id))
            restaurant = cur.fetchone()
            if not restaurant:
                return jsonify({"success": False, "message": "Restaurant not found"}), 404

            cur.execute(load_query("owner.sql", "get_food_categories"))
            categories = {row["category"] for row in cur.fetchall() or []}
            if category not in categories:
                return jsonify({"success": False, "message": "Invalid food category"}), 400

            food_id = f"FOOD-{uuid.uuid4()}"
            cur.execute(load_query("owner.sql", "insert_food"), (food_id, restaurant_id, category, name.strip(), price, discount, description, normalized_subcategory))
            conn.commit()
            return jsonify({"success": True, "message": "Food added successfully", "food_id": food_id}), 201
    except psycopg.errors.ForeignKeyViolation:
        return jsonify({"success": False, "message": "Invalid food category"}), 400
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@owner_bp.route("/owner/food-categories", methods=["GET"])
def owner_food_categories():
    _, error = approved_owner_required()
    if error:
        return error
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("owner.sql", "get_food_categories"))
            return jsonify({"success": True, "categories": [row["category"] for row in cur.fetchall() or []]}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@owner_bp.route("/owner/restaurants/<restaurant_id>/foods/<food_id>", methods=["DELETE"])
def delete_owner_food(restaurant_id, food_id):
    payload, error = approved_owner_required()
    if error:
        return error
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("owner.sql", "delete_food_by_owner"), (food_id, restaurant_id, restaurant_id, payload["username"]))
            if cur.rowcount == 0:
                return jsonify({"success": False, "message": "Food item not found"}), 404
            conn.commit()
            return jsonify({"success": True, "message": "Food removed successfully"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@owner_bp.route("/owner/restaurants/<restaurant_id>/foods/<food_id>", methods=["PATCH"])
def update_owner_food(restaurant_id, food_id):
    payload, error = approved_owner_required()
    if error:
        return error
    data = request.get_json() or {}
    name = data.get("name")
    description = data.get("description")
    subcategory = data.get("subcategory", "")
    try:
        price = float(data.get("price"))
        discount = float(data.get("discount", 0))
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "Price and discount must be numbers"}), 400
    if not isinstance(name, str) or not name.strip():
        return jsonify({"success": False, "message": "Food name is required"}), 400
    if not math.isfinite(price) or price < 0:
        return jsonify({"success": False, "message": "Price cannot be negative"}), 400
    if not math.isfinite(discount) or discount < 0 or discount > 100:
        return jsonify({"success": False, "message": "Discount must be between 0 and 100"}), 400
    if not isinstance(subcategory, str) or not re.fullmatch(r"[A-Za-z ]*", subcategory):
        return jsonify({"success": False, "message": "Subcategory may contain only letters and spaces"}), 400
    normalized_subcategory = re.sub(r" +", " ", subcategory.strip()).lower() or None
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("owner.sql", "update_food_by_owner"), (name.strip(), price, discount, description, normalized_subcategory, food_id, restaurant_id, payload["username"]))
            if cur.rowcount == 0:
                return jsonify({"success": False, "message": "Food item not found"}), 404
            conn.commit()
            return jsonify({"success": True, "message": "Food updated"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@owner_bp.route("/owner/restaurants/<restaurant_id>/orders", methods=["GET"])
def owner_restaurant_orders(restaurant_id):
    payload, error = approved_owner_required()
    if error:
        return error
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("owner.sql", "get_owner_restaurant"), (restaurant_id, payload["username"]))
            if not cur.fetchone():
                return jsonify({"success": False, "message": "Restaurant not found"}), 404
            cur.execute(load_query("owner.sql", "get_owner_restaurant_orders"), (restaurant_id, payload["username"]))
            return jsonify({"success": True, "orders": cur.fetchall() or []}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@owner_bp.route("/owner/restaurants/<restaurant_id>/orders/<order_id>/cancel", methods=["POST"])
def owner_cancel_pending_order(restaurant_id, order_id):
    payload, error = approved_owner_required()
    if error:
        return error
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("owner.sql", "reject_owner_pending_order"), (order_id, restaurant_id, payload["username"]))
            if cur.rowcount == 0:
                return jsonify({"success": False, "message": "Pending order not found"}), 404
            conn.commit()
            return jsonify({"success": True, "message": "Order rejected"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500
