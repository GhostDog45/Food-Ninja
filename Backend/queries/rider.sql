--name:get_rider_status
SELECT status, location, vehicle, name, balance, due_amount
FROM rider
WHERE username = %s;

--name:get_rider_location
SELECT
	ST_Y(location::geometry) AS latitude,
	ST_X(location::geometry) AS longitude
FROM rider
WHERE username = %s;

--name:set_rider_status
UPDATE rider
SET status = %s
WHERE username = %s AND status <> 'banned';

--name:set_rider_availability
UPDATE rider
SET status = %s
WHERE username = %s
	AND status IN ('online', 'offline')
RETURNING status;

--name:set_rider_offline_if_online
UPDATE rider
SET status = 'offline'
WHERE username = %s AND status = 'online';

--name:claim_online_rider
UPDATE rider
SET status = 'delivering'
WHERE username = %s AND status = 'online'
RETURNING username;

--name:release_rider_to_online
UPDATE rider
SET status = 'online'
WHERE username = %s AND status = 'delivering';

--name:get_rider_order_assignment
SELECT O.order_id, O.status, O.rider_username, O.bill
FROM orders O
WHERE O.order_id = %s;

--name:get_rider_name
SELECT name
FROM rider
WHERE username = %s;

--name:get_rider_active_order
SELECT O.order_id, O.status, O.bill, O.order_timestamp::text AS order_timestamp,
			 R.restaurant_id, R.name AS restaurant_name,
			 ST_Y(R.location::geometry) AS restaurant_latitude,
			 ST_X(R.location::geometry) AS restaurant_longitude,
			 ST_Y(O.location::geometry) AS customer_latitude,
			 ST_X(O.location::geometry) AS customer_longitude
FROM orders O
JOIN cart C ON C.cart_id = O.cart_id
JOIN restaurant R ON R.restaurant_id = C.restaurant_id
WHERE O.rider_username = %s AND O.status IN ('pending', 'delivering')
ORDER BY O.order_timestamp ASC
LIMIT 1;

--name:get_rider_available_orders
SELECT O.order_id, O.status, O.bill, O.order_timestamp::text AS order_timestamp,
			 R.restaurant_id, R.name AS restaurant_name,
			 ST_Y(R.location::geometry) AS restaurant_latitude,
			 ST_X(R.location::geometry) AS restaurant_longitude,
			 ST_Y(O.location::geometry) AS customer_latitude,
			 ST_X(O.location::geometry) AS customer_longitude,
			 U.name AS customer_name
FROM orders O
JOIN cart C ON C.cart_id = O.cart_id
JOIN restaurant R ON R.restaurant_id = C.restaurant_id
JOIN users U ON U.username = O.username
JOIN rider D ON D.username = %s
WHERE O.status = 'pending'
	AND O.rider_username IS NULL
	AND R.status = 'open'
	AND ST_DWithin(R.location, D.location, 8000)
	AND ST_DWithin(O.location, D.location, 10000)
	AND ST_DWithin(R.location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 4000)
ORDER BY O.order_timestamp ASC
LIMIT 100;

--name:accept_rider_order
UPDATE orders
SET rider_username = %s
WHERE order_id = %s AND status = 'pending' AND rider_username IS NULL
RETURNING order_id;

--name:mark_rider_picked_up
UPDATE orders
SET status = 'delivering'
WHERE order_id = %s AND rider_username = %s AND status = 'pending'
RETURNING order_id;

--name:settle_rider_delivery
WITH completed_order AS (
	UPDATE orders O
	SET status = 'delivered', final_timestamp = CURRENT_TIMESTAMP
	WHERE O.order_id = %s AND O.rider_username = %s AND O.status = 'delivering'
	RETURNING O.order_id, O.cart_id, O.delivery_fee, O.rider_username
), cash_due AS (
	SELECT CO.order_id, CO.rider_username, CO.delivery_fee,
		   COALESCE(SUM(round(round(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) * CI.quantity, 2)), 0) + CO.delivery_fee AS total_amount
	FROM completed_order CO
	JOIN cart_item CI ON CI.cart_id = CO.cart_id
	JOIN foods F ON F.food_id = CI.food_id
	GROUP BY CO.order_id, CO.rider_username, CO.delivery_fee
)
UPDATE rider R
SET due_amount = R.due_amount + D.total_amount,
	balance = R.balance + D.delivery_fee,
	status = 'online'
FROM cash_due D
WHERE R.username = D.rider_username AND R.status = 'delivering'
RETURNING D.order_id, D.total_amount, D.delivery_fee;

--name:get_rider_history
SELECT O.order_id, O.bill, O.order_timestamp::text AS order_timestamp,
			 O.final_timestamp::text AS final_timestamp,
			 R.restaurant_id, R.name AS restaurant_name
FROM orders O
JOIN cart C ON C.cart_id = O.cart_id
JOIN restaurant R ON R.restaurant_id = C.restaurant_id
WHERE O.rider_username = %s AND O.status = 'delivered'
ORDER BY O.final_timestamp DESC
LIMIT 100;