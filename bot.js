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
let currentVersion = "web"; // World English Bible
const SUPPORTED_VERSIONS = ["web", "kjv", "asv", "bbe", "oeb", "webbe"];

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

    // 🎲 UPDATED RANDOM COMMAND
    if (command === "random") {
        const res = await fetch(`https://bible-api.com/data/${currentVersion}/random`);
        const data = await res.json();

        // This line handles both the OLD and NEW API formats
        const v = data.random_verse ? data.random_verse : data;

        // Ensure we have the data before replying
        if (v && v.book_name) {
            return message.reply(`✝️ (**${currentVersion.toUpperCase()}**) **${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
        } else {
            return message.reply("❌ The Bible API returned an unexpected format. Try again in a moment.");
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