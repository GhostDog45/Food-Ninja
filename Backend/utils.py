from db import get_connection, load_query
import psycopg
import re
import requests
import os
import json

MAP_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
map_url = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
map_headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": MAP_API_KEY,
    "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters"
}

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

def getDistanceTime(restaurants, user):
    origins = []

    for restaurant in restaurants:
        origins.append({
            "waypoint": {
                "location": {
                    "latLng": {
                        "latitude": restaurant["latitude"],
                        "longitude": restaurant["longitude"]
                    }
                }
            }
        })

    destination = [{
        "waypoint": {
            "location": {
                "latLng": user
            }
        }
    }]

    data = {
        "origins": origins,
        "destinations": destination,
        "travelMode": "TWO_WHEELER"
    }

    response = requests.post(
        map_url,
        headers=map_headers,
        json=data
    )
    response.raise_for_status()

    bike_routes = response.text.strip().splitlines()
    bike_routes = [json.loads(route) for route in bike_routes]

    data["travelMode"] = "BICYCLE"

    response = requests.post(
        map_url,
        headers=map_headers,
        json=data
    )
    response.raise_for_status()

    bicycle_routes = response.text.strip().splitlines()
    bicycle_routes = [json.loads(route) for route in bicycle_routes]

    for route in bike_routes:
        i = route["originIndex"]

        bike_time = round(
            int(route["duration"].rstrip("s")) / 60
        )

        bicycle_route = bicycle_routes[i]

        bicycle_time = round(
            int(bicycle_route["duration"].rstrip("s")) / 60
        )

        restaurants[i]["distance"] = route["distanceMeters"]

        restaurants[i]["min_delivery_time"] = min(
            bike_time,
            bicycle_time
        )

        restaurants[i]["max_delivery_time"] = max(
            bike_time,
            bicycle_time
        )

    return restaurants

def filterRestaurants(restaurants, user):
    restaurants = getDistanceTime(restaurants, user)
    restaurants = [
        r for r in restaurants
        if r["distance"] <= 5000 and r["max_delivery_time"] <= 120
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


import math
import datetime

def calculate_order_delivery_time(restaurant_coords, user_coords, vehicle="bike"):
    """
    Calculates delivery time for an order considering:
    - GPS coordinates of restaurant and delivery destination
    - Traffic conditions / whether there is a jam
    - Vehicle type: Motorbike ('bike') vs Bicycle ('bicycle')
    - Kitchen food preparation time
    """
    rest_lat = float(restaurant_coords.get("latitude") or 23.726154)
    rest_lon = float(restaurant_coords.get("longitude") or 90.390298)
    user_lat = float(user_coords.get("latitude") or 23.726154)
    user_lon = float(user_coords.get("longitude") or 90.390298)

    # 1. GPS Distance calculation (haversine)
    R = 6371000.0
    phi1 = math.radians(rest_lat)
    phi2 = math.radians(user_lat)
    delta_phi = math.radians(user_lat - rest_lat)
    delta_lambda = math.radians(user_lon - rest_lon)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    dist_m = R * c
    dist_km = round(dist_m / 1000.0, 2)

    v = (vehicle or "bike").strip().lower()
    is_bike = v in ("bike", "motorcycle", "scooter")
    travel_mode = "TWO_WHEELER" if is_bike else "BICYCLE"
    v_label = "Motorbike" if is_bike else "Bicycle"

    transit_mins = None
    traffic_condition = None
    traffic_jam_detected = False

    # 2. Query Google Maps Routes API if key is present
    if MAP_API_KEY:
        try:
            req_data = {
                "origins": [{
                    "waypoint": {
                        "location": {
                            "latLng": {"latitude": rest_lat, "longitude": rest_lon}
                        }
                    }
                }],
                "destinations": [{
                    "waypoint": {
                        "location": {
                            "latLng": {"latitude": user_lat, "longitude": user_lon}
                        }
                    }
                }],
                "travelMode": travel_mode
            }
            resp = requests.post(map_url, headers=map_headers, json=req_data, timeout=3)
            if resp.status_code == 200:
                lines = resp.text.strip().splitlines()
                if lines:
                    route_info = json.loads(lines[0])
                    dur_str = route_info.get("duration", "")
                    if dur_str and dur_str.endswith("s"):
                        dur_sec = int(dur_str.rstrip("s"))
                        transit_mins = max(4, round(dur_sec / 60))
                        expected_mins = max(3, round((dist_km / (24.0 if is_bike else 12.0)) * 60))
                        if transit_mins >= expected_mins * 1.35:
                            traffic_condition = "Heavy traffic jam"
                            traffic_jam_detected = True
                        elif transit_mins >= expected_mins * 1.15:
                            traffic_condition = "Moderate traffic"
                            traffic_jam_detected = True
                        else:
                            traffic_condition = "Normal traffic flow"
        except Exception:
            transit_mins = None

    # 3. Intelligent traffic model fallback
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    bd_now = utc_now + datetime.timedelta(hours=6)
    cur_hour = bd_now.hour + bd_now.minute / 60.0

    is_heavy_jam = (8.5 <= cur_hour <= 10.75) or (17.25 <= cur_hour <= 21.5)
    is_moderate_jam = (11.0 <= cur_hour < 13.5) or (13.5 <= cur_hour <= 15.5) or (15.5 < cur_hour < 17.25)

    if traffic_condition is None:
        if is_heavy_jam:
            traffic_condition = "Heavy traffic jam"
            traffic_jam_detected = True
        elif is_moderate_jam:
            traffic_condition = "Moderate traffic"
            traffic_jam_detected = True
        else:
            traffic_condition = "Normal traffic flow"
            traffic_jam_detected = False

    if is_bike:
        base_speed_kmh = 24.0
        jam_factor = 1.7 if is_heavy_jam else (1.35 if is_moderate_jam else 1.1)
    else:
        base_speed_kmh = 12.0
        jam_factor = 1.3 if is_heavy_jam else (1.15 if is_moderate_jam else 1.05)

    base_transit_mins = max(3, round((dist_km / base_speed_kmh) * 60))
    if transit_mins is None:
        transit_mins = max(4, round(base_transit_mins * jam_factor))

    traffic_delay_mins = max(0, transit_mins - base_transit_mins)
    kitchen_prep_mins = 12
    total_delivery_mins = kitchen_prep_mins + transit_mins

    eta_time = bd_now + datetime.timedelta(minutes=total_delivery_mins)
    eta_str = eta_time.strftime("%I:%M %p").lstrip("0")

    min_range = max(15, total_delivery_mins - 5)
    max_range = total_delivery_mins + 5

    return {
        "estimated_delivery_mins": total_delivery_mins,
        "delivery_time_range": f"{min_range} - {max_range} mins",
        "estimated_arrival_time": eta_str,
        "distance_km": dist_km,
        "distance_meters": round(dist_m),
        "vehicle": "bike" if is_bike else "bicycle",
        "vehicle_label": v_label,
        "traffic_condition": traffic_condition,
        "traffic_jam_detected": traffic_jam_detected,
        "traffic_delay_mins": traffic_delay_mins,
        "kitchen_prep_mins": kitchen_prep_mins,
        "transit_mins": transit_mins
    }


def calculate_delivery_charge(distance_km, estimated_delivery_mins):
    """Return the delivery charge shared by the customer and assigned rider."""
    distance = max(0.0, float(distance_km or 0.0))
    minutes = max(0.0, float(estimated_delivery_mins or 0.0))
    return round(30.0 + distance * 8.0 + max(0.0, minutes - 20.0) * 0.5, 2)
