# 💬 BlinkChat

![Node.js](https://img.shields.io/badge/Node.js-18.x-green?logo=node.js)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-black?logo=socket.io)
![SQLite](https://img.shields.io/badge/SQLite-3.x-blue?logo=sqlite)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Status](https://img.shields.io/badge/Status-Active-success)

BlinkChat is a **real-time chat application** built with **Node.js**, **Socket.io**, and **SQLite**, featuring secure authentication, private messaging, and typing indicators.  
It’s fast, lightweight, and easy to use — perfect for learning or deploying your own chat system.

---

## 🚀 Features

- 🔑 **Login & Signup** – JSON-based authentication  
- 💬 **Global & Private Messaging (DMs)** – Chat in public or one-on-one  
- ✍️ **Typing Indicators** – Visible only to the relevant user  
- 📜 **Message History** – Stored in SQLite, loaded when you reconnect  
- 👥 **Online Users List** – Shows who’s active + unread message counts  
- 🕒 **Timestamps** – Every message has a clear time record  
- 📱 **Responsive Design** – Works on desktop & mobile devices  

---

## 🛠️ Tech Stack

**Frontend:** HTML, CSS, JavaScript  
**Backend:** Node.js, Express.js, Socket.io  
**Database:** SQLite (messages), JSON file (users)  

---

## 📂 Folder Structure
```
BlinkChat/
│── public/              # Frontend files
│   ├── index.html        # Main UI (login/signup/chat)
│   ├── style.css         # App styling
│   └── script.js         # Client-side logic
│
│── server.js             # Node.js server with Socket.io
│── users.json            # Stores registered users
│── messages.db           # SQLite database for chat messages
│── package.json          # Dependencies list
│── package-lock.json
│── node_modules/
```

---

## ⚡ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/iamdivyanshugupta/BlinkChat.git
   cd BlinkChat
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the server**
   ```bash
   node server.js
   ```

4. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## 📸 Screenshots

> *(Add screenshots of your app UI here)*  

---

## 🛡️ License
This project is licensed under the [MIT License](LICENSE) – you are free to use, modify, and distribute it, provided that proper credit is given.

---

## 🙌 Acknowledgements
- [Node.js](https://nodejs.org/) – JavaScript runtime  
- [Socket.io](https://socket.io/) – Real-time communication  
- [SQLite](https://sqlite.org/) – Lightweight database  
