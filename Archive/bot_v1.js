const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. WEB SERVER (Render Keep-Alive & Browser Test) ---
const app = express();
app.get("/", (req, res) => res.send("<h1>BibleBot is Live</h1>"));
app.listen(process.env.PORT || 10000);

// --- 2. CONFIGURATION ---
const client = new Client({
    apiURL: "https://api.stoat.chat"
});

const PREFIX = "!";

client.on("ready", () => {
    console.log(`✅ BibleBot logged in as ${client.user.username}`);
});

// --- 3. MESSAGE HANDLER ---
client.on("messageCreate", async (message) => {
    // Ignore bots and empty messages
    if (!message.content || message.author?.bot) return;

    const raw = message.content.trim();
    if (!raw.startsWith(PREFIX)) return;

    // Remove prefix and prepare for check
    const input = raw.slice(PREFIX.length).trim();
    const lowerInput = input.toLowerCase();

    // --- COMMAND: !ping ---
    if (lowerInput === "ping") {
        const start = Date.now();
        const reply = await message.reply("Pinging...");
        const ms = Date.now() - start;
        return reply.edit({ content: `🏓 **Pong!** BibleBot is alive. (Latency: ${ms}ms)` });
    }

    // --- COMMAND: !random ---
    if (lowerInput === "random") {
        const data = await fetchBible("https://bible-api.com/data/web/random");
        if (data?.random_verse) {
            const v = data.random_verse;
            return message.reply(`🎲 **Random Verse**\n**${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
        }
    }

    // --- SMART PARSER: Detects references like !John3:16 or !Genesis 1:1 ---
    // This regex looks for: [Book Name][Chapter]:[Verse]
    const bibleRegex = /^([1-3]?\s?[a-zA-Z]+)\s?(\d+):(\d+)/i;
    const match = input.match(bibleRegex);

    if (match) {
        console.log(`[DEBUG] Detected reference: ${input}`);
        const data = await fetchBible(`https://bible-api.com/${encodeURIComponent(input)}`);
        
        if (data && data.text) {
            return message.reply(`📖 **${data.reference}** (${data.translation_name})\n${data.text}`);
        } else {
            return message.reply(`❌ I couldn't find "${input}". Double-check the spelling!`);
        }
    }
});

// Helper function to fetch from API
async function fetchBible(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error("Fetch Error:", e);
        return null;
    }
}

// Error handling for Session issues
client.on("error", (err) => {
    if (err.data?.type === 'InvalidSession') {
        console.log("Session invalid. Restarting...");
        process.exit(1);
    }
});

client.loginBot(process.env.BOT_TOKEN);