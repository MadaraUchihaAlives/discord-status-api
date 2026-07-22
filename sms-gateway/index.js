'use strict';

const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const registerRoutes = require('./routes');
const setupSocket = require('./socket');

function initSmsGateway(app, options = {}) {
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'xd-sms-gateway-secret-key-2024';
  const frontendUrl = options.frontendUrl || process.env.FRONTEND_URL || 'https://sms.luffyxd.store';

  const allowedOrigins = [
    frontendUrl,
    'https://sms.luffyxd.store',
    'http://sms.luffyxd.store',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8080'
  ];

  app.use(cors({ origin: allowedOrigins, credentials: true }));

  const server = http.createServer(app);
  const io = socketIo(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] } });

  registerRoutes(app, io, jwtSecret);
  setupSocket(io);

  return { server, io };
}

module.exports = initSmsGateway;
