#!/usr/bin/env node

// CLI for Scribe

import { machine, type, release } from "node:os";
import * as readline from 'node:readline/promises';
import path from 'path';
import { checkCmdExists, getAccountInfo, getSerpTranscript, getSerpVideoInfo, saveFile, outputFormats, serpLangs } from './main.js';
import { loadEnvFile, env, stdin, stdout } from 'node:process';
import fs from 'node:fs';

const rl = readline.createInterface({ input: stdin, output: stdout });

// Regex to find video ID in a YouTube URL, demo: https://regex101.com/r/0Plpyd/1
const youtubeRegex = /^.*(youtu\.be\/|embed\/|shorts\/|\?v=|\&v=)(?<videoID>[^#\&\?]*).*/;

// Load environment variables
const envFilePath = "./.env"
if (fs.existsSync(envFilePath)) {
    loadEnvFile(envFilePath);
}

/**
 * Get the list of arguments from command line and parse them as an object.
 * @returns {object}
 */
function getArgs() {
    const array = process.argv;
    const result = {};
    for (let i = 0; i < array.length; i++) {
        const currentItem = array[i];
        if (currentItem.startsWith('-')) {
            // Remove all leading dashes
            const cleanKey = currentItem.replace(/^-+/, '');
            // Get the value and store it
            const nextValue = array[i + 1];
            result[cleanKey] = nextValue;
        } else if (currentItem.startsWith('http')) {
            result['url'] = currentItem;
        }
    }
    return result;
}

/**
 * Prompt the user for text input using the active readline interface.
 * @param {String} query The question to display in the CLI.
 * @returns {String} The response, with any surrounding quotation marks ('' and "") removed.
 */
async function askUser(query) {
    const response = await rl.question(query + " ");
    return response.replace(/^(['"])(.*)\1$/, '$2').trim();
}

/**
 * Show help information in the console.
 */
function showHelp() {
    const helpMessage = `Help not available yet!`;
    console.log(helpMessage);
}

/**
 * Prompts the user for an API key, and saves it to the settings file.
 * @param {string} envPath Full path to settings/env file
 * @returns New API key
 */
async function saveApiKey(pathToFile) {
    const apiKey = await askUser("Paste your API key from the https://serpapi.com/manage-api-key page:");
    fs.writeFileSync(pathToFile, `SERPAPI_KEY=${apiKey}\nINFO=DO NOT SHARE THIS FILE!`);
    console.log(`Saved API key to ${pathToFile}`);
    return apiKey;
}

async function main() {
    const args = getArgs();
    let settings = {};
    // Show help message if requested or missing parameters
    if (!args.hasOwnProperty("url") || args.hasOwnProperty("help")) {
        showHelp();
        return;
    }
    // Check that Pandoc is installed
    const pandocInstalled = checkCmdExists("pandoc");
    if (!pandocInstalled) {
        console.log("Pandoc is required but is not installed. Get it from here: https://pandoc.org/installing.html\n");
        process.exit(1);
    }
    // Set API key
    if (env.SERPAPI_KEY) {
        settings.serpApiKey = env.SERPAPI_KEY;
    } else if (args.hasOwnProperty("login") || env.SERPAPI_KEY === "") {
        settings.serpApiKey = await saveApiKey(envFilePath);
    }
    // Check for valid account and enough searches for request
    let accountData;
    try {
        accountData = await getAccountInfo(settings.serpApiKey);
    } catch (e) {
        console.log("Error logging into SerpApi:", e.message);
        process.exit(1);
    }
    console.log(`Logged in with SerpApi account ${accountData["account_email"] || "(unknown email)"}`);
    if (accountData?.total_searches_left !== undefined && accountData.total_searches_left < 2) {
        console.log('Not enough SerpApi searches remaining! Check your account here: https://serpapi.com/dashboard');
        process.exit(1);
    }
    // Set output directory
    const outputDir = path.resolve(process.cwd());
    settings.outputDir = outputDir;
    // Check that valid URL is provided
    try {
        settings.videoId = youtubeRegex.exec(args.url)['groups']['videoID'];
        console.log(`Found video ID: ${settings.videoId}`);
    } catch (e) {
        console.log(`Could not extract video ID from URL: ${args.url}`);
        process.exit(1);
    }
    // Set the output format
    if (!args.hasOwnProperty("format")) {
        console.log("No output format specified, defaulting to ePub.");
        settings.outputFormat = "epub";
    } else if (outputFormats.includes(args.format)) {
        settings.outputFormat = args.format;
    } else {
        console.log(`Invalid format, try again with one of these options: ${outputFormats.join(', ')}`);
        process.exit(1);
    }
    // Set the requested language
    if (!args.hasOwnProperty("lang")) {
        console.log("No language specified, defaulting to US English (en-us).");
        settings.videoLang = "en-us";
    } else if (serpLangs.some(lang => lang.language_code.toLowerCase() === args.lang.toLowerCase())) {
        settings.videoLang = args.lang;
    } else {
        console.log(`Invalid language, try again with one of these options: ${serpLangs.map(lang => lang.language_code).join(', ')}`);
        process.exit(1);
    }
    // Get video information and transcript
    console.log("Fetching video information...");
    let videoInfo = await getSerpVideoInfo(settings.videoId, settings.serpApiKey, settings.videoLang);
    settings = {...settings, ...videoInfo};
    console.log('Fetching transcript...');
    let bookText = await getSerpTranscript(settings);
    // Write file
    let savedFilePath = saveFile(settings, bookText);
    console.log(`Saved file: ${savedFilePath}`);
}

// Listen for termination signals
const gracefulShutdown = function () {
    rl.close();
    process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start main process
await main();
gracefulShutdown();