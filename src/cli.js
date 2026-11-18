#!/usr/bin/env node

// CLI for Scribe

import { machine, type, release } from "node:os";
import * as readline from 'node:readline/promises';
import path from 'path';
import { checkCmdExists, runCommand, getAccountInfo, getSerpTranscript, getSerpVideoInfo } from './main.js';
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
    const booksDir = path.resolve(process.cwd(), './books');
    const args = getArgs();
    let actionData = {};
    // Show help message if requested or missing parameters
    if (!args.hasOwnProperty("url") || args.hasOwnProperty("help")) {
        showHelp();
        return;
    }
    // Set API key
    if (env.SERPAPI_KEY) {
        actionData.serpApiKey = env.SERPAPI_KEY;
    } else if (args.hasOwnProperty("login") || env.SERPAPI_KEY === "") {
        actionData.serpApiKey = await saveApiKey(envFilePath);
    }
    // Show welcome message
    const accountData = await getAccountInfo(actionData.serpApiKey);
    console.log(`SerpAPI Scribe - ${type()} ${release()} (${machine()})\n======\nAccount email: ${accountData["account_email"] || "Unknown"}\nRemaining searches: ${accountData["total_searches_left"] || "Unknown"}\nManage account: https://serpapi.com/dashboard\n======\n`);
    // Check that books folder is available
    if (fs.existsSync(booksDir)) {
        console.log(`Found books directory: ${booksDir}`);
    } else {
        fs.mkdirSync(booksDir);
        console.log(`Created books directory: ${booksDir}`);
    }
    actionData.outputDir = booksDir;
    // Check that valid URL is provided
    let videoId;
    try {
        videoId = youtubeRegex.exec(args.url)['groups']['videoID'];
        console.log(`Found video ID: ${videoId}`);
    } catch (e) {
        console.log(`Could not extract video ID from URL: ${args.url}`);
        return;
    }
    actionData.videoId = videoId;
    // Set file format (will eventually contain more than .txt)
    actionData.outputFormat = "html";
    // Get video information and transcript
    console.log("Fetching video information...");
    let videoInfo = await getSerpVideoInfo(actionData.videoId, actionData.serpApiKey);
    actionData = {...actionData, ...videoInfo};
    console.log('Fetching transcript...');
    let bookText = await getSerpTranscript(actionData);
    // Write file
    const outputFilePath = path.resolve(actionData.outputDir, `${actionData.videoTitle} ${actionData.videoId}.md`);
    fs.writeFileSync(outputFilePath, bookText);
    console.log(`Saved file: ${outputFilePath}`);
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