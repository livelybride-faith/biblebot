const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. WEB SERVER ---
// Keeps the bot alive on services like Render
const app = express();
app.get("/", (req, res) => res.send("BibleBot is Online"));
app.listen(process.env.PORT || 10000);

// --- 2. CONFIGURATION ---
const client = new Client({ apiURL: "https://api.stoat.chat" });
const PREFIX = "!";

// Default settings
let currentVersion = "kjv"; 
const SUPPORTED_VERSIONS = [
    "web", "kjv", "asv", "bbe", "darby", "dra", "ylt", "oeb-us", 
    "oeb-cw", "webbe", "almeida", "rccv", "bkr", "cuv", "clementine", "cherokee"
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
            `> \`![Reference]\` - e.g., \`!John3:16\` or \`!John3:16-18\`\n` +
            `> \`![Reference]?[Version]\` - e.g., \`!John3:16?web\`\n\n` +
            `**Settings:**\n` +
            `> \`!version [name]\` - Set the default version (Current: **${currentVersion.toUpperCase()}**).\n` +
            `> \`!versions\` - List all supported versions.`
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

    // 🎲 RANDOM COMMAND (Corrected for random_verse format)
    if (command === "random") {
        try {
            const res = await fetch(`https://bible-api.com/data/${currentVersion}/random`);
            const data = await res.json();
            const v = data.random_verse;

            if (v && v.text) {
                const book = v.book || v.book_name;
                const ref = `${book} ${v.chapter}:${v.verse}`;
                return message.reply(`✝️ (**${currentVersion.toUpperCase()}**) **${ref}**\n${v.text.trim()}`);
            } else {
                throw new Error("Invalid structure");
            }
        } catch (error) {
            console.error("Random Command Error:", error);
            return message.reply("❌ Failed to fetch a random verse. Try again in a moment.");
        }
    }

    // 🔍 SMART REFERENCE PARSER (Handles Ranges and Overrides)
    // Regex: Matches Book, Chapter:Verse, and optional -EndVerse
    const bibleRegex = /^([1-3]?\s?[a-zA-Z]+)\s?(\d+):(\d+)(-(\d+))?(\?[a-z]+)?/i;
    const match = command.match(bibleRegex);

    if (match) {
        let reference = command;
        let version = currentVersion;

        // Handle version override within the command (e.g., !John3:16?asv)
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
            // Cap text length to avoid Revolt message limits
            const responseText = data.text.length > 1800 
                ? data.text.substring(0, 1800) + "..." 
                : data.text;

            return message.reply(`📖 **${data.reference}** (${version.toUpperCase()})\n${responseText}`);
        } else {
            return message.reply(`❌ Reference **${reference}** not found or format error.`);
        }
    }
});

// Helper Function
async function fetchJSON(url) {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        console.error("API Fetch Error:", e);
        return null;
    }
}

client.loginBot(process.env.BOT_TOKEN);