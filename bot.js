const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. RENDER KEEP-ALIVE ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot is connected to Stoat Nodes."));
app.listen(10000);

// --- 2. CONFIGURATION FOR STOAT ---
// We MUST point to stoat.chat specifically in 2026
const client = new Client({
    apiURL: "https://api.stoat.chat" 
});

const PREFIX = "!";

client.on("ready", () => {
    console.log("==========================================");
    console.log(`📡 NETWORK: Connected to Stoat.chat`);
    console.log(`👤 IDENTITY: Logged in as ${client.user.username}`);
    console.log("==========================================");
});

// --- 3. THE "EARS" (LISTENER) ---
client.on("message", async (message) => {
    // This will now definitely fire if the API URL is correct
    console.log(`[INCOMING] ${message.author?.username}: ${message.content}`);

    if (!message.content || message.author.bot) return;

    // Direct Check for !random
    if (message.content.toLowerCase().startsWith(PREFIX + "random")) {
        console.log("🎲 Random verse requested...");
        try {
            const response = await fetch(`https://bible-api.com/data/web/random`);
            const data = await response.json();
            const v = data.random_verse;
            
            await message.reply(`**${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
        } catch (e) {
            console.error("API Error:", e);
        }
    }

    // Direct Check for !help
    if (message.content.toLowerCase() === "!help") {
        message.reply("📖 **BibleBot Help**\nUse `!random` for a random verse or `!verse John 3:16`.");
    }
});

// --- 4. STARTUP ---
client.loginBot(process.env.BOT_TOKEN);
