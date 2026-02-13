const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");
const fs = require("fs");
const path = require("path");

// --- 1. WEB SERVER ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot & Shield are Active."));
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
const BANNED_FILE = path.join(__dirname, "banned_words.txt");

function loadBannedWords() {
    try {
        if (fs.existsSync(BANNED_FILE)) {
            const rawData = fs.readFileSync(BANNED_FILE, "utf8");
            BANNED_WORDS = rawData.split(/[,\r\n]+/)
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

client.on("ready", () => {
    console.log(`✅ Online as ${client.user.username}. Shield & Scripture active.`);
});

// --- 3. MAIN MESSAGE HANDLER ---
client.on("messageCreate", async (message) => {
    if (!message.content || message.author?.bot) return;

    const rawContent = message.content.trim();

    // --- STEP A: AUTOMOD SCANNING ---
    const cleanMessage = rawContent.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, "");
    const userWords = cleanMessage.split(/\s+/);
    const foundBadWord = userWords.some(word => BANNED_WORDS.includes(word));

    if (foundBadWord) {
        try {
            await message.delete();
            const warning = await message.channel.sendMessage(`⚠️ **AutoMod:** <@${message.author.id}>, please maintain clean language.`);
            setTimeout(() => warning.delete().catch(() => {}), 4000);
            return; 
        } catch (e) {
            console.error("Permission Error");
        }
    }

    // --- STEP B: COMMAND HANDLING ---
    
    if (rawContent.toLowerCase() === "pingmod") {
        return message.reply(`🛡️ **Shield:** Active\n📚 **Banned List:** ${BANNED_WORDS.length} words\n✝️ **Version:** ${currentVersion.toUpperCase()}`);
    }

    if (!rawContent.startsWith(PREFIX)) return;

    const args = rawContent.slice(PREFIX.length).split(/ +/);
    const command = args[0].toLowerCase();

    // Standard Commands
    if (command === "ping") return message.reply("🏓 **Pong!** Bot is active.");
    if (command === "help") {
        return message.reply(
            `# 📖 BibleBot Help\n` +
            `> \`!John 3:16\` or \`!John3:16\` - Lookup a verse.\n` +
            `> \`!Mark 4:5-10\` - Lookup a range of verses.\n` +
            `> \`!John 3:16 !Gen 1:1\` - Lookup multiple references.\n` +
            `> \`!version [name]\` - Change default translation.\n` +
            `> \`!random\` - Get a random verse.`
        );
    }
    if (command === "versions") return message.reply(`**Available:** ${SUPPORTED_VERSIONS.map(v => `\`${v}\``).join(", ")}`);

    if (command === "version") {
        const newVer = args[1]?.toLowerCase();
        if (SUPPORTED_VERSIONS.includes(newVer)) {
            currentVersion = newVer;
            return message.reply(`✅ Default version set to **${newVer.toUpperCase()}**.`);
        }
        return message.reply(`❌ Invalid version.`);
    }

    if (command === "random") {
        try {
            const res = await fetch(`https://bible-api.com/data/${currentVersion}/random`);
            const data = await res.json();
            const v = data.random_verse;
            if (v) {
                const book = v.book || v.book_name;
                return message.reply(`✝️ (**${currentVersion.toUpperCase()}**) **${book} ${v.chapter}:${v.verse}**\n${v.text.trim()}`);
            }
        } catch (error) { return message.reply("❌ Error fetching random verse."); }
    }

    // --- STEP C: BIBLE REFERENCE PARSER (Handles Ranges, Spaces, and Multiples) ---
    const bibleRegex = /!([1-3]?\s?[a-zA-Z]+)\s?(\d+):(\d+)(-(\d+))?(\?[a-z-]+)?/gi;
    const matches = [...rawContent.matchAll(bibleRegex)];

    if (matches.length > 0) {
        // Limit to 3 verses to prevent spam
        const results = matches.slice(0, 3); 

        for (const match of results) {
            let reference = match[0].slice(1); // Remove "!"
            let version = currentVersion;

            // Handle inline version: !John 3:16?asv
            if (reference.includes("?")) {
                const parts = reference.split("?");
                reference = parts[0];
                const requestedVersion = parts[1].toLowerCase();
                if (SUPPORTED_VERSIONS.includes(requestedVersion)) version = requestedVersion;
            }

            const data = await fetchJSON(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`);

            if (data && data.text) {
                let text = data.text.trim();
                let suffix = "";

                // If text is too long, truncate and provide a Read More link
                if (text.length > 1800) {
                    text = text.substring(0, 1800) + "...";
                    const externalLink = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(data.reference)}&version=${version.toUpperCase()}`;
                    suffix = `\n\n📖 **[Read full passage on Bible Gateway](${externalLink})**`;
                }

                await message.reply(`📖 **${data.reference}** (${version.toUpperCase()})\n${text}${suffix}`);
            } else {
                await message.reply(`❌ Reference **${reference}** not found.`);
            }
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