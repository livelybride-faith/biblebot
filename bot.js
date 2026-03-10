import { Client } from "stoat.js";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Global error handling
process.on('unhandledRejection', (reason) => console.error('Global Rejection:', reason));
process.on('uncaughtException', (err) => console.error('Global Exception:', err));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. CONFIGURATION & PREFS ---
const MOD_ENABLED = process.env.MOD_ENABLED?.toLowerCase() === "true";
const BOT_TOKEN = process.env.BOT_TOKEN;
const PREFIX = "!";
let globalDefaultVersion = "kjv"; 

const SUPPORTED_VERSIONS = [
    "web", "kjv", "asv", "bbe", "darby", "dra", "ylt", "oeb-us", 
    "oeb-cw", "webbe", "almeida", "rccv", "bkr", "cuv", "clementine", "cherokee"
];

// --- User's preferred bible's version functions ---
const PREFS_FILE = path.join(__dirname, "user_prefs.json");
let userPrefs = {};

function loadPrefs() {
    try {
        if (fs.existsSync(PREFS_FILE)) {
            userPrefs = JSON.parse(fs.readFileSync(PREFS_FILE, "utf8"));
        }
    } catch (e) { console.error("Prefs load error:", e); }
}

function savePrefs() {
    try {
        fs.writeFileSync(PREFS_FILE, JSON.stringify(userPrefs, null, 2));
    } catch (e) { console.error("Prefs save error:", e); }
}

loadPrefs();

// --- 2. WEB SERVER ---
const app = express();
app.get("/", (req, res) => res.send("BibleBot is Active."));

// --- Get URL to check whether bible-api is working ---
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
app.listen(process.env.PORT || 10000);

// --- 3. BOT INITIALIZATION ---
const client = new Client();
// Prevent the "Unhandled error event" crash
client.on("error", (err) => console.error("Socket Error:", err));

// --- 4. BANNED WORDS FILTER ---
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

// --- 5. EVENTS ---
client.on("ready", () => {
    console.log(`Online as ${client.user.username}.`);
    setInterval(async () => {
        try { await client.users.fetch(client.user.id); } catch (e) {}
    }, 25000);
});

client.on("messageCreate", async (message) => {
    // CRITICAL: Defensive check to ensure message and channel exist
    if (!message || !message.content || message.author?.bot || !message.channel) return;

    try {
        const userDefault = userPrefs[message.author.id] || globalDefaultVersion;
        const lowerContent = message.content.toLowerCase();

        // --- STEP A: BANNED WORDS FILTER ---
        if (MOD_ENABLED && BANNED_WORDS.some(word => lowerContent.includes(word))) {
            try {
                await message.delete();
                const warn = await message.channel?.sendMessage(`AutoMod: <@${message.author.id}>, that language is not allowed.`);
                if (warn) setTimeout(() => warn.delete().catch(() => {}), 4000);
                return;
            } catch (e) { console.error("Mod Delete Error"); }
        }

        // --- STEP B: BIBLE PARSER ---
        const bibleRegex = /([1-3]?\s?[a-zA-Z]+)\s*(\d+):(\d+)(?:[–—-](\d+))?(?:[\s?]([a-zA-Z- ,]+))?/gi;
        const matches = [...message.content.matchAll(bibleRegex)];

        if (matches.length > 0) {
            let processedMatch = false;
            for (const match of matches) {
                const [fullMatch, book, chapter, verse, endVerse, versionsPart] = match;
                let requestedVersions = [];
                if (versionsPart) {
                    const potentialVersions = versionsPart.toLowerCase().split(/[ ,]+/).filter(v => v.length > 0);
                    requestedVersions = potentialVersions.filter(v => SUPPORTED_VERSIONS.includes(v));
                }
                if (requestedVersions.length === 0) requestedVersions = [userDefault];
                const reference = endVerse ? `${book} ${chapter}:${verse}-${endVerse}` : `${book} ${chapter}:${verse}`;

                for (const ver of requestedVersions) {
                    const data = await fetchJSON(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${ver}`);
                    if (data?.text) {
                        processedMatch = true;
                        const ref = data.reference || reference;
                        const text = data.text.length > 1200 ? data.text.substring(0, 1200) + "..." : data.text;
                        // Added optional chaining ?.
                        await message.channel?.sendMessage(`**${ref}** (${ver.toUpperCase()})\n${text}`);
                    }
                }
            }
            if (processedMatch) return; 
        }

        // --- STEP C: PREFIX COMMANDS ---
        if (!message.content.startsWith(PREFIX)) return;
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        if (commandName === "ping") return message.channel?.sendMessage("Pong! BibleBot is active.");

        if (commandName === "pingbot") {
            return message.channel?.sendMessage(`Shield: ${MOD_ENABLED ? "Active" : "Off"} | Default: ${userDefault.toUpperCase()}`);
        }

        if (commandName === "help") {
            return message.channel.sendMessage("# BibleBot Help\n> `!random` - random verse.  | `!pingbot` - check status & default version.  | `!setversion [name]` - set default version.  | `!versions` - list available versions.");
        }
        if (commandName === "setversion") {
            const newVer = args[0]?.toLowerCase();
            if (SUPPORTED_VERSIONS.includes(newVer)) {
                userPrefs[message.author.id] = newVer;
                savePrefs();
                return message.channel?.sendMessage(`<@${message.author.id}>, default set to **${newVer.toUpperCase()}**.`);
            }
            return message.channel?.sendMessage("Invalid version.");
        }

        if (commandName === "random") {
            const data = await fetchJSON(`https://bible-api.com/data/${userDefault}/random`);
            if (data?.random_verse) {
                const v = data.random_verse;
                return message.channel?.sendMessage(`**${v.book_name} ${v.chapter}:${v.verse}** (${userDefault.toUpperCase()})\n${v.text}`);
            }
        }
        
        if (commandName === "daily") {
            const data = await fetchJSON("https://beta.ourmanna.com/api/v1/get?format=json&order=daily");
            if (data?.verse?.details) {
                const v = data.verse.details;
                return message.channel?.sendMessage(`**Daily Manna**\n\n"${v.text.trim()}"\n— *${v.reference} (${v.version})*`);
            } else {
                return message.channel?.sendMessage("Could not fetch the daily verse right now.");
            }
        }

        if (commandName === "versions") {
            return message.channel?.sendMessage(`**Default:** ${userDefault.toUpperCase()} | **Versions:** ${SUPPORTED_VERSIONS.map(v => v.toUpperCase()).join(", ")}`);
        }

    } catch (error) {
        console.error("Message Processing Error:", error);
    }
});

async function fetchJSON(url) {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) { return null; }
}

client.loginBot(BOT_TOKEN);