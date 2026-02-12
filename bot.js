const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. RENDER WEB SERVER ---
// This allows you to test the bot in your browser via your Render URL
const app = express();
const port = process.env.PORT || 10000;

app.get("/", (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h1>📖 BibleBot Status: ONLINE</h1>
            <p>Your bot is successfully hosted on Render.</p>
            <p>Go to <strong>/testapi</strong> to check the Bible connection.</p>
        </div>
    `);
});

// Browser test for the Bible API
app.get("/testapi", async (req, res) => {
    try {
        const response = await fetch("https://bible-api.com/data/web/random");
        const data = await response.json();
        res.json({ status: "API Working", verse: data.random_verse.text });
    } catch (e) {
        res.status(500).json({ error: "Bible API unreachable" });
    }
});

app.listen(port, () => console.log(`[SYSTEM] Web server listening on port ${port}`));

// --- 2. STOAT CLIENT CONFIG ---
// Crucial: apiURL must point to stoat.chat for 2026 bots
const client = new Client({
    apiURL: "https://api.stoat.chat"
});

const PREFIX = "!";

client.on("ready", () => {
    console.log("==========================================");
    console.log(`📡 CONNECTED: ${client.user.username}`);
    console.log(`🆔 BOT ID: ${client.user.id}`);
    console.log("==========================================");
});

// --- 3. THE "INVALID SESSION" FIX ---
client.on("error", (err) => {
    console.error("[STOAT ERROR]:", err);
    // If we see the error you posted, we restart to get a fresh token handshake
    if (err.data?.type === 'InvalidSession') {
        console.log("⚠️ Session rejected. Check your BOT_TOKEN in Render!");
        process.exit(1); 
    }
});

// --- 4. COMMAND LISTENER ---
client.on("messageCreate", async (message) => {
    // Debug: See what the bot hears in the Render logs
    console.log(`[CHAT] ${message.author?.username}: ${message.content}`);

    if (!message.content || message.author?.bot) return;

    const content = message.content.toLowerCase().trim();

    // Command: !random
    if (content === PREFIX + "random") {
        try {
            const res = await fetch("https://bible-api.com/data/web/random");
            const data = await res.json();
            const v = data.random_verse;
            
            await message.reply(`🎲 **Random Verse**\n**${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
        } catch (e) {
            message.reply("❌ Bible API is currently offline.");
        }
    }

    // Command: !ping (Quick test)
    if (content === PREFIX + "ping") {
        message.reply("Pong! I am reading your messages clearly. ✅");
    }
});

// --- 5. EXECUTE ---
if (!process.env.BOT_TOKEN) {
    console.log("❌ CRITICAL: No BOT_TOKEN found in Render Environment Variables.");
} else {
    client.loginBot(process.env.BOT_TOKEN);
}