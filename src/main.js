import { spawn, execSync } from "node:child_process";
import fs from 'node:fs';
import path from 'path';

/**
 * @typedef {Object} VideoSettings
 * @property {string} settings.serpApiKey The API key for SerpApi.
 * @property {string} settings.outputDir The absolute path to where the export file should be stored.
 * @property {string} settings.videoId The ID for the YouTube video.
 * @property {string} settings.videoUrl The full URL for the YouTube video.
 * @property {string} settings.videoCreator The channel name for the YouTube video.
 * @property {string} settings.videoTitle The title of the YouTube video.
 * @property {string} settings.videoLang The requested language of the video transcript.
 * @property {string} settings.videoDate The publish date of the YouTube video in YYY-MM-DD format.
 * @property {string} settings.outputFormat The output format for the file. Supported options are `markdown` and `txt`.
 */

/**
 * Checks if a given command or executable is available to the system.
 * @param {string} command The name of the command to check.
 * @returns {boolean}
 */
export async function checkCmdExists(command) {
    try {
        let checkCmd;
        // 'which' for Unix, 'where' for Windows
        if (process.platform === "win32") {
            checkCmd = `where ${command}`;
        } else {
            checkCmd = `which ${command}`
        }
        execSync(checkCmd, { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Saves the book in the specified file format using Pandoc, and returns the absolute path to the file.
 * @param {VideoSettings} settings The settings configuration.
 * @param {string} bookText The Markdown-formatted text for the book.
 * @returns {Promise<string>} The absolute path to the file.
 */
export async function saveFile(settings, bookText) {
    // When more options are added, Markdown will be the default/fallback
    const outputFilePath = path.resolve(settings.outputDir, `${settings.videoTitle} ${settings.videoId}.md`);
    fs.writeFileSync(outputFilePath, bookText);
    return outputFilePath;
}

/**
 * Check information for a SerpApi account.
 * More info: https://serpapi.com/account-api
 * @param {string} api_key The API key connected to the account
 * @returns {object} The JSON response from SerpApi.
 */
export async function getAccountInfo(apiKey) {
    // Create API request
    const url = `https://serpapi.com/account?api_key=${apiKey}`
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        const result = await response.json();
        return result;
    } catch (error) {
        throw new Error(error);
    }
}

/**
 * Get the URL, title, creator, and publish date of a YouTube video with SerpApi, and return them in a JSON object ready for appending to a VideoSettings object.
 * @param {string} videoId The ID of the YouTube video.
 * @param {string} serpApiKey The API key for SerpApi.
 * @param {string} langCode The language code to use for the search.
 * @returns {Promise<object>} The object with `videoUrl`, `videoTitle`, `videoCreator`, and `videoDate` keys.
 */
export async function getSerpVideoInfo(videoId, serpApiKey, langCode) {
    let result;
    // Send API request
    const apiReq = {
        engine: "youtube_video",
        v: videoId,
        api_key: serpApiKey,
        // Force English in US for a predictable date format
        gl: "us",
        hl: "en"
    };
    const url = "https://serpapi.com/search?" + new URLSearchParams(apiReq);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        result = await response.json();
    } catch (error) {
        throw new Error(error);
    }
    // Convert date to Pandoc's preferred YYYY-MM-DD format
    let publishDate;
    if (result?.published_date) {
        const d = new Date(result.published_date + " UTC");
        publishDate = d.toISOString().slice(0, 10);
    }
    // Return data
    const data = {
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        videoTitle: (result?.title || "Unknown Title"),
        videoCreator: (result?.channel?.name || "Unknown Creator"),
        videoDate: (publishDate || "")
    }
    return data;
}

/**
 * Get a YouTube video transcript with SerpApi and convert it to Pandoc's Markdown format.
 * @param {VideoSettings} settings The settings configuration.
 * @returns {Promise<string>} The generated book in Markdown format.
 */
export async function getSerpTranscript(settings) {
    let result;
    // Send API request
    const apiReq = {
        engine: "youtube_video_transcript",
        v: settings.videoId,
        language_code: settings.videoLang,
        api_key: settings.serpApiKey
    };
    const url = "https://serpapi.com/search?" + new URLSearchParams(apiReq);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        result = await response.json();
    } catch (error) {
        throw new Error(error);
    }
    const isSoundOnly = s => /^\s*(\[[^\]]*\]\s*)+$/.test(s);
    // Combine the chapters and snippets into one object
    const chapters = result.chapters.map(c => ({ ...c, snippets: [] }));
    let chapterIndex = 0;
    for (const line of result.transcript) {
        while (chapterIndex + 1 < chapters.length && chapters[chapterIndex + 1].start_ms <= line.start_ms) chapterIndex++;
        // Skip lines in the transcript that are only sounds, like "[upbeat music]" or "[laughing]"
        if (isSoundOnly(line.snippet)) continue;
        // Remove leading line dash from some lines
        const snippet = line.snippet.replace(/^\s*-\s*/, "");
        // Add the snippet
        chapters[chapterIndex].snippets.push({ ...line, snippet });
    }
    // Create Pandoc-formatted Markdown file, with metadata in YAML block at start
    // Documentation: https://pandoc.org/MANUAL.html#extension-yaml_metadata_block
    let bookText = `---
title: "${settings.videoTitle}"
author: "${settings.videoCreator}"
date: ${settings.videoDate}
description: "${settings.videoUrl}"
rights: "Converted with SerpApi Scribe: https://github.com/serpapi/scribe"
---\n\n`;
    for (let chapter of chapters) {
        bookText += `# ${chapter.chapter}\n\n`;
        for (let [i, value] of chapter.snippets.entries()) {
            // For every 10 snippets, add a linked timestamp
            if (i % 10 === 0) {
                let timestamp = value.start_ms / 1000;
                bookText += `${value.snippet} [[${value.start_time_text}](https://youtu.be/${settings.videoId}?t=${timestamp})]\n\n`;
            } else {
                bookText += `${value.snippet}\n\n`;
            }
        }
    }
    return bookText;
}

/**
 * Runs a command in a child process as a Promise
 * @param {String} command The command to run and wait for completion
 * @param {Array} args The arguments to pass to the command
 * @returns 
 */
export function runCommand(command, args) {
    return new Promise(function (resolve, reject) {
        const child = spawn(command, args);
        // Pipe output to parent console
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        // Resolve when the process finishes successfully
        child.on('close', function (code) {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Process exited with code ${code}`));
            }
        });
        // Reject if the command fails to start (e.g., command not found)
        child.on('error', function (err) {
            reject(err);
        });
    });
}