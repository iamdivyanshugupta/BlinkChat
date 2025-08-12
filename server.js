const express = require('express');
const app = express();
const http = require('http').createServer(app);

// ✅ Add CORS support for Render (important for online access)
const io = require('socket.io')(http, {
  cors: {
    origin: "*", // you can replace "*" with your frontend URL for security
    methods: ["GET", "POST"]
  }
});

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// ✅ Use Render's PORT environment variable or fallback to 3000
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10; // Number of rounds for bcrypt hashing

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// SQLite Setup
const db = new sqlite3.Database('messages.db', (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to SQLite');
});

// Messages table
db.run(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT,
  recipient TEXT,
  msg TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// JSON File for Users
const USERS_FILE = path.join(__dirname, 'users.json');

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Signup
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password are required.' });

  const users = readUsers();
  const existing = users.find(u => u.username === username);
  if (existing) return res.status(409).json({ success: false, message: 'Username already exists.' });

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    users.push({ username, password: hashedPassword });
    writeUsers(users);
    res.json({ success: true, message: 'User registered successfully.' });
  } catch (err) {
    console.error('Bcrypt Hash Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error during signup.' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password are required.' });

  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

  try {
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      res.json({ success: true, message: 'Login successful.' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
  } catch (err) {
    console.error('Bcrypt Compare Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// Track connected users
const connectedUsers = new Map();

// Socket.io Chat Logic
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('user joined', (username) => {
    connectedUsers.set(socket.id, username);
    io.emit('user joined', username);
    io.emit('online users', Array.from(connectedUsers.values()));
  });

  socket.on('request chat history', ({ sender, recipient }) => {
    db.all(
      `SELECT sender, recipient, msg, timestamp FROM messages 
       WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?) 
       ORDER BY timestamp ASC LIMIT 50`,
      [sender, recipient, recipient, sender],
      (err, rows) => {
        if (err) {
          console.error('DB Query Error:', err.message);
          return;
        }
        socket.emit('chat history', rows);
      }
    );
  });

  socket.on('private message', ({ sender, recipient, msg }) => {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    const timestamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
    
    db.run(
      `INSERT INTO messages (sender, recipient, msg, timestamp) VALUES (?, ?, ?, ?)`,
      [sender, recipient, msg, timestamp],
      (err) => {
        if (err) {
          console.error('DB Insert Error:', err.message);
          return;
        }
        socket.emit('private message', { sender, recipient, msg, timestamp });
        const recipientSocketId = Array.from(connectedUsers).find(([id, name]) => name === recipient)?.[0];
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('private message', { sender, recipient, msg, timestamp });
        }
      }
    );
  });

  socket.on('typing', ({ sender, recipient }) => {
    const recipientSocketId = Array.from(connectedUsers).find(([id, name]) => name === recipient)?.[0];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('typing', { sender, recipient });
    }
  });

  socket.on('stop typing', ({ sender, recipient }) => {
    const recipientSocketId = Array.from(connectedUsers).find(([id, name]) => name === recipient)?.[0];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('stop typing', { sender, recipient });
    }
  });

  socket.on('manual logout', (username) => {
    const entry = Array.from(connectedUsers.entries()).find(([id, name]) => name === username);
    if (entry) {
      const [socketId] = entry;
      connectedUsers.delete(socketId);
      io.emit('user left', username);
      io.emit('online users', Array.from(connectedUsers.values()));
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    const username = connectedUsers.get(socket.id);
    if (username) {
      connectedUsers.delete(socket.id);
      io.emit('user left', username);
      io.emit('online users', Array.from(connectedUsers.values()));
    }
  });
});

// ✅ Start Server
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
