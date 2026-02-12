const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. RENDER WEB SERVER (Crucial for Deployment) ---
const app = express();
const port = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("BibleBot is Running!"));
app.listen(port, () => console.log(`[SYSTEM] Web server active on port ${port}`));

// --- 2. BOT SETUP ---
const client = new Client({
    apiURL: "https://api.stoat.chat" // Points directly to the 2026 Stoat Node
});

const PREFIX = "!";

client.on("ready", () => {
    console.log("------------------------------------------");
    console.log(`✅ BOT ONLINE: ${client.user.username}`);
    console.log("------------------------------------------");
});

// --- 3. THE LISTENER ---
client.on("message", async (message) => {
    // Log every message to the Render console for debugging
    console.log(`[READING] ${message.author?.username || 'Unknown'}: ${message.content}`);

    if (!message.content || message.author?.bot) return;

    const content = message.content.toLowerCase();

    // Command: !test
    if (content === "!test" || content === "!ping") {
        console.log("[DEBUG] Test command detected.");
        return message.reply("Bot is reading the channel correctly! ✅");
    }

    // Command: !random
    if (content.startsWith(PREFIX + "random")) {
        console.log("[DEBUG] Fetching random verse...");
        try {
            const res = await fetch("https://bible-api.com/data/web/random");
            const data = await res.json();
            const v = data.random_verse;
            await message.reply(`🎲 **Random Verse**\n**${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
        } catch (err) {
            console.log("[ERROR] API Fail:", err);
            message.reply("Could not reach Bible API.");
        }
    }
});

// --- 4. START ---
if (!process.env.BOT_TOKEN) {
    console.log("[CRITICAL] No BOT_TOKEN found in Environment Variables!");
} else {
    client.loginBot(process.env.BOT_TOKEN);
}
