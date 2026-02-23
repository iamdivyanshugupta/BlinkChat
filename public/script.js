// Initialize socket but don't connect yet
const socket = io({ autoConnect: false });

let username = '';
let selectedRecipient = null;
let unreadMessages = new Map();
let lastMessageDate = null;

// === Helper: Escape HTML to prevent XSS ===
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// === Helper: Render tick mark based on read status ===
// read=0 → single ✓ (sent), read=1 → double ✓✓ (read)
function renderTick(read) {
  if (read === 1) {
    return `<span class="tick tick-read" title="Read">✓✓</span>`;
  }
  return `<span class="tick tick-sent" title="Sent">✓</span>`;
}

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const usernameInput = document.getElementById('auth-username');
const passwordInput = document.getElementById('auth-password');
const usernameInputSignup = document.getElementById('auth-username-signup');
const passwordInputSignup = document.getElementById('auth-password-signup');
const authSection = document.getElementById('auth-section');
const chatContainer = document.getElementById('chat-container');
const messages = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const errorDisplay = document.getElementById('auth-error');
const errorDisplaySignup = document.getElementById('auth-error-signup');
const onlineUsersList = document.getElementById('online-users-list');
const recipientInput = document.getElementById('recipient');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');
const logoutBtn = document.getElementById('logout-btn');
// Mobile Sidebar Elements
const sidebarToggle = document.getElementById('sidebar-toggle');
const onlineUsersBox = document.querySelector('.online-users-box');
const sidebarOverlay = document.getElementById('sidebar-overlay');

let typing = false;
let timeout = null;

// Toggle Sidebar
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    onlineUsersBox.classList.toggle('active');
    if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
  });
}

// Close Sidebar when clicking overlay
if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', () => {
    onlineUsersBox.classList.remove('active');
    sidebarOverlay.classList.remove('active');
  });
}

// Close sidebar logic for "click outside" using document listener removed 
// in favor of dedicated overlay which implies "outside" area.

showSignupLink.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.style.display = 'none';
  signupForm.style.display = 'block';
  errorDisplay.textContent = '';
  usernameInput.value = '';
  passwordInput.value = '';
});

showLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  signupForm.style.display = 'none';
  loginForm.style.display = 'block';
  errorDisplaySignup.textContent = '';
  usernameInputSignup.value = '';
  passwordInputSignup.value = '';
});

// === LOGIN ===
loginBtn.addEventListener('click', async () => {
  const value = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!value || !password) {
    errorDisplay.textContent = 'Username and password are required';
    return;
  }

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: value, password })
    });

    const data = await res.json();
    if (data.success) {
      localStorage.setItem('token', data.token); // ✅ Save Token
      localStorage.setItem('username', data.username);
      startChat(data.username, data.token);
    } else {
      errorDisplay.textContent = data.message || 'Login failed';
    }
  } catch (err) {
    console.error(err);
    errorDisplay.textContent = 'Server error';
  }
});

// === SIGNUP ===
signupBtn.addEventListener('click', async () => {
  const value = usernameInputSignup.value.trim();
  const password = passwordInputSignup.value.trim();

  if (!value || !password) {
    errorDisplaySignup.textContent = 'Username and password are required';
    return;
  }

  try {
    const res = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: value, password })
    });

    const data = await res.json();
    if (data.success) {
      localStorage.setItem('token', data.token); // ✅ Save Token
      localStorage.setItem('username', data.username);
      startChat(data.username, data.token);
    } else {
      errorDisplaySignup.textContent = data.message || 'Signup failed';
    }
  } catch (err) {
    console.error(err);
    errorDisplaySignup.textContent = 'Server error';
  }
});

// === AUTO LOGIN on Refresh ===
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('username');
  const savedToken = localStorage.getItem('token');
  if (savedUser && savedToken) {
    startChat(savedUser, savedToken);
  }
});

// === LOGOUT ===
logoutBtn.addEventListener('click', () => {
  socket.emit('manual logout');
  socket.disconnect(); // ✅ Disconnect socket

  localStorage.removeItem('username');
  localStorage.removeItem('token');

  chatContainer.style.display = 'none';
  authSection.style.display = 'block';
  username = '';
  selectedRecipient = null;
  recipientInput.value = '';
  messages.innerHTML = '';
});


// === Start Chat ===
function startChat(user, token) {
  username = user;
  authSection.style.display = 'none';
  chatContainer.style.display = 'block';

  // ✅ Connect with Token
  socket.auth = { token };
  socket.connect();
}

// === Socket Connection Error Handling ===
socket.on('connect_error', (err) => {
  console.error('Connection Error:', err.message);
  if (err.message === 'Authentication error') {
    alert('Session expired. Please login again.');
    logoutBtn.click();
  }
});

// === Submit Chat ===
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  if (msg && selectedRecipient) {
    socket.emit('private message', { recipient: selectedRecipient, msg }); // Sender is inferred from token
    input.value = '';
  } else if (!selectedRecipient) {
    alert('Please select a user to message');
  }
});

// === Typing Detection ===
input.addEventListener('input', () => {
  if (selectedRecipient) {
    if (!typing) {
      typing = true;
      socket.emit('typing', { recipient: selectedRecipient });
    }
    clearTimeout(timeout);
    timeout = setTimeout(timeoutFunction, 1000);
  }
});

function timeoutFunction() {
  if (typing && selectedRecipient) {
    typing = false;
    socket.emit('stop typing', { recipient: selectedRecipient });
  }
}

// === Format Date for Separators ===
function formatDate(timestamp) {
  let date;
  if (typeof timestamp === 'string') {
    // Handle SQL timestamp or ISO string
    // Append 'Z' if it looks like "YYYY-MM-DD HH:MM:SS" (from SQLite default) and doesn't have timezone
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
      date = new Date(`${timestamp}Z`);
    } else {
      date = new Date(timestamp);
    }
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return 'Invalid Date';

  // Convert to IST (+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);

  const today = new Date();
  const todayIST = new Date(today.getTime() + istOffset);
  todayIST.setHours(0, 0, 0, 0);

  const messageDate = new Date(istDate);
  messageDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((todayIST - messageDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  else if (diffDays === 1) return 'Yesterday';
  else {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return messageDate.toLocaleDateString('en-IN', options);
  }
}

// === Add Date Separator ===
function addDateSeparator(dateStr) {
  if (!dateStr || dateStr === 'Invalid Date') return;
  const div = document.createElement('div');
  div.classList.add('date-separator');
  div.textContent = dateStr;
  messages.appendChild(div);
}

// === Chat Events ===
socket.on('private message', ({ id, sender, recipient, msg, timestamp, read }) => {
  const bubble = document.getElementById('typing-bubble');
  const messageDate = formatDate(timestamp);

  if (lastMessageDate !== messageDate) {
    if (bubble) {
      const div = document.createElement('div');
      div.classList.add('date-separator');
      div.textContent = messageDate;
      messages.insertBefore(div, bubble);
    } else {
      addDateSeparator(messageDate);
    }
    lastMessageDate = messageDate;
  }

  const div = document.createElement('div');
  const isMe = sender === username && recipient === selectedRecipient;
  const isOther = sender === selectedRecipient && recipient === username;

  if (isMe || isOther) {
    div.classList.add('bubble', isMe ? 'you' : 'other');
    if (id) div.dataset.msgId = id;
    const tick = isMe ? renderTick(read) : '';
    div.innerHTML = `<strong>${escapeHtml(sender)}</strong><br>${escapeHtml(msg)}<span class="time">${formatTime(timestamp)}${tick}</span>`;

    if (bubble) {
      messages.insertBefore(div, bubble);
    } else {
      messages.appendChild(div);
    }
    scrollToBottom();

    // KEY FIX: If we received this message while actively viewing the chat,
    // tell the server to mark it as read immediately — no need to re-request history
    if (isOther) {
      socket.emit('mark read', { from: sender });
    }
  } else if (recipient === username && sender !== selectedRecipient) {
    // Message from someone we're NOT currently chatting with → unread badge
    const currentCount = unreadMessages.get(sender) || 0;
    unreadMessages.set(sender, currentCount + 1);
    updateOnlineUsersList();
  }
});

// === Messages Read — upgrade ✓ → ✓✓ on sender's side ===
socket.on('messages read', ({ by }) => {
  // Only upgrade ticks visible in the currently open conversation
  if (by === selectedRecipient) {
    document.querySelectorAll('.bubble.you .tick').forEach(tick => {
      tick.textContent = '✓✓';
      tick.className = 'tick tick-read';
      tick.title = 'Read';
    });
  }
  // If 'by' is NOT the currently selected recipient, the ticks aren't visible anyway.
  // When the sender switches to that conversation, chat history will load with read=1 from DB.
});

// ... (user joined/left handlers remain same) ...

socket.on('online users', (users) => {
  console.log('Received online users:', users);
  onlineUsersList.innerHTML = '';

  const otherUsers = users.filter(user => user !== username);

  if (otherUsers.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No other users online';
    li.style.fontStyle = 'italic';
    li.style.opacity = '0.7';
    li.style.pointerEvents = 'none';
    onlineUsersList.appendChild(li);
    return;
  }

  otherUsers.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user;
    li.dataset.username = user;
    li.style.overflow = 'hidden';
    li.style.textOverflow = 'ellipsis';
    li.style.whiteSpace = 'nowrap';

    // Use click for both desktop and mobile
    li.addEventListener('click', () => selectRecipient(user));

    if (user === selectedRecipient) {
      li.classList.add('selected');
    }
    const unreadCount = unreadMessages.get(user) || 0;
    if (unreadCount > 0) {
      li.classList.add('unread');
      li.dataset.unreadCount = unreadCount;
    }
    onlineUsersList.appendChild(li);
  });
});

// Typing Logic
socket.on('typing', ({ sender, recipient }) => {
  if (sender === selectedRecipient && recipient === username) {
    let bubble = document.getElementById('typing-bubble');
    if (bubble) {
      // If bubble exists, move it to the bottom
      messages.appendChild(bubble);
    } else {
      // Create new bubble
      bubble = document.createElement('div');
      bubble.id = 'typing-bubble';
      bubble.className = 'bubble other typing-bubble'; // Re-use 'other' for styling
      bubble.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
      messages.appendChild(bubble);
    }
    scrollToBottom();
  }
});

socket.on('stop typing', ({ sender, recipient }) => {
  if (sender === selectedRecipient && recipient === username) {
    const bubble = document.getElementById('typing-bubble');
    if (bubble) {
      bubble.remove();
    }
  }
});



socket.on('chat history', (chatHistory) => {
  messages.innerHTML = ''; // Clear current messages
  lastMessageDate = null; // Reset date tracking

  chatHistory.forEach(({ id, sender, recipient, msg, timestamp, read }) => {
    if ((sender === username && recipient === selectedRecipient) || (sender === selectedRecipient && recipient === username)) {
      const messageDate = formatDate(timestamp);
      if (messageDate !== lastMessageDate) {
        addDateSeparator(messageDate);
        lastMessageDate = messageDate;
      }

      const isMe = sender === username;
      const div = document.createElement('div');
      div.classList.add('bubble', isMe ? 'you' : 'other');
      if (id) div.dataset.msgId = id;
      const tick = isMe ? renderTick(read) : '';
      div.innerHTML = `<strong>${escapeHtml(sender)}</strong><br>${escapeHtml(msg)}<span class="time">${formatTime(timestamp)}${tick}</span>`;
      messages.appendChild(div);
    }
  });

  scrollToBottom();
});

function selectRecipient(user) {
  selectedRecipient = user;
  recipientInput.value = user;
  messages.innerHTML = '';
  lastMessageDate = null;
  // request chat history — server will also mark messages from `user` as read and notify them
  socket.emit('request chat history', { recipient: user });
  unreadMessages.delete(user);
  updateOnlineUsersList(); // fix: removed undefined typingIndicator reference

  // Close sidebar on mobile after selection
  if (window.innerWidth <= 768) {
    onlineUsersBox.classList.remove('active');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  }
}

function updateOnlineUsersList() {
  onlineUsersList.querySelectorAll('li').forEach(li => {
    const user = li.dataset.username;
    li.classList.remove('selected', 'unread');
    li.removeAttribute('data-unread-count');
    if (user === selectedRecipient) {
      li.classList.add('selected');
    }
    const unreadCount = unreadMessages.get(user) || 0;
    if (unreadCount > 0) {
      li.classList.add('unread');
      li.dataset.unreadCount = unreadCount;
    }
  });
}

function formatTime(timestamp) {
  let date;
  if (typeof timestamp === 'string') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
      date = new Date(`${timestamp}Z`);
    } else {
      date = new Date(timestamp);
    }
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return 'Invalid time';

  const options = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  };
  return date.toLocaleString('en-IN', options);
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}