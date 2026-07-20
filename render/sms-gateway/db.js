'use strict';

const { v4: uuidv4 } = require('uuid');
const rtdb = require('../firebase-init');

const ROOT = 'sms_gateway';

const ARRAY_COLLECTIONS = [
  'users',
  'sessions',
  'devices',
  'api_keys',
  'webhooks',
  'webhook_deliveries',
  'sms_queue',
  'sms_history',
  'logs',
  'settings'
];

const defaultData = {
  users: [],
  sessions: [],
  devices: [],
  api_keys: [],
  webhooks: [],
  webhook_deliveries: [],
  sms_queue: [],
  sms_history: [],
  logs: [],
  settings: [],
  gateway_state: {}
};

let cache = null;
let initPromise = null;

function objToArray(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj);
}

function arrayToObj(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const result = {};
  for (const item of arr) {
    if (item && item.id) result[item.id] = item;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function fbToData(fbVal) {
  const data = JSON.parse(JSON.stringify(defaultData));
  if (!fbVal) return data;
  for (const col of ARRAY_COLLECTIONS) {
    data[col] = fbVal[col] ? objToArray(fbVal[col]) : [];
  }
  data.gateway_state = fbVal.gateway_state || {};
  return data;
}

function dataToFb(data) {
  const fb = {};
  for (const col of ARRAY_COLLECTIONS) {
    const obj = arrayToObj(data[col]);
    if (obj) fb[col] = obj;
  }
  if (data.gateway_state && Object.keys(data.gateway_state).length > 0) {
    fb.gateway_state = data.gateway_state;
  }
  return fb;
}

async function initDb() {
  const fbVal = await rtdb.get(ROOT);
  cache = fbToData(fbVal);
}

async function load() {
  if (cache) return cache;
  if (!initPromise) initPromise = initDb();
  await initPromise;
  return cache;
}

async function persist() {
  const fbData = dataToFb(cache);
  await rtdb.set(ROOT, Object.keys(fbData).length > 0 ? fbData : null);
}

async function getData() {
  return load();
}

async function saveData(data) {
  cache = data;
  await persist();
}

async function mutate(fn) {
  const data = await load();
  const result = await fn(data);
  cache = data;
  await persist();
  return result;
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
  const { password, ...rest } = user;
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
  saveData,
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
