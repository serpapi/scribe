#!/usr/bin/env node

// CLI for Scribe

import * as readline from 'node:readline/promises';
import { checkCmdExists, runCommand } from './main.js';
import { loadEnvFile, env, stdin, stdout } from 'node:process';
import fs from 'node:fs';

const rl = readline.createInterface({ input: stdin, output: stdout });

// Load environment variables
const envFilePath = "./.env"
if (fs.existsSync(envFilePath)) {
    loadEnvFile(envFilePath);
}
let globalApiKey = env.SERPAPI_KEY;

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
    if (globalApiKey === "" || globalApiKey == undefined || args.hasOwnProperty("login")) {
        // Set API key if it's missing, or if the user requested a login again
        await saveApiKey(envFilePath);
    };
    console.log("Not available yet!");
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