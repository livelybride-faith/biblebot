const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");
const fs = require("fs");
const path = require("path");

// --- 1. WEB SERVER ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot & AutoMod are active."));
app.listen(process.env.PORT || 10000);

// --- 2. CONFIGURATION & MODERATION SETUP ---
const client = new Client({ apiURL: "https://api.stoat.chat" });
const PREFIX = "!";
let currentVersion = "kjv"; 
const SUPPORTED_VERSIONS = [
    "web", "kjv", "asv", "bbe", "darby", "dra", "ylt", "oeb-us", 
    "oeb-cw", "webbe", "almeida", "rccv", "bkr", "cuv", "clementine", "cherokee"
];

let BANNED_WORDS = [];

function loadBannedWords() {
    try {
        const filePath = path.join(__dirname, "banned_words.txt");
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, "utf8");
            BANNED_WORDS = rawData.split(/[,\r\n]+/)
                .map(word => word.trim().toLowerCase())
                .filter(word => word.length > 0);
            console.log(`🛡️ AutoMod: Loaded ${BANNED_WORDS.length} words.`);
        }
    } catch (err) {
        console.error("❌ Mod Load Error:", err.message);
    }
}

loadBannedWords();

client.on("ready", () => {
    console.log(`✅ Online as ${client.user.username}. Shield & Scripture active.`);
});

// --- 3. MAIN MESSAGE HANDLER ---
client.on("messageCreate", async (message) => {
    if (!message.content || message.author?.bot) return;

    const rawContent = message.content.trim();

    // --- STEP A: AUTOMOD SCANNING ---
    const cleanMessage = rawContent.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    const userWords = cleanMessage.split(/\s+/);
    const foundBadWord = userWords.some(word => BANNED_WORDS.includes(word));

    if (foundBadWord) {
        try {
            await message.delete();
            const warning = await message.channel.sendMessage(`⚠️ **AutoMod:** <@${message.author.id}>, please keep the language clean.`);
            setTimeout(() => warning.delete().catch(() => {}), 4000);
            return; // Stop processing further if it's a banned word
        } catch (e) {
            console.error("Permission Error: Bot needs 'Manage Messages'.");
        }
    }

    // --- STEP B: COMMAND HANDLING ---
    // Check for pingmod (Status Check)
    if (rawContent.toLowerCase() === "pingmod") {
        return message.reply(`🛡️ **Status:** Active\n📚 **Banned Words:** ${BANNED_WORDS.length}\n✝️ **Bible Version:** ${currentVersion.toUpperCase()}`);
    }

    if (!rawContent.startsWith(PREFIX)) return;

    const args = rawContent.slice(PREFIX.length).split(/ +/);
    const command = args.shift().toLowerCase();

    // 🏓 PING
    if (command === "ping") return message.reply("🏓 **Pong!** Bot is fully operational.");

    // 📖 HELP
    if (command === "help") {
        return message.reply(
            `# 📖 BibleBot & AutoMod\n` +
            `> \`!random\` - Get a random verse.\n` +
            `> \`![Reference]\` - e.g., \`!John3:16-18\`\n` +
            `> \`!version [name]\` - Change default translation.\n` +
            `> \`pingmod\` - Check ModBot status.`
        );
    }

    // 📜 VERSIONS
    if (command === "versions") return message.reply(`**Available:** ${SUPPORTED_VERSIONS.map(v => `\`${v}\``).join(", ")}`);

    // ⚙️ SET VERSION
    if (command === "version") {
        const newVer = args[0]?.toLowerCase();
        if (SUPPORTED_VERSIONS.includes(newVer)) {
            currentVersion = newVer;
            return message.reply(`✅ Default version set to **${newVer.toUpperCase()}**.`);
        }
        return message.reply(`❌ Invalid version.`);
    }

    // 🎲 RANDOM VERSE
    if (command === "random") {
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
    const match = command.match(bibleRegex);

    if (match) {
        let reference = command;
        let version = currentVersion;

        if (command.includes("?")) {
            const parts = command.split("?");
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