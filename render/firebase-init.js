'use strict';

const axios = require('axios');

const DATABASE_URL = (process.env.FIREBASE_DATABASE_URL || 'https://api-firebase-nabeelxd-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/$/, '');
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET || '';

function buildUrl(path) {
  const cleanPath = path.replace(/^\//, '');
  const url = `${DATABASE_URL}/${cleanPath}.json`;
  return DATABASE_SECRET ? `${url}?auth=${encodeURIComponent(DATABASE_SECRET)}` : url;
}

async function get(path) {
  try {
    const response = await axios.get(buildUrl(path));
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

async function set(path, data) {
  await axios.put(buildUrl(path), data !== undefined && data !== null ? data : null);
}

module.exports = { get, set };