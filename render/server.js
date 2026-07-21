require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, UserFlagsBitField } = require("discord.js");
const nodemailer = require("nodemailer");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");
const initSmsGateway = require("./sms-gateway");
const rtdb = require("./firebase-init");

const app = express();
app.use(express.text({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  const host = req.hostname || '';
  if (host.includes('api.sms.luffyxd.store')) {
    return res.redirect(301, 'https://sms.luffyxd.store/');
  } else if (host.includes('discord-status-api-tm91.onrender.com')) {
    const devKey = process.env.DEV_PVT_KEY || 'nabeelxd';
    if (req.query.dev === devKey) {
      return res.send('Discord Full Status API + PCPanel API + XD SMS Gateway + OAuth is running!');
    } else {
      return res.redirect(301, 'https://discord-status-api-tm91.onrender.com/login.html');
    }
  }
  res.send('Discord Full Status API + PCPanel API + XD SMS Gateway + OAuth is running!');
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

const DISCORD_CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';
const DISCORD_CLIENT_SECRET = process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const DISCORD_REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/discord/callback';
const GUILD_ID = '1033756069706600579';

let presenceCache = {};
let profileCache = {};
let lastSeenCache = {};
let applicationCache = {};
let otpStorage = {};
let oauthUsers = {};

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

function encodeEmailKey(email) {
  return email
    .replace(/\./g, '__dot__')
    .replace(/#/g, '__hash__')
    .replace(/\$/g, '__dollar__')
    .replace(/\[/g, '__lb__')
    .replace(/\]/g, '__rb__')
    .replace(/\//g, '__slash__');
}

function decodeEmailKey(key) {
  return key
    .replace(/__dot__/g, '.')
    .replace(/__hash__/g, '#')
    .replace(/__dollar__/g, '$')
    .replace(/__lb__/g, '[')
    .replace(/__rb__/g, ']')
    .replace(/__slash__/g, '/');
}

async function getData() {
  const fbUsers = await rtdb.get('pcpanel/users') || {};
  const users = {};
  for (const [encodedEmail, userData] of Object.entries(fbUsers)) {
    users[decodeEmailKey(encodedEmail)] = userData;
  }
  return { users };
}

async function saveData(data) {
  const fbUsers = {};
  for (const [email, userData] of Object.entries(data.users)) {
    fbUsers[encodeEmailKey(email)] = userData;
  }
  await rtdb.set('pcpanel/users', Object.keys(fbUsers).length > 0 ? fbUsers : null);
}

async function getOAuthData() {
  try {
    oauthUsers = await rtdb.get('oauth/users') || {};
  } catch (err) {
    console.warn('OAuth data load failed:', err.message);
    oauthUsers = {};
  }
}

async function saveOAuthData() {
  await rtdb.set('oauth/users', Object.keys(oauthUsers).length > 0 ? oauthUsers : null);
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         '0.0.0.0';
}

function safeParseBody(value) {
  if (typeof value === 'object' && value !== null) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

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
            <h1>ðŸ” Nexus Hosting</h1>
            <p>Secure PCPanel Access</p>
        </div>
        <div class="content">
            <h2>Your One-Time Password</h2>
            <p>Use the following OTP to access your Nexus Hosting PCPanel dashboard. This OTP is valid for 10 minutes.</p>
            <div class="otp-box">${otp}</div>
            <div class="info-box">
                <h3>âš ï¸ Security Notice</h3>
                <ul>
                    <li>This OTP will expire in 10 minutes</li>
                    <li>Do not share this code with anyone</li>
                    <li>Nexus Hosting will never ask for your OTP</li>
                    <li>If you didn't request this, please ignore this email</li>
                </ul>
            </div>
        </div>
        <div class="footer">
            <p>Â© ${new Date().getFullYear()} Nexus Hosting. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
  `;
}

function parseBadges(flags) {
  const names = new UserFlagsBitField(flags).toArray();
  return names.length ? names : ["None"];
}

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

function parseDescription(bio) {
  if (!bio) return null;

  const emojis = [];
  const emojiRegex = /<(a)?:(\w+):(\d+)>/g;
  let match;

  while ((match = emojiRegex.exec(bio)) !== null) {
    const animated = Boolean(match[1]);
    const name = match[2];
    const id = match[3];
    emojis.push({
      id,
      name,
      animated,
      url: `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`
    });
  }

  return {
    text: bio,
    emojis
  };
}

async function fetchUserBio(userId, guildId) {
  try {
    const options = guildId
      ? { query: new URLSearchParams({ guild_id: guildId }) }
      : undefined;
    const data = await client.rest.get(`/users/${userId}/profile`, options);
    const bio = data?.user_profile?.bio || data?.guild_member_profile?.bio || null;
    return parseDescription(bio);
  } catch {
    return null;
  }
}

async function getApplicationInfo(applicationId) {
  if (!applicationId) return null;
  if (applicationCache[applicationId]) return applicationCache[applicationId];

  try {
    const app = await client.rest.get(`/applications/${applicationId}`);
    const info = {
      name: app.name,
      icon: app.icon
        ? `https://cdn.discordapp.com/app-icons/${applicationId}/${app.icon}.png?size=512`
        : null
    };
    applicationCache[applicationId] = info;
    return info;
  } catch {
    return null;
  }
}

function resolveAssetImage(applicationId, assetKey) {
  if (!assetKey) return null;

  if (assetKey.startsWith("mp:external/")) {
    const encoded = assetKey.replace(/^mp:external\/[^/]+\//, "");
    return decodeURIComponent(encoded);
  }

  if (assetKey.startsWith("spotify:")) {
    return `https://i.scdn.co/image/${assetKey.slice(8)}`;
  }

  if (applicationId) {
    return `https://cdn.discordapp.com/app-assets/${applicationId}/${assetKey}.png?size=512`;
  }

  return null;
}

function formatActivityEmoji(emoji) {
  if (!emoji) return null;

  if (emoji.id) {
    const animated = Boolean(emoji.animated);
    return {
      id: emoji.id,
      name: emoji.name,
      animated,
      url: `https://cdn.discordapp.com/emojis/${emoji.id}.${animated ? "gif" : "png"}`
    };
  }

  return {
    id: null,
    name: emoji.name,
    animated: false,
    url: null
  };
}

async function mapActivity(activity) {
  const applicationId = activity.applicationId || null;
  const appInfo = applicationId ? await getApplicationInfo(applicationId) : null;

  let state = activity.state ?? null;
  if (activity.type === 2 && state) {
    state = state.replace(/;\s*/g, ", ");
  }

  const largeImageUrl = resolveAssetImage(applicationId, activity.assets?.largeImage);
  const smallImageUrl = resolveAssetImage(applicationId, activity.assets?.smallImage);
  const image = largeImageUrl || smallImageUrl || appInfo?.icon || null;

  const assets = activity.assets
    ? {
        largeText: activity.assets.largeText ?? null,
        smallText: activity.assets.smallText ?? null,
        largeImage: activity.assets.largeImage ?? null,
        smallImage: activity.assets.smallImage ?? null,
        largeImageUrl,
        smallImageUrl
      }
    : null;

  const party = activity.party
    ? {
        id: activity.party.id ?? null,
        current: activity.party.size?.[0] ?? null,
        max: activity.party.size?.[1] ?? null
      }
    : null;

  return {
    name: activity.name,
    type: activity.type,
    state,
    details: activity.details ?? null,
    emoji: formatActivityEmoji(activity.emoji),
    timestamps: activity.timestamps ?? null,
    party,
    assets,
    application_id: applicationId,
    image
  };
}

async function joinUserToGuild(userId, accessToken) {
  try {
    await axios.put(
      `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
      {
        access_token: accessToken
      },
      {
        headers: {
          Authorization: `Bot ${process.env.BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`User ${userId} joined guild successfully`);
  } catch (error) {
    if (error.response?.status !== 201 && error.response?.status !== 204) {
      console.error('Failed to add user to guild:', error.response?.data);
    }
  }
}

async function refreshAccessToken(refreshToken) {
  try {
    const response = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}

client.on("presenceUpdate", async (oldP, newP) => {
  const user = await client.users.fetch(newP.userId).catch(() => null);
  if (!user) return;

  const uid = newP.userId;
  const activities = newP.activities || [];
  const guildId = newP.guild?.id || null;
  const description = await fetchUserBio(uid, guildId);
  const mappedActivities = await Promise.all(activities.map(mapActivity));

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
      : null,
    description
  };

  presenceCache[uid] = {
    status: newP.status,
    activities: mappedActivities
  };

  if (newP.status === "offline") {
    lastSeenCache[uid] = Date.now();
  }

  console.log("Updated:", uid);
});

app.get("/status", (req, res) => {
  const id = req.query.id;
  if (!id) return res.json({ error: "Missing ?id=DISCORD_ID" });

  const profile = profileCache[id];
  const presence = presenceCache[id];
  const oauthData = oauthUsers[id];

  if (oauthData) {
    let lastSeen = null;
    if (presence?.status === "offline" && lastSeenCache[id]) {
      lastSeen = formatAgo(Date.now() - lastSeenCache[id]);
    }

    const mergedProfile = {
      id: id,
      username: profile?.username || oauthData.username,
      global_name: profile?.global_name || oauthData.global_name,
      avatar: profile?.avatar || oauthData.avatar,
      banner: profile?.banner || oauthData.banner,
      badges: profile?.badges || ["None"],
      avatar_decoration: profile?.avatar_decoration || null,
      description: profile?.description || null,
      email: oauthData.email,
      verified: oauthData.verified,
      premium_type: oauthData.premium_type,
      locale: oauthData.locale,
      guilds_count: oauthData.guilds?.length || 0
    };

    return res.json({
      profile: mergedProfile,
      presence: presence || { status: "offline", activities: [] },
      oauth: {
        authenticated: true,
        email: oauthData.email,
        verified: oauthData.verified,
        last_login: oauthData.last_login
      },
      last_seen: lastSeen
    });
  }

  if (!profile || !presence) {
    return res.json({
      error: "User data not found. User needs to authenticate first.",
      auth_required: true,
      login_url: `/auth/discord/login`
    });
  }

  let lastSeen = null;
  if (presence.status === "offline" && lastSeenCache[id]) {
    lastSeen = formatAgo(Date.now() - lastSeenCache[id]);
  }

  res.json({
    profile: profile,
    presence: presence,
    last_seen: lastSeen,
    oauth: {
      authenticated: false,
      login_url: `/auth/discord/login`
    }
  });
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/auth/discord/login', (req, res) => {
  const scope = 'identify email guilds guilds.join';
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}`;
  res.redirect(authUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const userData = userResponse.data;

    const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    await joinUserToGuild(userData.id, access_token);

    oauthUsers[userData.id] = {
      id: userData.id,
      username: userData.username,
      global_name: userData.global_name,
      email: userData.email,
      verified: userData.verified,
      avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : null,
      banner: userData.banner ? `https://cdn.discordapp.com/banners/${userData.id}/${userData.banner}.png` : null,
      locale: userData.locale,
      premium_type: userData.premium_type,
      flags: userData.flags,
      access_token: access_token,
      refresh_token: refresh_token,
      expires_at: Date.now() + expires_in * 1000,
      guilds: guildsResponse.data,
      last_login: new Date().toISOString()
    };

    await saveOAuthData();

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Authentication Successful</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  background: linear-gradient(135deg, #5865F2, #7289DA);
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  color: white;
              }
              .success-box {
                  background: rgba(255, 255, 255, 0.1);
                  backdrop-filter: blur(10px);
                  padding: 40px;
                  border-radius: 20px;
                  text-align: center;
                  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                  max-width: 500px;
              }
              .checkmark {
                  font-size: 80px;
                  display: block;
                  margin-bottom: 20px;
              }
              h1 {
                  margin: 0 0 10px;
                  font-size: 2.5rem;
              }
              p {
                  margin: 10px 0;
                  opacity: 0.9;
                  font-size: 1.2rem;
              }
              .info {
                  background: rgba(255,255,255,0.2);
                  padding: 15px;
                  border-radius: 10px;
                  margin: 20px 0;
              }
          </style>
      </head>
      <body>
          <div class="success-box">
              <span class="checkmark">âœ…</span>
              <h1>Authentication Successful!</h1>
              <p>Welcome, ${userData.global_name || userData.username}!</p>
              <div class="info">
                  <p>You've been added to our Discord server.</p>
                  <p>You can now close this window.</p>
              </div>
          </div>
          <script>
              setTimeout(() => window.close(), 5000);
          </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Authentication failed', 
      details: error.response?.data || error.message 
    });
  }
});

app.get('/auth/discord/logout/:userId', async (req, res) => {
  const userId = req.params.userId;
  const userData = oauthUsers[userId];
  
  if (userData?.access_token) {
    try {
      await axios.post('https://discord.com/api/oauth2/token/revoke',
        new URLSearchParams({
          token: userData.access_token,
          token_type_hint: 'access_token'
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${DISCORD_CLIENT_ID}:${DISCORD_CLIENT_SECRET}`).toString('base64')}`
          }
        }
      );
    } catch (error) {
      console.error('Token revocation failed:', error);
    }
  }
  
  delete oauthUsers[userId];
  await saveOAuthData();
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/oauth/users', (req, res) => {
  const users = Object.values(oauthUsers).map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    verified: u.verified,
    last_login: u.last_login
  }));
  res.json({ users });
});

app.get("/pcpanel/verify", async (req, res) => {
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

app.get("/pcpanel/verify-send-otp", async (req, res) => {
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

    const otp = generateOTP();
    const expiry = Date.now() + (10 * 60 * 1000);

    otpStorage[email] = {
      otp: otp,
      expiry: expiry,
      attempts: 0,
      blocked_until: null
    };

    const mailOptions = {
      from: '"Nexus Hosting - PCPanel Server" <thenexusserverpanel@gmail.com>',
      to: email,
      subject: 'Your OTP for Nexus Hosting PCPanel',
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

app.post("/pcpanel/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.json({ error: true, message: "Email and OTP are required" });
  }

  try {
    const stored = otpStorage[email];

    if (!stored) {
      return res.json({ error: true, message: "OTP not found. Please request a new one." });
    }

    if (stored.blocked_until && Date.now() < stored.blocked_until) {
      const remaining = Math.ceil((stored.blocked_until - Date.now()) / 1000 / 60);
      return res.json({
        error: true,
        message: `Too many failed attempts. Please wait ${remaining} minutes.`,
        blocked: true
      });
    }

    if (Date.now() > stored.expiry) {
      delete otpStorage[email];
      return res.json({ error: true, message: "OTP expired. Please request a new one." });
    }

    if (stored.otp !== otp) {
      stored.attempts++;

      if (stored.attempts >= 3) {
        stored.blocked_until = Date.now() + (5 * 60 * 1000);
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

    delete otpStorage[email];

    const data = await getData();
    if (data.users[email]) {
      data.users[email].last_login = new Date().toISOString();
      data.users[email].last_ip = getClientIP(req);
      await saveData(data);
    }

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

app.all("/pcpanel/api/*", async (req, res) => {
  const panelUrl = req.query.panel_url;
  const capi = req.query.capi;

  if (!panelUrl || !capi) {
    return res.json({
      error: true,
      message: "panel_url and capi (API key) are required"
    });
  }

  const endpoint = req.path.replace('/pcpanel/api/', '');

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

    const queryParams = { ...req.query };
    delete queryParams.panel_url;
    delete queryParams.capi;
    if (Object.keys(queryParams).length > 0) {
      config.url += '?' + new URLSearchParams(queryParams).toString();
    }

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

app.get("/pcpanel/api/delete-user", async (req, res) => {
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

app.get("/pcpanel/api/create-user", async (req, res) => {
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

app.get("/pcpanel/api/list-users", async (req, res) => {
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

app.get("/pcpanel/api/list-servers", async (req, res) => {
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

app.get("/pcpanel/api/suspend-server", async (req, res) => {
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

app.get("/pcpanel/api/unsuspend-server", async (req, res) => {
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

app.get("/pcpanel/api/delete-server", async (req, res) => {
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

const { server } = initSmsGateway(app);

getOAuthData().then(() => {
  client.login(process.env.BOT_TOKEN).catch(console.error);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Discord bot ${process.env.BOT_TOKEN ? 'will login' : 'needs BOT_TOKEN'}`);
    console.log(`XD SMS Gateway module loaded`);
  });
});
