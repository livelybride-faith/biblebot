const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. WEB SERVER (For Render & Health Checks) ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot Debug Mode is Active!"));
app.listen(10000, () => console.log("📡 Web server listening on port 10000"));

// --- 2. INITIALIZATION ---
const client = new Client();
const PREFIX = "!";

client.on("ready", () => {
    console.log("------------------------------------------");
    console.log(`✅ SUCCESS: Logged in as ${client.user.username}`);
    console.log(`🤖 Bot ID: ${client.user.id}`);
    console.log("------------------------------------------");
});

// --- 3. THE COMMAND HANDLER WITH DEBUG LOGS ---
client.on("message", async (message) => {
    // DEBUG LOG 1: See every message the bot can detect
    console.log(`[DEBUG] Message detected from ${message.author?.username}: "${message.content}"`);

    // Ignore messages from itself
    if (message.author?.id === client.user.id) return;

    // Check for Mention or Prefix
    const botMention = `<@${client.user.id}>`;
    const startsWithPrefix = message.content?.startsWith(PREFIX);
    const startsWithMention = message.content?.startsWith(botMention);

    if (!startsWithPrefix && !startsWithMention) {
        // DEBUG LOG 2: Bot heard it, but it wasn't a command
        return; 
    }

    console.log(`[DEBUG] Command recognized! Processing...`);

    // Clean input
    let rawContent = startsWithMention 
        ? message.content.slice(botMention.length).trim() 
        : message.content.slice(PREFIX.length).trim();

    const args = rawContent.split(/ +/);
    const command = args.shift().toLowerCase();

    // COMMAND: !random
    if (command === "random") {
        console.log(`[DEBUG] Executing RANDOM command...`);
        try {
            const response = await fetch(`https://bible-api.com/data/web/random`);
            const data = await response.json();
            const v = data.random_verse;
            
            console.log(`[DEBUG] API Response: ${v.book_name} ${v.chapter}:${v.verse}`);
            
            await message.reply(`🎲 **Random Verse**\n**${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
            console.log(`[DEBUG] Reply sent successfully.`);
        } catch (e) {
            console.error(`[DEBUG ERROR] API or Reply failed:`, e);
            message.reply("❌ API Error. Check logs.");
        }
    }

    // COMMAND: !help
    if (command === "help") {
        message.reply("📖 BibleBot is listening! Try `!random` or `!verse John 3:16`.");
    }
});

// --- 4. ERROR MONITORING ---
process.on('unhandledRejection', error => {
    console.error('[DEBUG CRITICAL] Unhandled promise rejection:', error);
});

client.loginBot(process.env.BOT_TOKEN);
