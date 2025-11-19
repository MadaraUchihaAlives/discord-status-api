const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials,
  UserFlagsBitField
} = require("discord.js");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.User]
});

let presenceCache = {};
let profileCache = {};

function parseBadges(flags) {
  const names = new UserFlagsBitField(flags).toArray();
  return names.length ? names : ["None"];
}

client.on("presenceUpdate", async (oldP, newP) => {
  try {
    const user = await client.users.fetch(newP.userId);
    if (!user) return;

    const userId = newP.userId;

    profileCache[userId] = {
      id: userId,
      username: user.username,
      global_name: user.globalName ?? user.username,
      avatar: user.displayAvatarURL({ size: 1024 }),
      banner: user.bannerURL({ size: 1024 }) || null,
      badges: parseBadges(user.flags?.bitfield || 0)
    };

    presenceCache[userId] = {
      status: newP.status,
      activities: (newP.activities || []).map(a => ({
        name: a.name,
        type: a.type,
        state: a.state,
        details: a.details,
        emoji: a.emoji || null,
        timestamps: a.timestamps || null,
        assets: a.assets || null
      }))
    };

    console.log("Updated:", userId);
  } catch (err) {
    console.log("Presence error:", err.message);
  }
});

app.get("/status", (req, res) => {
  const id = req.query.id;

  if (!id) return res.json({ error: "Missing ?id=DISCORD_ID" });

  const profile = profileCache[id];
  const presence = presenceCache[id];

  if (!profile || !presence)
    return res.json({
      error: "User not cached yet. The bot must see the user online at least once."
    });

  res.json({
    profile: profile,
    presence: presence
  });
});

app.get("/", (req, res) => {
  res.send("Discord Full Status API is running!");
});

client.login(process.env.BOT_TOKEN);
app.listen(PORT, () => console.log("API running on port " + PORT));
