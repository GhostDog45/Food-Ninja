from flask import Blueprint, jsonify, request
import psycopg
import json
import math
import threading
import time
from flask_sock import Sock

import auth
import utils
from db import get_connection, load_query


rider_bp = Blueprint("rider", __name__)
sock = Sock()
live_locations = {}
live_lock = threading.Lock()
LOCATION_TTL_SECONDS = 20


def get_live_location(username):
    with live_lock:
        location = live_locations.get(username)
        if location and time.time() - location["updated_at"] <= LOCATION_TTL_SECONDS:
            return location
        live_locations.pop(username, None)
        return None


def register_websocket_routes(app):
    sock.init_app(app)

    @sock.route("/rider/location/live")
    def rider_live_location(ws):
        try:
            auth_message = json.loads(ws.receive(timeout=10) or "{}")
        except Exception:
            ws.close(4401, "WebSocket authentication required")
            return
        token = auth_message.get("token", "")
        payload = auth.verify_token(token)
        if not payload or payload.get("user_type") != "rider":
            ws.close(4403, "Rider authorization required")
            return
        username = payload.get("username")
        try:
            with get_connection() as conn, conn.cursor() as cur:
                cur.execute(load_query("rider.sql", "get_rider_status"), (username,))
                rider = cur.fetchone()
                if not rider or rider.get("location") is None or not rider.get("vehicle") or rider.get("status") == "banned":
                    ws.close(4403, "Rider base location and vehicle are required")
                    return
            while True:
                message = ws.receive(timeout=LOCATION_TTL_SECONDS)
                if message is None:
                    with live_lock:
                        live_locations.pop(username, None)
                    with get_connection() as conn, conn.cursor() as cur:
                        cur.execute(load_query("rider.sql", "set_rider_offline_if_online"), (username,))
                        conn.commit()
                    break
                data = json.loads(message)
                latitude = float(data.get("latitude"))
                longitude = float(data.get("longitude"))
                if not math.isfinite(latitude) or not math.isfinite(longitude) or not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
                    ws.send(json.dumps({"success": False, "message": "Invalid coordinates"}))
                    continue
                with live_lock:
                    live_locations[username] = {"latitude": latitude, "longitude": longitude, "updated_at": time.time()}
                ws.send(json.dumps({"success": True, "updated": True}))
        except Exception:
            with live_lock:
                live_locations.pop(username, None)
            try:
                with get_connection() as conn, conn.cursor() as cur:
                    cur.execute(load_query("rider.sql", "set_rider_offline_if_online"), (username,))
                    conn.commit()
            except psycopg.Error:
                pass


@rider_bp.get("/rider/status")
def rider_status():
    payload = auth.get_user_info()
    if payload is None:
        return jsonify({"success": False, "message": "Invalid or missing token"}), 401
    if payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 403

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("rider.sql", "get_rider_status"), (payload["username"],))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "message": "Rider not found"}), 404
            if row.get("status") == "online" and not get_live_location(payload["username"]):
                cur.execute(load_query("rider.sql", "set_rider_offline_if_online"), (payload["username"],))
                conn.commit()
                row["status"] = "offline"
            return jsonify({
                "success": True,
                "status": row.get("status", "pending"),
                "has_location": row.get("location") is not None,
                "vehicle": row.get("vehicle"),
                "balance": float(row.get("balance") or 0),
                "due_amount": float(row.get("due_amount") or 0),
            }), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@rider_bp.post("/rider/availability")
def rider_availability():
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 403
    data = request.get_json() or {}
    status = data.get("status")
    if status not in ("online", "offline"):
        return jsonify({"success": False, "message": "Status must be online or offline"}), 400
    if status == "online" and not get_live_location(payload["username"]):
        return jsonify({"success": False, "message": "Enable live location before going online"}), 409
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("rider.sql", "get_rider_status"), (payload["username"],))
            rider = cur.fetchone()
            if not rider or rider.get("location") is None or not rider.get("vehicle"):
                return jsonify({"success": False, "message": "Set your base location and vehicle before going online"}), 409
            cur.execute(load_query("rider.sql", "set_rider_availability"), (status, payload["username"]))
            if not cur.fetchone():
                return jsonify({"success": False, "message": "Rider unavailable, banned, or currently delivering"}), 409
            conn.commit()
            return jsonify({"success": True, "status": status}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@rider_bp.get("/rider/orders/offers")
def rider_order_offers():
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 403
    location = get_live_location(payload["username"])
    if not location:
        return jsonify({"success": False, "message": "Enable live location to view offers"}), 409
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("rider.sql", "get_rider_status"), (payload["username"],))
            rider = cur.fetchone()
            if rider.get("location") is None or not rider.get("vehicle"):
                return jsonify({"success": False, "message": "Set base location and vehicle before accepting orders"}), 409
            cur.execute(load_query("rider.sql", "get_rider_active_order"), (payload["username"],))
            active = cur.fetchone()
            if active:
                return jsonify({"success": True, "active_order": active, "offers": []}), 200
            if not rider or rider.get("status") != "online":
                return jsonify({"success": False, "message": "Rider must be online to view offers"}), 409
            cur.execute(load_query("rider.sql", "get_rider_available_orders"), (payload["username"], location["longitude"], location["latitude"]))
            offers = cur.fetchall() or []
            return jsonify({"success": True, "active_order": None, "offers": offers}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@rider_bp.post("/rider/orders/<order_id>/accept")
def rider_accept_order(order_id):
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 403
    location = get_live_location(payload["username"])
    if not location:
        return jsonify({"success": False, "message": "Enable live location before accepting orders"}), 409
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("rider.sql", "get_rider_status"), (payload["username"],))
            rider = cur.fetchone()
            if not rider or rider.get("status") != "online" or not rider.get("location") or not rider.get("vehicle"):
                return jsonify({"success": False, "message": "Rider is not eligible to accept orders"}), 409
            cur.execute(load_query("rider.sql", "get_rider_available_orders"), (payload["username"], location["longitude"], location["latitude"]))
            eligible = {order["order_id"] for order in cur.fetchall() or []}
            if order_id not in eligible:
                return jsonify({"success": False, "message": "Order is no longer available or outside your service area"}), 409
            latest_location = get_live_location(payload["username"])
            if not latest_location:
                cur.execute(load_query("rider.sql", "set_rider_offline_if_online"), (payload["username"],))
                conn.commit()
                return jsonify({"success": False, "message": "Live location disconnected; you are offline and cannot accept this order"}), 409
            cur.execute(load_query("rider.sql", "claim_online_rider"), (payload["username"],))
            if not cur.fetchone():
                return jsonify({"success": False, "message": "You already have a delivery or are offline"}), 409
            cur.execute(load_query("rider.sql", "accept_rider_order"), (payload["username"], order_id))
            if not cur.fetchone():
                cur.execute(load_query("rider.sql", "release_rider_to_online"), (payload["username"],))
                conn.commit()
                return jsonify({"success": False, "message": "Order was accepted by another rider"}), 409
            conn.commit()
            return jsonify({"success": True, "message": "Order accepted. Collect it from the restaurant."}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@rider_bp.post("/rider/orders/<order_id>/pickup")
def rider_pickup_order(order_id):
    return _advance_rider_order(order_id, "pickup")


@rider_bp.post("/rider/orders/<order_id>/delivered")
def rider_deliver_order(order_id):
    return _advance_rider_order(order_id, "delivered")


def _advance_rider_order(order_id, action):
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 403
    username = payload["username"]
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("rider.sql", "get_rider_active_order"), (username,))
            order = cur.fetchone()
            if not order or order["order_id"] != order_id:
                return jsonify({"success": False, "message": "Active assigned order not found"}), 404
            if action == "pickup":
                cur.execute(load_query("rider.sql", "mark_rider_picked_up"), (order_id, username))
                if not cur.fetchone():
                    return jsonify({"success": False, "message": "Order is not awaiting pickup"}), 409
                conn.commit()
                return jsonify({"success": True, "status": "delivering", "message": "Pickup confirmed"}), 200

            cur.execute(load_query("rider.sql", "settle_rider_delivery"), (order_id, username))
            settlement = cur.fetchone()
            if not settlement:
                return jsonify({"success": False, "message": "Order is not in delivery state or rider is unavailable"}), 409
            conn.commit()
            return jsonify({
                "success": True,
                "status": "delivered",
                "credited": float(settlement["delivery_fee"]),
                "due_amount_added": float(settlement["total_amount"]),
            }), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@rider_bp.get("/rider/history")
def rider_history():
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 403
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("rider.sql", "get_rider_history"), (payload["username"],))
            return jsonify({"success": True, "orders": cur.fetchall() or []}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500