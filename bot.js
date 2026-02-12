const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. KEEP-ALIVE WEB SERVER ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot is Online & Debugging!"));
app.listen(10000, () => console.log("🌐 Web Server Ready on Port 10000"));

// --- 2. BOT INITIALIZATION ---
// NOTE: We explicitly request MessageContent intent to fix the "silent bot" issue
const client = new Client();
const PREFIX = "!";

client.on("ready", () => {
    console.log("------------------------------------------");
    console.log(`✅ SUCCESS: Logged in as ${client.user.username}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log("------------------------------------------");
});

// --- 3. MESSAGE LISTENER ---
client.on("message", async (message) => {
    // 🔍 DEBUG LOG: This will show in Render if the bot hears ANYTHING
    console.log(`[LOG] Heard: "${message.content}" from ${message.author?.username}`);

    // Ignore messages from bots or empty content
    if (!message.content || message.author.bot) return;

    // Test Command: !ping
    if (message.content.toLowerCase() === "!ping") {
        console.log("[DEBUG] Ping detected, replying...");
        return message.reply("Pong! I am reading your messages clearly.");
    }

    // Command Logic
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // COMMAND: !random
    if (command === "random") {
        console.log("[DEBUG] Running !random command...");
        try {
            const response = await fetch(`https://bible-api.com/data/web/random`);
            const data = await response.json();
            const v = data.random_verse;
            
            await message.reply(`🎲 **Random Verse**\n**${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
            console.log("[DEBUG] Random verse sent.");
        } catch (e) {
            console.error("[ERROR] Random command failed:", e);
            message.reply("❌ Error fetching a random verse.");
        }
    }

    // COMMAND: !verse
    if (command === "verse") {
        const ref = args.join(" ");
        if (!ref) return message.reply("Try `!verse John 3:16`.");

        const data = await fetchBible(`https://bible-api.com/${encodeURIComponent(ref)}`);
        if (data && data.text) {
            message.reply(`📖 **${data.reference}**\n${data.text}`);
        } else {
            message.reply("❌ Verse not found.");
        }
    }
});

// Helper function
async function fetchBible(url) {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        return null;
    }
}

// --- 4. LOGIN ---
// Ensure BOT_TOKEN is set in Render's Environment Variables
client.loginBot(process.env.BOT_TOKEN);
