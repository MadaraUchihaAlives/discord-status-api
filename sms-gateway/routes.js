'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const db = require('./db');

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.connection?.remoteAddress || '0.0.0.0';
}

function decodedName(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function logActivity(data, userId, action, details, req, status, requestId, duration) {
  db.addLog(data, {
    user_id: userId,
    action,
    details: details || {},
    ip_address: getClientIP(req),
    country: null,
    user_agent: req.headers['user-agent'] || '',
    status,
    request_id: requestId || null,
    duration: duration || null
  });
}

async function triggerWebhooks(data, userId, event, payload) {
  const hooks = data.webhooks.filter((w) => w.user_id === userId && w.status === 'active');
  for (const hook of hooks) {
    const body = { event, timestamp: db.now(), data: payload };
    const signature = crypto.createHmac('sha256', hook.secret).update(JSON.stringify(body)).digest('hex');
    let attempt = 0;
    let success = false;
    while (attempt < (hook.retry_count || 3) && !success) {
      attempt++;
      try {
        const response = await axios.post(hook.url, body, {
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature, 'X-Webhook-Event': event },
          timeout: 10000
        });
        data.webhook_deliveries.unshift({
          id: db.uuidv4(),
          webhook_id: hook.id,
          payload: body,
          status_code: response.status,
          response: String(response.data).slice(0, 500),
          attempt,
          created_at: db.now()
        });
        success = true;
      } catch (error) {
        data.webhook_deliveries.unshift({
          id: db.uuidv4(),
          webhook_id: hook.id,
          payload: body,
          status_code: error.response?.status || 0,
          response: error.message,
          attempt,
          created_at: db.now()
        });
      }
    }
    if (data.webhook_deliveries.length > 2000) data.webhook_deliveries = data.webhook_deliveries.slice(0, 2000);
  }
}

async function queueSms(data, io, req, userId, apiKeyId, payload) {
  const { phone_number, number, message, sim_slot, priority, webhook_url, metadata, device_id } = payload;
  const targetNumber = phone_number || number;
  if (!targetNumber || !message) return { error: 'Phone number and message required', status: 400 };

  const gateway = db.getGatewayState(data, userId);
  if (gateway.paused) return { error: 'Gateway is paused', status: 503 };

  const requestId = db.uuidv4();
  const id = db.uuidv4();
  let targetDeviceId = null;
  if (device_id) {
    const device = data.devices.find((d) => d.id === device_id && d.user_id === userId);
    if (device) targetDeviceId = device.id;
  } else {
    const availableDevice = data.devices.find((d) => d.user_id === userId && d.status === 'online');
    targetDeviceId = availableDevice?.id || null;
  }

  const queueItem = {
    id,
    user_id: userId,
    device_id: targetDeviceId,
    phone_number: targetNumber,
    message,
    sim_slot: sim_slot || 1,
    priority: priority || 0,
    webhook_url: webhook_url || null,
    metadata: metadata || {},
    status: 'pending',
    retry_count: 0,
    max_retries: 3,
    error: null,
    source_ip: getClientIP(req),
    country: null,
    api_key_id: apiKeyId || null,
    request_id: requestId,
    sent_at: null,
    delivered_at: null,
    created_at: db.now(),
    updated_at: db.now()
  };

  data.sms_queue.push(queueItem);
  data.sms_history.push({
    id: db.uuidv4(),
    user_id: userId,
    device_id: targetDeviceId,
    phone_number: targetNumber,
    message,
    sim_slot: sim_slot || 1,
    status: 'pending',
    error: null,
    duration: null,
    request_id: requestId,
    api_key_id: apiKeyId || null,
    sent_at: db.now()
  });

  logActivity(data, userId, 'sms_queued', { request_id: requestId, phone_number: targetNumber }, req, 'success', requestId);
  io.emit('queue_updated', { user_id: userId, request_id: requestId, status: 'pending' });
  await triggerWebhooks(data, userId, 'sms.queued', { request_id: requestId, phone_number: targetNumber });
  return { request_id: requestId, status: 'pending', message: 'SMS queued', id };
}

const registerRateLimiter = new Map();

function registerRoutes(app, io, jwtSecret) {
  const createMiddleware = require('./middleware');
  const { authenticateToken, authenticateApiKey, requireAdmin } = createMiddleware(jwtSecret);

  app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', service: 'XD SMS Gateway', time: db.now() });
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) {}
      }
      const { email, name, password } = body || {};
      if (!email || !name || !password) return res.status(400).json({ error: 'All fields required' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      const clientIP = getClientIP(req);
      const rateLimitKey = `${clientIP}:${email}`;
      if (!registerRateLimiter.has(rateLimitKey)) {
        registerRateLimiter.set(rateLimitKey, []);
      }
      const now = Date.now();
      const attempts = registerRateLimiter.get(rateLimitKey).filter(t => now - t < 3600000);
      if (attempts.length >= 5) {
        return res.status(429).json({ error: 'Too many registration attempts. Try again later.' });
      }
      attempts.push(now);
      registerRateLimiter.set(rateLimitKey, attempts);

      try {
        const result = await db.mutate(async (data) => {
          if (db.findUserByEmail(data, email)) return { error: 'Email already registered', status: 400 };

          const userId = db.uuidv4();
          const passwordHash = await new Promise((resolve, reject) => {
            bcrypt.hash(password, 10, (err, hash) => err ? reject(err) : resolve(hash));
          });

          const user = {
            id: userId,
            email,
            name,
            role: 'user',
            password_hash: passwordHash,
            created_at: db.now(),
            updated_at: db.now()
          };
          data.users.push(user);
          data.settings.push({
            id: db.uuidv4(),
            user_id: userId,
            timezone: 'UTC',
            language: 'en',
            theme: 'system',
            notifications_enabled: true,
            created_at: db.now(),
            updated_at: db.now()
          });
          db.getGatewayState(data, userId);

          const token = jwt.sign({ userId }, jwtSecret, { expiresIn: '7d' });
          data.sessions.push({
            id: db.uuidv4(),
            user_id: userId,
            token,
            ip_address: clientIP,
            user_agent: req.headers['user-agent'] || '',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: db.now()
          });
          logActivity(data, userId, 'user_registered', { email, name }, req, 'success');
          return { user: db.sanitizeUser(user), token, status: 201 };
        });

        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.status(result.status || 201).json({ user: result.user, token: result.token });
      } catch (dbErr) {
        console.error('Registration DB error:', dbErr.message);
        res.status(500).json({ error: 'Database error: ' + dbErr.message });
      }
    } catch (err) {
      console.error('Registration error:', err.message);
      res.status(500).json({ error: 'Registration failed: ' + err.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) {}
      }
      const { email, password } = body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      try {
        const result = await db.mutate(async (data) => {
          const user = db.findUserByEmail(data, email);
          if (!user || !user.password_hash) return { error: 'Invalid email or password', status: 401 };

          const match = await new Promise((resolve) => {
            bcrypt.compare(password, user.password_hash, (err, ok) => resolve(ok));
          });
          if (!match) return { error: 'Invalid email or password', status: 401 };

          const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' });
          data.sessions = data.sessions.filter((s) => s.user_id !== user.id);
          data.sessions.push({
            id: db.uuidv4(),
            user_id: user.id,
            token,
            ip_address: getClientIP(req),
            user_agent: req.headers['user-agent'] || '',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: db.now()
          });
          logActivity(data, user.id, 'user_login', {}, req, 'success');
          user.last_login = db.now();
          return { user: db.sanitizeUser(user), token };
        });

        if (result.error) return res.status(result.status || 401).json({ error: result.error });
        res.json(result);
      } catch (dbErr) {
        console.error('Login DB error:', dbErr.message);
        res.status(500).json({ error: 'Database error: ' + dbErr.message });
      }
    } catch (err) {
      console.error('Login error:', err.message);
      res.status(500).json({ error: 'Login failed: ' + err.message });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) {}
      }
      const { email } = body || {};
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const result = await db.mutate(async (data) => {
        const user = db.findUserByEmail(data, email);
        if (!user) return { message: 'If an account exists, a reset link has been sent.' };

        const resetToken = db.uuidv4();
        data.password_reset_tokens = data.password_reset_tokens || [];
        data.password_reset_tokens.push({
          id: db.uuidv4(),
          user_id: user.id,
          token: resetToken,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          created_at: db.now()
        });
        logActivity(data, user.id, 'forgot_password_requested', { email }, req, 'success');
        return { message: 'If an account exists, a reset link has been sent.', reset_token: resetToken };
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to process request' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) {}
      }
      const { token, password } = body || {};
      if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      const result = await db.mutate(async (data) => {
        data.password_reset_tokens = data.password_reset_tokens || [];
        const resetEntry = data.password_reset_tokens.find((t) => t.token === token && new Date(t.expires_at) > new Date());
        if (!resetEntry) return { error: 'Invalid or expired reset token', status: 400 };

        const user = db.findUserById(data, resetEntry.user_id);
        if (!user) return { error: 'User not found', status: 404 };

        user.password_hash = await new Promise((resolve, reject) => {
          bcrypt.hash(password, 10, (err, hash) => err ? reject(err) : resolve(hash));
        });
        user.updated_at = db.now();

        data.password_reset_tokens = data.password_reset_tokens.filter((t) => t.token !== token);
        data.sessions = data.sessions.filter((s) => s.user_id !== user.id);
        logActivity(data, user.id, 'password_reset', {}, req, 'success');
        return { message: 'Password reset successful' };
      });

      if (result.error) return res.status(result.status || 400).json({ error: result.error });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  app.post('/api/admin/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const adminUser = process.env.ADMIN_USERNAME || 'nabeelxd';
      const adminPass = process.env.ADMIN_PASSWORD || 'nabeelxd@123';

      if (username === adminUser && password === adminPass) {
        const token = jwt.sign({ userId: 'admin', role: 'admin' }, jwtSecret, { expiresIn: '24h' });

        await db.mutate(async (data) => {
          data.sessions.push({
            id: db.uuidv4(),
            user_id: 'admin',
            token,
            ip_address: getClientIP(req),
            user_agent: req.headers['user-agent'] || '',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            created_at: db.now()
          });
          logActivity(data, 'admin', 'admin_login', { username }, req, 'success');
        });

        return res.json({
          user: { id: 'admin', name: 'Nabeel XD', role: 'admin', email: 'admin@xd' },
          token
        });
      }

      return res.status(401).json({ error: 'Invalid admin credentials' });
    } catch (err) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      data.sessions = data.sessions.filter((s) => s.token !== req.authToken);
      logActivity(data, req.user.id, 'user_logout', {}, req, 'success');
    });
    res.json({ message: 'Logged out' });
  });

  app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
  });

  app.get('/api/dashboard', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const userId = req.user.id;
    const devices = data.devices.filter((d) => d.user_id === userId);
    const onlineDevices = devices.filter((d) => d.status === 'online');
    const today = new Date().toISOString().slice(0, 10);
    const history = data.sms_history.filter((h) => h.user_id === userId);
    const queue = data.sms_queue.filter((q) => q.user_id === userId);
    const gateway = db.getGatewayState(data, userId);

    res.json({
      gatewayStatus: { online: onlineDevices.length > 0, paused: gateway.paused, totalDevices: devices.length, onlineCount: onlineDevices.length },
      connectedDevices: devices.length,
      onlineDevices: onlineDevices.length,
      todayRequests: history.filter((h) => h.sent_at?.startsWith(today)).length,
      totalRequests: history.length,
      pendingQueue: queue.filter((q) => q.status === 'pending').length,
      completedQueue: queue.filter((q) => q.status === 'completed').length,
      failedQueue: queue.filter((q) => q.status === 'failed').length,
      apiUsage: data.api_keys.filter((k) => k.user_id === userId).length,
      webhookUsage: data.webhooks.filter((w) => w.user_id === userId).length,
      primaryDevice: onlineDevices[0] || devices[0] || null
    });
  });

  app.get('/api/devices', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const devices = data.devices.filter((d) => d.user_id === req.user.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ devices });
  });

  app.get('/api/device/:id', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const device = data.devices.find((d) => d.id === req.params.id && d.user_id === req.user.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({ device });
  });

  app.post('/api/device/connect', authenticateApiKey, async (req, res) => {
    const { device_id, device_name, gateway_name, android_version, phone_model, brand, battery, charging, network_type, carrier, sim_number, sim_slot, ip_address, country, timezone, ram_usage, storage_usage, cpu_usage } = req.body;

    const result = await db.mutate(async (data) => {
      let device = null;
      if (device_id) device = data.devices.find((d) => d.id === device_id && d.user_id === req.user.id);
      if (!device) {
        device = {
          id: db.uuidv4(),
          user_id: req.user.id,
          device_name: device_name || 'Android Device',
          gateway_name: gateway_name || 'XD Gateway',
          android_version: android_version || null,
          phone_model: phone_model || null,
          brand: brand || null,
          battery: battery || 0,
          charging: charging ? 1 : 0,
          network_type: network_type || null,
          carrier: carrier || null,
          sim_number: sim_number || null,
          sim_slot: sim_slot || 1,
          ip_address: ip_address || getClientIP(req),
          country: country || null,
          timezone: timezone || null,
          ram_usage: ram_usage || 0,
          storage_usage: storage_usage || 0,
          cpu_usage: cpu_usage || 0,
          uptime: 0,
          status: 'online',
          socket_id: null,
          last_seen: db.now(),
          created_at: db.now(),
          updated_at: db.now()
        };
        data.devices.push(device);
      } else {
        Object.assign(device, {
          device_name: device_name || device.device_name,
          gateway_name: gateway_name || device.gateway_name,
          android_version: android_version ?? device.android_version,
          phone_model: phone_model ?? device.phone_model,
          brand: brand ?? device.brand,
          battery: battery ?? device.battery,
          charging: charging ? 1 : 0,
          network_type: network_type ?? device.network_type,
          carrier: carrier ?? device.carrier,
          sim_number: sim_number ?? device.sim_number,
          sim_slot: sim_slot ?? device.sim_slot,
          ip_address: ip_address || getClientIP(req),
          country: country ?? device.country,
          timezone: timezone ?? device.timezone,
          ram_usage: ram_usage ?? device.ram_usage,
          storage_usage: storage_usage ?? device.storage_usage,
          cpu_usage: cpu_usage ?? device.cpu_usage,
          status: 'online',
          last_seen: db.now(),
          updated_at: db.now()
        });
      }
      logActivity(data, req.user.id, 'device_connected', { device_id: device.id }, req, 'success');
      io.emit('device_connected', { device_id: device.id, user_id: req.user.id, device });
      return device;
    });

    res.json({ device_id: result.id, status: 'connected', device: result });
  });

  app.post('/api/device/update', authenticateApiKey, async (req, res) => {
    const { device_id } = req.body;
    if (!device_id) return res.status(400).json({ error: 'device_id required' });

    const result = await db.mutate(async (data) => {
      const device = data.devices.find((d) => d.id === device_id && d.user_id === req.user.id);
      if (!device) return { error: 'Device not found', status: 404 };

      const fields = ['device_name', 'gateway_name', 'android_version', 'phone_model', 'brand', 'battery', 'charging', 'network_type', 'carrier', 'sim_number', 'sim_slot', 'ip_address', 'country', 'timezone', 'ram_usage', 'storage_usage', 'cpu_usage', 'uptime'];
      fields.forEach((field) => {
        if (req.body[field] !== undefined) device[field] = field === 'charging' ? (req.body[field] ? 1 : 0) : req.body[field];
      });
      device.status = 'online';
      device.last_seen = db.now();
      device.updated_at = db.now();
      io.emit('device_updated', { device_id: device.id, user_id: req.user.id, device });
      return { device };
    });

    if (result.error) return res.status(result.status || 404).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/device/status', authenticateApiKey, async (req, res) => {
    const { device_id } = req.body;
    const data = await db.getData();
    const device = data.devices.find((d) => d.id === device_id && d.user_id === req.user.id);
    const queue = data.sms_queue.filter((q) => q.user_id === req.user.id && q.status === 'pending');
    res.json({ online: device?.status === 'online', queue: queue.length, phone: device?.sim_number || 'Unknown', battery: device?.battery || 0, device: device || null, last_seen: device?.last_seen || null });
  });

  app.post('/api/device/:id/disconnect', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      const device = data.devices.find((d) => d.id === req.params.id && d.user_id === req.user.id);
      if (device) {
        device.status = 'offline';
        device.socket_id = null;
        device.updated_at = db.now();
        logActivity(data, req.user.id, 'device_disconnected', { device_id: device.id }, req, 'success');
        io.emit('device_disconnected', { device_id: device.id, user_id: req.user.id });
      }
    });
    res.json({ message: 'Device disconnected' });
  });

  app.post('/api/device/:id/pause', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      const device = data.devices.find((d) => d.id === req.params.id && d.user_id === req.user.id);
      if (device) { device.status = 'paused'; device.updated_at = db.now(); }
    });
    res.json({ message: 'Device paused' });
  });

  app.post('/api/device/:id/resume', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      const device = data.devices.find((d) => d.id === req.params.id && d.user_id === req.user.id);
      if (device) { device.status = 'online'; device.updated_at = db.now(); }
    });
    res.json({ message: 'Device resumed' });
  });

  app.post('/api/device/:id/rename', authenticateToken, async (req, res) => {
    const { device_name } = req.body;
    await db.mutate(async (data) => {
      const device = data.devices.find((d) => d.id === req.params.id && d.user_id === req.user.id);
      if (device && device_name) { device.device_name = device_name; device.updated_at = db.now(); }
    });
    res.json({ message: 'Device renamed' });
  });

  app.post('/api/device/:id/delete', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      data.devices = data.devices.filter((d) => !(d.id === req.params.id && d.user_id === req.user.id));
      logActivity(data, req.user.id, 'device_deleted', { device_id: req.params.id }, req, 'success');
    });
    res.json({ message: 'Device deleted' });
  });

  app.get('/api/apikeys', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const keys = data.api_keys.filter((k) => k.user_id === req.user.id).map(({ key, ...rest }) => rest);
    res.json({ api_keys: keys });
  });

  app.post('/api/apikey/create', authenticateToken, async (req, res) => {
    const { name, allowed_ips, rate_limit, permissions } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = await db.mutate(async (data) => {
      const apiKey = crypto.randomBytes(32).toString('hex');
      const record = {
        id: db.uuidv4(),
        user_id: req.user.id,
        key: apiKey,
        name,
        masked_key: db.maskKey(apiKey),
        allowed_ips: allowed_ips || '*',
        rate_limit: rate_limit || 100,
        permissions: permissions || 'all',
        usage_count: 0,
        last_used: null,
        status: 'active',
        created_at: db.now(),
        updated_at: db.now()
      };
      data.api_keys.push(record);
      logActivity(data, req.user.id, 'apikey_created', { name }, req, 'success');
      return { id: record.id, key: apiKey, name, masked_key: record.masked_key };
    });
    res.json(result);
  });

  app.post('/api/apikey/:id/delete', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      data.api_keys = data.api_keys.filter((k) => !(k.id === req.params.id && k.user_id === req.user.id));
    });
    res.json({ message: 'API key deleted' });
  });

  app.post('/api/apikey/:id/regenerate', authenticateToken, async (req, res) => {
    const result = await db.mutate(async (data) => {
      const keyData = data.api_keys.find((k) => k.id === req.params.id && k.user_id === req.user.id);
      if (!keyData) return { error: 'Not found', status: 404 };
      const newKey = crypto.randomBytes(32).toString('hex');
      keyData.key = newKey;
      keyData.masked_key = db.maskKey(newKey);
      keyData.updated_at = db.now();
      return { key: newKey, masked_key: keyData.masked_key };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/apikey/:id/toggle', authenticateToken, async (req, res) => {
    const result = await db.mutate(async (data) => {
      const keyData = data.api_keys.find((k) => k.id === req.params.id && k.user_id === req.user.id);
      if (!keyData) return { error: 'Not found', status: 404 };
      keyData.status = keyData.status === 'active' ? 'disabled' : 'active';
      keyData.updated_at = db.now();
      return { status: keyData.status };
    });
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  });

  app.get('/api/webhooks', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const webhooks = data.webhooks.filter((w) => w.user_id === req.user.id).map(({ secret, ...rest }) => rest);
    res.json({ webhooks });
  });

  app.post('/api/webhook/create', authenticateToken, async (req, res) => {
    const { url, allowed_ips, retry_count } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const result = await db.mutate(async (data) => {
      const secret = crypto.randomBytes(24).toString('hex');
      const record = { id: db.uuidv4(), user_id: req.user.id, url, secret, allowed_ips: allowed_ips || '*', retry_count: retry_count || 3, status: 'active', created_at: db.now(), updated_at: db.now() };
      data.webhooks.push(record);
      return { id: record.id, url, secret };
    });
    res.json(result);
  });

  app.post('/api/webhook/:id/delete', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      data.webhooks = data.webhooks.filter((w) => !(w.id === req.params.id && w.user_id === req.user.id));
    });
    res.json({ message: 'Webhook deleted' });
  });

  app.post('/api/webhook/:id/rotate-secret', authenticateToken, async (req, res) => {
    const result = await db.mutate(async (data) => {
      const webhook = data.webhooks.find((w) => w.id === req.params.id && w.user_id === req.user.id);
      if (!webhook) return { error: 'Not found', status: 404 };
      webhook.secret = crypto.randomBytes(24).toString('hex');
      webhook.updated_at = db.now();
      return { secret: webhook.secret };
    });
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/webhook/:id/toggle', authenticateToken, async (req, res) => {
    const result = await db.mutate(async (data) => {
      const webhook = data.webhooks.find((w) => w.id === req.params.id && w.user_id === req.user.id);
      if (!webhook) return { error: 'Not found', status: 404 };
      webhook.status = webhook.status === 'active' ? 'disabled' : 'active';
      webhook.updated_at = db.now();
      return { status: webhook.status };
    });
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/sms/send', authenticateApiKey, async (req, res) => {
    const result = await db.mutate(async (data) => queueSms(data, io, req, req.user.id, req.apiKey.id, req.body));
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/sms/send-panel', authenticateToken, async (req, res) => {
    const result = await db.mutate(async (data) => queueSms(data, io, req, req.user.id, null, req.body));
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/sms/send-bulk', authenticateApiKey, async (req, res) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages array required' });

    const results = await db.mutate(async (data) => {
      const gateway = db.getGatewayState(data, req.user.id);
      if (gateway.paused) return { error: 'Gateway is paused', status: 503 };

      const output = [];
      const availableDevice = data.devices.find((d) => d.user_id === req.user.id && d.status === 'online');

      for (const msg of messages) {
        const targetNumber = msg.phone_number || msg.number;
        if (!targetNumber || !msg.message) continue;
        const requestId = db.uuidv4();
        const id = db.uuidv4();
        data.sms_queue.push({
          id, user_id: req.user.id, device_id: availableDevice?.id || null, phone_number: targetNumber,
          message: msg.message, sim_slot: msg.sim_slot || 1, priority: msg.priority || 0,
          webhook_url: msg.webhook_url || null, metadata: msg.metadata || {}, status: 'pending',
          retry_count: 0, max_retries: 3, error: null, source_ip: getClientIP(req), country: null,
          api_key_id: req.apiKey.id, request_id: requestId, sent_at: null, delivered_at: null,
          created_at: db.now(), updated_at: db.now()
        });
        data.sms_history.push({
          id: db.uuidv4(), user_id: req.user.id, device_id: availableDevice?.id || null,
          phone_number: targetNumber, message: msg.message, sim_slot: msg.sim_slot || 1,
          status: 'pending', error: null, duration: null, request_id: requestId,
          api_key_id: req.apiKey.id, sent_at: db.now()
        });
        output.push({ request_id: requestId, phone_number: targetNumber, status: 'pending', id });
      }
      io.emit('queue_updated', { user_id: req.user.id, bulk: true });
      return { results: output };
    });

    if (results.error) return res.status(results.status).json({ error: results.error });
    res.json(results);
  });

  app.get('/api/get', authenticateApiKey, async (req, res) => {
    const { device_id } = req.query;
    const result = await db.mutate(async (data) => {
      const gateway = db.getGatewayState(data, req.user.id);
      if (gateway.paused) return { success: false, reason: 'gateway_paused' };

      let device = null;
      if (device_id) device = data.devices.find((d) => d.id === device_id && d.user_id === req.user.id);
      if (!device) device = data.devices.find((d) => d.user_id === req.user.id && d.status === 'online');
      if (device) { device.last_seen = db.now(); device.status = 'online'; }

      const pending = data.sms_queue.filter((q) => q.user_id === req.user.id && q.status === 'pending' && (!q.device_id || !device || q.device_id === device.id || !data.devices.some((d) => d.id === q.device_id && d.status === 'online'))).sort((a, b) => (b.priority || 0) - (a.priority || 0) || new Date(a.created_at) - new Date(b.created_at))[0];
      if (!pending) return { success: false };

      pending.status = 'sending';
      pending.device_id = device?.id || pending.device_id;
      pending.updated_at = db.now();

      const history = data.sms_history.find((h) => h.request_id === pending.request_id);
      if (history) history.status = 'sending';

      io.emit('queue_updated', { user_id: req.user.id, request_id: pending.request_id, status: 'sending' });
      return { success: true, id: pending.id, request_id: pending.request_id, number: pending.phone_number, phone_number: pending.phone_number, message: pending.message, sim_slot: pending.sim_slot || 1 };
    });
    res.json(result);
  });

  app.post('/api/done', authenticateApiKey, async (req, res) => {
    const { id, request_id, status, error, device_id } = req.body;
    if (!id && !request_id) return res.status(400).json({ error: 'id or request_id required' });
    const finalStatus = status === 'sent' || status === 'delivered' ? 'completed' : status === 'failed' ? 'failed' : status;

    const result = await db.mutate(async (data) => {
      const item = data.sms_queue.find((q) => q.user_id === req.user.id && (q.id === id || q.request_id === request_id));
      if (!item) return { error: 'SMS not found', status: 404 };

      item.status = finalStatus || 'completed';
      item.error = error || null;
      item.sent_at = db.now();
      if (finalStatus === 'completed' || finalStatus === 'delivered') item.delivered_at = db.now();
      if (device_id) item.device_id = device_id;
      item.updated_at = db.now();

      const history = data.sms_history.find((h) => h.request_id === item.request_id);
      if (history) { history.status = finalStatus === 'completed' ? 'completed' : finalStatus; history.error = error || null; history.device_id = item.device_id; history.sent_at = db.now(); }

      logActivity(data, req.user.id, finalStatus === 'failed' ? 'sms_failed' : 'sms_sent', { request_id: item.request_id, phone_number: item.phone_number, error }, req, finalStatus === 'failed' ? 'failed' : 'success', item.request_id);

      io.emit('sms_sent', { user_id: req.user.id, request_id: item.request_id, status: item.status, phone_number: item.phone_number });
      io.emit('queue_updated', { user_id: req.user.id, request_id: item.request_id, status: item.status });

      await triggerWebhooks(data, req.user.id, `sms.${item.status}`, { request_id: item.request_id, phone_number: item.phone_number, status: item.status, error: item.error });
      return { success: true, request_id: item.request_id, status: item.status };
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.get('/api/sms/logs', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const logs = data.sms_history.filter((h) => h.user_id === req.user.id).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)).slice(offset, offset + limit);
    const total = data.sms_history.filter((h) => h.user_id === req.user.id).length;
    res.json({ logs, total, page });
  });

  app.get('/api/sms/status/:requestId', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const sms = data.sms_queue.find((q) => q.request_id === req.params.requestId && q.user_id === req.user.id);
    if (!sms) return res.status(404).json({ error: 'SMS not found' });
    res.json({ request_id: sms.request_id, status: sms.status, phone_number: sms.phone_number, created_at: sms.created_at, sent_at: sms.sent_at, delivered_at: sms.delivered_at, error: sms.error });
  });

  app.get('/api/sms/history', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const history = data.sms_history.filter((h) => h.user_id === req.user.id).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)).slice(0, 100);
    res.json({ history });
  });

  app.get('/api/logs', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    let logs = data.logs.filter((l) => l.user_id === req.user.id);
    if (req.query.event_type) logs = logs.filter((l) => l.action === req.query.event_type);
    if (req.query.status) logs = logs.filter((l) => l.status === req.query.status);
    const total = logs.length;
    logs = logs.slice(offset, offset + limit);
    res.json({ logs, total, page });
  });

  app.get('/api/statistics', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const userId = req.user.id;
    const period = req.query.period || 'today';
    const nowDate = new Date();
    let startDate = new Date(nowDate.toISOString().slice(0, 10));

    if (period === 'yesterday') startDate = new Date(startDate.getTime() - 86400000);
    else if (period === '7days') startDate = new Date(startDate.getTime() - 7 * 86400000);
    else if (period === '30days') startDate = new Date(startDate.getTime() - 30 * 86400000);
    else if (period === 'all') startDate = new Date(0);

    const history = data.sms_history.filter((h) => h.user_id === userId && new Date(h.sent_at) >= startDate);
    const totalSent = history.filter((h) => h.status === 'completed').length;
    const totalFailed = history.filter((h) => h.status === 'failed').length;
    const totalPending = history.filter((h) => h.status === 'pending' || h.status === 'sending').length;
    const successRate = totalSent + totalFailed > 0 ? Number(((totalSent / (totalSent + totalFailed)) * 100).toFixed(1)) : 0;

    res.json({ total_sent: totalSent, total_failed: totalFailed, total_pending: totalPending, success_rate: successRate, total_requests: history.length });
  });

  app.get('/api/queue', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const queue = data.sms_queue.filter((q) => q.user_id === req.user.id).sort((a, b) => (b.priority || 0) - (a.priority || 0) || new Date(a.created_at) - new Date(b.created_at)).slice(0, 100);
    res.json({ queue });
  });

  app.post('/api/queue/:id/cancel', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      const item = data.sms_queue.find((q) => q.id === req.params.id && q.user_id === req.user.id);
      if (item) { item.status = 'cancelled'; item.updated_at = db.now(); io.emit('queue_updated', { user_id: req.user.id, request_id: item.request_id, status: 'cancelled' }); }
    });
    res.json({ message: 'Cancelled' });
  });

  app.post('/api/queue/:id/retry', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      const item = data.sms_queue.find((q) => q.id === req.params.id && q.user_id === req.user.id);
      if (item) { item.status = 'pending'; item.retry_count = 0; item.error = null; item.updated_at = db.now(); io.emit('queue_updated', { user_id: req.user.id, request_id: item.request_id, status: 'pending' }); }
    });
    res.json({ message: 'Retrying' });
  });

  app.post('/api/queue/clear', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      data.sms_queue = data.sms_queue.filter((q) => !(q.user_id === req.user.id && ['pending', 'failed', 'cancelled'].includes(q.status)));
      io.emit('queue_updated', { user_id: req.user.id, cleared: true });
    });
    res.json({ message: 'Queue cleared' });
  });

  app.get('/api/settings', authenticateToken, async (req, res) => {
    const data = await db.getData();
    const settings = data.settings.find((s) => s.user_id === req.user.id);
    const gateway = db.getGatewayState(data, req.user.id);
    res.json({ settings: settings || {}, gateway });
  });

  app.post('/api/settings/gateway/pause', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      const gateway = db.getGatewayState(data, req.user.id);
      gateway.paused = true;
      gateway.updated_at = db.now();
      logActivity(data, req.user.id, 'gateway_paused', {}, req, 'success');
    });
    res.json({ paused: true });
  });

  app.post('/api/settings/gateway/resume', authenticateToken, async (req, res) => {
    await db.mutate(async (data) => {
      const gateway = db.getGatewayState(data, req.user.id);
      gateway.paused = false;
      gateway.updated_at = db.now();
      logActivity(data, req.user.id, 'gateway_resumed', {}, req, 'success');
    });
    res.json({ paused: false });
  });

  app.post('/api/settings/update', authenticateToken, async (req, res) => {
    const { timezone, language, theme, notifications_enabled } = req.body;
    await db.mutate(async (data) => {
      let settings = data.settings.find((s) => s.user_id === req.user.id);
      if (!settings) {
        settings = { id: db.uuidv4(), user_id: req.user.id, timezone: 'UTC', language: 'en', theme: 'system', notifications_enabled: true, created_at: db.now(), updated_at: db.now() };
        data.settings.push(settings);
      }
      if (timezone !== undefined) settings.timezone = timezone;
      if (language !== undefined) settings.language = language;
      if (theme !== undefined) settings.theme = theme;
      if (notifications_enabled !== undefined) settings.notifications_enabled = notifications_enabled;
      settings.updated_at = db.now();
      logActivity(data, req.user.id, 'settings_changed', { timezone, language, theme }, req, 'success');
    });
    res.json({ message: 'Settings updated' });
  });

  app.get('/api/admin/gateways', authenticateToken, requireAdmin, async (req, res) => {
    const data = await db.getData();
    const gateways = Object.entries(data.gateway_state || {}).map(([userId, state]) => {
      const user = data.users.find((u) => u.id === userId);
      return { user_id: userId, email: user?.email || 'unknown', paused: Boolean(state.paused), updated_at: state.updated_at || null };
    });
    res.json({ gateways });
  });

  app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    const data = await db.getData();
    const totalUsers = data.users.length;
    const totalDevices = data.devices.length;
    const onlineDevices = data.devices.filter((d) => d.status === 'online').length;
    const totalApiKeys = data.api_keys.length;
    const totalWebhooks = data.webhooks.length;
    const totalSmsQueued = data.sms_queue.filter((q) => q.status === 'pending').length;
    const totalSmsSent = data.sms_history.filter((h) => h.status === 'completed').length;
    const totalSmsFailed = data.sms_history.filter((h) => h.status === 'failed').length;
    res.json({ totalUsers, totalDevices, onlineDevices, totalApiKeys, totalWebhooks, totalSmsQueued, totalSmsSent, totalSmsFailed });
  });

  app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    const data = await db.getData();
    const users = data.users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at, last_login: u.last_login }));
    res.json({ users });
  });

  app.post('/api/admin/user/:id/suspend', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const result = await db.mutate(async (data) => {
        const user = db.findUserById(data, req.params.id);
        if (!user) return { error: 'User not found', status: 404 };
        if (user.role === 'admin') return { error: 'Cannot suspend admin', status: 403 };

        user.role = 'suspended';
        user.updated_at = db.now();
        logActivity(data, 'admin', 'user_suspended', { target_user: user.id, email: user.email }, req, 'success');
        return { user: db.sanitizeUser(user) };
      });

      if (result.error) return res.status(result.status).json({ error: result.error });
      res.json(result.user);
    } catch (err) {
      res.status(500).json({ error: 'Action failed' });
    }
  });

  app.post('/api/admin/user/:id/unsuspend', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const result = await db.mutate(async (data) => {
        const user = db.findUserById(data, req.params.id);
        if (!user) return { error: 'User not found', status: 404 };

        user.role = 'user';
        user.updated_at = db.now();
        logActivity(data, 'admin', 'user_unsuspended', { target_user: user.id, email: user.email }, req, 'success');
        return { user: db.sanitizeUser(user) };
      });

      if (result.error) return res.status(result.status).json({ error: result.error });
      res.json(result.user);
    } catch (err) {
      res.status(500).json({ error: 'Action failed' });
    }
  });

  app.post('/api/admin/user/:id/delete', authenticateToken, requireAdmin, async (req, res) => {
    await db.mutate(async (data) => {
      const user = data.users.find((u) => u.id === req.params.id);
      if (!user) return { error: 'User not found', status: 404 };
      if (user.role === 'admin') return { error: 'Cannot delete admin', status: 403 };
      data.users = data.users.filter((u) => u.id !== req.params.id);
      data.devices = data.devices.filter((d) => d.user_id !== req.params.id);
      data.api_keys = data.api_keys.filter((k) => k.user_id !== req.params.id);
      data.webhooks = data.webhooks.filter((w) => w.user_id !== req.params.id);
      data.sms_queue = data.sms_queue.filter((q) => q.user_id !== req.params.id);
      data.sms_history = data.sms_history.filter((h) => h.user_id !== req.params.id);
      data.logs = data.logs.filter((l) => l.user_id !== req.params.id);
      data.settings = data.settings.filter((s) => s.user_id !== req.params.id);
      logActivity(data, req.user.id, 'user_deleted', { target_user_id: req.params.id }, req, 'success');
    });
    res.json({ message: 'User deleted' });
  });

  app.post('/api/admin/user/:id/set-role', authenticateToken, requireAdmin, async (req, res) => {
    const { role } = req.body;
    if (!['user', 'admin', 'suspended'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    try {
      const result = await db.mutate(async (data) => {
        const user = data.users.find((u) => u.id === req.params.id);
        if (!user) return { error: 'User not found', status: 404 };
        user.role = role;
        user.updated_at = db.now();
        logActivity(data, req.user.id, 'user_role_changed', { target_user_id: user.id, role }, req, 'success');
        return { user: db.sanitizeUser(user) };
      });

      if (result.error) return res.status(result.status).json({ error: result.error });
      res.json(result.user);
    } catch (err) {
      res.status(500).json({ error: 'Action failed' });
    }
  });

  app.get('/api/admin/users/:id/devices', authenticateToken, requireAdmin, async (req, res) => {
    const data = await db.getData();
    const devices = data.devices.filter((d) => d.user_id === req.params.id);
    res.json({ devices });
  });

  app.post('/api/admin/user/:id/send-sms', authenticateToken, requireAdmin, async (req, res) => {
    const { device_id, phone_number, message, sim_slot } = req.body;
    if (!phone_number || !message) return res.status(400).json({ error: 'Phone number and message required' });

    const result = await db.mutate(async (data) => {
      const targetUserId = req.params.id;
      const user = db.findUserById(data, targetUserId);
      if (!user) return { error: 'User not found', status: 404 };

      const gateway = db.getGatewayState(data, targetUserId);
      if (gateway.paused) return { error: 'Gateway is paused', status: 503 };

      const requestId = db.uuidv4();
      const id = db.uuidv4();
      const targetDevice = device_id ? data.devices.find((d) => d.id === device_id && d.user_id === targetUserId) : null;
      const availableDevice = targetDevice && targetDevice.status === 'online' ? targetDevice : data.devices.find((d) => d.user_id === targetUserId && d.status === 'online');

      const queueItem = {
        id, user_id: targetUserId, device_id: availableDevice?.id || null,
        phone_number, message, sim_slot: sim_slot || 1, priority: 0,
        webhook_url: null, metadata: {}, status: 'pending', retry_count: 0,
        max_retries: 3, error: null, source_ip: getClientIP(req), country: null,
        api_key_id: null, request_id: requestId, sent_at: null,
        delivered_at: null, created_at: db.now(), updated_at: db.now()
      };

      data.sms_queue.push(queueItem);
      data.sms_history.push({
        id: db.uuidv4(), user_id: targetUserId, device_id: availableDevice?.id || null,
        phone_number, message, sim_slot: sim_slot || 1, status: 'pending',
        error: null, duration: null, request_id: requestId, api_key_id: null,
        sent_at: db.now()
      });

      logActivity(data, targetUserId, 'sms_queued', { request_id: requestId, phone_number, source: 'admin' }, req, 'success', requestId);
      io.emit('queue_updated', { user_id: targetUserId, request_id, status: 'pending' });
      return { request_id, status: 'pending', message: 'SMS queued', id };
    });

    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  });

  app.get('/api/admin/logs', authenticateToken, requireAdmin, async (req, res) => {
    const data = await db.getData();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    let logs = data.logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (req.query.action) logs = logs.filter((l) => l.action === req.query.action);
    if (req.query.status) logs = logs.filter((l) => l.status === req.query.status);
    const total = logs.length;
    logs = logs.slice(offset, offset + limit);
    const usersById = {};
    data.users.forEach((u) => { usersById[u.id] = u; });
    logs = logs.map((l) => ({ ...l, user_email: usersById[l.user_id]?.email || 'System' }));
    res.json({ logs, total, page });
  });

  app.post('/api/admin/gateway/pause-all', authenticateToken, requireAdmin, async (req, res) => {
    await db.mutate(async (data) => {
      for (const userId of Object.keys(data.gateway_state)) {
        data.gateway_state[userId].paused = true;
        data.gateway_state[userId].updated_at = db.now();
      }
      logActivity(data, req.user.id, 'gateway_paused_all', {}, req, 'success');
    });
    res.json({ message: 'All gateways paused' });
  });

  app.post('/api/admin/gateway/resume-all', authenticateToken, requireAdmin, async (req, res) => {
    await db.mutate(async (data) => {
      for (const userId of Object.keys(data.gateway_state)) {
        data.gateway_state[userId].paused = false;
        data.gateway_state[userId].updated_at = db.now();
      }
      logActivity(data, req.user.id, 'gateway_resumed_all', {}, req, 'success');
    });
    res.json({ message: 'All gateways resumed' });
  });

}

module.exports = registerRoutes;
