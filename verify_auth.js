const io = require('socket.io-client');
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testAuth() {
  let socket;
  let badSocket;

  try {
    console.log('--- Testing Signup ---');
    // Random username to avoid conflict
    const username = `TestUser_${Math.floor(Math.random() * 10000)}`;
    const signupRes = await axios.post(`${BASE_URL}/signup`, {
      username,
      password: 'password123'
    });
    console.log('Signup Result:', signupRes.data);
    const token = signupRes.data.token;

    if (!token) {
      console.error('FAILED: No token received on signup');
      return;
    }

    console.log('\n--- Testing Login ---');
    const loginRes = await axios.post(`${BASE_URL}/login`, {
      username,
      password: 'password123'
    });
    console.log('Login Result:', loginRes.data);

    if (loginRes.data.token && loginRes.data.token.length > 0) {
      console.log('Login token received.');
    } else {
      console.error('FAILED: No token received on login');
    }

    console.log('\n--- Testing Socket Connection (With Token) ---');
    socket = io(BASE_URL, {
      auth: { token },
      autoConnect: false,
      transports: ['websocket']
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected successfully!');
      // Disconnect socket after success
      socket.disconnect();
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connection error (Unexpected):', err.message);
    });

    socket.connect();

    // Give it a moment to connect
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('\n--- Testing Socket Connection (Without Token) ---');
    badSocket = io(BASE_URL, {
      autoConnect: false,
      transports: ['websocket']
    });

    badSocket.on('connect', () => {
      console.error('❌ Socket connected WITHOUT token (Should fail!)');
      badSocket.disconnect();
    });

    badSocket.on('connect_error', (err) => {
      console.log('✅ Socket connection rejected as expected:', err.message);
    });

    badSocket.connect();

    // Give it a moment
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Cleanup badSocket
    if (badSocket.connected) badSocket.disconnect();

    console.log('\n--- Test Completed ---');

  } catch (error) {
    console.error('Test Failed:', error.response ? error.response.data : error.message);
  } finally {
    if (socket && socket.connected) socket.disconnect();
    if (badSocket && badSocket.connected) badSocket.disconnect();
  }
}

testAuth();
