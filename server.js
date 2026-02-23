const express = require('express');
const app = express();
const http = require('http').createServer(app);
const jwt = require('jsonwebtoken'); // ✅ Import JWT

// ✅ Add CORS support for Render
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-this'; // ✅ Secret Key

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// SQLite Setup
const db = new sqlite3.Database('messages.db', (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to SQLite');
});

// ✅ Initialize Tables (Messages & Users)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    recipient TEXT,
    msg TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    read INTEGER DEFAULT 0
  )`);

  // Migration: add `read` column if it doesn't exist (for existing DBs)
  db.run(`ALTER TABLE messages ADD COLUMN read INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Migration error:', err.message);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
});

// ✅ Signup (SQLite)
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password are required.' });

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ success: false, message: 'Username already exists.' });
        }
        return res.status(500).json({ success: false, message: 'Database error.' });
      }
      // Issue token on signup
      const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '24h' });
      res.json({ success: true, message: 'User registered successfully.', token, username });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error during signup.' });
  }
});

// ✅ Login (SQLite + JWT)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password are required.' });

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      const token = jwt.sign({ username: user.username }, SECRET_KEY, { expiresIn: '24h' });
      res.json({ success: true, message: 'Login successful.', token, username: user.username });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
  });
});

// Track connected users
const connectedUsers = new Map();

// ✅ Socket Middleware for Auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return next(new Error('Authentication error'));
    socket.user = decoded; // Attach user info to socket
    next();
  });
});

// Socket.io Chat Logic
io.on('connection', (socket) => {
  const username = socket.user.username; // Trusted username from JWT
  console.log(`User connected: ${username} (${socket.id})`);

  // Auto-join logic
  connectedUsers.set(socket.id, username);
  io.emit('user joined', username);
  io.emit('online users', Array.from(connectedUsers.values()));

  socket.on('request chat history', ({ recipient }) => {
    const sender = socket.user.username;

    // Step 1: Mark all unread messages FROM recipient→sender as read
    db.run(
      `UPDATE messages SET read = 1 WHERE sender = ? AND recipient = ? AND read = 0`,
      [recipient, sender],
      function (err) {
        if (err) return console.error('DB Update Error:', err.message);

        // Notify sender that their messages were read (if any were updated)
        if (this.changes > 0) {
          const recipientSocketId = [...connectedUsers.entries()].find(([id, name]) => name === recipient)?.[0];
          if (recipientSocketId) {
            io.to(recipientSocketId).emit('messages read', { by: sender });
          }
        }

        // Step 2: Fetch history AFTER the update so read values are accurate
        db.all(
          `SELECT id, sender, recipient, msg, timestamp, read FROM messages
           WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)
           ORDER BY timestamp ASC LIMIT 50`,
          [sender, recipient, recipient, sender],
          (err2, rows) => {
            if (err2) return console.error('DB Query Error:', err2.message);
            socket.emit('chat history', rows);
          }
        );
      }
    );
  });

  // Dedicated event: recipient explicitly marks a message (or all) as read
  // Called when a real-time message arrives and the recipient is already viewing that chat
  socket.on('mark read', ({ from }) => {
    const reader = socket.user.username;
    db.run(
      `UPDATE messages SET read = 1 WHERE sender = ? AND recipient = ? AND read = 0`,
      [from, reader],
      function (err) {
        if (err) return console.error('DB Update Error (mark read):', err.message);
        if (this.changes > 0) {
          const senderSocketId = [...connectedUsers.entries()].find(([id, name]) => name === from)?.[0];
          if (senderSocketId) {
            io.to(senderSocketId).emit('messages read', { by: reader });
          }
        }
      }
    );
  });

  socket.on('private message', ({ recipient, msg }) => {
    const sender = socket.user.username; // Enforce sender identity
    const now = new Date();
    // UTC timestamp for consistency
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);

    db.run(
      `INSERT INTO messages (sender, recipient, msg, timestamp, read) VALUES (?, ?, ?, ?, 0)`,
      [sender, recipient, msg, timestamp],
      function (err) {
        if (err) return console.error('DB Insert Error:', err.message);

        const msgId = this.lastID; // Capture the new message's DB id

        // Check if recipient has this chat open (i.e. is online and viewing this sender)
        // We optimistically mark as sent=0 (unread); recipient opening chat triggers the read update
        socket.emit('private message', { id: msgId, sender, recipient, msg, timestamp, read: 0 });
        const recipientSocketId = [...connectedUsers.entries()].find(([id, name]) => name === recipient)?.[0];
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('private message', { id: msgId, sender, recipient, msg, timestamp, read: 0 });
        }
      }
    );
  });

  socket.on('typing', ({ recipient }) => {
    const sender = socket.user.username;
    const recipientSocketId = [...connectedUsers.entries()].find(([id, name]) => name === recipient)?.[0];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('typing', { sender, recipient });
    }
  });

  socket.on('stop typing', ({ recipient }) => {
    const sender = socket.user.username;
    const recipientSocketId = [...connectedUsers.entries()].find(([id, name]) => name === recipient)?.[0];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('stop typing', { sender, recipient });
    }
  });

  socket.on('manual logout', () => {
    // Just handle cleanup if needed, client does the rest
    disconnectUser(socket.id);
  });

  socket.on('disconnect', () => {
    disconnectUser(socket.id);
  });

  function disconnectUser(socketId) {
    const user = connectedUsers.get(socketId);
    if (user) {
      console.log(`User disconnected: ${user}`);
      connectedUsers.delete(socketId);
      io.emit('user left', user);
      io.emit('online users', Array.from(connectedUsers.values()));
    }
  }
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
