--name:get_user_location
SELECT 
    ST_Y(location::geometry) AS latitude,
    ST_X(location::geometry) AS longitude
FROM users
WHERE username = %s;

--name:get_all_food_categories
SELECT category, picture_url 
FROM food_category 
ORDER BY category ASC;

--name:get_nearby_restaurants
SELECT 
    R.restaurant_id,
    R.name,
    ST_Y(R.location::geometry) AS latitude,
    ST_X(R.location::geometry) AS longitude,
    R.open_time::text,
    R.close_time::text,
    R.status,
    ROUND(ST_Distance(R.location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)::numeric, 1) AS distance_meters,
    COALESCE(ROUND(AVG(RV.restaurant_rating)::numeric, 1), 0.0) AS avg_rating,
    COUNT(DISTINCT RV.order_id) AS review_count,
    COUNT(DISTINCT O.username) AS people_ordered_count,
    COUNT(DISTINCT O.order_id) AS total_orders_count
FROM restaurant R
LEFT JOIN cart C ON R.restaurant_id = C.restaurant_id AND C.status = 'ordered'
LEFT JOIN orders O ON C.cart_id = O.cart_id
LEFT JOIN review RV ON O.order_id = RV.order_id
WHERE ST_DWithin(R.location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 5000)
  AND R.status IN ('open', 'closed')
GROUP BY R.restaurant_id, R.name, R.location, R.open_time, R.close_time, R.status
ORDER BY distance_meters ASC;

--name:get_restaurant_details
SELECT 
    R.restaurant_id,
    R.name,
    ST_Y(R.location::geometry) AS latitude,
    ST_X(R.location::geometry) AS longitude,
    R.open_time::text,
    R.close_time::text,
    R.status,
    ROUND(ST_Distance(R.location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)::numeric, 1) AS distance_meters,
    COALESCE(ROUND(AVG(RV.restaurant_rating)::numeric, 1), 0.0) AS avg_rating,
    COUNT(DISTINCT RV.order_id) AS review_count,
    COUNT(DISTINCT O.username) AS people_ordered_count,
    COUNT(DISTINCT O.order_id) AS total_orders_count
FROM restaurant R
LEFT JOIN cart C ON R.restaurant_id = C.restaurant_id AND C.status = 'ordered'
LEFT JOIN orders O ON C.cart_id = O.cart_id
LEFT JOIN review RV ON O.order_id = RV.order_id
WHERE R.restaurant_id = %s
  AND R.status IN ('open', 'closed')
GROUP BY R.restaurant_id, R.name, R.location, R.open_time, R.close_time, R.status;

--name:get_restaurant_foods
SELECT 
    F.food_id,
    F.restaurant_id,
    F.category,
    F.name,
    F.price,
    F.discount,
    ROUND(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) AS discounted_price,
    F.description,
    F.subcategory,
    F.picture_url
FROM foods F
WHERE F.restaurant_id = %s
ORDER BY F.category ASC, F.name ASC;

--name:get_food_detail_with_restaurant
SELECT 
    F.food_id,
    F.restaurant_id,
    R.name AS restaurant_name,
    R.status AS restaurant_status,
    ST_Y(R.location::geometry) AS restaurant_latitude,
    ST_X(R.location::geometry) AS restaurant_longitude,
    ROUND(ST_Distance(R.location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)::numeric, 1) AS distance_meters,
    F.category,
    F.name AS food_name,
    F.price,
    F.discount,
    ROUND(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) AS discounted_price,
    F.description,
    F.subcategory
FROM foods F
JOIN restaurant R ON F.restaurant_id = R.restaurant_id
WHERE F.food_id = %s;

--name:search_foods_within_range
SELECT 
    F.food_id,
    F.name AS food_name,
    F.category,
    F.price,
    F.discount,
    ROUND(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) AS discounted_price,
    F.description,
    F.subcategory,
    F.picture_url,
    R.restaurant_id,
    R.name AS restaurant_name,
    R.status AS restaurant_status,
    ROUND(ST_Distance(R.location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)::numeric, 1) AS distance_meters,
    COALESCE(ROUND(AVG(RV.restaurant_rating)::numeric, 1), 0.0) AS avg_rating,
    COUNT(DISTINCT O.username) AS people_ordered_count
FROM foods F
JOIN restaurant R ON F.restaurant_id = R.restaurant_id
LEFT JOIN cart C ON R.restaurant_id = C.restaurant_id AND C.status = 'ordered'
LEFT JOIN orders O ON C.cart_id = O.cart_id
LEFT JOIN review RV ON O.order_id = RV.order_id
WHERE ST_DWithin(R.location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 5000)
  AND R.status IN ('open', 'closed')
  AND (%s::text IS NULL OR LOWER(F.category) = LOWER(%s))
  AND (%s::text IS NULL OR LOWER(F.name) LIKE LOWER(%s) OR LOWER(F.category) LIKE LOWER(%s) OR LOWER(R.name) LIKE LOWER(%s))
GROUP BY F.food_id, F.name, F.category, F.price, F.discount, F.description, F.subcategory, F.picture_url, R.restaurant_id, R.name, R.status, R.location
ORDER BY distance_meters ASC, F.name ASC
LIMIT 50;

--name:get_user_active_cart
SELECT 
    C.cart_id,
    C.restaurant_id,
    R.name AS restaurant_name,
    R.status AS restaurant_status,
    ST_Y(R.location::geometry) AS restaurant_latitude,
    ST_X(R.location::geometry) AS restaurant_longitude,
    C.status
FROM cart C
JOIN restaurant R ON C.restaurant_id = R.restaurant_id
WHERE C.username = %s AND C.status = 'pending'
LIMIT 1;

--name:get_cart_items
SELECT 
    CI.food_id,
    F.name,
    F.category,
    F.price,
    F.discount,
    F.description,
    ROUND(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) AS unit_price,
    CI.quantity,
    ROUND(ROUND(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) * CI.quantity, 2) AS item_total
FROM cart_item CI
JOIN foods F ON CI.food_id = F.food_id
WHERE CI.cart_id = %s
ORDER BY F.name ASC;

--name:create_cart
INSERT INTO cart (cart_id, username, restaurant_id, status)
VALUES (%s, %s, %s, 'pending');

--name:add_or_update_cart_item
INSERT INTO cart_item (cart_id, food_id, quantity)
VALUES (%s, %s, %s)
ON CONFLICT (cart_id, food_id)
DO UPDATE SET quantity = cart_item.quantity + EXCLUDED.quantity;

--name:set_cart_item_quantity
UPDATE cart_item
SET quantity = %s
WHERE cart_id = %s AND food_id = %s;

--name:remove_cart_item
DELETE FROM cart_item
WHERE cart_id = %s AND food_id = %s;

--name:delete_user_cart
DELETE FROM cart
WHERE username = %s AND status = 'pending';

--name:delete_cart_by_id
DELETE FROM cart
WHERE cart_id = %s AND username = %s;

--name:get_food_restaurant_id
SELECT food_id, restaurant_id, name, price, discount
FROM foods
WHERE food_id = %s;

--name:find_available_rider
SELECT 
    username,
    name,
    vehicle,
    phone,
    ST_Y(location::geometry) AS latitude,
    ST_X(location::geometry) AS longitude
FROM rider
WHERE status IN ('online', 'delivering')
ORDER BY 
    CASE WHEN status = 'online' THEN 0 ELSE 1 END,
    CASE WHEN location IS NOT NULL THEN ST_Distance(location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) ELSE 9999999 END ASC
LIMIT 1;

--name:create_order
INSERT INTO orders (order_id, username, cart_id, rider_username, location, status, bill, order_timestamp)
VALUES (
    %s,
    %s,
    %s,
    %s,
    ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
    'pending',
    %s,
    CURRENT_TIMESTAMP
);

--name:create_payment
INSERT INTO payment (order_id, username, transaction_id, payment_method, status, timestamp)
VALUES (%s, %s, %s, 'Cash on delivery', 'pending', CURRENT_TIMESTAMP);

--name:update_cart_status_ordered
UPDATE cart
SET status = 'ordered'
WHERE cart_id = %s;

--name:get_user_orders
SELECT 
    O.order_id,
    O.status,
    O.bill,
    O.order_timestamp::text,
    O.final_timestamp::text,
    ST_Y(O.location::geometry) AS latitude,
    ST_X(O.location::geometry) AS longitude,
    P.payment_method,
    P.status AS payment_status,
    P.transaction_id,
    R.restaurant_id,
    R.name AS restaurant_name,
    ST_Y(R.location::geometry) AS restaurant_latitude,
    ST_X(R.location::geometry) AS restaurant_longitude,
    ROUND(ST_Distance(R.location, O.location)::numeric, 0) AS distance_meters,
    RD.username AS rider_username,
    RD.name AS rider_name,
    RD.phone AS rider_phone,
    RD.vehicle AS rider_vehicle,
    RV.rider_rating,
    RV.rider_review,
    RV.restaurant_rating,
    RV.restaurant_review,
    RV.timestamp::text AS review_timestamp
FROM orders O
JOIN cart C ON O.cart_id = C.cart_id
JOIN restaurant R ON C.restaurant_id = R.restaurant_id
LEFT JOIN payment P ON O.order_id = P.order_id
LEFT JOIN rider RD ON O.rider_username = RD.username
LEFT JOIN review RV ON O.order_id = RV.order_id
WHERE O.username = %s
ORDER BY O.order_timestamp DESC;

--name:get_order_by_id
SELECT 
    O.order_id,
    O.username,
    O.cart_id,
    O.rider_username,
    O.status,
    O.bill,
    O.order_timestamp::text,
    O.final_timestamp::text,
    ST_Y(O.location::geometry) AS latitude,
    ST_X(O.location::geometry) AS longitude,
    P.payment_method,
    P.status AS payment_status,
    P.transaction_id,
    R.restaurant_id,
    R.name AS restaurant_name,
    ST_Y(R.location::geometry) AS restaurant_latitude,
    ST_X(R.location::geometry) AS restaurant_longitude,
    ROUND(ST_Distance(R.location, O.location)::numeric, 0) AS distance_meters,
    RD.name AS rider_name,
    RD.phone AS rider_phone,
    RD.vehicle AS rider_vehicle,
    RV.rider_rating,
    RV.rider_review,
    RV.restaurant_rating,
    RV.restaurant_review,
    RV.timestamp::text AS review_timestamp
FROM orders O
JOIN cart C ON O.cart_id = C.cart_id
JOIN restaurant R ON C.restaurant_id = R.restaurant_id
LEFT JOIN payment P ON O.order_id = P.order_id
LEFT JOIN rider RD ON O.rider_username = RD.username
LEFT JOIN review RV ON O.order_id = RV.order_id
WHERE O.order_id = %s AND O.username = %s;

--name:get_order_items
SELECT 
    CI.food_id,
    F.name,
    F.price,
    F.discount,
    F.description,
    F.picture_url,
    ROUND(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) AS unit_price,
    CI.quantity,
    ROUND(ROUND(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) * CI.quantity, 2) AS item_total
FROM cart_item CI
JOIN foods F ON CI.food_id = F.food_id
WHERE CI.cart_id = %s
ORDER BY F.name ASC;

--name:submit_order_review
INSERT INTO review (order_id, rider_rating, rider_review, restaurant_rating, restaurant_review, timestamp)
VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
ON CONFLICT (order_id) DO UPDATE
SET rider_rating = EXCLUDED.rider_rating,
    rider_review = EXCLUDED.rider_review,
    restaurant_rating = EXCLUDED.restaurant_rating,
    restaurant_review = EXCLUDED.restaurant_review,
    timestamp = CURRENT_TIMESTAMP;

--name:mark_order_delivered
UPDATE orders
SET status = 'delivered',
    final_timestamp = CURRENT_TIMESTAMP
WHERE order_id = %s AND username = %s;

--name:confirm_order_pickup
UPDATE orders
SET status = 'delivering',
    rider_username = COALESCE(%s, rider_username)
WHERE order_id = %s;



