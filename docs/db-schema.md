# Схема бази даних — TaxiApp

## 1) ER-діаграма
- **Users** — пасажири
- **Drivers** — водії
- **Cars** — автомобілі водіїв
- **Tariffs** — тарифи
- **Rides** — поїздки/замовлення
- **Reviews** — відгуки

## 2) Реляційна схема (PK/FK)
- Users (PK: user_id)
- Drivers (PK: driver_id, FK: user_id → Users.user_id)
- Cars (PK: car_id, FK: driver_id → Drivers.driver_id)
- Tariffs (PK: tariff_id)
- Rides (PK: ride_id, FK: user_id → Users.user_id, FK: driver_id → Drivers.driver_id, FK: tariff_id → Tariffs.tariff_id)
- Reviews (PK: review_id, FK: ride_id → Rides.ride_id, FK: user_id → Users.user_id, FK: driver_id → Drivers.driver_id)

## 3) ER-діаграма

