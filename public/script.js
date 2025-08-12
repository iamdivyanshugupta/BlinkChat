const socket = io();

let username = '';
let selectedRecipient = null;
let unreadMessages = new Map(); 
let lastMessageDate = null;

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
const typingIndicator = document.getElementById('typing-indicator');
const errorDisplay = document.getElementById('auth-error');
const errorDisplaySignup = document.getElementById('auth-error-signup');
const onlineUsersList = document.getElementById('online-users-list');
const recipientInput = document.getElementById('recipient');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');
const logoutBtn = document.getElementById('logout-btn'); // NEW

let typing = false;
let timeout = null;

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

  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: value, password })
  });

  const data = await res.json();
  if (data.success) {
    localStorage.setItem('username', value); // Save username
    startChat(value);
  } else {
    errorDisplay.textContent = data.message || 'Login failed';
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

  const res = await fetch('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: value, password })
  });

  const data = await res.json();
  if (data.success) {
    localStorage.setItem('username', value); // Save username
    startChat(value);
  } else {
    errorDisplaySignup.textContent = data.message || 'Signup failed';
  }
});

// === AUTO LOGIN on Refresh ===
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('username');
  if (savedUser) {
    startChat(savedUser);
  }
});

// === LOGOUT ===
logoutBtn.addEventListener('click', () => {
  socket.emit('manual logout', username); // ← inform server

  localStorage.removeItem('username');
  chatContainer.style.display = 'none';
  authSection.style.display = 'block';
  username = '';
  selectedRecipient = null;
  recipientInput.value = '';
  messages.innerHTML = '';
});


// === Start Chat ===
function startChat(user) {
  username = user;
  authSection.style.display = 'none';
  chatContainer.style.display = 'block';
  socket.emit('user joined', username);
}

// (The rest of your script.js stays the same below this point)
// Don't delete your chat events, formatTime, scrollToBottom, etc.


// === Submit Chat ===
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  if (msg && selectedRecipient) {
    socket.emit('private message', { sender: username, recipient: selectedRecipient, msg });
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
      socket.emit('typing', { sender: username, recipient: selectedRecipient });
      console.log(`Emitting typing from ${username} to ${selectedRecipient}`);
    }
    clearTimeout(timeout);
    timeout = setTimeout(timeoutFunction, 1000);
  } else {
    console.log('No recipient selected, typing event not emitted');
  }
});

function timeoutFunction() {
  if (typing && selectedRecipient) {
    typing = false;
    socket.emit('stop typing', { sender: username, recipient: selectedRecipient });
    console.log(`Emitting stop typing from ${username} to ${selectedRecipient}`);
  }
}

// === Format Date for Separators ===
function formatDate(timestamp) {
  let date;
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    try {
      date = new Date(`${timestamp}Z`); // Treat as UTC
      console.log(`Parsed UTC timestamp: ${timestamp} -> ${date.toISOString()}`);
    } catch (e) {
      console.error(`Error parsing timestamp: ${timestamp}`, e);
      return 'Invalid Date';
    }
  } else {
    date = new Date(timestamp);
    console.log(`Parsed non-string timestamp: ${timestamp} -> ${date.toISOString()}`);
  }

  if (isNaN(date.getTime())) {
    console.error(`Invalid date for separator: ${timestamp}`);
    return 'Invalid Date';
  }

  // Convert to IST (+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
  const istDate = new Date(date.getTime() + istOffset);

  // Get today's date in IST
  const today = new Date();
  const todayIST = new Date(today.getTime() + istOffset);
  todayIST.setHours(0, 0, 0, 0); // Reset to start of day in IST

  // Reset message date to start of day in IST
  const messageDate = new Date(istDate);
  messageDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((todayIST - messageDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    console.log(`Date separator: Today for ${timestamp}`);
    return 'Today';
  } else if (diffDays === 1) {
    console.log(`Date separator: Yesterday for ${timestamp}`);
    return 'Yesterday';
  } else {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = messageDate.toLocaleDateString('en-IN', options);
    console.log(`Date separator: ${formattedDate} for ${timestamp}`);
    return formattedDate;
  }
}

// === Add Date Separator ===
function addDateSeparator(dateStr) {
  if (!dateStr || dateStr === 'Invalid Date') {
    console.warn('Skipping invalid date separator:', dateStr);
    return;
  }
  const div = document.createElement('div');
  div.classList.add('date-separator');
  div.textContent = dateStr;
  messages.appendChild(div);
  console.log(`Added date separator: ${dateStr}`);
}

// === Chat Events ===
socket.on('private message', ({ sender, recipient, msg, timestamp }) => {
  // Get message date for separator
  const messageDate = formatDate(timestamp);
  
  // Add separator if date changes
  if (lastMessageDate !== messageDate) {
    addDateSeparator(messageDate);
    lastMessageDate = messageDate;
  }

  if (sender === username && recipient === selectedRecipient) {
    // Display message if sent by the user to the selected recipient
    const div = document.createElement('div');
    div.classList.add('bubble', 'you');
    div.innerHTML = `<strong>${sender}</strong><br>${msg}<span class="time">[${formatTime(timestamp)}]</span>`;
    messages.appendChild(div);
    scrollToBottom();
  } else if (sender === selectedRecipient && recipient === username) {
    // Display message if received from the selected recipient
    const div = document.createElement('div');
    div.classList.add('bubble', 'other');
    div.innerHTML = `<strong>${sender}</strong><br>${msg}<span class="time">[${formatTime(timestamp)}]</span>`;
    messages.appendChild(div);
    scrollToBottom();
  } else if (recipient === username && sender !== selectedRecipient) {
    // Increment unread message count for non-selected sender
    const currentCount = unreadMessages.get(sender) || 0;
    unreadMessages.set(sender, currentCount + 1);
    updateOnlineUsersList();
  }
});

socket.on('user joined', (username) => {
  const info = document.createElement('div');
  info.textContent = `${username} joined the chat`;
  info.style.fontStyle = 'italic';
  messages.appendChild(info);
  scrollToBottom();
});

socket.on('user left', (username) => {
  const info = document.createElement('div');
  info.textContent = `${username} left the chat`;
  info.style.fontStyle = 'italic';
  messages.appendChild(info);
  if (username === selectedRecipient) {
    selectedRecipient = null;
    recipientInput.value = '';
    messages.innerHTML = '';
    lastMessageDate = null; // Reset date tracking
  }
  unreadMessages.delete(username); // Clear unread status
  updateOnlineUsersList();
  scrollToBottom();
});

socket.on('online users', (users) => {
  onlineUsersList.innerHTML = ''; // Clear the list
  users.forEach(user => {
    if (user !== username) { // Exclude current user
      const li = document.createElement('li');
      li.textContent = user;
      li.dataset.username = user; // Store username for easy reference
      li.style.overflow = 'hidden'; // Prevent text overflow
      li.style.textOverflow = 'ellipsis'; // Add ellipsis for long usernames
      li.style.whiteSpace = 'nowrap'; // Keep text on one line
      // Handle both click and touchstart for user selection
      li.addEventListener('click', () => selectRecipient(user));
      li.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent default touch behavior (e.g., scrolling)
        selectRecipient(user);
      });
      if (user === selectedRecipient) {
        li.classList.add('selected');
      }
      const unreadCount = unreadMessages.get(user) || 0;
      if (unreadCount > 0) {
        li.classList.add('unread');
        li.dataset.unreadCount = unreadCount; // Set count for CSS
      }
      onlineUsersList.appendChild(li);
    }
  });
});

socket.on('typing', ({ sender, recipient }) => {
  if (sender === selectedRecipient && recipient === username) {
    typingIndicator.textContent = `${sender} is typing...`;
    console.log(`Received typing event from ${sender} for ${recipient}`);
  } else {
    console.log(`Typing event ignored: sender=${sender}, recipient=${recipient}, selectedRecipient=${selectedRecipient}`);
  }
});

socket.on('stop typing', ({ sender, recipient }) => {
  if (sender === selectedRecipient && recipient === username) {
    typingIndicator.textContent = '';
    console.log(`Received stop typing event from ${sender} for ${recipient}`);
  } else {
    console.log(`Stop typing event ignored: sender=${sender}, recipient=${recipient}, selectedRecipient=${selectedRecipient}`);
  }
});

socket.on('chat history', (chatHistory) => {
  messages.innerHTML = ''; // Clear current messages
  lastMessageDate = null; // Reset date tracking
  
  chatHistory.forEach(({ sender, recipient, msg, timestamp }) => {
    if ((sender === username && recipient === selectedRecipient) || (sender === selectedRecipient && recipient === username)) {
      // Add date separator if date changes
      const messageDate = formatDate(timestamp);
      if (messageDate !== lastMessageDate) {
        addDateSeparator(messageDate);
        lastMessageDate = messageDate;
      }
      
      const div = document.createElement('div');
      div.classList.add('bubble', sender === username ? 'you' : 'other');
      div.innerHTML = `<strong>${sender}</strong><br>${msg}<span class="time">[${formatTime(timestamp)}]</span>`;
      messages.appendChild(div);
    }
  });
  scrollToBottom();
});

function selectRecipient(user) {
  selectedRecipient = user;
  recipientInput.value = user; // Update recipient input to show selected user
  messages.innerHTML = ''; // Clear chat for new conversation
  lastMessageDate = null; // Reset date tracking
  socket.emit('request chat history', { sender: username, recipient: user });
  unreadMessages.delete(user); // Clear unread count
  typingIndicator.textContent = ''; // Clear typing indicator
  updateOnlineUsersList();
}

function updateOnlineUsersList() {
  onlineUsersList.querySelectorAll('li').forEach(li => {
    const user = li.dataset.username;
    li.classList.remove('selected', 'unread');
    li.removeAttribute('data-unread-count'); // Clear previous count
    if (user === selectedRecipient) {
      li.classList.add('selected');
    }
    const unreadCount = unreadMessages.get(user) || 0;
    if (unreadCount > 0) {
      li.classList.add('unread');
      li.dataset.unreadCount = unreadCount; // Set count for CSS
    }
  });
}

function formatTime(timestamp) {
  let date;
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    try {
      date = new Date(`${timestamp}Z`); // Treat as UTC
      console.log(`Parsed UTC timestamp for time: ${timestamp} -> ${date.toISOString()}`);
    } catch (e) {
      console.error(`Error parsing timestamp for time: ${timestamp}`, e);
      return 'Invalid time';
    }
  } else {
    date = new Date(timestamp);
    console.log(`Parsed non-string timestamp for time: ${timestamp} -> ${date.toISOString()}`);
  }

  if (isNaN(date.getTime())) {
    console.error(`Invalid timestamp for time: ${timestamp}`);
    return 'Invalid time';
  }

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