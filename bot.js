const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");
const fs = require("fs");
const path = require("path");

// --- 1. WEB SERVER ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot & Shield are Active."));

// Endpoint to test Bible API fetching via browser
app.get("/get", async (req, res) => {
    const reference = req.query.v;
    const version = req.query.version || "kjv"; // Default to KJV if not specified

    if (!reference) {
        return res.status(400).send("Please provide a reference using ?v=BookChapter:Verse");
    }

    try {
        const response = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`);
        const data = await response.json();
        
        if (data && data.text) {
            res.json(data);
        } else {
            res.status(404).send("Reference not found.");
        }
    } catch (error) {
        res.status(500).send("Error fetching from Bible API.");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🌐 Web server listening on port ${PORT}`);
});

// --- 2. CONFIGURATION & MODERATION SETUP ---
const client = new Client({ apiURL: "https://api.stoat.chat" });
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
            console.log(`🛡️ AutoMod: Loaded ${BANNED_WORDS.length} words.`);
        } else {
            fs.writeFileSync(BANNED_FILE, ""); 
            console.log("🛡️ AutoMod: No banned_words.txt found. Created empty file.");
        }
    } catch (err) {
        console.error("❌ Mod Load Error:", err.message);
    }
}

loadBannedWords();

// --- 3. ERROR HANDLING ---
client.on("error", (err) => {
    console.error("❌ Revolt Client Error:", err);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

client.on("ready", () => {
    console.log(`✅ Online as ${client.user.username}. Shield & Scripture active.`);
});

// --- 4. MAIN MESSAGE HANDLER ---
client.on("messageCreate", async (message) => {
    if (!message.content || message.author?.bot) return;

    const rawContent = message.content.trim();

    // --- STEP A: AUTOMOD SCANNING ---
    const lowerContent = rawContent.toLowerCase();
    const foundBadWord = BANNED_WORDS.some(word => lowerContent.includes(word));

    if (foundBadWord) {
        try {
            await message.delete();
            const warning = await message.channel.sendMessage(`⚠️ **AutoMod:** <@${message.author.id}>, please maintain clean language.`);
            setTimeout(() => warning.delete().catch(() => {}), 4000);
            return;
        } catch (e) {
            console.error("Permission Error: Bot needs 'Manage Messages' to delete.");
        }
    }

    // --- STEP B: COMMAND HANDLING ---
    
    if (rawContent.toLowerCase() === "pingmod") {
        return message.reply(`🛡️ **Shield:** Active\n📚 **Banned List:** ${BANNED_WORDS.length} words\n✝️ **Version:** ${currentVersion.toUpperCase()}`);
    }

    if (!rawContent.startsWith(PREFIX)) return;

    const fullCommand = rawContent.slice(PREFIX.length).trim();
    const args = fullCommand.split(/ +/);
    const commandName = args.shift().toLowerCase();

    // 🏓 PING
    if (commandName === "ping") return message.reply("🏓 **Pong!** Bot is active.");

    // 📖 HELP
    if (commandName === "help") {
        return message.reply(
            `# 📖 BibleBot Help\n` +
            `> \`!random\` - Get a random verse.\n` +
            `> \`![Reference]\` - e.g., \`!John 3:16\`\n` +
            `> \`!version [name]\` - Change default translation.\n` +
            `> \`pingmod\` - Check system status.`
        );
    }

    // 📜 VERSIONS
    if (commandName === "versions") return message.reply(`**Available:** ${SUPPORTED_VERSIONS.map(v => `\`${v}\``).join(", ")}`);

    // ⚙️ SET VERSION
    if (commandName === "version") {
        const newVer = args[0]?.toLowerCase();
        if (SUPPORTED_VERSIONS.includes(newVer)) {
            currentVersion = newVer;
            return message.reply(`✅ Default version set to **${newVer.toUpperCase()}**.`);
        }
        return message.reply(`❌ Invalid version.`);
    }

    // 🎲 RANDOM VERSE
    if (commandName === "random") {
        try {
            const res = await fetch(`https://bible-api.com/data/${currentVersion}/random`);
            const data = await res.json();
            const v = data.random_verse;
            if (v && v.text) {
                const book = v.book || v.book_name;
                return message.reply(`✝️ (**${currentVersion.toUpperCase()}**) **${book} ${v.chapter}:${v.verse}**\n${v.text.trim()}`);
            }
        } catch (error) {
            return message.reply("❌ Error fetching random verse.");
        }
    }

    // 🔍 REFERENCE PARSER
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
            return message.reply(`📖 **${data.reference}** (${version.toUpperCase()})\n${responseText}`);
        } else {
            return message.reply(`❌ Reference not found.`);
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

client.loginBot(process.env.BOT_TOKEN);