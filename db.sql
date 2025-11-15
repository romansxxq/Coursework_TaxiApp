-- Користувачі (пасажири)
CREATE TABLE IF NOT EXISTS users (
 id_user SERIAL PRIMARY KEY,
 full_name VARCHAR(100) NOT NULL,
 email VARCHAR(100) UNIQUE NOT NULL,
 phone VARCHAR(20) UNIQUE NOT NULL,
 password VARCHAR(255) NOT NULL,
 registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Водії
CREATE TABLE IF NOT EXISTS drivers (
 id_driver SERIAL PRIMARY KEY,
 full_name VARCHAR(100) NOT NULL,
 phone VARCHAR(20) UNIQUE NOT NULL,
 email VARCHAR(100) UNIQUE NOT NULL,
 password VARCHAR(255) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK (status IN ('active','inactive','busy')),
 driver_rating DECIMAL(3,2) DEFAULT 0
);

-- Автомобілі
CREATE TABLE IF NOT EXISTS cars (
 id_car SERIAL PRIMARY KEY,
 driver_id INT UNIQUE REFERENCES drivers(id_driver) ON DELETE CASCADE,
 brand VARCHAR(50) NOT NULL,
 model VARCHAR(50) NOT NULL,
 plate_number VARCHAR(20) UNIQUE NOT NULL,
 year INT CHECK (year > 1990)
);

-- Тарифи
CREATE TABLE IF NOT EXISTS tariffs (
 id_tariff SERIAL PRIMARY KEY,
 name VARCHAR(50) NOT NULL,
 base_price DECIMAL(10,2) NOT NULL,
 price_per_km DECIMAL(10,2) NOT NULL,
 price_per_minute DECIMAL(10,2) NOT NULL
);

-- Поїздки (замовлення)
CREATE TABLE IF NOT EXISTS rides (
 id_ride SERIAL PRIMARY KEY,
 user_id INT REFERENCES users(id_user) ON DELETE SET NULL,
 driver_id INT REFERENCES drivers(id_driver),
 tariff_id INT REFERENCES tariffs(id_tariff) ON DELETE RESTRICT,
 pickup_address VARCHAR(255) NOT NULL,
 destination_address VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 completed_at TIMESTAMP,
 distance_km DECIMAL(10,2),
 duration_min DECIMAL(10,2),
 status VARCHAR(20) NOT NULL CHECK (status IN ('new','accepted','on_way','completed','cancelled')),
 total_cost DECIMAL(10,2)
);

-- Відгуки
CREATE TABLE IF NOT EXISTS reviews (
 id_review SERIAL PRIMARY KEY,
 user_id INT REFERENCES users(id_user),
 driver_id INT REFERENCES drivers(id_driver),
 ride_id INT UNIQUE REFERENCES rides(id_ride),
 rating INT CHECK (rating BETWEEN 1 AND 5),
 comment VARCHAR(500),
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Тарифи (демо)
INSERT INTO tariffs (name, base_price, price_per_km, price_per_minute)
VALUES
('Економ', 40, 10, 2),
('Стандарт', 50, 12, 2.5),
('Комфорт', 70, 15, 3)
ON CONFLICT DO NOTHING;

-- 10 тестових водіїв
INSERT INTO drivers (full_name, phone, email, password, status, driver_rating) VALUES
('Іван Петренко',      '+380501111111', 'driver1@example.com',  '12345', 'active', 4.50),
('Олег Сидоренко',     '+380502222222', 'driver2@example.com',  '12345', 'active', 4.80),
('Марко Коваленко',    '+380503333333', 'driver3@example.com',  '12345', 'active', 4.20),
('Андрій Шевчук',      '+380504444444', 'driver4@example.com',  '12345', 'active', 4.60),
('Богдан Степанюк',    '+380505555555', 'driver5@example.com',  '12345', 'active', 4.10),
('Дмитро Гнатюк',      '+380506666666', 'driver6@example.com',  '12345', 'active', 4.90),
('Роман Лисенко',      '+380507777777', 'driver7@example.com',  '12345', 'active', 4.30),
('Володимир Мельник',  '+380508888888', 'driver8@example.com',  '12345', 'active', 4.70),
('Сергій Черненко',    '+380509999999', 'driver9@example.com',  '12345', 'active', 4.40),
('Юрій Бондар',        '+380501234567', 'driver10@example.com', '12345', 'active', 4.55)
ON CONFLICT DO NOTHING;
