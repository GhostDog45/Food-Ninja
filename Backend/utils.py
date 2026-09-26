from db import get_connection, load_query
import psycopg
import re
import requests
import os
import json

import time
import math
import datetime

GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


def get_map_api_key():
    return os.getenv("GOOGLE_MAPS_API_KEY") or ""


_ROUTE_CACHE = {}
_ROUTE_CACHE_TTL = 300  # Cache route results for 5 minutes


EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
NAME_PATTERN = r"^[A-Za-z\s']+$"
USERNAME_PATTERN = r"^[A-Za-z][A-Za-z0-9_]*$"


def is_valid_email(email):
    return re.fullmatch(EMAIL_PATTERN, email) is not None


def normalize_bd_phone(phone):
    if not isinstance(phone, str):
        return None

    phone = phone.strip()

    if phone.startswith("01"):
        normalized = phone

    elif phone.startswith("+8801"):
        normalized = "0" + phone[4:]

    elif phone.startswith("8801"):
        normalized = "0" + phone[3:]

    else:
        return None

    if not re.fullmatch(r"01[3-9]\d{8}", normalized):
        return None

    return normalized


def is_valid_name(name):
    if not isinstance(name, str):
        return False

    return re.fullmatch(NAME_PATTERN, name) is not None


def normalize_username(username):
    if not isinstance(username, str):
        return None

    username = username.strip().lower()

    if not re.fullmatch(USERNAME_PATTERN, username):
        return None

    return username


import auth


def verifyUserPassword(user_type, username, password):
    if not isinstance(password, str) or not password:
        return False

    with get_connection() as conn:
        with conn.cursor() as cur:
            if user_type == "user":
                query = load_query("update_info.sql", "get_user_password")
            elif user_type == "rider":
                query = load_query("update_info.sql", "get_rider_password")
            elif user_type == "admin":
                query = load_query("update_info.sql", "get_admin_password")
            elif user_type == "owner":
                query = load_query("update_info.sql", "get_owner_password")
            else:
                return False

            cur.execute(query, (username,))
            row = cur.fetchone()

            if not row:
                return False

            stored_hash = row["password_hash"]
            return auth.verify_password(password, stored_hash)


def updatePassword(user_type, username, new_password_hash):
    with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                if user_type == "user":
                    query = load_query("update_info.sql", "update_user_password")
                elif user_type == "rider":
                    query = load_query("update_info.sql", "update_rider_password")
                elif user_type == "admin":
                    query = load_query("update_info.sql", "update_admin_password")
                elif user_type == "owner":
                    query = load_query("update_info.sql", "update_owner_password")
                else:
                    return "invalid_user_type"

                cur.execute(query, (new_password_hash, username))
                conn.commit()
                return "success"

            except psycopg.Error:
                return "database_error"


def updateLocation(user_type, username, longitude, latitude,):
    with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                if user_type == "user":
                    query = load_query("update_info.sql", "update_user_location")
                elif user_type == "rider":
                    query = load_query("update_info.sql", "update_rider_location")
                else:
                    return "invalid_user_type"

                cur.execute(query, (longitude, latitude, username))
                conn.commit()
                return "success"

            except psycopg.Error:
                return "database_error"


def updateEmail(user_type, username, email):
    with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                if user_type == "user":
                    query = load_query("update_info.sql", "update_user_email")
                elif user_type == "rider":
                    query = load_query("update_info.sql", "update_rider_email")
                elif user_type == "admin":
                    query = load_query("update_info.sql", "update_admin_email")
                elif user_type == "owner":
                    query = load_query("update_info.sql", "update_owner_email")
                else:
                    return "invalid_user_type"

                cur.execute(query, (email, username))
                conn.commit()
                return "success"

            except psycopg.errors.UniqueViolation:
                return "email_exists"

            except psycopg.Error:
                return "database_error"


def updatePhone(user_type, username, phone):
    with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                if user_type == "user":
                    query = load_query("update_info.sql", "update_user_phone")
                elif user_type == "rider":
                    query = load_query("update_info.sql", "update_rider_phone")
                elif user_type == "admin":
                    query = load_query("update_info.sql", "update_admin_phone")
                elif user_type == "owner":
                    query = load_query("update_info.sql", "update_owner_phone")
                else:
                    return "invalid_user_type"

                cur.execute(query, (phone, username))
                conn.commit()
                return "success"

            except psycopg.errors.UniqueViolation:
                return "phone_exists"

            except psycopg.Error:
                return "database_error"


def getNearbyRestaurants(username, food_cat):
    with get_connection() as conn:     
        with conn.cursor() as cur: 

            query = load_query("get_info.sql", "get_user_location")
                        
            cur.execute(query, (username,))
            user = cur.fetchone()

            # check user existence
            if user is None:
                return "user not found"

            # check if location is set
            if user.get("latitude") is None:
                return "location not set"
            
            user_location = {"latitude": user["latitude"], "longitude": user["longitude"]}

            query = load_query("nearby_restaurants.sql", "get_nearby_restaurants")
            
            cur.execute(query, (user_location.get("longitude"), user_location.get("latitude"), 5000, food_cat, food_cat))
            rows = cur.fetchall()

            filtered_restaurants = filterRestaurants(rows, user_location)
            return filtered_restaurants

def normalize_lat_lon(latitude, longitude):
    """
    Ensure latitude and longitude are valid numeric coordinates in correct order.
    In Postgres/PostGIS: Point(x, y) = Point(longitude, latitude).
    In Google Maps API: latLng = {latitude: Y, longitude: X}.
    Latitude must be in [-90, 90], and Longitude in [-180, 180].
    If coordinates were inadvertently inverted (e.g. latitude > 90 or in Bangladesh
    where longitude is ~90 and latitude is ~23), safely swap them to the correct order.
    """
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return None, None

    if abs(lat) > 90.0 and abs(lon) <= 90.0:
        lat, lon = lon, lat
    elif 85.0 <= lat <= 95.0 and 20.0 <= lon <= 30.0:
        lat, lon = lon, lat

    return lat, lon


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate straight-line aerial distance in meters between two GPS coordinates."""
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def fetch_google_route(origin_lat, origin_lon, dest_lat, dest_lon, travel_mode="TWO_WHEELER"):
    """
    Call Google Maps Routes API (computeRoutes) to determine actual route distance and duration.
    Caches route calls in-memory for 5 minutes.
    """
    lat1, lon1 = normalize_lat_lon(origin_lat, origin_lon)
    lat2, lon2 = normalize_lat_lon(dest_lat, dest_lon)
    if lat1 is None or lat2 is None:
        return None

    cache_key = (round(lat1, 5), round(lon1, 5), round(lat2, 5), round(lon2, 5), travel_mode)
    now = time.time()
    if cache_key in _ROUTE_CACHE:
        entry_time, cached_val = _ROUTE_CACHE[cache_key]
        if now - entry_time < _ROUTE_CACHE_TTL:
            return cached_val

    api_key = get_map_api_key()
    if not api_key:
        return None

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters,routes.description"
    }
    body = {
        "origin": {
            "location": {
                "latLng": {
                    "latitude": lat1,
                    "longitude": lon1
                }
            }
        },
        "destination": {
            "location": {
                "latLng": {
                    "latitude": lat2,
                    "longitude": lon2
                }
            }
        },
        "travelMode": travel_mode,
        "routingPreference": "TRAFFIC_AWARE"
    }

    try:
        resp = requests.post(GOOGLE_ROUTES_URL, headers=headers, json=body, timeout=4)
        if resp.status_code == 200:
            routes = resp.json().get("routes", [])
            if routes:
                r = routes[0]
                dist_m = int(r.get("distanceMeters") or 0)
                dur_str = r.get("duration") or ""
                dur_s = int(dur_str.rstrip("s")) if dur_str.endswith("s") else 0
                static_str = r.get("staticDuration") or ""
                static_s = int(static_str.rstrip("s")) if static_str.endswith("s") else dur_s
                desc = r.get("description") or ""

                result = {
                    "distance_meters": dist_m,
                    "duration_seconds": dur_s,
                    "static_duration_seconds": static_s,
                    "description": desc
                }
                _ROUTE_CACHE[cache_key] = (now, result)
                return result
    except Exception:
        pass

    return None


def getDistanceTime(restaurants, user):
    user_lat, user_lon = normalize_lat_lon(user.get("latitude"), user.get("longitude"))
    if user_lat is None or user_lon is None:
        return restaurants

    for r in restaurants:
        r_lat, r_lon = normalize_lat_lon(r.get("latitude"), r.get("longitude"))
        if r_lat is None or r_lon is None:
            continue

        route = fetch_google_route(r_lat, r_lon, user_lat, user_lon, travel_mode="TWO_WHEELER")
        if route:
            dist_m = route["distance_meters"]
            bike_time = max(3, round(route["duration_seconds"] / 60.0))
            bicycle_time = max(4, round((dist_m / 1000.0 / 13.0) * 60))
            r["distance"] = dist_m
            r["min_delivery_time"] = min(bike_time, bicycle_time)
            r["max_delivery_time"] = max(bike_time, bicycle_time)
        else:
            dist_m = haversine_distance(r_lat, r_lon, user_lat, user_lon)
            bike_time = max(4, round((dist_m / 1000.0 / 22.0) * 60))
            bicycle_time = max(5, round((dist_m / 1000.0 / 13.0) * 60))
            r["distance"] = round(dist_m)
            r["min_delivery_time"] = min(bike_time, bicycle_time)
            r["max_delivery_time"] = max(bike_time, bicycle_time)

    return restaurants


def filterRestaurants(restaurants, user):
    restaurants = getDistanceTime(restaurants, user)
    restaurants = [
        r for r in restaurants
        if r.get("distance", 0) <= 5000 and r.get("max_delivery_time", 0) <= 120
    ]
    return restaurants


def is_valid_food_cat(food_cat):
    with get_connection() as conn:     
        with conn.cursor() as cur: 

            query = load_query("check_exist.sql", "check_food_cat")
                        
            cur.execute(query, (food_cat,))
            result = cur.fetchone()

            if result:
                return True
    return False


def calculate_order_delivery_time(restaurant_coords, user_coords, vehicle="bike"):
    """
    Calculates delivery time and route distance for an order using Google Maps Routes API:
    - Queries Google Routes API for real road route distance and traffic-aware transit duration
    - Distinguishes Motorbike (TWO_WHEELER) vs Bicycle
    - Detects traffic condition from Google API duration vs staticDuration
    - Adds kitchen food preparation time (12 mins)
    - Computes estimated arrival / reaching time in Bangladesh local time (UTC+6)
    - Formats delivery time range (e.g. 20 - 30 mins)
    """
    rest_lat, rest_lon = normalize_lat_lon(
        restaurant_coords.get("latitude") if restaurant_coords else None,
        restaurant_coords.get("longitude") if restaurant_coords else None
    )
    user_lat, user_lon = normalize_lat_lon(
        user_coords.get("latitude") if user_coords else None,
        user_coords.get("longitude") if user_coords else None
    )

    if rest_lat is None:
        rest_lat, rest_lon = 23.726154, 90.390298
    if user_lat is None:
        user_lat, user_lon = 23.726154, 90.390298

    v = (vehicle or "bike").strip().lower()
    is_bike = v in ("bike", "motorcycle", "scooter")
    v_label = "Motorbike" if is_bike else "Bicycle"

    route_info = None
    if is_bike:
        route_info = fetch_google_route(rest_lat, rest_lon, user_lat, user_lon, travel_mode="TWO_WHEELER")
    else:
        # First attempt BICYCLE travel mode
        route_info = fetch_google_route(rest_lat, rest_lon, user_lat, user_lon, travel_mode="BICYCLE")
        # In regions where bicycle routes are not published by Google, fetch road route via TWO_WHEELER
        if not route_info:
            tw_route = fetch_google_route(rest_lat, rest_lon, user_lat, user_lon, travel_mode="TWO_WHEELER")
            if tw_route:
                road_dist_m = tw_route["distance_meters"]
                road_dist_km = road_dist_m / 1000.0
                # Bicycle average city speed ~13 km/h
                bicycle_mins = max(4, round((road_dist_km / 13.0) * 60))
                route_info = {
                    "distance_meters": road_dist_m,
                    "duration_seconds": bicycle_mins * 60,
                    "static_duration_seconds": bicycle_mins * 60,
                    "description": tw_route.get("description", "")
                }

    # If Google Maps API returned route info, use the actual route distance & duration
    if route_info:
        dist_m = route_info["distance_meters"]
        dist_km = round(dist_m / 1000.0, 2)
        dur_sec = route_info["duration_seconds"]
        static_sec = route_info["static_duration_seconds"]
        transit_mins = max(3, round(dur_sec / 60.0))

        delay_sec = max(0, dur_sec - static_sec)
        traffic_delay_mins = round(delay_sec / 60.0)

        if dur_sec >= static_sec * 1.30 and delay_sec >= 180:
            traffic_condition = "Heavy traffic jam"
            traffic_jam_detected = True
        elif dur_sec >= static_sec * 1.15 and delay_sec >= 60:
            traffic_condition = "Moderate traffic"
            traffic_jam_detected = True
        else:
            traffic_condition = "Normal traffic flow"
            traffic_jam_detected = False
    else:
        # Graceful fallback: Haversine distance with road tortuosity factor (1.25)
        straight_m = haversine_distance(rest_lat, rest_lon, user_lat, user_lon)
        dist_m = round(straight_m * 1.25)
        dist_km = round(dist_m / 1000.0, 2)

        utc_now = datetime.datetime.now(datetime.timezone.utc)
        bd_now = utc_now + datetime.timedelta(hours=6)
        cur_hour = bd_now.hour + bd_now.minute / 60.0
        is_heavy_jam = (8.5 <= cur_hour <= 10.75) or (17.25 <= cur_hour <= 21.5)
        is_moderate_jam = (11.0 <= cur_hour < 13.5) or (13.5 <= cur_hour <= 15.5) or (15.5 < cur_hour < 17.25)

        if is_heavy_jam:
            traffic_condition = "Heavy traffic jam"
            traffic_jam_detected = True
            jam_factor = 1.6 if is_bike else 1.3
        elif is_moderate_jam:
            traffic_condition = "Moderate traffic"
            traffic_jam_detected = True
            jam_factor = 1.3 if is_bike else 1.15
        else:
            traffic_condition = "Normal traffic flow"
            traffic_jam_detected = False
            jam_factor = 1.05

        base_speed = 24.0 if is_bike else 13.0
        base_transit = max(3, round((dist_km / base_speed) * 60))
        transit_mins = max(4, round(base_transit * jam_factor))
        traffic_delay_mins = max(0, transit_mins - base_transit)

    kitchen_prep_mins = 12
    total_delivery_mins = kitchen_prep_mins + transit_mins

    # Compute reaching time / arrival time in Bangladesh time (UTC+6)
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    bd_now = utc_now + datetime.timedelta(hours=6)
    eta_time = bd_now + datetime.timedelta(minutes=total_delivery_mins)
    eta_str = eta_time.strftime("%I:%M %p").lstrip("0")

    min_range = max(15, total_delivery_mins - 5)
    max_range = total_delivery_mins + 5

    return {
        "estimated_delivery_mins": total_delivery_mins,
        "delivery_time_range": f"{min_range} - {max_range} mins",
        "estimated_arrival_time": eta_str,
        "distance_km": dist_km,
        "distance_meters": dist_m,
        "vehicle": "bike" if is_bike else "bicycle",
        "vehicle_label": v_label,
        "traffic_condition": traffic_condition,
        "traffic_jam_detected": traffic_jam_detected,
        "traffic_delay_mins": traffic_delay_mins,
        "kitchen_prep_mins": kitchen_prep_mins,
        "transit_mins": transit_mins,
        "route_description": route_info.get("description", "") if route_info else ""
    }



def calculate_delivery_charge(distance_km, estimated_delivery_mins):
    """Return the delivery charge shared by the customer and assigned rider."""
    distance = max(0.0, float(distance_km or 0.0))
    minutes = max(0.0, float(estimated_delivery_mins or 0.0))
    return round(30.0 + distance * 8.0 + max(0.0, minutes - 20.0) * 0.5, 2)
