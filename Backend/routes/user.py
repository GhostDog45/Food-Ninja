import uuid
import re
from flask import Blueprint, request, jsonify
from db import get_connection, load_query
import auth
from utils import calculate_order_delivery_time, calculate_delivery_charge
from routes.owner import is_restaurant_open_now

user_bp = Blueprint("user", __name__)


def _get_authenticated_user():
    payload = auth.get_user_info()
    if not payload:
        return None, (jsonify({"success": False, "message": "Authentication required. Please log in."}), 401)
    if payload.get("user_type") != "user":
        return None, (jsonify({"success": False, "message": "Customer authorization required."}), 403)
    return payload, None


def _get_effective_user_location(username, query_lat=None, query_lon=None):
    """
    Returns (longitude, latitude) tuple.
    Handles explicit coordinate overrides or queries user's saved location in Postgres.
    NOTE: Postgres PostGIS ST_MakePoint takes (longitude, latitude).
    """
    if query_lat is not None and query_lon is not None:
        try:
            return float(query_lon), float(query_lat)
        except (ValueError, TypeError):
            pass

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(load_query("user.sql", "get_user_location"), (username,))
            row = cur.fetchone()
            if row and row.get("longitude") is not None and row.get("latitude") is not None:
                return float(row["longitude"]), float(row["latitude"])
    return None, None


# ---------------------------------------------------------------------------
# 1. Food Categories
# ---------------------------------------------------------------------------
@user_bp.route("/user/categories", methods=["GET"])
def get_categories():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(load_query("user.sql", "get_all_food_categories"))
                rows = cur.fetchall()
                categories = [r["category"] for r in rows]
                categories_detail = [{"category": r["category"], "picture_url": r.get("picture_url")} for r in rows]
                return jsonify({"success": True, "categories": categories, "categories_detail": categories_detail}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------------------
# 2. Nearby Restaurants (within 5km)
# ---------------------------------------------------------------------------
@user_bp.route("/user/nearby_restaurants", methods=["GET"])
@user_bp.route("/user/restaurants/nearby", methods=["GET"])
def get_nearby_restaurants():
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    req_lat = request.args.get("latitude")
    req_lon = request.args.get("longitude")

    user_lon, user_lat = _get_effective_user_location(username, req_lat, req_lon)
    if user_lon is None or user_lat is None:
        return jsonify({
            "success": True,
            "restaurants": [],
            "message": "User location not set. Please set your delivery location first."
        }), 200

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                query = load_query("user.sql", "get_nearby_restaurants")
                # ST_MakePoint(user_lon, user_lat) takes (longitude, latitude)
                cur.execute(query, (user_lon, user_lat, user_lon, user_lat))
                rows = cur.fetchall()

                restaurants = []
                for r in rows:
                    dist_m = float(r.get("distance_meters") or 0.0)
                    r_raw_status = (r.get("status") or "closed").strip().lower()
                    if r_raw_status not in ("banned", "shutdown", "pending") and r.get("open_time") and r.get("close_time"):
                        r_status = "open" if is_restaurant_open_now(r.get("open_time"), r.get("close_time")) else "closed"
                    else:
                        r_status = r_raw_status
                    r_lat = float(r["latitude"]) if r.get("latitude") is not None else None
                    r_lon = float(r["longitude"]) if r.get("longitude") is not None else None

                    deliv_time_mins = int(15 + round(dist_m / 200))
                    if r_lat is not None and r_lon is not None and user_lat is not None and user_lon is not None:
                        est = calculate_order_delivery_time(
                            {"latitude": r_lat, "longitude": r_lon},
                            {"latitude": user_lat, "longitude": user_lon},
                            vehicle="bike"
                        )
                        deliv_time_mins = est["estimated_delivery_mins"]
                        dist_m = float(est["distance_meters"])

                    restaurants.append({
                        "restaurant_id": r["restaurant_id"],
                        "name": r["name"],
                        "latitude": r_lat,
                        "longitude": r_lon,
                        "picture_url": r.get("picture_url"),
                        "open_time": str(r["open_time"]) if r.get("open_time") else None,
                        "close_time": str(r["close_time"]) if r.get("close_time") else None,
                        "status": r_status,
                        "distance_meters": dist_m,
                        "distance_km": round(dist_m / 1000.0, 2),
                        "delivery_time_mins": deliv_time_mins,
                        "rating": float(r.get("avg_rating") or 0.0),
                        "review_count": int(r.get("review_count") or 0),
                        "people_ordered_count": int(r.get("people_ordered_count") or 0),
                        "total_orders_count": int(r.get("total_orders_count") or 0)
                    })

                sort_by = (request.args.get("sort") or "distance").strip().lower()
                # Prioritize open restaurants first, followed by closed restaurants
                if sort_by == "rating":
                    restaurants.sort(key=lambda x: (0 if x["status"] == "open" else 1, -x["rating"], -x["review_count"]))
                elif sort_by in ("popularity", "popular"):
                    restaurants.sort(key=lambda x: (0 if x["status"] == "open" else 1, -x["people_ordered_count"], -x["total_orders_count"]))
                elif sort_by in ("delivery_time", "delivery time", "delivery"):
                    restaurants.sort(key=lambda x: (0 if x["status"] == "open" else 1, x["delivery_time_mins"], x["distance_meters"]))
                else:
                    restaurants.sort(key=lambda x: (0 if x["status"] == "open" else 1, x["distance_meters"]))

                return jsonify({
                    "success": True,
                    "restaurants": restaurants,
                    "user_location": {"latitude": user_lat, "longitude": user_lon}
                }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------------------
# 3. Restaurant Details & Food Menu
# ---------------------------------------------------------------------------
@user_bp.route("/user/restaurants/<restaurant_id>", methods=["GET"])
def get_restaurant_detail(restaurant_id):
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    req_lat = request.args.get("latitude")
    req_lon = request.args.get("longitude")

    user_lon, user_lat = _get_effective_user_location(username, req_lat, req_lon)
    # Default to center of Dhaka if not set yet for distance display
    eff_lon = user_lon if user_lon is not None else 90.390298
    eff_lat = user_lat if user_lat is not None else 23.726154

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # 1. Fetch restaurant info
                r_query = load_query("user.sql", "get_restaurant_details")
                cur.execute(r_query, (eff_lon, eff_lat, restaurant_id))
                restaurant = cur.fetchone()

                if not restaurant:
                    # Check if restaurant exists with an unauthorized status (banned/pending)
                    cur.execute("SELECT status FROM restaurant WHERE restaurant_id = %s", (restaurant_id,))
                    chk = cur.fetchone()
                    if chk and chk.get("status") in ("banned", "pending"):
                        return jsonify({
                            "success": False,
                            "message": f"Access restricted. This restaurant is currently {chk.get('status')} and cannot be accessed."
                        }), 403
                    return jsonify({"success": False, "message": "Restaurant not found or does not exist."}), 404

                dist_m = float(restaurant.get("distance_meters") or 0.0)
                is_within_range = dist_m <= 5000.0 if (user_lon is not None and user_lat is not None) else True

                # 2. Fetch food items
                f_query = load_query("user.sql", "get_restaurant_foods")
                cur.execute(f_query, (restaurant_id,))
                food_rows = cur.fetchall()

                foods = []
                for f in food_rows:
                    price = float(f["price"])
                    discount = float(f.get("discount") or 0.0)
                    disc_price = float(f.get("discounted_price") or round(price * (1 - discount / 100.0), 2))
                    foods.append({
                        "food_id": f["food_id"],
                        "restaurant_id": f["restaurant_id"],
                        "category": f["category"],
                        "name": f["name"],
                        "price": price,
                        "discount": discount,
                        "discounted_price": disc_price,
                        "description": f.get("description") or "",
                        "subcategory": f.get("subcategory") or "",
                        "picture_url": f.get("picture_url")
                    })

                restaurant_data = {
                    "restaurant_id": restaurant["restaurant_id"],
                    "name": restaurant["name"],
                    "latitude": float(restaurant["latitude"]) if restaurant.get("latitude") is not None else None,
                    "longitude": float(restaurant["longitude"]) if restaurant.get("longitude") is not None else None,
                    "picture_url": restaurant.get("picture_url"),
                    "open_time": str(restaurant["open_time"]) if restaurant.get("open_time") else None,
                    "close_time": str(restaurant["close_time"]) if restaurant.get("close_time") else None,
                    "status": "open" if (restaurant.get("status") or "").strip().lower() not in ("banned", "shutdown", "pending") and is_restaurant_open_now(restaurant.get("open_time"), restaurant.get("close_time")) else (restaurant.get("status") or "closed").strip().lower(),
                    "distance_meters": dist_m,
                    "distance_km": round(dist_m / 1000.0, 2),
                    "within_5km": is_within_range,
                    "rating": float(restaurant.get("avg_rating") or 0.0),
                    "review_count": int(restaurant.get("review_count") or 0),
                    "people_ordered_count": int(restaurant.get("people_ordered_count") or 0),
                    "total_orders_count": int(restaurant.get("total_orders_count") or 0),
                    "foods": foods
                }

                return jsonify({"success": True, "restaurant": restaurant_data}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------------------
# 4. Search Foods with Realtime Word Tracking & Category Filter
# ---------------------------------------------------------------------------
@user_bp.route("/user/foods/search", methods=["GET"])
def search_foods():
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    q = (request.args.get("q") or "").strip()
    category = (request.args.get("category") or "").strip()

    req_lat = request.args.get("latitude")
    req_lon = request.args.get("longitude")
    user_lon, user_lat = _get_effective_user_location(username, req_lat, req_lon)

    if user_lon is None or user_lat is None:
        return jsonify({
            "success": True,
            "results": [],
            "message": "User location not set"
        }), 200

    like_pattern = f"%{q}%" if q else None
    cat_param = category if category else None

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                query = load_query("user.sql", "search_foods_within_range")
                cur.execute(
                    query,
                    (
                        user_lon, user_lat,
                        user_lon, user_lat,
                        cat_param, cat_param,
                        like_pattern, like_pattern, like_pattern, like_pattern
                    )
                )
                rows = cur.fetchall()

                results = []
                for r in rows:
                    dist_m = float(r.get("distance_meters") or 0.0)
                    price = float(r["price"])
                    discount = float(r.get("discount") or 0.0)
                    disc_price = float(r.get("discounted_price") or round(price * (1 - discount / 100.0), 2))
                    results.append({
                        "food_id": r["food_id"],
                        "food_name": r["food_name"],
                        "category": r["category"],
                        "price": price,
                        "discount": discount,
                        "discounted_price": disc_price,
                        "description": r.get("description") or "",
                        "subcategory": r.get("subcategory") or "",
                        "picture_url": r.get("picture_url"),
                        "restaurant_id": r["restaurant_id"],
                        "restaurant_name": r["restaurant_name"],
                        "restaurant_status": r.get("restaurant_status") or "open",
                        "restaurant_picture_url": r.get("restaurant_picture_url"),
                        "distance_meters": dist_m,
                        "distance_km": round(dist_m / 1000.0, 2),
                        "restaurant_rating": float(r.get("avg_rating") or 0.0),
                        "people_ordered_count": int(r.get("people_ordered_count") or 0)
                    })

                return jsonify({"success": True, "results": results, "count": len(results)}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------------------
# 5. Food Detail
# ---------------------------------------------------------------------------
@user_bp.route("/user/foods/<food_id>", methods=["GET"])
def get_food_detail(food_id):
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    user_lon, user_lat = _get_effective_user_location(username)
    eff_lon = user_lon if user_lon is not None else 90.390298
    eff_lat = user_lat if user_lat is not None else 23.726154

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                query = load_query("user.sql", "get_food_detail_with_restaurant")
                cur.execute(query, (eff_lon, eff_lat, food_id))
                f = cur.fetchone()

                if not f:
                    return jsonify({"success": False, "message": "Food not found"}), 404

                dist_m = float(f.get("distance_meters") or 0.0)
                price = float(f["price"])
                discount = float(f.get("discount") or 0.0)
                disc_price = float(f.get("discounted_price") or round(price * (1 - discount / 100.0), 2))

                return jsonify({
                    "success": True,
                    "food": {
                        "food_id": f["food_id"],
                        "food_name": f["food_name"],
                        "category": f["category"],
                        "price": price,
                        "discount": discount,
                        "discounted_price": disc_price,
                        "description": f.get("description") or "",
                        "subcategory": f.get("subcategory") or "",
                        "restaurant_id": f["restaurant_id"],
                        "restaurant_name": f["restaurant_name"],
                        "restaurant_status": f.get("restaurant_status") or "open",
                        "distance_meters": dist_m,
                        "distance_km": round(dist_m / 1000.0, 2),
                        "within_5km": dist_m <= 5000.0 if (user_lon is not None and user_lat is not None) else True
                    }
                }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------------------
# 6. Cart Management (Add, View, Update, Remove, Delete Cart)
# ---------------------------------------------------------------------------
@user_bp.route("/user/cart", methods=["GET"])
def get_cart():
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Check active pending cart
                cur.execute(load_query("user.sql", "get_user_active_cart"), (username,))
                cart_row = cur.fetchone()

                if not cart_row:
                    return jsonify({
                        "success": True,
                        "has_cart": False,
                        "cart": None,
                        "items": [],
                        "subtotal": 0.0,
                        "delivery_fee": 0.0,
                        "total": 0.0
                    }), 200

                cart_id = cart_row["cart_id"]
                cur.execute(load_query("user.sql", "get_cart_items"), (cart_id,))
                item_rows = cur.fetchall()

                items = []
                subtotal = 0.0
                for it in item_rows:
                    unit_p = float(it["unit_price"])
                    qty = int(it["quantity"])
                    item_t = float(it["item_total"])
                    subtotal += item_t
                    items.append({
                        "food_id": it["food_id"],
                        "name": it["name"],
                        "category": it["category"],
                        "price": float(it["price"]),
                        "discount": float(it.get("discount") or 0.0),
                        "unit_price": unit_p,
                        "quantity": qty,
                        "item_total": item_t
                    })

                delivery_fee = 50.0 if len(items) > 0 else 0.0
                total = round(subtotal + delivery_fee, 2)

                return jsonify({
                    "success": True,
                    "has_cart": True,
                    "cart": {
                        "cart_id": cart_id,
                        "restaurant_id": cart_row["restaurant_id"],
                        "restaurant_name": cart_row["restaurant_name"],
                        "restaurant_status": (cart_row.get("restaurant_status") or "open").strip().lower(),
                        "status": cart_row["status"],
                        "items": items,
                        "subtotal": round(subtotal, 2),
                        "delivery_fee": delivery_fee,
                        "total": total
                    }
                }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@user_bp.route("/user/cart/items", methods=["POST"])
def add_to_cart():
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    data = request.get_json() or {}
    food_id = data.get("food_id")
    quantity = int(data.get("quantity", 1))
    replace_cart = bool(data.get("replace", False))

    if not food_id or quantity <= 0:
        return jsonify({"success": False, "message": "Invalid food or quantity"}), 400

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # 1. Look up food and its restaurant
                cur.execute(load_query("user.sql", "get_food_restaurant_id"), (food_id,))
                food = cur.fetchone()
                if not food:
                    return jsonify({"success": False, "message": "Food item not found"}), 404

                food_restaurant_id = food["restaurant_id"]

                # 2. Verify restaurant is open
                cur.execute("SELECT status, name FROM restaurant WHERE restaurant_id = %s", (food_restaurant_id,))
                r_row = cur.fetchone()
                if r_row and (r_row.get("status") or "").strip().lower() == "closed":
                    return jsonify({
                        "success": False,
                        "message": f"'{r_row['name']}' is currently closed off and not accepting orders."
                    }), 400

                # 3. Check user's current pending cart
                cur.execute(load_query("user.sql", "get_user_active_cart"), (username,))
                active_cart = cur.fetchone()

                if active_cart:
                    if active_cart["restaurant_id"] != food_restaurant_id:
                        if replace_cart:
                            # User agreed to start a new cart from this restaurant
                            cur.execute(load_query("user.sql", "delete_user_cart"), (username,))
                            new_cart_id = f"CART-{uuid.uuid4().hex[:12].upper()}"
                            cur.execute(load_query("user.sql", "create_cart"), (new_cart_id, username, food_restaurant_id))
                            cart_id = new_cart_id
                        else:
                            return jsonify({
                                "success": False,
                                "conflict": True,
                                "existing_restaurant": active_cart["restaurant_name"],
                                "message": f"Your cart currently contains items from '{active_cart['restaurant_name']}'. Would you like to clear your cart and start a fresh order from this restaurant?"
                            }), 409
                    else:
                        cart_id = active_cart["cart_id"]
                else:
                    new_cart_id = f"CART-{uuid.uuid4().hex[:12].upper()}"
                    cur.execute(load_query("user.sql", "create_cart"), (new_cart_id, username, food_restaurant_id))
                    cart_id = new_cart_id

                # 3. Add or update item quantity
                cur.execute(load_query("user.sql", "add_or_update_cart_item"), (cart_id, food_id, quantity))
                conn.commit()

                return jsonify({
                    "success": True,
                    "message": f"Added {food['name']} to cart",
                    "cart_id": cart_id
                }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@user_bp.route("/user/cart/items", methods=["PATCH"])
def update_cart_item_quantity():
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    data = request.get_json() or {}
    food_id = data.get("food_id")
    quantity = int(data.get("quantity", 0))

    if not food_id:
        return jsonify({"success": False, "message": "food_id is required"}), 400

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(load_query("user.sql", "get_user_active_cart"), (username,))
                active_cart = cur.fetchone()
                if not active_cart:
                    return jsonify({"success": False, "message": "No active cart found"}), 404

                cart_id = active_cart["cart_id"]

                if quantity <= 0:
                    cur.execute(load_query("user.sql", "remove_cart_item"), (cart_id, food_id))
                else:
                    cur.execute(load_query("user.sql", "set_cart_item_quantity"), (quantity, cart_id, food_id))

                conn.commit()
                return jsonify({"success": True, "message": "Cart item updated"}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@user_bp.route("/user/cart/items/<food_id>", methods=["DELETE"])
def remove_cart_item(food_id):
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(load_query("user.sql", "get_user_active_cart"), (username,))
                active_cart = cur.fetchone()
                if not active_cart:
                    return jsonify({"success": False, "message": "No active cart found"}), 404

                cur.execute(load_query("user.sql", "remove_cart_item"), (active_cart["cart_id"], food_id))
                conn.commit()
                return jsonify({"success": True, "message": "Item removed from cart"}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# Requirement 5: "can delete the cart anytime he wants"
@user_bp.route("/user/cart", methods=["DELETE"])
def delete_cart():
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(load_query("user.sql", "delete_user_cart"), (username,))
                conn.commit()
                return jsonify({"success": True, "message": "Cart cleared successfully"}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------------------
# 7. Checkout & Place Order
# Requirement 6: "he can order his current cart"
# Requirement 7: "if order is placed, it will show delivering for the user"
# Requirement 9: "payment system will only be 'cash on delivery' no other payment system will be available"
# ---------------------------------------------------------------------------
@user_bp.route("/user/cart/checkout", methods=["POST"])
def checkout_cart():
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    data = request.get_json() or {}

    payment_method = data.get("payment_method", "Cash on delivery")
    # Strictly enforce Cash on delivery as required by Requirement 9
    if payment_method.strip().lower() != "cash on delivery":
        return jsonify({
            "success": False,
            "message": "Only 'Cash on delivery' payment method is supported."
        }), 400

    req_lat = data.get("latitude")
    req_lon = data.get("longitude")
    user_lon, user_lat = _get_effective_user_location(username, req_lat, req_lon)

    if user_lon is None or user_lat is None:
        # Default fallback to central Dhaka if coordinates are missing
        user_lon, user_lat = 90.390298, 23.726154

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # 1. Verify active pending cart
                cur.execute(load_query("user.sql", "get_user_active_cart"), (username,))
                active_cart = cur.fetchone()
                if not active_cart:
                    return jsonify({"success": False, "message": "No active cart to checkout"}), 400

                cart_id = active_cart["cart_id"]

                # Final stage server-side re-verification: Check restaurant operating status
                cur.execute("SELECT status, name FROM restaurant WHERE restaurant_id = %s", (active_cart["restaurant_id"],))
                r_status_row = cur.fetchone()
                if not r_status_row:
                    return jsonify({
                        "success": False,
                        "message": "Restaurant no longer exists or is unavailable."
                    }), 404

                curr_status = (r_status_row.get("status") or "closed").strip().lower()
                if curr_status != "open":
                    return jsonify({
                        "success": False,
                        "message": f"'{active_cart['restaurant_name']}' has closed since you added items to your cart. Orders cannot be processed while the restaurant is {curr_status}."
                    }), 400

                # 2. Get items and calculate bill
                cur.execute(load_query("user.sql", "get_cart_items"), (cart_id,))
                items = cur.fetchall()
                if not items:
                    return jsonify({"success": False, "message": "Cart is empty"}), 400

                rest_lat = float(active_cart.get("restaurant_latitude") or 23.726154)
                rest_lon = float(active_cart.get("restaurant_longitude") or 90.390298)
                delivery_est = calculate_order_delivery_time(
                    {"latitude": rest_lat, "longitude": rest_lon},
                    {"latitude": user_lat, "longitude": user_lon},
                    vehicle="bike"
                )
                delivery_fee = calculate_delivery_charge(
                    delivery_est["distance_km"],
                    delivery_est["estimated_delivery_mins"]
                )
                body = request.get_json(silent=True) or {}
                food_prep = (body.get("food_preparing_notes") or "").strip()
                deliv_note = (body.get("delivery_notes") or "").strip()

                # Create order (rider_username is NULL until a rider accepts).
                order_id = f"OD-{uuid.uuid4().hex[:8].upper()}"
                cur.execute(
                    load_query("user.sql", "create_order"),
                    (order_id, username, cart_id, None, user_lon, user_lat, delivery_fee, food_prep, deliv_note)
                )
                cur.execute(load_query("user.sql", "get_created_order_bill"), (order_id,))
                bill_str = cur.fetchone()["bill"]

                # 5. Create payment record with 'Cash on delivery'
                tx_id = f"COD-{uuid.uuid4().hex[:10].upper()}"
                cur.execute(
                    load_query("user.sql", "create_payment"),
                    (order_id, username, tx_id)
                )

                # 6. Mark cart as ordered
                cur.execute(load_query("user.sql", "update_cart_status_ordered"), (cart_id,))

                conn.commit()

                return jsonify({
                    "success": True,
                    "message": "Order placed successfully! The restaurant will confirm your order.",
                    "order_id": order_id,
                    "status": "pending",
                    "bill": bill_str,
                    "payment_method": "Cash on delivery",
                    "restaurant_name": active_cart["restaurant_name"],
                    "delivery_estimate": delivery_est,
                    "rider": None
                }), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


def _extract_sum_total(bill_text):
    if not bill_text:
        return "৳0.00"
    for line in str(bill_text).splitlines():
        if "Sum total" in line or "Sum Total" in line:
            parts = line.split("=")
            if len(parts) > 1:
                val = parts[1].strip()
                return f"৳{val}" if not val.startswith("৳") else val
    val = str(bill_text).strip()
    return f"৳{val}" if not val.startswith("৳") else val


# ---------------------------------------------------------------------------
# 8. User Order History & Tracking
# ---------------------------------------------------------------------------
@user_bp.route("/user/orders", methods=["GET"])
def get_orders():
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(load_query("user.sql", "get_user_orders"), (username,))
                rows = cur.fetchall()

                orders = []
                seen_order_ids = set()
                for o in rows:
                    oid = o.get("order_id")
                    if oid in seen_order_ids:
                        continue
                    seen_order_ids.add(oid)
                    o_rest_lat = float(o["restaurant_latitude"]) if o.get("restaurant_latitude") is not None else 23.726154
                    o_rest_lon = float(o["restaurant_longitude"]) if o.get("restaurant_longitude") is not None else 90.390298
                    o_user_lat = float(o["latitude"]) if o.get("latitude") is not None else 23.726154
                    o_user_lon = float(o["longitude"]) if o.get("longitude") is not None else 90.390298
                    o_vehicle = o.get("rider_vehicle") or "bike"

                    o_deliv_est = calculate_order_delivery_time(
                        {"latitude": o_rest_lat, "longitude": o_rest_lon},
                        {"latitude": o_user_lat, "longitude": o_user_lon},
                        vehicle=o_vehicle
                    )

                    clean_bill = o["bill"]
                    if "Desc:" in clean_bill:
                        clean_bill = re.sub(r"\n\s*Desc:[^\n]*", "", clean_bill)

                    orders.append({
                        "order_id": o["order_id"],
                        "status": o["status"],
                        "bill": clean_bill,
                        "total_amount": _extract_sum_total(clean_bill),
                        "order_timestamp": o.get("order_timestamp"),
                        "final_timestamp": o.get("final_timestamp"),
                        "payment_method": o.get("payment_method"),
                        "payment_status": o.get("payment_status"),
                        "transaction_id": o.get("transaction_id"),
                        "restaurant_id": o["restaurant_id"],
                        "restaurant_name": o["restaurant_name"],
                        "latitude": float(o["latitude"]) if o.get("latitude") is not None else None,
                        "longitude": float(o["longitude"]) if o.get("longitude") is not None else None,
                        "distance_meters": float(o.get("distance_meters") or 0.0),
                        "distance_km": round(float(o.get("distance_meters") or 0.0) / 1000.0, 2) if o.get("distance_meters") else o_deliv_est["distance_km"],
                        "rider_name": o.get("rider_name"),
                        "rider_phone": o.get("rider_phone"),
                        "rider_vehicle": o.get("rider_vehicle"),
                        "rider_username": o.get("rider_username"),
                        "delivery_estimate": o_deliv_est,
                        "review": {
                            "rider_rating": int(o["rider_rating"]) if o.get("rider_rating") is not None else None,
                            "rider_review": o.get("rider_review"),
                            "restaurant_rating": int(o["restaurant_rating"]) if o.get("restaurant_rating") is not None else None,
                            "restaurant_review": o.get("restaurant_review"),
                            "timestamp": o.get("review_timestamp")
                        } if o.get("restaurant_rating") is not None or o.get("rider_rating") is not None else None
                    })

                return jsonify({"success": True, "orders": orders}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@user_bp.route("/user/orders/<order_id>", methods=["GET"])
def get_order_detail(order_id):
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    clean_id = (order_id or "").strip()

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # If requested as "active", resolve to latest pending/delivering order
                if clean_id.lower() == "active":
                    cur.execute(
                        """
                        SELECT order_id FROM orders 
                        WHERE LOWER(username) = LOWER(%s) AND status IN ('pending', 'delivering')
                        ORDER BY order_timestamp DESC LIMIT 1
                        """,
                        (username,)
                    )
                    active_row = cur.fetchone()
                    if not active_row:
                        return jsonify({"success": False, "message": "No active delivery in progress"}), 404
                    clean_id = active_row["order_id"]

                cur.execute(load_query("user.sql", "get_order_detail"), (clean_id, clean_id, username))
                o = cur.fetchone()

                if not o:
                    return jsonify({"success": False, "message": "Order not found"}), 404

                cur.execute(load_query("user.sql", "get_order_items"), (o["cart_id"],))
                item_rows = cur.fetchall()

                items = []
                for it in item_rows:
                    items.append({
                        "food_id": it["food_id"],
                        "name": it["name"],
                        "price": float(it["price"]),
                        "discount": float(it.get("discount") or 0.0),
                        "unit_price": float(it["unit_price"]),
                        "quantity": int(it["quantity"]),
                        "item_total": float(it["item_total"])
                    })

                rest_lat = float(o["restaurant_latitude"]) if o.get("restaurant_latitude") is not None else 23.726154
                rest_lon = float(o["restaurant_longitude"]) if o.get("restaurant_longitude") is not None else 90.390298
                user_lat = float(o["latitude"]) if o.get("latitude") is not None else 23.726154
                user_lon = float(o["longitude"]) if o.get("longitude") is not None else 90.390298
                rider_v = o.get("rider_vehicle") or "bike"

                deliv_est = calculate_order_delivery_time(
                    {"latitude": rest_lat, "longitude": rest_lon},
                    {"latitude": user_lat, "longitude": user_lon},
                    vehicle=rider_v
                )

                bill_text = o.get("bill") or ""
                if not bill_text or not bill_text.startswith("Order id:"):
                    cur.execute("SELECT refresh_order_bill(%s) AS bill", (o["order_id"],))
                    refreshed_bill = cur.fetchone()
                    bill_text = refreshed_bill["bill"] if refreshed_bill else ""

                if "Desc:" in bill_text:
                    bill_text = re.sub(r"\n\s*Desc:[^\n]*", "", bill_text)

                return jsonify({
                    "success": True,
                    "order": {
                        "order_id": o["order_id"],
                        "status": o["status"],
                        "bill": bill_text,
                        "total_amount": _extract_sum_total(bill_text),
                        "order_timestamp": o.get("order_timestamp"),
                        "final_timestamp": o.get("final_timestamp"),
                        "payment_method": o.get("payment_method"),
                        "payment_status": o.get("payment_status"),
                        "transaction_id": o.get("transaction_id"),
                        "restaurant_id": o["restaurant_id"],
                        "restaurant_name": o["restaurant_name"],
                        "latitude": float(o["latitude"]) if o.get("latitude") is not None else None,
                        "longitude": float(o["longitude"]) if o.get("longitude") is not None else None,
                        "distance_meters": float(o.get("distance_meters") or 0.0),
                        "distance_km": round(float(o.get("distance_meters") or 0.0) / 1000.0, 2) if o.get("distance_meters") else deliv_est["distance_km"],
                        "rider_name": o.get("rider_name"),
                        "rider_phone": o.get("rider_phone"),
                        "rider_vehicle": o.get("rider_vehicle"),
                        "rider_username": o.get("rider_username"),
                        "delivery_estimate": deliv_est,
                        "review": {
                            "rider_rating": int(o["rider_rating"]) if o.get("rider_rating") is not None else None,
                            "rider_review": o.get("rider_review"),
                            "restaurant_rating": int(o["restaurant_rating"]) if o.get("restaurant_rating") is not None else None,
                            "restaurant_review": o.get("restaurant_review"),
                            "timestamp": o.get("review_timestamp")
                        } if o.get("restaurant_rating") is not None or o.get("rider_rating") is not None else None,
                        "items": items
                    }
                }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@user_bp.route("/user/orders/<order_id>/rider_location", methods=["GET"])
def get_order_rider_live_location(order_id):
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    clean_id = (order_id or "").strip()

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
                (clean_id, clean_id, username)
            )
            order_row = cur.fetchone()

            if not order_row:
                return jsonify({"success": False, "message": "Order not found"}), 404

            # Access restriction: Customer can ONLY see the live location while order is in 'delivering' status
            if order_row["status"] != "delivering":
                return jsonify({
                    "success": False,
                    "active": False,
                    "status": order_row["status"],
                    "message": "Live rider location is only accessible when the order is actively delivering."
                }), 403

            rider_username = order_row.get("rider_username")
            if not rider_username:
                return jsonify({
                    "success": False,
                    "active": False,
                    "status": "delivering",
                    "message": "Rider has not yet been assigned."
                }), 200

            from routes.rider import get_live_location
            loc = get_live_location(rider_username)

            return jsonify({
                "success": True,
                "active": True,
                "status": "delivering",
                "order_id": order_row["order_id"],
                "rider": {
                    "username": rider_username,
                    "name": order_row.get("rider_name"),
                    "phone": order_row.get("rider_phone"),
                    "vehicle": order_row.get("rider_vehicle") or "bike",
                    "latitude": loc["latitude"] if loc else None,
                    "longitude": loc["longitude"] if loc else None,
                    "updated_at": loc.get("updated_at") if loc else None
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
            }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@user_bp.route("/user/orders/<order_id>/complete", methods=["POST"])
def complete_order(order_id):
    payload, err = _get_authenticated_user()
    if err:
        return err

    return jsonify({"success": False, "message": "Only the assigned rider can complete a delivery"}), 403


@user_bp.route("/user/orders/<order_id>/pickup", methods=["POST"])
def confirm_pickup_order(order_id):
    payload, err = _get_authenticated_user()
    if err:
        return err

    return jsonify({"success": False, "message": "Pickup must be confirmed by the assigned rider"}), 403



@user_bp.route("/user/orders/<order_id>/review", methods=["POST"])
def submit_order_review(order_id):
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    body = request.get_json(silent=True) or {}

    raw_restaurant_rating = body.get("restaurant_rating")
    restaurant_review = body.get("restaurant_review")
    raw_rider_rating = body.get("rider_rating")
    rider_review = body.get("rider_review")

    # Validate restaurant_rating (1-5)
    if raw_restaurant_rating is None:
        return jsonify({"success": False, "message": "Restaurant rating is required"}), 400
    try:
        restaurant_rating = int(raw_restaurant_rating)
        if not (1 <= restaurant_rating <= 5):
            return jsonify({"success": False, "message": "Restaurant rating must be between 1 and 5"}), 400
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid restaurant rating"}), 400

    # Validate rider_rating (1-5) if provided
    rider_rating = None
    if raw_rider_rating is not None and str(raw_rider_rating).strip() != "":
        try:
            rider_rating = int(raw_rider_rating)
            if not (1 <= rider_rating <= 5):
                return jsonify({"success": False, "message": "Rider rating must be between 1 and 5"}), 400
        except (ValueError, TypeError):
            return jsonify({"success": False, "message": "Invalid rider rating"}), 400

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT order_id, status FROM orders WHERE order_id = %s AND username = %s", (order_id, username))
                order_row = cur.fetchone()
                if not order_row:
                    return jsonify({"success": False, "message": "Order not found"}), 404

                cur.execute(
                    load_query("user.sql", "submit_order_review"),
                    (
                        order_id,
                        rider_rating,
                        rider_review.strip() if rider_review else None,
                        restaurant_rating,
                        restaurant_review.strip() if restaurant_review else None,
                    )
                )
                conn.commit()

                return jsonify({
                    "success": True,
                    "message": "Review submitted successfully!",
                    "review": {
                        "order_id": order_id,
                        "rider_rating": rider_rating,
                        "rider_review": rider_review,
                        "restaurant_rating": restaurant_rating,
                        "restaurant_review": restaurant_review
                    }
                }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@user_bp.route("/user/orders/<order_id>/cancel", methods=["POST"])
def user_cancel_order(order_id):
    payload, err = _get_authenticated_user()
    if err:
        return err

    username = payload.get("username")
    clean_id = (order_id or "").strip()

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("user.sql", "cancel_user_order"), (clean_id, username))
            cancelled = cur.fetchone()
            if not cancelled:
                cur.execute(
                    "SELECT status FROM orders WHERE LOWER(order_id) = LOWER(%s) AND LOWER(username) = LOWER(%s)",
                    (clean_id, username)
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"success": False, "message": "Order not found under your account"}), 404
                return jsonify({"success": False, "message": f"Order is already {row.get('status')} and cannot be cancelled"}), 409

            conn.commit()
            return jsonify({"success": True, "message": "Order cancelled successfully"}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

