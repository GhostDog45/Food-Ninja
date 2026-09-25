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

COMMIT;