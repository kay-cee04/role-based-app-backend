// ============================================================
//  FULL-STACK APP — server.js
//  Node.js + Express backend with JWT auth & role-based access
//  Guide 2: Migration Activity
// ============================================================

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your-very-secure-secret'; // Use environment variables in production!

// ─── MIDDLEWARE ─────────────────────────────────────────────
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://127.0.0.1:3000']
}));
app.use(express.json());

// ─── IN-MEMORY DATABASE ──────────────────────────────────────
// Replace with MySQL/MongoDB in production
let users = [
  { id: 1, username: 'admin', email: 'admin@example.com', password: '$2a$10$...', role: 'admin' },
  { id: 2, username: 'alice', email: 'alice@example.com', password: '$2a$10$...', role: 'user'  }
];

// Pre-hash passwords on startup
(async () => {
  if (!users[0].password.includes('$2a$')) {
    users[0].password = await bcrypt.hash('admin123', 10);
    users[1].password = await bcrypt.hash('user123',  10);
  } else {
    // Always re-hash for fresh demo (passwords are placeholders above)
    users[0].password = await bcrypt.hash('admin123', 10);
    users[1].password = await bcrypt.hash('user123',  10);
  }
  console.log('✅ Passwords hashed and ready.');
})();

// ─── MIDDLEWARE: Token Authentication ────────────────────────
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// ─── MIDDLEWARE: Role Authorization ──────────────────────────
function authorizeRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

// ============================================================
//  AUTH ROUTES
// ============================================================

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { username, email, password, role = 'user' } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  // Check for existing user
  const existing = users.find(u => u.username === username || u.email === email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already exists' });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: users.length + 1,
    username,
    email,
    password: hashedPassword,
    role: 'user' // Note: In real apps, role should NOT be set by the client!
  };

  users.push(newUser);
  res.status(201).json({ message: 'User registered successfully', username, role: newUser.role });
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Find user (allow login by username or email)
  const user = users.find(u => u.username === username || u.email === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate JWT token (expires in 1 hour)
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET_KEY,
    { expiresIn: '1h' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role }
  });
});

// ============================================================
//  PROTECTED ROUTES
// ============================================================

// GET /api/profile  — requires valid token
app.get('/api/profile', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

// GET /api/content/user  — any logged-in user
app.get('/api/content/user', authenticateToken, (req, res) => {
  res.json({ message: `Hello ${req.user.username}! Here is your user content.`, data: { tip: 'You are authenticated.' } });
});

// ============================================================
//  ADMIN-ONLY ROUTES
// ============================================================

// GET /api/admin/dashboard  — admin only
app.get('/api/admin/dashboard', authenticateToken, authorizeRole('admin'), (req, res) => {
  res.json({
    message: 'Welcome to the Admin Dashboard!',
    data: {
      totalUsers: users.length,
      users: users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role }))
    }
  });
});

// GET /api/admin/users  — list all users (admin only)
app.get('/api/admin/users', authenticateToken, authorizeRole('admin'), (req, res) => {
  const safeUsers = users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role }));
  res.json({ users: safeUsers });
});

// DELETE /api/admin/users/:id  — delete user (admin only)
app.delete('/api/admin/users/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  users.splice(idx, 1);
  res.json({ message: 'User deleted successfully' });
});

// ============================================================
//  PUBLIC ROUTES
// ============================================================

// GET /api/content/guest  — no auth needed
app.get('/api/content/guest', (req, res) => {
  res.json({ message: 'Public content for all visitors. No login required.' });
});

// GET /  — health check
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'Full-Stack App Backend is live!',
    endpoints: {
      public:    ['GET /api/content/guest'],
      auth:      ['POST /api/register', 'POST /api/login'],
      protected: ['GET /api/profile', 'GET /api/content/user'],
      admin:     ['GET /api/admin/dashboard', 'GET /api/admin/users', 'DELETE /api/admin/users/:id']
    }
  });
});

// ─── START SERVER ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Backend running on http://localhost:${PORT}`);
  console.log(`\n🔐 Try logging in with:`);
  console.log(`   - Admin:  username=admin, password=admin123`);
  console.log(`   - User:   username=alice, password=user123`);
  console.log(`\n📋 Available routes:`);
  console.log(`   POST   /api/register`);
  console.log(`   POST   /api/login`);
  console.log(`   GET    /api/profile          (token required)`);
  console.log(`   GET    /api/content/user     (token required)`);
  console.log(`   GET    /api/admin/dashboard  (admin only)`);
  console.log(`   GET    /api/admin/users      (admin only)`);
  console.log(`   DELETE /api/admin/users/:id  (admin only)\n`);
});