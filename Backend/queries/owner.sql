--name:get_owner_status
SELECT status, name, email, phone, nid
FROM restaurant_owner
WHERE owner_id = %s;

--name:get_owner_restaurants
SELECT restaurant_id, name,
       ST_Y(location::geometry) AS latitude,
       ST_X(location::geometry) AS longitude,
       open_time::text, close_time::text, status
FROM restaurant
WHERE owner_id = %s
ORDER BY name ASC;

--name:check_owner_status
SELECT status
FROM restaurant_owner
WHERE owner_id = %s;

--name:get_owner_restaurant
SELECT restaurant_id, owner_id, name,
       ST_Y(location::geometry) AS latitude,
       ST_X(location::geometry) AS longitude,
       open_time::text, close_time::text, status
FROM restaurant
WHERE restaurant_id = %s AND owner_id = %s;

--name:update_owner_restaurant
UPDATE restaurant
SET open_time = %s, close_time = %s, status = %s
WHERE restaurant_id = %s AND owner_id = %s AND status NOT IN ('pending', 'banned');

--name:get_owner_restaurant_orders
SELECT O.order_id, O.status, O.order_timestamp::text AS order_timestamp,
                         O.final_timestamp::text AS final_timestamp, O.bill, O.rider_username, U.username,
                         U.name AS customer_name, U.phone AS customer_phone
FROM orders O
JOIN cart C ON C.cart_id = O.cart_id
JOIN users U ON U.username = O.username
WHERE C.restaurant_id = %s
        AND EXISTS (
                        SELECT 1 FROM restaurant R
                        WHERE R.restaurant_id = C.restaurant_id AND R.owner_id = %s
        )
ORDER BY CASE WHEN O.status = 'pending' THEN 0 ELSE 1 END,
                                 O.order_timestamp ASC;

--name:reject_owner_pending_order
UPDATE orders O
SET status = 'rejected', final_timestamp = CURRENT_TIMESTAMP
FROM cart C
WHERE O.cart_id = C.cart_id
        AND O.order_id = %s
        AND O.status = 'pending'
        AND O.rider_username IS NULL
        AND C.restaurant_id = %s
        AND EXISTS (
                        SELECT 1 FROM restaurant R
                        WHERE R.restaurant_id = C.restaurant_id AND R.owner_id = %s
        );

--name:insert_restaurant
INSERT INTO restaurant
(restaurant_id, owner_id, name, location, open_time, close_time, status)
VALUES
(%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s);

--name:delete_restaurant_by_owner
DELETE FROM restaurant
WHERE restaurant_id = %s AND owner_id = %s AND status = 'pending';

--name:get_food_categories
SELECT category
FROM food_category
ORDER BY category ASC;

--name:get_owner_foods
SELECT F.food_id, F.restaurant_id, F.category, F.name, F.price,
             F.discount, F.description, F.subcategory, F.picture_url
FROM foods F
WHERE F.restaurant_id = %s
    AND EXISTS (
            SELECT 1
            FROM restaurant R
            WHERE R.restaurant_id = %s AND R.owner_id = %s
    )
ORDER BY F.subcategory NULLS FIRST, F.category ASC, F.name ASC;

--name:insert_food
INSERT INTO foods
(food_id, restaurant_id, category, name, price, discount, description, subcategory, picture_url)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);

--name:delete_food_by_owner
DELETE FROM foods
WHERE food_id = %s
    AND restaurant_id = %s
    AND EXISTS (
            SELECT 1
            FROM restaurant R
            WHERE R.restaurant_id = %s AND R.owner_id = %s
    );

--name:update_food_by_owner
UPDATE foods F
SET name = %s,
        price = %s,
        discount = %s,
        description = %s,
        subcategory = %s
WHERE F.food_id = %s
  AND F.restaurant_id = %s
  AND EXISTS (
          SELECT 1 FROM restaurant R
          WHERE R.restaurant_id = F.restaurant_id AND R.owner_id = %s
  );

--name:update_food_picture_by_owner
UPDATE foods F
SET picture_url = %s
WHERE F.food_id = %s
  AND F.restaurant_id = %s
  AND EXISTS (
          SELECT 1 FROM restaurant R
          WHERE R.restaurant_id = F.restaurant_id AND R.owner_id = %s
  );

