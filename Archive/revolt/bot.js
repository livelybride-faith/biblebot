const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");
const fs = require("fs");
const path = require("path");

// --- 1. CONFIGURATION & SWITCHES ---
const MOD_ENABLED = process.env.MOD_ENABLED?.toLowerCase() === "true";
const BOT_TOKEN = process.env.BOT_TOKEN;

// --- 2. WEB SERVER ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot & Shield are Active."));

app.get("/get", async (req, res) => {
    const reference = req.query.v;
    const version = req.query.version || "kjv";
    if (!reference) return res.status(400).send("Provide reference: ?v=BookChapter:Verse");

    try {
        const response = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`);
        const data = await response.json();
        data && data.text ? res.json(data) : res.status(404).send("Reference not found.");
    } catch (error) {
        res.status(500).send("Error fetching from Bible API.");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// --- 3. BOT SETUP & BANNED WORDS ---
const client = new Client({ apiURL: "https://api.stoat.chat" });

async function startBot() {
    try {
        await client.loginBot(BOT_TOKEN);
    } catch (err) {
        console.error("Login failed, retrying in 10s...", err.message);
        setTimeout(startBot, 10000);
    }
}

// Global error listener to prevent process exit
client.on("error", (err) => {
    console.error("Socket Error:", err);
    if (err.includes?.("Socket closed") || err.code === "ECONNRESET") {
        console.log("Attempting to recover connection...");
        // Re-login logic if necessary
    }
});

// Use a safe reply helper to prevent crashes
async function safeReply(message, content) {
    try {
        if (!client.ready) throw new Error("Client not ready");
        return await message.reply(content);
    } catch (e) {
        console.error("Failed to send message (Socket closed):", e.message);
    }
}

const PREFIX = "!";
let currentVersion = "kjv"; 
const SUPPORTED_VERSIONS = [
    "web", "kjv", "asv", "bbe", "darby", "dra", "ylt", "oeb-us", 
    "oeb-cw", "webbe", "almeida", "rccv", "bkr", "cuv", "clementine", "cherokee"
];

let BANNED_WORDS = [];
const BANNED_FILE = path.join(__dirname, "banned_words.txt");

function loadBannedWords() {
    try {
        if (fs.existsSync(BANNED_FILE)) {
            const rawData = fs.readFileSync(BANNED_FILE, "utf8");
            BANNED_WORDS = rawData.split(/[\r\n]+/)
                .flatMap(line => line.split(','))
                .map(word => word.trim().toLowerCase())
                .filter(word => word.length > 0);
            console.log(`AutoMod: Loaded ${BANNED_WORDS.length} words.`);
        } else {
            fs.writeFileSync(BANNED_FILE, ""); 
            console.log("AutoMod: No banned_words.txt found. Created empty file.");
        }
    } catch (err) {
        console.error("Mod Load Error:", err.message);
    }
}

// Only load and run moderation if the switch is TRUE
if (MOD_ENABLED) {
    loadBannedWords();
} else {
    console.log("AutoMod: Feature is disabled (MOD_ENABLED is not true).");
}

// --- 4. EVENT HANDLER ---

// Error handler
client.on("error", (err) => console.error("Client Error:", err));

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

client.on("ready", () => {
    console.log(`Online as ${client.user.username}. BibleBot active.`);
});

// Message handler
client.on("messageCreate", async (message) => {
    if (!message.content || message.author?.bot) return;

    const rawContent = message.content.trim();
    const lowerContent = rawContent.toLowerCase();

    // --- STEP A: AUTOMOD (Only if enabled) ---
    if (MOD_ENABLED && BANNED_WORDS.length > 0) {
        const foundBadWord = BANNED_WORDS.some(word => lowerContent.includes(word));
        if (foundBadWord) {
            try {
                await message.delete();
                const warning = await message.channel.sendMessage(`AutoMod: <@${message.author.id}>, please maintain clean language.`);
                setTimeout(() => warning.delete().catch(() => {}), 4000);
                return;
            } catch (e) {
                console.error("Permission Error: Missing 'Manage Messages' permission.");
            }
        }
    }

    // --- STEP B: COMMAND handler ---
    if (lowerContent === "pingmod") {
        const modStatus = MOD_ENABLED ? `Active (${BANNED_WORDS.length} words)` : "Disabled";
        return message.reply(`Shield Status:\n- Moderation: ${modStatus}\n- Bible Version: ${currentVersion.toUpperCase()}`);
    }

    if (!rawContent.startsWith(PREFIX)) return;

    const fullCommand = rawContent.slice(PREFIX.length).trim();
    const args = fullCommand.split(/ +/);
    const commandName = args.shift().toLowerCase();

    // !ping
    if (commandName === "ping") return safeReply(message, "Pong! BibleBot is active.");

    // !help
    if (commandName === "help") {
        return message.reply(
            `# BibleBot Help\n` +
            `> \`!random\` - Get a random verse.\n` +
            `> \`![Reference]\` - e.g., \`!John 3:16\`\n` +
            `> \`!version [name]\` - Change default translation.\n` +
            `> \`pingmod\` - Check system status.`
        );
    }

    // Versions
    if (commandName === "versions") return message.reply(`Available: ${SUPPORTED_VERSIONS.map(v => `\`${v}\``).join(", ")}`);

    // !version - set bible version
    if (commandName === "version") {
        const newVer = args[0]?.toLowerCase();
        if (SUPPORTED_VERSIONS.includes(newVer)) {
            currentVersion = newVer;
            return message.reply(`Default version set to **${newVer.toUpperCase()}**.`);
        }
        return message.reply(`Invalid version.`);
    }

    // !random feature
    if (commandName === "random") {
        try {
            const res = await fetch(`https://bible-api.com/data/${currentVersion}/random`);
            const data = await res.json();
            const v = data.random_verse;
            if (v && v.text) {
                const book = v.book || v.book_name;
                return message.reply(`(**${currentVersion.toUpperCase()}**) **${book} ${v.chapter}:${v.verse}**\n${v.text.trim()}`);
            }
        } catch (error) {
            return message.reply("Error fetching random verse.");
        }
    }

    // Reference parser
    const bibleRegex = /^([1-3]?\s?[a-zA-Z]+)\s?(\d+):(\d+)(-(\d+))?(\?[a-z]+)?/i;
    const match = fullCommand.match(bibleRegex);

    if (match) {
        let reference = fullCommand;
        let version = currentVersion;

        if (fullCommand.includes("?")) {
            const parts = fullCommand.split("?");
            reference = parts[0];
            const requestedVersion = parts[1].toLowerCase();
            if (SUPPORTED_VERSIONS.includes(requestedVersion)) version = requestedVersion;
        }

        const data = await fetchJSON(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`);
        if (data && data.text) {
            const responseText = data.text.length > 1800 ? data.text.substring(0, 1800) + "..." : data.text;
            return message.reply(`**${data.reference}** (${version.toUpperCase()})\n${responseText}`);
        } else {
            return message.reply(`Reference not found.`);
        }
    }
});

// Helper
async function fetchJSON(url) {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) { return null; }
}

// --- START ---
if (!BOT_TOKEN) {
    console.error("Missing BOT_TOKEN environment variable!");
} else {
    client.loginBot(BOT_TOKEN);
}