CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE food_category (
	category varchar(50) PRIMARY KEY,
	picture_url varchar(255)
);

CREATE TABLE admin (
	username varchar(50) PRIMARY KEY,
	email varchar(254) NOT NULL UNIQUE,
	phone varchar(20) NOT NULL UNIQUE,
	password_hash varchar(255) NOT NULL,
	status varchar(10) DEFAULT 'pending' CHECK (status IN ('pending', 'banned', 'approved'))
);

CREATE TABLE restaurant_owner (
	owner_id varchar(64) PRIMARY KEY,
	name varchar(100) NOT NULL,
	phone varchar(20) NOT NULL UNIQUE,
	email varchar(254) NOT NULL UNIQUE,
	nid varchar(50) NOT NULL UNIQUE,
	password_hash varchar(255) NOT NULL,
	status varchar(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'banned'))
);

CREATE TABLE users (
	username varchar(64) PRIMARY KEY,
	phone varchar(20) NOT NULL UNIQUE,
	email varchar(254) NOT NULL UNIQUE,
	pfp_url varchar(255),
	location geography(Point, 4326),
	name varchar(100) NOT NULL,
	password_hash varchar(255) NOT NULL,
	status varchar(10) DEFAULT 'ok' CHECK (status IN ('deleted', 'banned', 'ok')),
	reg_date timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE rider (
	username varchar(64) PRIMARY KEY,
	name varchar(100) NOT NULL,
	phone varchar(20) NOT NULL UNIQUE,
	email varchar(254) NOT NULL UNIQUE,
	password_hash varchar(255) NOT NULL,
	vehicle varchar(50) NOT NULL CHECK (vehicle IN ('bike', 'bicycle')),
	location geography(Point, 4326),
	balance numeric(10, 2) DEFAULT 0.00 NOT NULL,
	pfp_url varchar(255),
	status varchar(20) DEFAULT 'pending' CHECK (status IN ('pending', 'online', 'offline', 'banned', 'delivering')),
	reg_date timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE restaurant (
	restaurant_id varchar(64) PRIMARY KEY,
	owner_id varchar(64) NOT NULL REFERENCES restaurant_owner(owner_id) ON DELETE CASCADE,
	name varchar(100) NOT NULL,
	location geography(Point, 4326) NOT NULL,
	open_time time NOT NULL,
	close_time time NOT NULL,
	status varchar(20) DEFAULT 'closed' CHECK (status IN ('pending', 'open', 'closed', 'banned'))
);

CREATE TABLE foods (
	food_id varchar(64) PRIMARY KEY,
	restaurant_id varchar(64) NOT NULL REFERENCES restaurant(restaurant_id) ON DELETE CASCADE,
	category varchar(50) NOT NULL REFERENCES food_category(category) ON DELETE RESTRICT,
	name varchar(100) NOT NULL,
	price numeric(10, 2) NOT NULL CHECK (price >= 0),
	discount numeric(5, 2) DEFAULT 0.00 CHECK (discount >= 0 AND discount <= 100),
	description text,
	picture_url varchar(255),
	subcategory varchar(50)
);

CREATE TABLE cart (
	cart_id varchar(64) PRIMARY KEY,
	username varchar(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
	restaurant_id varchar(64) NOT NULL REFERENCES restaurant(restaurant_id) ON DELETE CASCADE,
	status varchar(20) DEFAULT 'pending' CHECK (status IN ('pending', 'unavailable', 'ordered'))
);

CREATE TABLE cart_item (
	cart_id varchar(64) REFERENCES cart(cart_id) ON DELETE CASCADE,
	food_id varchar(64) REFERENCES foods(food_id) ON DELETE CASCADE,
	quantity integer NOT NULL CHECK (quantity > 0),
	PRIMARY KEY (cart_id, food_id)
);

CREATE TABLE orders (
	order_id varchar(64) PRIMARY KEY,
	username varchar(64) NOT NULL REFERENCES users(username),
	cart_id varchar(64) NOT NULL UNIQUE REFERENCES cart(cart_id),
	rider_username varchar(64) REFERENCES rider(username),
	location geography(Point, 4326) NOT NULL,
	status varchar(30) DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'delivered', 'cancelled', 'rejected')),
	order_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	final_timestamp timestamp,
	bill text NOT NULL
);

CREATE TABLE payment (
	order_id varchar(64) PRIMARY KEY REFERENCES orders(order_id) ON DELETE CASCADE,
	username varchar(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
	transaction_id varchar(100) NOT NULL UNIQUE,
	payment_method varchar(50) NOT NULL DEFAULT 'Cash on delivery',
	status varchar(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
	timestamp timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE review (
	order_id varchar(64) PRIMARY KEY REFERENCES orders(order_id),
	rider_rating integer CHECK (rider_rating >= 1 AND rider_rating <= 5),
	rider_review text,
	restaurant_rating integer CHECK (restaurant_rating >= 1 AND restaurant_rating <= 5),
	restaurant_review text,
	timestamp timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);


CREATE TABLE revoked_tokens (
    jti UUID PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_revoked_tokens_expires_at
ON revoked_tokens(expires_at);

CREATE OR REPLACE FUNCTION remove_expired_revoked_tokens()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	DELETE FROM revoked_tokens
	WHERE expires_at <= CURRENT_TIMESTAMP;

	RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_revoked_tokens_before_insert
BEFORE INSERT ON revoked_tokens
FOR EACH ROW
EXECUTE FUNCTION remove_expired_revoked_tokens();
















ALTER TABLE restaurant
    DROP CONSTRAINT IF EXISTS restaurant_status_check;

ALTER TABLE restaurant
    ADD CONSTRAINT restaurant_status_check
    CHECK (status IN ('pending', 'open', 'closed', 'shutdown', 'banned'));

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_status_check;

UPDATE orders
SET status = 'pending'
WHERE status = 'preparing';

ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'delivering', 'delivered', 'cancelled', 'rejected'));

CREATE OR REPLACE FUNCTION handle_restaurant_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'shutdown' AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE orders O
        SET status = 'rejected',
            final_timestamp = CURRENT_TIMESTAMP
        FROM cart C
        WHERE O.cart_id = C.cart_id
          AND C.restaurant_id = NEW.restaurant_id
          AND O.status = 'pending';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurant_shutdown_rejects_pending_orders ON restaurant;

CREATE TRIGGER restaurant_shutdown_rejects_pending_orders
AFTER UPDATE OF status ON restaurant
FOR EACH ROW
EXECUTE FUNCTION handle_restaurant_status_change();

CREATE OR REPLACE FUNCTION normalize_legacy_order_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'preparing' THEN
        NEW.status := 'pending';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_legacy_order_status_before_insert ON orders;

CREATE TRIGGER normalize_legacy_order_status_before_insert
BEFORE INSERT OR UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION normalize_legacy_order_status();




ALTER TABLE orders
	ADD COLUMN IF NOT EXISTS delivery_fee numeric(10, 2) NOT NULL DEFAULT 50.00,
	ADD COLUMN IF NOT EXISTS food_preparing_notes text NOT NULL DEFAULT '',
	ADD COLUMN IF NOT EXISTS delivery_notes text NOT NULL DEFAULT '';

ALTER TABLE rider
	ADD COLUMN IF NOT EXISTS due_amount numeric(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE rider
	DROP CONSTRAINT IF EXISTS rider_due_amount_check;

ALTER TABLE rider
	ADD CONSTRAINT rider_due_amount_check CHECK (due_amount >= 0);

CREATE OR REPLACE FUNCTION refresh_order_bill(p_order_id varchar)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
	order_row record;
	item_lines text;
	raw_total numeric(10, 2);
	discounted_total numeric(10, 2);
	instructions text;
	bill_text text;
BEGIN
	SELECT O.order_id, O.username, O.order_timestamp, O.location, O.delivery_fee,
		   O.food_preparing_notes, O.delivery_notes, O.status,
		   RD.name AS rider_name, O.rider_username,
		   R.name AS restaurant_name
	INTO order_row
	FROM orders O
	JOIN cart C ON C.cart_id = O.cart_id
	JOIN restaurant R ON R.restaurant_id = C.restaurant_id
	LEFT JOIN rider RD ON RD.username = O.rider_username
	WHERE O.order_id = p_order_id;

	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	SELECT
		COALESCE(string_agg(
			F.name || ' x ' || CI.quantity::text || ' = ' ||
			trim_scale(round(round(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) * CI.quantity, 2))::text,
			E'\n' ORDER BY F.name ASC
		), ''),
		COALESCE(sum(F.price * CI.quantity), 0),
		COALESCE(sum(round(round(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) * CI.quantity, 2)), 0)
	INTO item_lines, raw_total, discounted_total
	FROM cart_item CI
	JOIN foods F ON F.food_id = CI.food_id
	WHERE CI.cart_id = (SELECT cart_id FROM orders WHERE order_id = p_order_id);

	instructions := concat_ws(' | ',
		NULLIF('Food prep: ' || order_row.food_preparing_notes, 'Food prep: '),
		NULLIF('Delivery: ' || order_row.delivery_notes, 'Delivery: ')
	);
	IF instructions = '' THEN
		instructions := 'None';
	END IF;

	bill_text :=
		'Order id: ' || order_row.order_id || E'\n' ||
		'Restaurant name: ' || order_row.restaurant_name || E'\n' ||
		'Ordered by: ' || order_row.username || E'\n' ||
		'Timestamp: ' || to_char(order_row.order_timestamp, 'YYYY-MM-DD HH12:MI AM') || E'\n' ||
		'Location: ' || to_char(ST_Y(order_row.location::geometry), 'FM990.0000') || '° N, ' ||
			to_char(ST_X(order_row.location::geometry), 'FM990.0000') || '° E' || E'\n' ||
		'Delivered by: ' || CASE WHEN order_row.status = 'delivered'
			THEN COALESCE(order_row.rider_name, order_row.rider_username, 'Unknown rider')
			ELSE 'Pending Assignment' END || E'\n\n' ||
		item_lines || E'\n\n' ||
		'Instructions: ' || instructions || E'\n\n' ||
		'Total = ' || trim_scale(round(raw_total, 2))::text || E'\n' ||
		'Discount = ' || trim_scale(round(raw_total - discounted_total, 2))::text || E'\n' ||
		'Delivery fee = ' || trim_scale(round(order_row.delivery_fee, 2))::text || E'\n\n' ||
		'Sum total = ' || trim_scale(round(discounted_total + order_row.delivery_fee, 2))::text;

	UPDATE orders SET bill = bill_text WHERE order_id = p_order_id;
	RETURN bill_text;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_order_bill_after_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		PERFORM refresh_order_bill(NEW.order_id);
	ELSIF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM NEW.status THEN
		UPDATE orders
		SET bill = regexp_replace(
			NEW.bill,
			'Delivered by:.*',
			'Delivered by: ' || COALESCE(
				(SELECT name FROM rider WHERE username = NEW.rider_username),
				NEW.rider_username,
				'Unknown rider'
			)
		)
		WHERE order_id = NEW.order_id;
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_order_bill_on_order_change ON orders;

CREATE TRIGGER refresh_order_bill_on_order_change
AFTER INSERT OR UPDATE OF status
ON orders
FOR EACH ROW
EXECUTE FUNCTION refresh_order_bill_after_change();

CREATE OR REPLACE FUNCTION ban_restaurants_with_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.status = 'banned' AND OLD.status IS DISTINCT FROM NEW.status THEN
		UPDATE restaurant
		SET status = 'banned'
		WHERE owner_id = NEW.owner_id
		  AND status IS DISTINCT FROM 'banned';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ban_restaurants_after_owner_ban ON restaurant_owner;

CREATE TRIGGER ban_restaurants_after_owner_ban
AFTER UPDATE OF status ON restaurant_owner
FOR EACH ROW
EXECUTE FUNCTION ban_restaurants_with_owner();

CREATE TABLE IF NOT EXISTS email_verification (
	email VARCHAR(255) PRIMARY KEY,
	code VARCHAR(6) NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION cleanup_expired_email_verifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	DELETE FROM email_verification
	WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes';
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_expired_email_verifications_after_write ON email_verification;

CREATE TRIGGER cleanup_expired_email_verifications_after_write
AFTER INSERT OR UPDATE ON email_verification
FOR EACH ROW
EXECUTE FUNCTION cleanup_expired_email_verifications();

DROP PROCEDURE IF EXISTS settle_rider_delivery_procedure;

CREATE OR REPLACE PROCEDURE settle_rider_delivery_procedure(
    IN p_order_id varchar,
    IN p_rider_username varchar,
    INOUT delivery_fee numeric DEFAULT NULL,
    INOUT total_amount numeric DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cart_id varchar(64);
    v_delivery_fee numeric(10, 2);
    v_food_total numeric(10, 2);
BEGIN
    UPDATE orders
    SET status = 'delivered',
        final_timestamp = CURRENT_TIMESTAMP
    WHERE order_id = p_order_id
      AND rider_username = p_rider_username
      AND status = 'delivering'
    RETURNING cart_id, orders.delivery_fee INTO v_cart_id, v_delivery_fee;

    IF NOT FOUND THEN
        delivery_fee := NULL;
        total_amount := NULL;
        RETURN;
    END IF;

    SELECT COALESCE(SUM(ROUND(ROUND(F.price * (1 - COALESCE(F.discount, 0) / 100.0), 2) * CI.quantity, 2)), 0)
    INTO v_food_total
    FROM cart_item CI
    JOIN foods F ON F.food_id = CI.food_id
    WHERE CI.cart_id = v_cart_id;

    delivery_fee := v_delivery_fee;
    total_amount := v_food_total + v_delivery_fee;

    UPDATE rider
    SET due_amount = due_amount + total_amount,
        balance = balance + delivery_fee,
        status = 'online'
    WHERE username = p_rider_username
      AND status = 'delivering';
END;
$$;


