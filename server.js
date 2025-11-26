const express = require("express");
const { 
  Client, 
  GatewayIntentBits,
  UserFlagsBitField 
} = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

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

    // Avatar Decoration
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

// API endpoint
app.get("/status", (req, res) => {
  const id = req.query.id;
  if (!id) return res.json({ error: "Missing ?id=DISCORD_ID" });

  const profile = profileCache[id];
  const presence = presenceCache[id];

  if (!profile || !presence)
    return res.json({
      error: "User data not found yet. Wait until bot sees the user’s presence."
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

app.get("/", (req, res) => {
  res.send("Discord Full Status API is running!");
});

client.login(process.env.BOT_TOKEN);
app.listen(PORT, () => console.log("Server running on port " + PORT));
