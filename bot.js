const { Client } = require("revolt.js");
const fetch = require("node-fetch");
const express = require("express");

// --- 1. WEB SERVER (Keep-Alive for Render) ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot is running!"));
app.listen(10000);

// --- 2. THE BOT ---
const client = new Client();
const PREFIX = "!";

client.on("ready", () => console.log(`Logged in as ${client.user.username}!`));

client.on("message", async (message) => {
    if (!message.content || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // COMMAND: !verse [reference]
    if (command === "verse") {
        const reference = args.join(" ");
        if (!reference) return message.reply("Please provide a reference (e.g., !verse John 3:16)");
        
        const data = await fetchBible(`https://bible-api.com/${reference}`);
        if (data && data.text) {
            message.reply(`**${data.reference}**\n${data.text}`);
        } else {
            message.reply("Couldn't find that verse. Check your spelling!");
        }
    }

    // COMMAND: !random
    if (command === "random") {
        // Fetches a random verse using bible-api's data endpoint
        const data = await fetchBible(`https://bible-api.com/data/web/random`);
        if (data && data.random_verse) {
            const v = data.random_verse;
            message.reply(`**Random Verse: ${v.book_name} ${v.chapter}:${v.verse}**\n${v.text}`);
        } else {
            message.reply("Failed to get a random verse. Try again!");
        }
    }

    // COMMAND: !search [keyword]
    if (command === "search") {
        const query = args.join(" ");
        if (!query) return message.reply("What should I search for? (e.g., !search faith)");

        // Note: Free bible-api.com doesn't have a direct keyword search, 
        // so we use a search-friendly alternative or specific reference.
        // For simple search, we'll point users to a search link or use a specific API:
        message.reply(`🔍 Searching for "${query}"...`);
        const searchUrl = `https://bible-api.com/${query}`;
        const data = await fetchBible(searchUrl);

        if (data && data.text) {
            message.reply(`**Found: ${data.reference}**\n${data.text}`);
        } else {
            message.reply("No direct match found. Try a more specific word!");
        }
    }
});

// Helper function to handle API calls
async function fetchBible(url) {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        return null;
    }
}

client.loginBot(process.env.BOT_TOKEN);
