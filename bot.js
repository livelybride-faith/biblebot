import { Client } from "stoat.js";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. CONFIGURATION ---
const MOD_ENABLED = process.env.MOD_ENABLED?.toLowerCase() === "true";
const BOT_TOKEN = process.env.BOT_TOKEN;
const PREFIX = "!";

let currentVersion = "kjv"; 
const SUPPORTED_VERSIONS = [
    "web", "kjv", "asv", "bbe", "darby", "dra", "ylt", "oeb-us", 
    "oeb-cw", "webbe", "almeida", "rccv", "bkr", "cuv", "clementine", "cherokee"
];

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
        res.json(data);
    } catch (error) {
        res.status(500).send("Error fetching from Bible API.");
    }
});
app.listen(process.env.PORT || 10000, () => console.log(`Web server listening on port ${process.env.PORT || 10000}`));

// --- 3. BOT SETUP & AUTO-MOD ---
const client = new Client(); // Stoat.js connects to Stoat by default

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
            console.log("AutoMod: Created empty banned_words.txt");
        }
    } catch (err) {
        console.error("Mod Load Error:", err.message);
    }
}

if (MOD_ENABLED) loadBannedWords();

// --- 4. HEARTBEAT & EVENTS ---
client.on("ready", () => {
    console.log(`Online as ${client.user.username}.`);
    
    // Heartbeat to prevent Stoat connection drop
    setInterval(async () => {
        try { await client.users.fetch(client.user.id); } 
        catch (e) { console.error("Heartbeat failed"); }
    }, 25000);
});

client.on("messageCreate", async (message) => {
    if (!message.content || message.author?.bot) return;

    const lowerContent = message.content.toLowerCase();

    // --- STEP A: AUTOMOD ---
    if (MOD_ENABLED && BANNED_WORDS.length > 0) {
        if (BANNED_WORDS.some(word => lowerContent.includes(word))) {
            try {
                await message.delete();
                const warn = await message.channel.sendMessage(`AutoMod: <@${message.author.id}>, that language is not allowed.`);
                setTimeout(() => warn.delete().catch(() => {}), 4000);
                return;
            } catch (e) { console.error("Mod Error: Missing Permissions"); }
        }
    }

    // --- STEP B: COMMANDS ---
    if (lowerContent === "pingmod") {
        return message.channel.sendMessage(`Shield: ${MOD_ENABLED ? "Active" : "Off"} | Version: ${currentVersion.toUpperCase()}`);
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    if (commandName === "ping") return message.channel.sendMessage("Pong! BibleBot is live.");
    
    if (commandName === "help") {
        return message.channel.sendMessage("# BibleBot Help\n> `!random` | `![Ref]` | `!version [name]`");
    }

    if (commandName === "version") {
        const newVer = args[0]?.toLowerCase();
        if (SUPPORTED_VERSIONS.includes(newVer)) {
            currentVersion = newVer;
            return message.channel.sendMessage(`Default set to **${newVer.toUpperCase()}**.`);
        }
        return message.channel.sendMessage("Invalid version.");
    }

    if (commandName === "random") {
        const data = await fetchJSON(`https://bible-api.com/data/${currentVersion}/random`);
        if (data?.random_verse) {
            const v = data.random_verse;
            return message.channel.sendMessage(`**${v.book_name} ${v.chapter}:${v.verse}** (${currentVersion})\n${v.text}`);
        }
    }

    // Verse Parser (Matches: !John 3:16 or !John 3:16?kjv)
    const bibleRegex = /^([1-3]?\s?[a-zA-Z]+)\s?(\d+):(\d+)/i;
    if (bibleRegex.test(commandName + " " + args.join(" "))) {
        let reference = message.content.slice(1);
        let version = currentVersion;

        if (reference.includes("?")) {
            const parts = reference.split("?");
            reference = parts[0];
            if (SUPPORTED_VERSIONS.includes(parts[1])) version = parts[1];
        }

        const data = await fetchJSON(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`);
        if (data?.text) {
            const text = data.text.length > 1500 ? data.text.substring(0, 1500) + "..." : data.text;
            return message.channel.sendMessage(`**${data.reference}** (${version.toUpperCase()})\n${text}`);
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

client.loginBot(BOT_TOKEN);