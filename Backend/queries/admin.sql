--name:get_admin_status
SELECT username, status
FROM admin
WHERE username = %s;

--name:get_all_admins
SELECT username, email, phone, status
FROM admin
WHERE status = 'pending'
ORDER BY username ASC;

--name:get_admins_by_status
SELECT A.username, A.email, A.phone, A.status
FROM admin A
WHERE A.status = %s
    AND (
        %s = ''
        OR A.username ILIKE '%%' || %s || '%%'
        OR A.email ILIKE '%%' || %s || '%%'
        OR A.phone ILIKE '%%' || %s || '%%'
    )
ORDER BY A.username ASC
LIMIT 25 OFFSET %s;

--name:verify_admin
UPDATE admin
SET status = %s
WHERE username = %s;

--name:get_all_users
SELECT username, name, email, phone, status
FROM users
ORDER BY username ASC;

--name:get_users_by_status
SELECT U.username, U.name, U.email, U.phone, U.status
FROM users U
WHERE (
                U.status = %s
                OR (U.status != %s AND %s = 'active')
            )
  AND (
            %s = ''
            OR U.username ILIKE '%%' || %s || '%%'
            OR U.email ILIKE '%%' || %s || '%%'
            OR U.phone ILIKE '%%' || %s || '%%'
  )
ORDER BY U.username ASC
LIMIT 25 OFFSET %s;

--name:get_all_owners
SELECT owner_id, name, email, phone, nid, status
FROM restaurant_owner
WHERE status = 'pending'
ORDER BY owner_id ASC;

--name:get_owners_by_status
SELECT O.owner_id, O.name, O.email, O.phone, O.nid, O.status
FROM restaurant_owner O
WHERE O.status = %s
    AND (
        %s = ''
        OR O.owner_id ILIKE '%%' || %s || '%%'
        OR O.email ILIKE '%%' || %s || '%%'
        OR O.phone ILIKE '%%' || %s || '%%'
    )
ORDER BY O.owner_id ASC
LIMIT 25 OFFSET %s;

--name:verify_owner
UPDATE restaurant_owner
SET status = %s
WHERE owner_id = %s;

--name:get_all_restaurants
SELECT R.restaurant_id, R.name, R.owner_id, O.name AS owner_name,
       R.open_time::text, R.close_time::text, R.status, R.picture_url
FROM restaurant R
LEFT JOIN restaurant_owner O ON R.owner_id = O.owner_id
WHERE R.status = 'pending'
ORDER BY R.name ASC
LIMIT 25 OFFSET %s;

--name:get_restaurants_by_status
SELECT R.restaurant_id, R.name, R.owner_id, O.name AS owner_name,
       R.open_time::text, R.close_time::text, R.status, R.picture_url
FROM restaurant R
LEFT JOIN restaurant_owner O ON R.owner_id = O.owner_id
WHERE (
                R.status = %s
                OR (%s = 'approved' AND R.status IN ('open', 'closed'))
      )
  AND (
            %s = ''
            OR R.restaurant_id ILIKE '%%' || %s || '%%'
            OR R.name ILIKE '%%' || %s || '%%'
            OR R.owner_id ILIKE '%%' || %s || '%%'
            OR O.name ILIKE '%%' || %s || '%%'
  )
ORDER BY R.name ASC
LIMIT 25 OFFSET %s;

--name:get_all_riders
SELECT username, name, email, phone, vehicle, location, balance, status
FROM rider
WHERE status = 'pending'
ORDER BY username ASC;

--name:get_riders_by_status
SELECT R.username, R.name, R.email, R.phone, R.vehicle, R.location, R.balance, R.status
FROM rider R
WHERE (
        R.status = %s
        OR (%s = 'approved' AND R.status IN ('online', 'offline', 'delivering'))
      )
  AND (
      %s = ''
    OR R.username ILIKE '%%' || %s || '%%'
    OR R.email ILIKE '%%' || %s || '%%'
    OR R.phone ILIKE '%%' || %s || '%%'
  )
ORDER BY R.username ASC
LIMIT 25 OFFSET %s;

--name:get_admin_summary
SELECT
    (SELECT COUNT(*) FROM admin WHERE status = 'pending') AS pending_admins,
    (SELECT COUNT(*) FROM admin WHERE status = 'approved') AS approved_admins,
    (SELECT COUNT(*) FROM admin WHERE status = 'banned') AS banned_admins,
    (SELECT COUNT(*) FROM rider WHERE status = 'pending') AS pending_riders,
    (SELECT COUNT(*) FROM rider WHERE status IN ('online', 'offline', 'delivering')) AS approved_riders,
    (SELECT COUNT(*) FROM rider WHERE status = 'banned') AS banned_riders,
    (SELECT COUNT(*) FROM restaurant_owner WHERE status = 'pending') AS pending_owners,
    (SELECT COUNT(*) FROM restaurant_owner WHERE status = 'approved') AS approved_owners,
    (SELECT COUNT(*) FROM restaurant_owner WHERE status = 'banned') AS banned_owners,
    (SELECT COUNT(*) FROM restaurant WHERE status = 'pending') AS pending_restaurants,
    (SELECT COUNT(*) FROM restaurant WHERE status IN ('open', 'closed')) AS approved_restaurants,
    (SELECT COUNT(*) FROM restaurant WHERE status = 'banned') AS banned_restaurants,
    (SELECT COUNT(*) FROM users WHERE status != 'banned') AS active_users,
    (SELECT COUNT(*) FROM users WHERE status = 'banned') AS banned_users;

--name:verify_rider
UPDATE rider
SET status = %s
WHERE username = %s;

--name:verify_restaurant
UPDATE restaurant
SET status = %s
WHERE restaurant_id = %s;

--name:update_admin_status
UPDATE admin
SET status = %s
WHERE username = %s;

--name:update_owner_status
UPDATE restaurant_owner
SET status = %s
WHERE owner_id = %s;

--name:update_rider_status
UPDATE rider
SET status = %s
WHERE username = %s;

--name:update_restaurant_status
UPDATE restaurant
SET status = %s
WHERE restaurant_id = %s;

--name:delete_restaurant
DELETE FROM restaurant
WHERE restaurant_id = %s;

--name:get_admin_restaurant_details
SELECT R.restaurant_id, R.owner_id, R.name,
       ST_Y(R.location::geometry) AS latitude,
       ST_X(R.location::geometry) AS longitude,
       R.open_time::text, R.close_time::text, R.status, R.picture_url,
       O.name AS owner_name, O.email AS owner_email, O.phone AS owner_phone,
       O.nid AS owner_nid
FROM restaurant R
LEFT JOIN restaurant_owner O ON O.owner_id = R.owner_id
WHERE R.restaurant_id = %s;

--name:get_admin_restaurant_foods
SELECT food_id, restaurant_id, category, name, price, discount, description, picture_url, subcategory
FROM foods
WHERE restaurant_id = %s
ORDER BY subcategory NULLS FIRST, category ASC, name ASC;

--name:get_admin_restaurant_orders
SELECT O.order_id, O.status, O.order_timestamp::text AS order_timestamp,
       O.final_timestamp::text AS final_timestamp, O.bill, U.username,
       U.name AS customer_name, RD.username AS rider_username, RD.name AS rider_name
FROM orders O
JOIN cart C ON C.cart_id = O.cart_id
JOIN users U ON U.username = O.username
LEFT JOIN rider RD ON RD.username = O.rider_username
WHERE C.restaurant_id = %s
ORDER BY CASE WHEN O.status IN ('pending', 'delivering') THEN 0 ELSE 1 END,
         O.order_timestamp DESC;

--name:get_admin_user_details
SELECT username, name, email, phone, pfp_url AS pfp, location, status, reg_date
FROM users WHERE username = %s;

--name:get_admin_user_orders
SELECT O.order_id, O.status, O.order_timestamp::text AS order_timestamp,
       O.final_timestamp::text AS final_timestamp, O.bill,
       R.restaurant_id, R.name AS restaurant_name, RD.username AS rider_username,
       RD.name AS rider_name
FROM orders O
JOIN cart C ON C.cart_id = O.cart_id
JOIN restaurant R ON R.restaurant_id = C.restaurant_id
LEFT JOIN rider RD ON RD.username = O.rider_username
WHERE LOWER(O.username) = LOWER(%s)
ORDER BY CASE WHEN O.status IN ('pending', 'delivering') THEN 0 ELSE 1 END,
         O.order_timestamp DESC;

--name:get_admin_rider_details
SELECT username, name, email, phone, vehicle, location, balance, due_amount, pfp_url AS pfp, status, reg_date
FROM rider WHERE username = %s;

--name:get_admin_rider_orders
SELECT O.order_id, O.status, O.order_timestamp::text AS order_timestamp,
       O.final_timestamp::text AS final_timestamp, O.bill,
       R.restaurant_id, R.name AS restaurant_name, U.username, U.name AS customer_name
FROM orders O
JOIN cart C ON C.cart_id = O.cart_id
JOIN restaurant R ON R.restaurant_id = C.restaurant_id
JOIN users U ON U.username = O.username
WHERE LOWER(O.rider_username) = LOWER(%s)
ORDER BY CASE WHEN O.status IN ('pending', 'delivering') THEN 0 ELSE 1 END,
         O.order_timestamp DESC;

--name:get_admin_owner_details
SELECT owner_id, name, phone, email, nid, status
FROM restaurant_owner WHERE owner_id = %s;

--name:get_admin_owner_restaurants
SELECT restaurant_id, name, status, open_time::text AS open_time, close_time::text AS close_time
FROM restaurant
WHERE owner_id = %s
ORDER BY name ASC;

--name:get_admin_admin_details
SELECT username, email, phone, status
FROM admin WHERE username = %s;

--name:update_user_status
UPDATE users
SET status = %s
WHERE username = %s;

--name:adjust_rider_amounts
UPDATE rider
SET due_amount = due_amount - %s,
        balance = balance - %s
WHERE username = %s
    AND %s >= 0 AND %s >= 0
    AND %s <= due_amount
    AND %s <= balance
RETURNING due_amount, balance;

--name:get_admin_order
SELECT O.order_id, O.username, U.name AS customer_name, O.rider_username,
             RD.name AS rider_name, O.status, O.bill, O.order_timestamp::text AS order_timestamp,
             O.final_timestamp::text AS final_timestamp, R.restaurant_id, R.name AS restaurant_name,
             ST_Y(O.location::geometry) AS latitude, ST_X(O.location::geometry) AS longitude,
             P.payment_method, P.payment_status, P.transaction_id
FROM orders O
JOIN users U ON U.username = O.username
JOIN cart C ON C.cart_id = O.cart_id
JOIN restaurant R ON R.restaurant_id = C.restaurant_id
LEFT JOIN rider RD ON RD.username = O.rider_username
LEFT JOIN LATERAL (
        SELECT payment_method, status AS payment_status, transaction_id
        FROM payment WHERE order_id = O.order_id
) P ON TRUE
WHERE LOWER(O.order_id) = LOWER(%s);

--name:get_admin_order_items
SELECT F.food_id, F.name, F.price, F.discount,
             round(round(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) * CI.quantity, 2) AS item_total,
             CI.quantity, F.picture_url
FROM orders O
JOIN cart_item CI ON CI.cart_id = O.cart_id
JOIN foods F ON F.food_id = CI.food_id
WHERE O.order_id = %s
ORDER BY F.name ASC;

--name:cancel_admin_order
WITH cancelled AS (
        UPDATE orders
        SET status = 'cancelled', final_timestamp = CURRENT_TIMESTAMP
        WHERE LOWER(order_id) = LOWER(%s)
            AND status IN ('pending', 'delivering')
        RETURNING order_id, rider_username
), released AS (
        UPDATE rider R
        SET status = 'online'
        FROM cancelled C
        WHERE R.username = C.rider_username AND R.status = 'delivering'
        RETURNING R.username
)
SELECT order_id FROM cancelled;

--name:insert_food_category
INSERT INTO food_category (category, picture_url)
VALUES (%s, %s)
ON CONFLICT (category) DO UPDATE SET picture_url = EXCLUDED.picture_url
RETURNING category, picture_url;
