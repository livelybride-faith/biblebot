const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. THE WEB SERVER (To keep Render happy) ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot is Online!"));
app.listen(10000); // Render uses port 10000 by default

// --- 2. THE BIBLE BOT ---
const client = new Client();

client.on("ready", () => console.log(`Logged in as ${client.user.username}!`));

client.on("message", async (message) => {
    if (!message.content || !message.content.startsWith("!verse")) return;

    const reference = message.content.replace("!verse ", "").trim();
    try {
        const response = await fetch(`https://bible-api.com/${reference}`);
        const data = await response.json();
        if (data.text) {
            message.reply(`**${data.reference}**\n${data.text}`);
        } else {
            message.reply("Couldn't find that verse!");
        }
    } catch (e) {
        message.reply("Error fetching verse.");
    }
});

client.loginBot(process.env.BOT_TOKEN);
