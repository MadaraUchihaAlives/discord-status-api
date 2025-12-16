const express = require("express");
const { Client, GatewayIntentBits, UserFlagsBitField } = require("discord.js");
const nodemailer = require("nodemailer");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

// Caches
let presenceCache = {};
let profileCache = {};
let lastSeenCache = {};

// OTP Storage (in-memory, could be moved to Redis/DB)
let otpStorage = {};

// SMTP Configuration
const smtpConfig = {
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'thenexusserverpanel@gmail.com',
    pass: 'bdmc kzuo psab ouxc'
  }
};

const transporter = nodemailer.createTransport(smtpConfig);

// Data file path
const DATA_FILE = path.join(__dirname, 'data.json');

// Helper: Read data.json
async function getData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { users: {} };
  }
}

// Helper: Save data.json
async function saveData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Helper: Generate OTP
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Helper: Get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         '0.0.0.0';
}

// Helper: Send Telegram notification
async function sendTelegramNotification(chatId, message) {
  const botToken = '8218669668:AAG_l2txL0asxz5b7-WdcSox5eIXNBDMDbQ';
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Telegram notification error:', error.message);
  }
}

// Helper: Create email template
function createEmailTemplate(otp) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your OTP Code</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .header {
            background: linear-gradient(135deg, #5865F2 0%, #4752C4 100%);
            padding: 40px;
            text-align: center;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5rem;
        }
        .header p {
            margin: 10px 0 0;
            opacity: 0.9;
        }
        .content {
            padding: 40px;
        }
        .otp-box {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            margin: 30px 0;
            font-size: 2.5rem;
            font-weight: bold;
            letter-spacing: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .info-box {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin: 30px 0;
            border-left: 5px solid #5865F2;
        }
        .footer {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            color: #666;
            font-size: 0.9rem;
            border-top: 1px solid #eee;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Nexus Hosting</h1>
            <p>Secure CPanel Access</p>
        </div>
        <div class="content">
            <h2>Your One-Time Password</h2>
            <p>Use the following OTP to access your Nexus Hosting CPanel dashboard. This OTP is valid for 10 minutes.</p>
            <div class="otp-box">${otp}</div>
            <div class="info-box">
                <h3>⚠️ Security Notice</h3>
                <ul>
                    <li>This OTP will expire in 10 minutes</li>
                    <li>Do not share this code with anyone</li>
                    <li>Nexus Hosting will never ask for your OTP</li>
                    <li>If you didn't request this, please ignore this email</li>
                </ul>
            </div>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} Nexus Hosting. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
  `;
}

// Badge parser
function parseBadges(flags) {
  const names = new UserFlagsBitField(flags).toArray();
  return names.length ? names : ["None"];
}

// Last seen formatter
function formatAgo(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const month = Math.floor(day / 30);
  if (month >= 1) return `${month} month${month > 1 ? "s" : ""} ago`;
  if (day >= 1) return `${day} day${day > 1 ? "s" : ""} ago`;
  if (hr >= 1) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
  if (min >= 1) return `${min} minute${min > 1 ? "s" : ""} ago`;
  return `just now`;
}

// Discord Bot Events
client.on("presenceUpdate", async (oldP, newP) => {
  const user = await client.users.fetch(newP.userId).catch(() => null);
  if (!user) return;

  const uid = newP.userId;
  const activities = newP.activities || [];

  // Save profile data
  profileCache[uid] = {
    id: uid,
    username: user.username,
    global_name: user.globalName ?? user.username,
    avatar: user.displayAvatarURL({ size: 1024 }),
    banner: user.bannerURL({ size: 1024 }) || null,
    badges: parseBadges(user.flags?.bitfield || 0),
    avatar_decoration: user.avatarDecorationData
      ? {
          id: user.avatarDecorationData.asset,
          url: `https://cdn.discordapp.com/avatar-decoration-presets/${user.avatarDecorationData.asset}.png`
        }
      : null
  };

  // Save presence
  presenceCache[uid] = {
    status: newP.status,
    activities: activities.map(a => ({
      name: a.name,
      type: a.type,
      state: a.state,
      details: a.details,
      emoji: a.emoji || null,
      timestamps: a.timestamps || null,
      assets: a.assets || null
    }))
  };

  // If user goes offline, record lastSeen timestamp
  if (newP.status === "offline") {
    lastSeenCache[uid] = Date.now();
  }

  console.log("Updated:", uid);
});

// Discord Status API
app.get("/status", (req, res) => {
  const id = req.query.id;
  if (!id) return res.json({ error: "Missing ?id=DISCORD_ID" });

  const profile = profileCache[id];
  const presence = presenceCache[id];
  if (!profile || !presence)
    return res.json({
      error: "User data not found yet. Wait until bot sees the user's presence."
    });

  // Calculate last seen
  let lastSeen = null;
  if (presence.status === "offline" && lastSeenCache[id]) {
    lastSeen = formatAgo(Date.now() - lastSeenCache[id]);
  }

  res.json({
    profile: profile,
    presence: presence,
    last_seen: lastSeen
  });
});

// CPanel Verify Endpoint
app.get("/cpanel/verify", async (req, res) => {
  const email = req.query.mail;
  
  if (!email) {
    return res.json({ error: true, message: "Email is required" });
  }

  try {
    const data = await getData();
    
    if (!data.users[email]) {
      return res.json({ 
        error: true, 
        message: "Email not found",
        access: "not_found"
      });
    }

    const user = data.users[email];
    
    return res.json({
      error: false,
      email: email,
      access: user.access,
      registered_at: user.registered_at,
      last_login: user.last_login || null
    });
  } catch (error) {
    return res.json({ error: true, message: error.message });
  }
});

// CPanel Send OTP Endpoint
app.get("/cpanel/verify-send-otp", async (req, res) => {
  const email = req.query.mail;
  
  if (!email) {
    return res.json({ error: true, message: "Email is required" });
  }

  try {
    const data = await getData();
    
    if (!data.users[email]) {
      return res.json({ 
        error: true, 
        message: "Email not found. Please register first." 
      });
    }

    const user = data.users[email];
    
    if (user.access !== 'allow') {
      return res.json({ 
        error: true, 
        message: `Access ${user.access}. Please wait for approval.`,
        access: user.access
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiry = Date.now() + (10 * 60 * 1000); // 10 minutes

    // Store OTP
    otpStorage[email] = {
      otp: otp,
      expiry: expiry,
      attempts: 0,
      blocked_until: null
    };

    // Send email
    const mailOptions = {
      from: '"Nexus Hosting - CPanel Server" <thenexusserverpanel@gmail.com>',
      to: email,
      subject: 'Your OTP for Nexus Hosting CPanel',
      html: createEmailTemplate(otp)
    };

    await transporter.sendMail(mailOptions);

    return res.json({
      error: false,
      message: "OTP sent successfully",
      expiry: expiry
    });
  } catch (error) {
    console.error('OTP send error:', error);
    return res.json({ 
      error: true, 
      message: `Failed to send OTP: ${error.message}` 
    });
  }
});

// CPanel Verify OTP Endpoint
app.post("/cpanel/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  
  if (!email || !otp) {
    return res.json({ error: true, message: "Email and OTP are required" });
  }

  try {
    const stored = otpStorage[email];
    
    if (!stored) {
      return res.json({ error: true, message: "OTP not found. Please request a new one." });
    }

    // Check if blocked
    if (stored.blocked_until && Date.now() < stored.blocked_until) {
      const remaining = Math.ceil((stored.blocked_until - Date.now()) / 1000 / 60);
      return res.json({ 
        error: true, 
        message: `Too many failed attempts. Please wait ${remaining} minutes.`,
        blocked: true
      });
    }

    // Check if expired
    if (Date.now() > stored.expiry) {
      delete otpStorage[email];
      return res.json({ error: true, message: "OTP expired. Please request a new one." });
    }

    // Verify OTP
    if (stored.otp !== otp) {
      stored.attempts++;
      
      if (stored.attempts >= 3) {
        stored.blocked_until = Date.now() + (5 * 60 * 1000); // 5 minutes
        delete otpStorage[email];
        return res.json({ 
          error: true, 
          message: "Too many failed attempts. Please wait 5 minutes.",
          blocked: true
        });
      }
      
      return res.json({ 
        error: true, 
        message: `Invalid OTP. ${3 - stored.attempts} attempts remaining.`,
        attempts_remaining: 3 - stored.attempts
      });
    }

    // OTP verified successfully
    delete otpStorage[email];
    
    // Update last login
    const data = await getData();
    if (data.users[email]) {
      data.users[email].last_login = new Date().toISOString();
      data.users[email].last_ip = getClientIP(req);
      await saveData(data);
    }

    // Generate session token (simple, could use JWT)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    return res.json({
      error: false,
      message: "OTP verified successfully",
      session_token: sessionToken,
      email: email
    });
  } catch (error) {
    return res.json({ error: true, message: error.message });
  }
});

// Pterodactyl API Proxy - Generic endpoint
app.all("/cpanel/api/*", async (req, res) => {
  const panelUrl = req.query.panel_url;
  const capi = req.query.capi;
  
  if (!panelUrl || !capi) {
    return res.json({ 
      error: true, 
      message: "panel_url and capi (API key) are required" 
    });
  }

  // Extract endpoint from path
  const endpoint = req.path.replace('/cpanel/api/', '');
  
  if (!endpoint) {
    return res.json({ error: true, message: "Invalid endpoint" });
  }

  try {
    const url = `${panelUrl}/api/application/${endpoint}`;
    const method = req.method;
    
    const config = {
      method: method,
      url: url,
      headers: {
        'Authorization': `Bearer ${capi}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    // Add query params (except panel_url and capi)
    const queryParams = { ...req.query };
    delete queryParams.panel_url;
    delete queryParams.capi;
    if (Object.keys(queryParams).length > 0) {
      config.url += '?' + new URLSearchParams(queryParams).toString();
    }

    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) {
      config.data = req.body;
    }

    const response = await axios(config);
    
    return res.json({
      error: false,
      data: response.data
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.errors?.[0]?.detail || 
                   error.response?.data?.error || 
                   error.message;
    
    return res.status(status).json({
      error: true,
      message: message,
      code: status
    });
  }
});

// Specific API endpoints for convenience
app.get("/cpanel/api/delete-user", async (req, res) => {
  const { panel_url, capi, userid } = req.query;
  
  if (!panel_url || !capi || !userid) {
    return res.json({ 
      error: true, 
      message: "panel_url, capi, and userid are required" 
    });
  }

  try {
    const response = await axios.delete(
      `${panel_url}/api/application/users/${userid}`,
      {
        headers: {
          'Authorization': `Bearer ${capi}`,
          'Accept': 'application/json'
        }
      }
    );
    
    return res.json({
      error: false,
      message: "User deleted successfully",
      data: response.data
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: true,
      message: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
});

app.get("/cpanel/api/create-user", async (req, res) => {
  const { panel_url, capi, email, username, first_name, last_name, password, root_admin } = req.query;
  
  if (!panel_url || !capi || !email || !username || !password) {
    return res.json({ 
      error: true, 
      message: "panel_url, capi, email, username, and password are required" 
    });
  }

  try {
    const response = await axios.post(
      `${panel_url}/api/application/users`,
      {
        email,
        username,
        first_name: first_name || '',
        last_name: last_name || '',
        password,
        root_admin: root_admin === 'true' || root_admin === '1',
        language: 'en'
      },
      {
        headers: {
          'Authorization': `Bearer ${capi}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.json({
      error: false,
      message: "User created successfully",
      data: response.data
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: true,
      message: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
});

app.get("/cpanel/api/list-users", async (req, res) => {
  const { panel_url, capi, page } = req.query;
  
  if (!panel_url || !capi) {
    return res.json({ 
      error: true, 
      message: "panel_url and capi are required" 
    });
  }

  try {
    const url = `${panel_url}/api/application/users${page ? `?page=${page}` : ''}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${capi}`,
        'Accept': 'application/json'
      }
    });
    
    return res.json({
      error: false,
      data: response.data
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: true,
      message: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
});

app.get("/cpanel/api/list-servers", async (req, res) => {
  const { panel_url, capi, page } = req.query;
  
  if (!panel_url || !capi) {
    return res.json({ 
      error: true, 
      message: "panel_url and capi are required" 
    });
  }

  try {
    const url = `${panel_url}/api/application/servers${page ? `?page=${page}` : ''}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${capi}`,
        'Accept': 'application/json'
      }
    });
    
    return res.json({
      error: false,
      data: response.data
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: true,
      message: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
});

app.get("/cpanel/api/suspend-server", async (req, res) => {
  const { panel_url, capi, serverid } = req.query;
  
  if (!panel_url || !capi || !serverid) {
    return res.json({ 
      error: true, 
      message: "panel_url, capi, and serverid are required" 
    });
  }

  try {
    const response = await axios.post(
      `${panel_url}/api/application/servers/${serverid}/suspend`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${capi}`,
          'Accept': 'application/json'
        }
      }
    );
    
    return res.json({
      error: false,
      message: "Server suspended successfully",
      data: response.data
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: true,
      message: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
});

app.get("/cpanel/api/unsuspend-server", async (req, res) => {
  const { panel_url, capi, serverid } = req.query;
  
  if (!panel_url || !capi || !serverid) {
    return res.json({ 
      error: true, 
      message: "panel_url, capi, and serverid are required" 
    });
  }

  try {
    const response = await axios.post(
      `${panel_url}/api/application/servers/${serverid}/unsuspend`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${capi}`,
          'Accept': 'application/json'
        }
      }
    );
    
    return res.json({
      error: false,
      message: "Server unsuspended successfully",
      data: response.data
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: true,
      message: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
});

app.get("/cpanel/api/delete-server", async (req, res) => {
  const { panel_url, capi, serverid } = req.query;
  
  if (!panel_url || !capi || !serverid) {
    return res.json({ 
      error: true, 
      message: "panel_url, capi, and serverid are required" 
    });
  }

  try {
    const response = await axios.delete(
      `${panel_url}/api/application/servers/${serverid}`,
      {
        headers: {
          'Authorization': `Bearer ${capi}`,
          'Accept': 'application/json'
        }
      }
    );
    
    return res.json({
      error: false,
      message: "Server deleted successfully",
      data: response.data
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: true,
      message: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("Discord Full Status API + CPanel API is running!");
});

// Start server
client.login(process.env.BOT_TOKEN).catch(console.error);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Discord bot ${process.env.BOT_TOKEN ? 'will login' : 'needs BOT_TOKEN'}`);
});

