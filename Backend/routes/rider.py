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

# Active customer WebSocket listeners: { rider_username: { order_id: ws } }
rider_listeners = {}
listeners_lock = threading.Lock()


def register_customer_listener(rider_username, order_id, ws):
    with listeners_lock:
        if rider_username not in rider_listeners:
            rider_listeners[rider_username] = {}
        rider_listeners[rider_username][order_id] = ws


def unregister_customer_listener(rider_username, order_id):
    with listeners_lock:
        if rider_username in rider_listeners:
            rider_listeners[rider_username].pop(order_id, None)
            if not rider_listeners[rider_username]:
                rider_listeners.pop(rider_username, None)


def notify_customer_listeners(rider_username, lat, lon):
    with listeners_lock:
        targets = list(rider_listeners.get(rider_username, {}).items())

    dead_orders = []
    payload = json.dumps({
        "type": "location_update",
        "latitude": lat,
        "longitude": lon,
        "updated_at": time.time()
    })
    for ord_id, client_ws in targets:
        try:
            client_ws.send(payload)
        except Exception:
            dead_orders.append(ord_id)

    if dead_orders:
        with listeners_lock:
            if rider_username in rider_listeners:
                for ord_id in dead_orders:
                    rider_listeners[rider_username].pop(ord_id, None)


def get_live_location(username):
    with live_lock:
        location = live_locations.get(username)
        if location and time.time() - location["updated_at"] <= LOCATION_TTL_SECONDS:
            return location
        live_locations.pop(username, None)

    # Database fallback if rider has a saved location in DB
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("rider.sql", "get_rider_location"), (username,))
            row = cur.fetchone()
            if row and row.get("latitude") is not None and row.get("longitude") is not None:
                return {
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "updated_at": time.time(),
                    "source": "db"
                }
    except Exception:
        pass
    return None


def register_websocket_routes(app):
    sock.init_app(app)

    @sock.route("/rider/location/live")
    def rider_live_location(ws):
        try:
            auth_message = json.loads(ws.receive(timeout=10) or "{}")
        except Exception:
            try:
                ws.close(4401, "WebSocket authentication required")
            except Exception:
                pass
            return
        token = auth_message.get("token", "")
        payload = auth.verify_token(token)
        if not payload or payload.get("user_type") != "rider":
            try:
                ws.close(4403, "Rider authorization required")
            except Exception:
                pass
            return
        username = payload.get("username")
        try:
            with get_connection() as conn, conn.cursor() as cur:
                cur.execute(load_query("rider.sql", "get_rider_status"), (username,))
                rider = cur.fetchone()
                if not rider or rider.get("location") is None or not rider.get("vehicle") or rider.get("status") == "banned":
                    try:
                        ws.close(4403, "Rider base location and vehicle are required")
                    except Exception:
                        pass
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
                # Instantly notify any active customers currently tracking this delivering rider
                notify_customer_listeners(username, latitude, longitude)
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

    @sock.route("/orders/<order_id>/live_location")
    def order_customer_live_location(ws, order_id):
        """
        Customer WebSocket route to receive real-time rider location updates.
        Strictly restricted: Customer can ONLY access this while order is in 'delivering' status.
        Once the order is delivered or cancelled, access is immediately revoked.
        """
        try:
            auth_message = json.loads(ws.receive(timeout=10) or "{}")
        except Exception:
            try:
                ws.close(4401, "WebSocket authentication required")
            except Exception:
                pass
            return

        token = auth_message.get("token", "")
        payload = auth.verify_token(token)
        if not payload or payload.get("user_type") != "user":
            try:
                ws.close(4403, "Customer authorization required")
            except Exception:
                pass
            return

        username = payload.get("username")
        clean_order_id = (order_id or "").strip()

        try:
            with get_connection() as conn, conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT O.order_id, O.status, O.rider_username,
                           ST_Y(O.location::geometry) AS customer_latitude,
                           ST_X(O.location::geometry) AS customer_longitude,
                           R.name AS restaurant_name,
                           ST_Y(R.location::geometry) AS restaurant_latitude,
                           ST_X(R.location::geometry) AS restaurant_longitude,
                           RD.name AS rider_name, RD.phone AS rider_phone, RD.vehicle AS rider_vehicle
                    FROM orders O
                    JOIN cart C ON C.cart_id = O.cart_id
                    JOIN restaurant R ON R.restaurant_id = C.restaurant_id
                    LEFT JOIN rider RD ON RD.username = O.rider_username
                    WHERE (O.order_id = %s OR LOWER(O.order_id) = LOWER(%s)) AND LOWER(O.username) = LOWER(%s)
                    """,
                    (clean_order_id, clean_order_id, username)
                )
                order_row = cur.fetchone()

            if not order_row:
                try:
                    ws.send(json.dumps({"type": "error", "message": "Order not found"}))
                    ws.close(4404, "Order not found")
                except Exception:
                    pass
                return

            # Access Control Check: Only allow when order status is 'delivering'
            if order_row["status"] != "delivering":
                try:
                    ws.send(json.dumps({
                        "type": "status_denied",
                        "active": False,
                        "status": order_row["status"],
                        "message": "Live rider tracking is only accessible when the order is actively delivering."
                    }))
                    ws.close(4403, "Access restricted to delivering status")
                except Exception:
                    pass
                return

            rider_username = order_row.get("rider_username")
            if not rider_username:
                try:
                    ws.send(json.dumps({
                        "type": "waiting_rider",
                        "active": False,
                        "status": "delivering",
                        "message": "Waiting for rider assignment"
                    }))
                    ws.close(4404, "No rider assigned")
                except Exception:
                    pass
                return

            init_fix = get_live_location(rider_username)
            try:
                ws.send(json.dumps({
                    "type": "init",
                    "active": True,
                    "status": "delivering",
                    "order_id": order_row["order_id"],
                    "rider": {
                        "username": rider_username,
                        "name": order_row.get("rider_name"),
                        "phone": order_row.get("rider_phone"),
                        "vehicle": order_row.get("rider_vehicle") or "bike",
                        "latitude": init_fix["latitude"] if init_fix else None,
                        "longitude": init_fix["longitude"] if init_fix else None,
                        "updated_at": init_fix.get("updated_at") if init_fix else None
                    },
                    "customer_location": {
                        "latitude": float(order_row["customer_latitude"]) if order_row.get("customer_latitude") is not None else None,
                        "longitude": float(order_row["customer_longitude"]) if order_row.get("customer_longitude") is not None else None
                    },
                    "restaurant_location": {
                        "name": order_row.get("restaurant_name"),
                        "latitude": float(order_row["restaurant_latitude"]) if order_row.get("restaurant_latitude") is not None else None,
                        "longitude": float(order_row["restaurant_longitude"]) if order_row.get("restaurant_longitude") is not None else None
                    }
                }))
            except Exception:
                return

            register_customer_listener(rider_username, order_row["order_id"], ws)

            try:
                while getattr(ws, 'connected', True):
                    # Check every 3 seconds for messages, heartbeats, and order status transitions
                    try:
                        _ = ws.receive(timeout=3)
                    except Exception:
                        break

                    # Check order status in DB: if status transitioned to delivered or cancelled, remove access immediately!
                    try:
                        with get_connection() as conn, conn.cursor() as cur:
                            cur.execute("SELECT status FROM orders WHERE order_id = %s", (order_row["order_id"],))
                            st_row = cur.fetchone()
                            cur_status = st_row["status"] if st_row else "unknown"
                    except Exception:
                        cur_status = "delivering"

                    if cur_status != "delivering":
                        try:
                            ws.send(json.dumps({
                                "type": "status_change",
                                "active": False,
                                "status": cur_status,
                                "message": f"Order status changed to '{cur_status}'. Live tracking access ended."
                            }))
                            ws.close(1000, "Delivery completed or terminated")
                        except Exception:
                            pass
                        break

                    # Send periodic heartbeat with latest coordinates
                    current_fix = get_live_location(rider_username)
                    if current_fix and current_fix.get("latitude") is not None:
                        try:
                            ws.send(json.dumps({
                                "type": "location_update",
                                "latitude": current_fix["latitude"],
                                "longitude": current_fix["longitude"],
                                "updated_at": current_fix.get("updated_at")
                            }))
                        except Exception:
                            break
            finally:
                unregister_customer_listener(rider_username, order_row["order_id"])
        except Exception:
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


@rider_bp.route("/rider/me/vehicle", methods=["PATCH", "POST"])
def update_rider_vehicle():
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 401

    username = payload["username"]
    data = request.get_json(silent=True) or {}
    vehicle = (data.get("vehicle") or "").strip().lower()

    if vehicle not in ("bike", "bicycle"):
        return jsonify({
            "success": False,
            "message": "Invalid vehicle type. Allowed types: 'bike' (motorcycle) or 'bicycle'"
        }), 400

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("rider.sql", "update_rider_vehicle"), (vehicle, username))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "message": "Rider not found"}), 404
            conn.commit()

        return jsonify({
            "success": True,
            "message": f"Vehicle updated to {'Motorcycle' if vehicle == 'bike' else 'Bicycle'} successfully!",
            "vehicle": vehicle
        }), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Database error"}), 500


@rider_bp.route("/rider/me/location", methods=["PATCH", "POST"])
def update_rider_location_endpoint():
    payload = auth.get_user_info()
    if not payload or payload.get("user_type") != "rider":
        return jsonify({"success": False, "message": "Rider authorization required"}), 401

    username = payload["username"]
    data = request.get_json(silent=True) or {}
    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if latitude is None or longitude is None:
        return jsonify({"success": False, "message": "Latitude and longitude are required"}), 400

    res = utils.updateLocation("rider", username, longitude, latitude)
    if res == "success":
        return jsonify({"success": True, "message": "Base static location updated successfully"}), 200
    return jsonify({"success": False, "message": "Location update failed"}), 500