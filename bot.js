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
const ALLOWED_BOT = process.env.ALLOWED_BOT;
let globalDefaultVersion = "kjv";

// Limits: stop one message from causing a flood of API calls and replies
const MAX_REFS_PER_MESSAGE = 10;
const MAX_VERSIONS_PER_REF = 10;
const MAX_REPLY_TEXT = 1200;
const FETCH_TIMEOUT_MS = 8000;

if (!BOT_TOKEN) {
    console.error("BOT_TOKEN is not set. Add it to .env.");
    process.exit(1);
}

const SUPPORTED_VERSIONS = [
    "web", "kjv", "asv", "bbe", "darby", "dra", "ylt", "oeb-us",
    "oeb-cw", "webbe", "almeida", "rccv", "bkr", "cuv", "clementine", "cherokee"
];

// Verse reference: [1-3] Book Chapter:Verse[-End] [versions...]
const VERSION_ALT = SUPPORTED_VERSIONS.map(v => v.replace(/-/g, "\\-")).join("|");
const bibleRegex = new RegExp(
    `(?<![\\w:])((?:[1-3]\\s?)?[a-zA-Z]+)\\s*(\\d+):(\\d+)(?:[–—-](\\d+))?((?:[\\s,]+(?:${VERSION_ALT})(?![\\w-]))*)`,
    "gi"
);

// --- User's preferred bible's version functions ---
const PREFS_FILE = path.join(__dirname, "user_prefs.json");
let userPrefs = {};

function loadPrefs() {
    try {
        if (fs.existsSync(PREFS_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(PREFS_FILE, "utf8"));
            // Only accept a plain object; a bad file must not break every message
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) userPrefs = parsed;
        }
    } catch (e) { console.error("Prefs load error:", e); }
}

function savePrefs() {
    try {
        fs.writeFileSync(PREFS_FILE, JSON.stringify(userPrefs, null, 2));
    } catch (e) { console.error("Prefs save error:", e); }
}

function getUserVersion(userId) {
    const v = Object.hasOwn(userPrefs, userId) ? userPrefs[userId] : undefined;
    return SUPPORTED_VERSIONS.includes(v) ? v : globalDefaultVersion;
}

function clip(text, max = MAX_REPLY_TEXT) {
    const t = String(text ?? "").trim();
    return t.length > max ? t.substring(0, max) + "..." : t;
}

loadPrefs();

// --- 2. WEB SERVER ---
const app = express();
app.disable("x-powered-by");
app.get("/", (req, res) => res.send("BibleBot is Active."));

// --- Get URL to check whether bible-api is working ---
app.get("/get", async (req, res) => {
    const reference = typeof req.query.v === "string" ? req.query.v : "";
    const version = typeof req.query.version === "string" ? req.query.version.toLowerCase() : "kjv";
    if (!reference) return res.status(400).send("Provide reference: ?v=BookChapter:Verse");
    if (reference.length > 100) return res.status(400).send("Reference too long.");
    if (!SUPPORTED_VERSIONS.includes(version)) return res.status(400).send("Unsupported version.");
    const data = await fetchJSON(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`);
    if (!data) return res.status(502).send("Error fetching from Bible API.");
    res.json(data);
});
const server = app.listen(process.env.PORT || 10000);
server.on("error", (err) => console.error("Web server error:", err.message));

// --- 3. BOT INITIALIZATION ---
const client = new Client();
// Prevent the "Unhandled error event" crash
client.on("error", (err) => console.error("Socket Error:", err));

// Send without throwing: one failed send must not stop the rest of the handler
async function safeSend(channel, text) {
    try {
        return await channel?.sendMessage(text);
    } catch (e) {
        console.error("Send Error:", e?.message || e);
        return null;
    }
}

// --- 4. BANNED WORDS FILTER ---
// Single words are matched as whole words, so "tit" does not hit "Titus"
// and "cum" does not hit "circumcision". Phrases and symbols use substring match.
let BANNED_TOKENS = new Set();
let BANNED_PHRASES = [];
const BANNED_FILE = path.join(__dirname, "banned_words.txt");
const WORD_RE = /^[\p{L}\p{N}&]+$/u;
function loadBannedWords() {
    try {
        if (fs.existsSync(BANNED_FILE)) {
            const rawData = fs.readFileSync(BANNED_FILE, "utf8");
            const words = rawData.split(/[\r\n]+/)
                .flatMap(line => line.split(','))
                .map(word => word.trim().toLowerCase())
                .filter(word => word.length > 0);
            BANNED_TOKENS = new Set(words.filter(w => WORD_RE.test(w)));
            BANNED_PHRASES = words.filter(w => !WORD_RE.test(w));
            console.log(`AutoMod: Loaded ${words.length} words.`);
        } else {
            fs.writeFileSync(BANNED_FILE, "");
            console.log("AutoMod: Created empty banned_words.txt");
        }
    } catch (err) {
        console.error("Mod Load Error:", err.message);
    }
}
function hasBannedWord(lowerContent) {
    const tokens = lowerContent.split(/[^\p{L}\p{N}&]+/u);
    if (tokens.some(t => BANNED_TOKENS.has(t))) return true;
    const spaced = lowerContent.replace(/\s+/g, " ");
    return BANNED_PHRASES.some(p => spaced.includes(p));
}
if (MOD_ENABLED) loadBannedWords();

// --- 5. EVENTS ---
// "ready" fires again after every reconnect; only start the keep-alive once
let keepAlive = null;
client.on("ready", () => {
    console.log(`Online as ${client.user?.username}.`);
    if (keepAlive) return;
    keepAlive = setInterval(async () => {
        try { if (client.user) await client.users.fetch(client.user.id); } catch (e) {}
    }, 25000);
});

client.on("messageCreate", async (message) => {
    try {
        // CRITICAL: Defensive check to ensure message and channel exist
        if (!message || typeof message.content !== "string" || !message.content || !message.channel) return;

        const authorId = message.author?.id ?? message.authorId;
        if (!authorId) return;

        // Never react to our own messages: replies contain "**John 3:16**",
        // which the parser would match again and loop forever.
        if (client.user && authorId === client.user.id) return;

        // 2. Updated Bot Filter:
        // Ignore the message if the author is a bot,
        // UNLESS the author's ID matches our ALLOWED_BOT. Added BotsWatcher to automate restart if no response returned.
        if (message.author?.bot) {
            if (!ALLOWED_BOT || authorId !== ALLOWED_BOT) return;
        }

        const userDefault = getUserVersion(authorId);
        const lowerContent = message.content.toLowerCase();

        // --- STEP A: BANNED WORDS FILTER ---
        if (MOD_ENABLED && hasBannedWord(lowerContent)) {
            try {
                await message.delete();
            } catch (e) { console.error("Mod Delete Error:", e?.message || e); }
            const warn = await safeSend(message.channel, `AutoMod: <@${authorId}>, that language is not allowed.`);
            if (warn) setTimeout(() => warn.delete?.().catch(() => {}), 4000);
            return;
        }

        // --- STEP B: BIBLE PARSER ---
        //const bibleRegex = /([1-3]?\s?[a-zA-Z]+)\s*(\d+):(\d+)(?:-(\d+))?(?:[\s?]([a-zA-Z- ,]+))?/gi;
        // Book must not follow a digit/colon (stops "1:1 Matthew" becoming "1 Matthew"),
        // and the trailing part only takes real version names (stops it eating the next book).
        const matches = [...message.content.matchAll(bibleRegex)].slice(0, MAX_REFS_PER_MESSAGE);

        if (matches.length > 0) {
            let processedMatch = false;
            for (const match of matches) {
                const [fullMatch, book, chapter, verse, endVerse, versionsPart] = match;
                let requestedVersions = [];
                if (versionsPart) {
                    const potentialVersions = versionsPart.toLowerCase().split(/[\s,]+/).filter(v => v.length > 0);
                    requestedVersions = [...new Set(potentialVersions.filter(v => SUPPORTED_VERSIONS.includes(v)))];
                }
                if (requestedVersions.length === 0) requestedVersions = [userDefault];
                requestedVersions = requestedVersions.slice(0, MAX_VERSIONS_PER_REF);
                const reference = endVerse ? `${book} ${chapter}:${verse}-${endVerse}` : `${book} ${chapter}:${verse}`;

                for (const ver of requestedVersions) {
                    const data = await fetchJSON(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${ver}`);
                    if (typeof data?.text === "string" && data.text.trim()) {
                        processedMatch = true;
                        const ref = data.reference || reference;
                        await safeSend(message.channel, `**${ref}** (${ver.toUpperCase()})\n${clip(data.text)}`);
                    }
                }
            }
            if (processedMatch) return;
        }

        // --- STEP C: PREFIX COMMANDS ---
        if (!message.content.startsWith(PREFIX)) return;
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = (args.shift() || "").toLowerCase();

        if (commandName === "ping") return safeSend(message.channel, "Pong! BibleBot is active.");

        if (commandName === "pingbot") {
            return safeSend(message.channel, `Shield: ${MOD_ENABLED ? "Active" : "Off"} | Default: ${userDefault.toUpperCase()}`);
        }

        if (commandName === "help") {
            return safeSend(message.channel, "# BibleBot Help\n> `!random` - random verse.  | `!daily` - daily verse.  | `!pingbot` - check status & default version.  | `!setversion [name]` - set default version.  | `!versions` - list available versions.");
        }
        if (commandName === "setversion") {
            const newVer = args[0]?.toLowerCase();
            if (SUPPORTED_VERSIONS.includes(newVer)) {
                userPrefs[authorId] = newVer;
                savePrefs();
                return safeSend(message.channel, `<@${authorId}>, default set to **${newVer.toUpperCase()}**.`);
            }
            return safeSend(message.channel, "Invalid version.");
        }

        if (commandName === "random") {
            const data = await fetchJSON(`https://bible-api.com/data/${userDefault}/random`);
            const v = data?.random_verse;
            if (v && typeof v.text === "string") {
                return safeSend(message.channel, `**${v.book} ${v.chapter}:${v.verse}** (${userDefault.toUpperCase()})\n${clip(v.text)}`);
            }
            return safeSend(message.channel, "Could not fetch a random verse right now.");
        }
        /*
        if (commandName === "daily") {
            const data = await fetchJSON("https://beta.ourmanna.com/api/v1/get?format=json&order=daily");
            if (data?.verse?.details) {
                const v = data.verse.details;
                return message.channel?.sendMessage(`**Daily Manna**\n\n"${v.text.trim()}"\n— *${v.reference} (${v.version})*`);
            } else {
                return message.channel?.sendMessage("Could not fetch the daily verse right now.");
            }
        }*/

        if (commandName === "daily") {
            const daily = await fetchJSON("https://beta.ourmanna.com/api/v1/get?format=json&order=daily");
            const v = daily?.verse?.details;
            if (!v || typeof v.reference !== "string") {
                return safeSend(message.channel, "Could not fetch the daily verse right now.");
            }
            const ref = v.reference;

            // Re-fetch that same reference in the user's preferred version
            const data = await fetchJSON(`https://bible-api.com/${encodeURIComponent(ref)}?translation=${userDefault}`);
            if (typeof data?.text === "string" && data.text.trim()) {
                return safeSend(message.channel, `**Daily Manna: ${data.reference || ref}** (${userDefault.toUpperCase()})\n${clip(data.text)}`);
            }
            // fallback to OurManna's own text if bible-api can't parse the reference
            return safeSend(message.channel, `**Daily Manna**\n\n"${clip(v.text)}"\n— *${v.reference} (${v.version ?? ""})*`);
        }

        if (commandName === "versions") {
            return safeSend(message.channel, `**Default:** ${userDefault.toUpperCase()} | **Versions:** ${SUPPORTED_VERSIONS.map(v => v.toUpperCase()).join(", ")}`);
        }

    } catch (error) {
        console.error("Message Processing Error:", error);
    }
});

// Timeout so a hung API cannot block a handler forever; null on any failure
async function fetchJSON(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}

Promise.resolve()
    .then(() => client.loginBot(BOT_TOKEN))
    .catch((err) => console.error("Login Error:", err?.message || err));
