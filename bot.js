const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. WEB SERVER ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot is Online"));
app.listen(process.env.PORT || 10000);

// --- 2. CONFIGURATION ---
const client = new Client({ apiURL: "https://api.stoat.chat" });
const PREFIX = "!";

// Default settings
let currentVersion = "kjv"; // World English Bible
const SUPPORTED_VERSIONS = [
    // --- English ---
    "web",      // World English Bible (Default)
    "kjv",      // King James Version
    "asv",      // American Standard Version (1901)
    "bbe",      // Bible in Basic English
    "darby",    // Darby Bible
    "dra",      // Douay-Rheims 1899 American Edition
    "ylt",      // Young's Literal Translation (NT Only)
    "oeb-us",   // Open English Bible (US Edition)
    "oeb-cw",   // Open English Bible (Commonwealth Edition)
    "webbe",    // World English Bible (British Edition)

    // --- International ---
    "almeida",    // Portuguese (João Ferreira de Almeida)
    "rccv",       // Romanian (Protestant Romanian Corrected Cornilescu)
    "bkr",        // Czech (Bible kralická)
    "cuv",        // Chinese (Chinese Union Version)
    "clementine", // Latin (Clementine Latin Vulgate)
    "cherokee"    // Cherokee (Cherokee New Testament)
];

client.on("ready", () => console.log(`✅ BibleBot online as ${client.user.username}`));

// --- 3. MESSAGE HANDLER ---
client.on("messageCreate", async (message) => {
    if (!message.content || message.author?.bot) return;
    const input = message.content.trim();
    if (!input.startsWith(PREFIX)) return;

    const args = input.slice(PREFIX.length).split(/ +/);
    const command = args.shift().toLowerCase();

    // 🏓 PING
    if (command === "ping") {
        return message.reply("🏓 **Pong!** Bot is fully operational.");
    }

    // 📖 HELP COMMAND
    if (command === "help") {
        return message.reply(
            `# 📖 BibleBot Help\n` +
            `**Standard Commands:**\n` +
            `> \`!random\` - Get a random verse.\n` +
            `> \`![Reference]\` - e.g., \`!John3:16\` to get the verse.\n` +
            `> \`![Reference]?[Version]\` - e.g., \`!John3:16?kjv\`\n\n` +
            `**Settings:**\n` +
            `> \`!version [name]\` - Set the default version (Current: **${currentVersion.toUpperCase()}**).\n` +
            `> \`!versions\` - List all supported Bible versions.\n\n` +
            `**System:**\n` +
            `> \`!ping\` - Check bot response time.`
        );
    }

    // 📜 VERSIONS LIST
    if (command === "versions") {
        return message.reply(`**Available Versions:**\n${SUPPORTED_VERSIONS.map(v => `\`${v}\``).join(", ")}`);
    }

    // ⚙️ SET VERSION
    if (command === "version") {
        const newVer = args[0]?.toLowerCase();
        if (SUPPORTED_VERSIONS.includes(newVer)) {
            currentVersion = newVer;
            return message.reply(`✅ Default version set to **${newVer.toUpperCase()}**.`);
        }
        return message.reply(`❌ Invalid version. Type \`!versions\` to see the list.`);
    }

    // --- COMMAND: !random ---
    if (lowerInput === "random") {
        const data = await fetchBible("https://bible-api.com/data/web/random");
        if (data?.random_verse) {
            const v = data.random_verse;
            return message.reply(`🎲 **Random Verse**\n**${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
        }
    }

    // 🔍 SMART REFERENCE PARSER (!John3:16 or !John3:16?kjv)
    const bibleRegex = /^([1-3]?\s?[a-zA-Z]+)\s?(\d+):(\d+)(\?[a-z]+)?/i;
    const match = command.match(bibleRegex);

    if (match) {
        let reference = command;
        let version = currentVersion;

        // Check if user provided a version override (e.g. !John3:16?kjv)
        if (command.includes("?")) {
            const parts = command.split("?");
            reference = parts[0];
            const requestedVersion = parts[1].toLowerCase();
            if (SUPPORTED_VERSIONS.includes(requestedVersion)) {
                version = requestedVersion;
            }
        }

        const data = await fetchJSON(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`);
        if (data && data.text) {
            return message.reply(`📖 **${data.reference}** (${version.toUpperCase()})\n${data.text}`);
        } else {
            return message.reply(`❌ Reference not found or formatting error.`);
        }
    }
});

// Helper
async function fetchJSON(url) {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        return null;
    }
}

client.loginBot(process.env.BOT_TOKEN);