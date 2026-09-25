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
       R.open_time::text, R.close_time::text, R.status
FROM restaurant R
LEFT JOIN restaurant_owner O ON R.owner_id = O.owner_id
WHERE R.status = 'pending'
ORDER BY R.name ASC
LIMIT 25 OFFSET %s;

--name:get_restaurants_by_status
SELECT R.restaurant_id, R.name, R.owner_id, O.name AS owner_name,
       R.open_time::text, R.close_time::text, R.status
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
       R.open_time::text, R.close_time::text, R.status,
       O.name AS owner_name, O.email AS owner_email, O.phone AS owner_phone,
       O.nid AS owner_nid
FROM restaurant R
LEFT JOIN restaurant_owner O ON O.owner_id = R.owner_id
WHERE R.restaurant_id = %s;

--name:get_admin_restaurant_foods
SELECT food_id, restaurant_id, category, name, price, discount, description, subcategory
FROM foods
WHERE restaurant_id = %s
ORDER BY subcategory NULLS FIRST, category ASC, name ASC;

--name:get_admin_user_details
SELECT username, name, email, phone, pfp_url AS pfp, location, status, reg_date
FROM users WHERE username = %s;

--name:get_admin_rider_details
SELECT username, name, email, phone, vehicle, location, balance, pfp_url AS pfp, status, reg_date
FROM rider WHERE username = %s;

--name:get_admin_owner_details
SELECT owner_id, name, phone, email, nid, status
FROM restaurant_owner WHERE owner_id = %s;

--name:get_admin_admin_details
SELECT username, email, phone, status
FROM admin WHERE username = %s;

--name:update_user_status
UPDATE users
SET status = %s
WHERE username = %s;
