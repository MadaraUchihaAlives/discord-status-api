'use strict';

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_URL = process.env.MYSQL_API_URL || (process.env.FRONTEND_URL ? process.env.FRONTEND_URL + '/api.php' : 'https://sms.luffyxd.store/api.php');
const API_USER = process.env.MYSQL_API_USER || process.env.ADMIN_USERNAME;
const API_PASS = process.env.MYSQL_API_PASS || process.env.ADMIN_PASSWORD;

async function checkProxy() {
  try {
    await axios.head(API_URL, { headers: authHeader(), timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function getData() {
  try {
    const { data } = await axios.get(API_URL + '?action=read', { headers: authHeader(), timeout: 15000 });
    return data;
  } catch (err) {
    console.error('DB proxy read failed:', err.message, 'URL:', API_URL);
    throw new Error('Database proxy unreachable: ' + err.message);
  }
}

async function mutate(fn) {
  try {
    const { data } = await axios.get(API_URL + '?action=read', { headers: authHeader(), timeout: 15000 });
    const result = await fn(data);
    await axios.post(API_URL + '?action=write', data, { headers: { ...authHeader(), 'Content-Type': 'application/json' }, timeout: 15000 });
    return result;
  } catch (err) {
    console.error('DB proxy write failed:', err.message, 'URL:', API_URL);
    throw new Error('Database proxy unreachable: ' + err.message);
  }
}

function now() {
  return new Date().toISOString();
}

function findUserByEmail(data, email) {
  return data.users.find((u) => u.email === email) || null;
}

function findUserById(data, id) {
  return data.users.find((u) => u.id === id) || null;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, password_hash, ...rest } = user;
  return rest;
}

function findSession(data, token) {
  const session = data.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) return null;
  return session;
}

function findApiKey(data, key) {
  return data.api_keys.find((k) => k.key === key && k.status === 'active') || null;
}

function maskKey(key) {
  if (!key || key.length < 16) return key;
  return key.slice(0, 8) + '...' + key.slice(-8);
}

function addLog(data, entry) {
  data.logs.unshift({
    id: uuidv4(),
    created_at: now(),
    ...entry
  });
  if (data.logs.length > 5000) {
    data.logs = data.logs.slice(0, 5000);
  }
}

function getGatewayState(data, userId) {
  if (!data.gateway_state[userId]) {
    data.gateway_state[userId] = { paused: false, updated_at: now() };
  }
  return data.gateway_state[userId];
}

module.exports = {
  getData,
  mutate,
  now,
  findUserByEmail,
  findUserById,
  sanitizeUser,
  findSession,
  findApiKey,
  maskKey,
  addLog,
  getGatewayState,
  uuidv4
};
