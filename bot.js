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
            fs.writeFileSync(BANNED_FILE, ""); // Create empty file if missing
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
    // Remove symbols to catch things like "b.a.n.n.e.d"
    const cleanMessage = rawContent.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, "");
    const userWords = cleanMessage.split(/\s+/);
    
    // Check if any word in the message is in our banned list
    const foundBadWord = userWords.some(word => BANNED_WORDS.includes(word));

    if (foundBadWord) {
        try {
            await message.delete();
            const warning = await message.channel.sendMessage(`⚠️ **AutoMod:** <@${message.author.id}>, please maintain clean language.`);
            setTimeout(() => warning.delete().catch(() => {}), 4000);
            return; // Stop processing immediately
        } catch (e) {
            console.error("Permission Error: Bot needs 'Manage Messages' to delete.");
        }
    }

    // --- STEP B: COMMAND HANDLING ---
    
    // Heartbeat check (No prefix needed)
    if (rawContent.toLowerCase() === "pingmod") {
        return message.reply(`🛡️ **Shield:** Active\n📚 **Banned List:** ${BANNED_WORDS.length} words\n✝️ **Version:** ${currentVersion.toUpperCase()}`);
    }

    if (!rawContent.startsWith(PREFIX)) return;

    const args = rawContent.slice(PREFIX.length).split(/ +/);
    const command = args.shift().toLowerCase();

    // 🔨 MOD COMMAND: BAN A NEW WORD
    if (command === "banword") {
        const wordToBan = args[0]?.toLowerCase();
        if (!wordToBan) return message.reply("❌ Usage: `!banword [word]`");
        
        if (!BANNED_WORDS.includes(wordToBan)) {
            BANNED_WORDS.push(wordToBan);
            fs.appendFileSync(BANNED_FILE, `\n${wordToBan}`);
            return message.reply(`✅ Added **${wordToBan}** to the shield list.`);
        } else {
            return message.reply("⚠️ That word is already banned.");
        }
    }

    // 🏓 PING
    if (command === "ping") return message.reply("🏓 **Pong!** BibleBot is operational.");

    // 📖 HELP
    if (command === "help") {
        return message.reply(
            `# 📖 BibleBot & AutoMod\n` +
            `> \`!random\` - Random verse.\n` +
            `> \`![Reference]\` - e.g., \`!John3:16-18\`\n` +
            `> \`!version [name]\` - Change default translation.\n` +
            `> \`!banword [word]\` - Add a word to the filter.\n` +
            `> \`pingmod\` - Check system status.`
        );
    }

    // 📜 LIST VERSIONS
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
            return message.reply("❌ API Error fetching random verse.");
        }
    }

    // 🔍 REFERENCE PARSER (Handles !John3:16-18 and ?version overrides)
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
            // Cap length at 1800 characters for Revolt
            const responseText = data.text.length > 1800 ? data.text.substring(0, 1800) + "..." : data.text;
            return message.reply(`📖 **${data.reference}** (${version.toUpperCase()})\n${responseText}`);
        } else {
            return message.reply(`❌ Reference **${reference}** not found.`);
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