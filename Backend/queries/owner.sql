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
WHERE restaurant_id = %s AND owner_id = %s AND status <> 'pending';

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
             F.discount, F.description, F.subcategory
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
(food_id, restaurant_id, category, name, price, discount, description, subcategory)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s);

--name:delete_food_by_owner
DELETE FROM foods
WHERE food_id = %s
    AND restaurant_id = %s
    AND EXISTS (
            SELECT 1
            FROM restaurant R
            WHERE R.restaurant_id = %s AND R.owner_id = %s
    );
