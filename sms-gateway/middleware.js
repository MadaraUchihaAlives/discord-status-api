'use strict';

const jwt = require('jsonwebtoken');
const db = require('./db');

function createMiddleware(jwtSecret) {
  async function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.headers['x-access-token'] || req.query.token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      let payload;
      try {
        payload = jwt.verify(token, jwtSecret);
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
      const data = await db.getData();
      const session = db.findSession(data, token);
      if (!session) {
        return res.status(401).json({ error: 'Session expired' });
      }
      const user = db.findUserById(data, payload.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      if (user.role === 'suspended') {
        return res.status(403).json({ error: 'Account suspended' });
      }
      req.user = db.sanitizeUser(user);
      req.authToken = token;
      next();
    } catch {
      return res.status(500).json({ error: 'Authentication error' });
    }
  }

  function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.body?.apikey || req.query?.apikey;

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    db.mutate(async (data) => {
      const keyData = db.findApiKey(data, apiKey);
      if (!keyData) {
        return { error: 'Invalid API key', status: 401 };
      }

      const gateway = db.getGatewayState(data, keyData.user_id);
      if (gateway.paused) {
        return { error: 'Gateway is paused', status: 503 };
      }

      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.connection?.remoteAddress || '';

      if (keyData.allowed_ips && keyData.allowed_ips !== '*' && clientIp) {
        const allowed = keyData.allowed_ips.split(',').map((ip) => ip.trim());
        if (!allowed.includes(clientIp) && !allowed.includes('*')) {
          return { error: 'IP not allowed', status: 403 };
        }
      }

      keyData.usage_count = (keyData.usage_count || 0) + 1;
      keyData.last_used = db.now();
      req.apiKey = keyData;
      req.user = db.sanitizeUser(db.findUserById(data, keyData.user_id));
      return { success: true };
    }).then(result => {
      if (result?.error) {
        return res.status(result.status).json({ error: result.error });
      }
      next();
    }).catch(() => res.status(500).json({ error: 'Authentication failed' }));
  }

  function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  }

  return { authenticateToken, authenticateApiKey, requireAdmin };
}

module.exports = createMiddleware;
