const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const app = express();
app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

app.post('/api/register', async (req, res) => {
  const { firstname, lastname, email, username, password } = req.body;
  try {
    const [existingUsers] = await db.promise().query(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (existingUsers.length > 0) return res.status(400).json({ message: 'Sähköposti tai käyttäjänimi on jo käytössä' });
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    await db.promise().query(
      'INSERT INTO users (firstname, lastname, email, username, password) VALUES (?, ?, ?, ?, ?)',
      [firstname, lastname, email, username, hashedPassword]
    );
    res.status(201).json({ message: 'Käyttäjä luotu onnistuneesti!' });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(400).json({ message: 'Väärä sähköposti tai salasana' });
    
    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Väärä sähköposti tai salasana' });
    
    res.json({ 
      message: 'Kirjautuminen onnistui!',
      user: { id: user.id, firstname: user.firstname, lastname: user.lastname, username: user.username, email: user.email, is_admin: user.is_admin }
    });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const [products] = await db.promise().query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe' });
  }
});

app.get('/api/products/user/:userId', async (req, res) => {
  try {
    const [products] = await db.promise().query('SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC', [req.params.userId]);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe' });
  }
});

app.post('/api/products', upload.array('images', 5), async (req, res) => {
  const { title, category, description, location, condition, status, price, contact_phone, user_id } = req.body;

  const imageUrls = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

  try {
    await db.promise().query(
      `INSERT INTO products 
      (title, category, description, location, item_condition, status, price, contact_phone, user_id, images) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, category, description, location, condition, status, price || null, contact_phone, user_id, JSON.stringify(imageUrls)]
    );

    res.status(201).json({ message: 'Ilmoitus julkaistu onnistuneesti!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Palvelinvirhe' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await db.promise().query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Ilmoitus poistettu' });
  } catch (error) {
    res.status(500).json({ message: 'Virhe poistettaessa' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { title, description, price, location, category, status, item_condition } = req.body;
  try {
    await db.promise().query(
      'UPDATE products SET title=?, description=?, price=?, location=?, category=?, status=?, item_condition=? WHERE id=?',
      [title, description, price, location, category, status, item_condition, req.params.id]
    );
    res.json({ message: 'Päivitetty onnistuneesti' });
  } catch (error) {
    res.status(500).json({ message: 'Päivitysvirhe' });
  }
});

app.post('/api/users/avatar/:userId', upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Ei tiedostoa' });
  
  const avatarUrl = `/uploads/${req.file.filename}`;
  try {
    await db.promise().query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.params.userId]);
    res.json({ avatarUrl });
  } catch (error) {
    res.status(500).json({ message: 'Päivitysvirhe' });
  }
});

app.post('/api/favorites/toggle', async (req, res) => {
  const { userId, productId } = req.body;
  try {
    const [existing] = await db.promise().query(
      'SELECT * FROM favorites WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );

    if (existing.length > 0) {
      await db.promise().query('DELETE FROM favorites WHERE user_id = ? AND product_id = ?', [userId, productId]);
      res.json({ isFavorite: false });
    } else {
      await db.promise().query('INSERT INTO favorites (user_id, product_id) VALUES (?, ?)', [userId, productId]);
      res.json({ isFavorite: true });
    }
  } catch (error) {
    res.status(500).json({ message: 'Virhe suosikeissa' });
  }
});

app.get('/api/favorites/:userId', async (req, res) => {
  try {
    const [favorites] = await db.promise().query(
      `SELECT p.* FROM products p 
       JOIN favorites f ON p.id = f.product_id 
       WHERE f.user_id = ?`,
      [req.params.userId]
    );
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ message: 'Virhe haettaessa suosikkeja' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const [users] = await db.promise().query(
      'SELECT id, firstname, lastname, username, email, is_admin, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
});

// Admin käsky käyttäjien poistamiseen
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    await db.promise().query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
});

app.put('/api/admin/users/:id/master', async (req, res) => {
  const { is_master } = req.body;
  try {
    await db.promise().query('UPDATE users SET is_master = ? WHERE id = ?', [is_master, req.params.id]);
    res.json({ message: 'Rooli päivitetty' });
  } catch (error) {
    res.status(500).json({ message: 'Virhe roolin päivityksessä' });
  }
});

app.put('/api/admin/products/:id', async (req, res) => {
  const { title } = req.body;
  try {
    await db.promise().query('UPDATE products SET title = ? WHERE id = ?', [title, req.params.id]);
    res.json({ message: 'Otsikko päivitetty' });
  } catch (error) {
    res.status(500).json({ message: 'Virhe muokkauksessa' });
  }
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
