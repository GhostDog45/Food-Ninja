import uuid
from flask import Blueprint, request, jsonify
from db import get_connection, load_query
import auth

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
                return jsonify({"success": True, "categories": categories}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------------------
# 2. Nearby Restaurants (within 5km)
# ---------------------------------------------------------------------------
@user_bp.route("/user/nearby_restaurants", methods=["GET"])
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
                    restaurants.append({
                        "restaurant_id": r["restaurant_id"],
                        "name": r["name"],
                        "latitude": float(r["latitude"]) if r.get("latitude") is not None else None,
                        "longitude": float(r["longitude"]) if r.get("longitude") is not None else None,
                        "open_time": str(r["open_time"]) if r.get("open_time") else None,
                        "close_time": str(r["close_time"]) if r.get("close_time") else None,
                        "status": r.get("status") or "open",
                        "distance_meters": dist_m,
                        "distance_km": round(dist_m / 1000.0, 2),
                        "rating": float(r.get("avg_rating") or 0.0),
                        "review_count": int(r.get("review_count") or 0),
                        "people_ordered_count": int(r.get("people_ordered_count") or 0),
                        "total_orders_count": int(r.get("total_orders_count") or 0)
                    })

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
                    return jsonify({"success": False, "message": "Restaurant not found"}), 404

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
                        "subcategory": f.get("subcategory") or ""
                    })

                restaurant_data = {
                    "restaurant_id": restaurant["restaurant_id"],
                    "name": restaurant["name"],
                    "latitude": float(restaurant["latitude"]) if restaurant.get("latitude") is not None else None,
                    "longitude": float(restaurant["longitude"]) if restaurant.get("longitude") is not None else None,
                    "open_time": str(restaurant["open_time"]) if restaurant.get("open_time") else None,
                    "close_time": str(restaurant["close_time"]) if restaurant.get("close_time") else None,
                    "status": restaurant.get("status") or "open",
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
                        like_pattern, like_pattern, like_pattern
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
                        "restaurant_id": r["restaurant_id"],
                        "restaurant_name": r["restaurant_name"],
                        "restaurant_status": r.get("restaurant_status") or "open",
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

                # 2. Check user's current pending cart
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

                # 2. Get items and calculate bill
                cur.execute(load_query("user.sql", "get_cart_items"), (cart_id,))
                items = cur.fetchall()
                if not items:
                    return jsonify({"success": False, "message": "Cart is empty"}), 400

                subtotal = sum(float(it["item_total"]) for it in items)
                delivery_fee = 50.0
                total_bill = round(subtotal + delivery_fee, 2)
                bill_str = f"৳{total_bill:.2f}"

                # 3. Create order with status 'delivering' (Requirement 7)
                order_id = f"OD-{uuid.uuid4().hex[:8].upper()}"
                cur.execute(
                    load_query("user.sql", "create_order"),
                    (order_id, username, cart_id, user_lon, user_lat, bill_str)
                )

                # 4. Create payment record with 'Cash on delivery' (Requirement 9)
                tx_id = f"COD-{uuid.uuid4().hex[:10].upper()}"
                cur.execute(
                    load_query("user.sql", "create_payment"),
                    (order_id, username, tx_id)
                )

                # 5. Mark cart as ordered
                cur.execute(load_query("user.sql", "update_cart_status_ordered"), (cart_id,))

                conn.commit()

                return jsonify({
                    "success": True,
                    "message": "Order placed successfully! Your meal is now delivering.",
                    "order_id": order_id,
                    "status": "delivering",
                    "bill": bill_str,
                    "payment_method": "Cash on delivery",
                    "restaurant_name": active_cart["restaurant_name"]
                }), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


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
                for o in rows:
                    orders.append({
                        "order_id": o["order_id"],
                        "status": o["status"],
                        "bill": o["bill"],
                        "order_timestamp": o.get("order_timestamp"),
                        "final_timestamp": o.get("final_timestamp"),
                        "payment_method": o.get("payment_method"),
                        "payment_status": o.get("payment_status"),
                        "transaction_id": o.get("transaction_id"),
                        "restaurant_id": o["restaurant_id"],
                        "restaurant_name": o["restaurant_name"],
                        "latitude": float(o["latitude"]) if o.get("latitude") is not None else None,
                        "longitude": float(o["longitude"]) if o.get("longitude") is not None else None
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

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(load_query("user.sql", "get_order_by_id"), (order_id, username))
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

                return jsonify({
                    "success": True,
                    "order": {
                        "order_id": o["order_id"],
                        "status": o["status"],
                        "bill": o["bill"],
                        "order_timestamp": o.get("order_timestamp"),
                        "final_timestamp": o.get("final_timestamp"),
                        "payment_method": o.get("payment_method"),
                        "payment_status": o.get("payment_status"),
                        "transaction_id": o.get("transaction_id"),
                        "restaurant_id": o["restaurant_id"],
                        "restaurant_name": o["restaurant_name"],
                        "latitude": float(o["latitude"]) if o.get("latitude") is not None else None,
                        "longitude": float(o["longitude"]) if o.get("longitude") is not None else None,
                        "items": items
                    }
                }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
