const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const PORT = 3000;
const HOST = '0.0.0.0';
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
    // Hash the password
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
    // Compare provided password with stored hash
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
const connectedUsers = new Map(); // Map to store socket IDs and usernames

// Socket.io Chat Logic
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // User joined
  socket.on('user joined', (username) => {
    connectedUsers.set(socket.id, username); // Add user to connected users
    io.emit('user joined', username);
    io.emit('online users', Array.from(connectedUsers.values())); // Broadcast online users
  });

  // Send chat history for a specific user pair
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

  // New private message
  socket.on('private message', ({ sender, recipient, msg }) => {
    // Generate UTC timestamp (yyyy-MM-dd HH:mm:ss)
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
        // Emit to sender
        socket.emit('private message', { sender, recipient, msg, timestamp });
        // Emit to recipient if online
        const recipientSocketId = Array.from(connectedUsers).find(([id, name]) => name === recipient)?.[0];
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('private message', { sender, recipient, msg, timestamp });
        }
      }
    );
  });

  // Typing
  socket.on('typing', ({ sender, recipient }) => {
    const recipientSocketId = Array.from(connectedUsers).find(([id, name]) => name === recipient)?.[0];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('typing', { sender, recipient });
    }
  });

  // Stop Typing
  socket.on('stop typing', ({ sender, recipient }) => {
    const recipientSocketId = Array.from(connectedUsers).find(([id, name]) => name === recipient)?.[0];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('stop typing', { sender, recipient });
    }
  });

  socket.on('manual logout', (username) => {
  // Find the socket ID for the username
  const entry = Array.from(connectedUsers.entries()).find(([id, name]) => name === username);
  if (entry) {
    const [socketId] = entry;
    connectedUsers.delete(socketId);
    io.emit('user left', username);
    io.emit('online users', Array.from(connectedUsers.values()));
  }
});


  // Disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    const username = connectedUsers.get(socket.id);
    if (username) {
      connectedUsers.delete(socket.id); // Remove user from connected users
      io.emit('user left', username); // Notify others
      io.emit('online users', Array.from(connectedUsers.values())); // Broadcast online users
    }
  });
});

// Start Server
http.listen(PORT, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});