const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

// Cache every user's presence the bot sees
let usersPresence = {};

client.on("presenceUpdate", (oldP, newP) => {
  const uid = newP.userId;
  const activities = newP.activities || [];

  usersPresence[uid] = {
    status: newP.status,
    activities: activities.map(a => ({
      name: a.name,
      type: a.type,
      state: a.state,
      details: a.details
    }))
  };

  console.log("Updated presence for:", uid);
});

// API example → /status?id=1234567890
app.get("/status", (req, res) => {
  const id = req.query.id;

  if (!id) return res.json({ error: "Missing ?id=DISCORD_ID" });

  if (!usersPresence[id])
    return res.json({ error: "No presence found for this ID yet." });

  res.json({
    id,
    ...usersPresence[id]
  });
});

// Root page to show "Running"
app.get("/", (req, res) => {
  res.send("Discord Status API is running!");
});

client.login(process.env.BOT_TOKEN);
app.listen(PORT, () => console.log("Server running on port " + PORT));
