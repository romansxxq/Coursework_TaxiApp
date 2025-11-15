const express = require('express');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Лог конфігурації для перевірки .env
console.log('DB CONFIG:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER
});

// ---------- ПІДКЛЮЧЕННЯ ДО БД ----------
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// ---------- MIDDLEWARE ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false
  })
);

// робимо поточного користувача/водія доступним у всіх шаблонах
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentDriver = req.session.driver || null;
  next();
});

// захист маршрутів
function requireUser(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireDriver(req, res, next) {
  if (!req.session.driver) return res.redirect('/driver/login');
  next();
}

// ---------- VIEW ENGINE ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- ГОЛОВНА ----------
app.get('/', (req, res) => {
  res.render('index');
});

// ======================================================
//                    ПАСАЖИР
// ======================================================

// реєстрація пасажира
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const { full_name, email, phone, password } = req.body;

  try {
    const check = await pool.query(
      'SELECT 1 FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (check.rows.length > 0) {
      return res.render('register', {
        error: 'Email або телефон уже використовується.'
      });
    }

    await pool.query(
      `INSERT INTO users (full_name, email, phone, password)
       VALUES ($1, $2, $3, $4)`,
      [full_name, email, phone, password]
    );

    res.redirect('/login');
  } catch (err) {
    console.error('Register error:', err);
    res.render('register', { error: 'Помилка реєстрації.' });
  }
});

// вхід пасажира
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND password = $2',
      [email, password]
    );

    if (result.rows.length === 0) {
      return res.render('login', { error: 'Невірний email або пароль.' });
    }

    req.session.user = result.rows[0];
    res.redirect('/profile');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'Помилка входу.' });
  }
});

// профіль пасажира
app.get('/profile', requireUser, (req, res) => {
  res.render('profile', { user: req.session.user });
});

// історія поїздок пасажира
app.get('/rides', requireUser, async (req, res) => {
  const userId = req.session.user.id_user;

  try {
    const result = await pool.query(
      `
      SELECT 
        r.id_ride,
        r.pickup_address,
        r.destination_address,
        r.status,
        r.total_cost,
        TO_CHAR(r.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
        t.name AS tariff_name,
        d.full_name AS driver_name,
        c.brand,
        c.model,
        c.plate_number,
        rev.id_review IS NOT NULL AS has_review,
        rev.rating,
        rev.comment
      FROM rides r
      LEFT JOIN tariffs t ON r.tariff_id = t.id_tariff
      LEFT JOIN drivers d ON r.driver_id = d.id_driver
      LEFT JOIN cars c ON c.driver_id = d.id_driver
      LEFT JOIN reviews rev ON rev.ride_id = r.id_ride
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      `,
      [userId]
    );

    res.render('rides', { rides: result.rows });
  } catch (err) {
    console.error('Rides list error:', err);
    res.status(500).send('Помилка завантаження поїздок.');
  }
});

// список відгуків для водія
app.get('/driver/reviews', requireDriver, async (req, res) => {
  const driverId = req.session.driver.id_driver;

  try {
    const result = await pool.query(
      `
      SELECT
        rev.id_review,
        rev.rating,
        rev.comment,
        TO_CHAR(rev.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
        u.full_name AS user_name,
        r.id_ride,
        TO_CHAR(r.created_at, 'YYYY-MM-DD HH24:MI') AS ride_created_at
      FROM reviews rev
      LEFT JOIN users u ON rev.user_id = u.id_user
      LEFT JOIN rides r ON rev.ride_id = r.id_ride
      WHERE rev.driver_id = $1
      ORDER BY rev.created_at DESC
      `,
      [driverId]
    );

    res.render('driver-reviews', {
      driver: req.session.driver,
      reviews: result.rows
    });
  } catch (err) {
    console.error('Driver reviews error:', err);
    res.status(500).send('Помилка завантаження відгуків.');
  }
});

// форма створення поїздки
app.get('/rides/new', requireUser, async (req, res) => {
  try {
    const tariffsRes = await pool.query(
      'SELECT id_tariff, name FROM tariffs ORDER BY id_tariff'
    );

    res.render('newRide', {
      tariffs: tariffsRes.rows,
      error: null
    });
  } catch (err) {
    console.error('New ride form error:', err);
    res.status(500).send('Помилка завантаження форми замовлення.');
  }
});

// створення поїздки
app.post('/rides/new', requireUser, async (req, res) => {
  const userId = req.session.user.id_user;
  const {
    pickup_address,
    destination_address,
    tariff_id,
    distance_km,
    duration_min
  } = req.body;

  if (!pickup_address || !destination_address || !tariff_id) {
    return res.status(400).send('Не всі обовʼязкові поля заповнені.');
  }

  try {
    const tariffRes = await pool.query(
      'SELECT base_price, price_per_km, price_per_minute FROM tariffs WHERE id_tariff = $1',
      [tariff_id]
    );
    if (tariffRes.rows.length === 0) {
      return res.status(400).send('Обраний тариф не знайдено.');
    }

    const tariff = tariffRes.rows[0];
    const dist = parseFloat(distance_km) || 0;
    const dur = parseFloat(duration_min) || 0;

    const totalCost =
      Number(tariff.base_price) +
      dist * Number(tariff.price_per_km) +
      dur * Number(tariff.price_per_minute);

    await pool.query(
      `
      INSERT INTO rides
        (user_id, tariff_id, pickup_address, destination_address,
         distance_km, duration_min, status, total_cost)
      VALUES
        ($1, $2, $3, $4, $5, $6, 'new', $7)
      `,
      [userId, tariff_id, pickup_address, destination_address, dist || null, dur || null, totalCost]
    );

    res.redirect('/rides');
  } catch (err) {
    console.error('Create ride error:', err);
    res.status(500).send('Помилка створення поїздки.');
  }
});

// форма відгуку на поїздку
app.get('/rides/:id/review', requireUser, async (req, res) => {
  const rideId = req.params.id;
  const userId = req.session.user.id_user;

  try {
    const rideRes = await pool.query(
      `
      SELECT r.*, d.full_name AS driver_name
      FROM rides r
      LEFT JOIN drivers d ON r.driver_id = d.id_driver
      WHERE r.id_ride = $1 AND r.user_id = $2 AND r.status = 'completed'
      `,
      [rideId, userId]
    );

    if (rideRes.rows.length === 0) {
      return res.status(400).send('Цю поїздку оцінити не можна.');
    }

    res.render('review', { ride: rideRes.rows[0], error: null });
  } catch (err) {
    console.error('Review form error:', err);
    res.status(500).send('Помилка завантаження форми відгуку.');
  }
});

// збереження відгуку
app.post('/rides/:id/review', requireUser, async (req, res) => {
  const rideId = req.params.id;
  const userId = req.session.user.id_user;
  const { rating, comment } = req.body;

  try {
    // перевірка, що поїздка належить користувачу і завершена
    const rideRes = await pool.query(
      'SELECT * FROM rides WHERE id_ride = $1 AND user_id = $2 AND status = \'completed\'',
      [rideId, userId]
    );

    if (rideRes.rows.length === 0) {
      return res.status(400).send('Неможливо залишити відгук для цієї поїздки.');
    }

    const ride = rideRes.rows[0];

    // вставка відгуку
    await pool.query(
      `
      INSERT INTO reviews (ride_id, user_id, driver_id, rating, comment)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [rideId, userId, ride.driver_id, rating, comment]
    );

    // оновлення середнього рейтингу водія
    await pool.query(
      `
      UPDATE drivers
      SET driver_rating = (
        SELECT AVG(rating)::DECIMAL(3,2)
        FROM reviews
        WHERE driver_id = $1
      )
      WHERE id_driver = $1
      `,
      [ride.driver_id]
    );

    res.redirect('/rides');
  } catch (err) {
    console.error('Save review error:', err);
    res.status(500).send('Помилка збереження відгуку.');
  }
});

// вихід пасажира
app.get('/logout-user', (req, res) => {
  req.session.user = null;
  res.redirect('/');
});

// ======================================================
//                    ВОДІЙ
// ======================================================

// реєстрація водія
app.get('/driver/register', (req, res) => {
  res.render('driver-register', { error: null });
});

app.post('/driver/register', async (req, res) => {
  const {
    full_name,
    phone,
    email,
    password,
    brand,
    model,
    plate_number,
    year
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // перевірка унікальності email/телефону
    const check = await client.query(
      'SELECT 1 FROM drivers WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (check.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.render('driver-register', { error: 'Такий email або телефон уже використовується' });
    }

    // створення водія
    const driverRes = await client.query(
      `INSERT INTO drivers (full_name, phone, email, password, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id_driver`,
      [full_name, phone, email, password]
    );

    const driverId = driverRes.rows[0].id_driver;

    // створення авто для водія
    await client.query(
      `INSERT INTO cars (driver_id, brand, model, plate_number, year)
       VALUES ($1, $2, $3, $4, $5)`,
      [driverId, brand, model, plate_number, year]
    );

    await client.query('COMMIT');

    res.redirect('/driver/login');
  } catch (err) {
    console.error('Driver register error:', err);
    await client.query('ROLLBACK');
    res.render('driver-register', { error: 'Помилка при реєстрації водія' });
  } finally {
    client.release();
  }
});

// вхід водія
app.get('/driver/login', (req, res) => {
  res.render('driver-login', { error: null });
});

app.post('/driver/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM drivers WHERE email = $1 AND password = $2',
      [email, password]
    );

    if (result.rows.length === 0) {
      return res.render('driver-login', { error: 'Невірний email або пароль.' });
    }

    req.session.driver = result.rows[0];
    res.redirect('/driver/dashboard');
  } catch (err) {
    console.error('Driver login error:', err);
    res.render('driver-login', { error: 'Помилка входу водія.' });
  }
});

// кабінет водія
app.get('/driver/dashboard', async (req, res) => {
  if (!req.session.driver) {
    return res.redirect('/driver/login');
  }

  const driverId = req.session.driver.id_driver;

  try {
    const result = await pool.query(
      `SELECT d.*,
              c.brand,
              c.model,
              c.plate_number,
              c.year
       FROM drivers d
       LEFT JOIN cars c ON c.driver_id = d.id_driver
       WHERE d.id_driver = $1`,
      [driverId]
    );

    const driver = result.rows[0];

    res.render('driver-dashboard', { driver });
  } catch (err) {
    console.error('Driver dashboard error:', err);
    res.send('Помилка завантаження кабінету водія');
  }
});


// таблиця доступних замовлень
app.get('/driver/orders', requireDriver, async (req, res) => {
  const driverId = req.session.driver.id_driver;

  try {
    const result = await pool.query(
      `
      SELECT 
        r.id_ride,
        r.pickup_address,
        r.destination_address,
        r.status,
        r.total_cost,
        TO_CHAR(r.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
        u.full_name AS user_name,
        t.name AS tariff_name
      FROM rides r
      LEFT JOIN users u ON r.user_id = u.id_user
      LEFT JOIN tariffs t ON r.tariff_id = t.id_tariff
      WHERE r.status = 'new'
         OR (r.driver_id = $1 AND r.status IN ('accepted','on_way'))
      ORDER BY r.created_at ASC
      `,
      [driverId]
    );

    res.render('driver-orders', {
      driver: req.session.driver,
      orders: result.rows
    });
  } catch (err) {
    console.error('Driver orders error:', err);
    res.status(500).send('Помилка завантаження замовлень.');
  }
});


// водій приймає замовлення (new -> accepted)
app.post('/driver/orders/:id/accept', requireDriver, async (req, res) => {
  const driverId = req.session.driver.id_driver;
  const rideId = req.params.id;

  try {
    await pool.query(
      `
      UPDATE rides
      SET driver_id = $1, status = 'accepted'
      WHERE id_ride = $2 AND status = 'new'
      `,
      [driverId, rideId]
    );

    res.redirect('/driver/orders');
  } catch (err) {
    console.error('Accept order error:', err);
    res.status(500).send('Помилка прийняття замовлення.');
  }
});

// водій позначає "у дорозі" (accepted -> on_way)
app.post('/driver/orders/:id/on_way', requireDriver, async (req, res) => {
  const driverId = req.session.driver.id_driver;
  const rideId = req.params.id;

  try {
    await pool.query(
      `
      UPDATE rides
      SET status = 'on_way'
      WHERE id_ride = $1 AND driver_id = $2 AND status = 'accepted'
      `,
      [rideId, driverId]
    );

    res.redirect('/driver/orders');
  } catch (err) {
    console.error('On way error:', err);
    res.status(500).send('Помилка зміни статусу поїздки.');
  }
});

// водій завершує поїздку (on_way -> completed)
app.post('/driver/orders/:id/complete', requireDriver, async (req, res) => {
  const driverId = req.session.driver.id_driver;
  const rideId = req.params.id;

  try {
    await pool.query(
      `
      UPDATE rides
      SET status = 'completed', completed_at = NOW()
      WHERE id_ride = $1 AND driver_id = $2 AND status IN ('accepted','on_way')
      `,
      [rideId, driverId]
    );

    res.redirect('/driver/orders');
  } catch (err) {
    console.error('Complete order error:', err);
    res.status(500).send('Помилка завершення поїздки.');
  }
});

// вихід водія
app.get('/driver/logout', (req, res) => {
  req.session.driver = null;
  res.redirect('/driver/login');
});

// ---------- ТЕСТ БД ----------
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tariffs');
    res.json(result.rows);
  } catch (err) {
    console.error('DB error in /test-db:', err);
    res.status(500).send('DB error: ' + err);
  }
});

// ---------- ЗАПУСК ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
