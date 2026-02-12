const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. HEALTH CHECK WEB SERVER ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot Status: Active and Listening."));
app.listen(10000);

// --- 2. CONFIGURATION ---
// We specify the Stoat API URL to ensure the bot connects to the right network
const client = new Client({
    apiURL: "https://api.stoat.chat" 
});

const PREFIX = "!";

client.on("ready", () => {
    console.log("==========================================");
    console.log(`📡 CONNECTED TO STOAT`);
    console.log(`👤 Logged in as: ${client.user.username}`);
    console.log("==========================================");
});

// --- 3. THE "FORCE" LISTENER ---
// We use a general "packet" log to see if ANY data is reaching us
client.on("packet", (packet) => {
    if (packet.type === "Message") {
        console.log(`[NETWORK DEBUG] Raw message packet received: ${packet.content}`);
    }
});

client.on("message", async (message) => {
    // This MUST show up if the bot is hearing you
    console.log(`[CHAT LOG] ${message.author?.username}: ${message.content}`);

    if (message.author.bot) return;

    if (message.content.toLowerCase() === "!test") {
        return message.reply("I can hear you loud and clear!");
    }

    if (message.content.startsWith(PREFIX)) {
        const command = message.content.slice(PREFIX.length).toLowerCase().trim();
        
        if (command === "random") {
            try {
                const res = await fetch(`https://bible-api.com/data/web/random`);
                const data = await res.json();
                const v = data.random_verse;
                message.reply(`🎲 **Random Verse**\n**${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
            } catch (e) {
                console.log("Bible API Error");
            }
        }
    }
});

// --- 4. START ---
// Make sure your BOT_TOKEN in Render is correct!
client.loginBot(process.env.BOT_TOKEN);
