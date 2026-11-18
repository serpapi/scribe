import { spawn, execSync } from "node:child_process";
import path from 'path';
import fs from 'node:fs';

/**
 * Checks if a given command or executable is available to the system.
 * @param {string} command The name of the command to check.
 * @returns {boolean}
 */
async function checkCmdExists(command) {
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
 * Check information for a SerpApi account.
 * More info: https://serpapi.com/account-api
 * @param {string} api_key The API key connected to the account
 * @returns {object} The JSON response from SerpApi.
 */
async function getAccountInfo(apiKey) {
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
 * Get a YouTube video transcript with SerpApi and save it to the specified directory.
 * @param {object} settings The settings configuration. 
 * @param {string} settings.serpApiKey The API key for SerpApi.
 * @param {string} settings.outputDir The absolute path to where the export file should be stored.
 * @param {string} settings.videoId The ID for the YouTube video.
 * @param {string} settings.outputFormat The output format for the file.
 * @returns {string} The absolute path to the exported file.
 */
async function getSerpTranscript(settings) {
    let result;
    // Send API request
    const apiReq = {
        engine: "youtube_video_transcript",
        v: settings.videoId,
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
    let i = 0;
    for (const line of result.transcript) {
        while (i + 1 < chapters.length && chapters[i + 1].start_ms <= line.start_ms) i++;
        // Skip lines in the transcript that are only sounds, like "[upbeat music]" or "[laughing]"
        if (isSoundOnly(line.snippet)) continue;
        // Remove leading line dash from some lines
        const snippet = line.snippet.replace(/^\s*-\s*/, "");
        // Add the snippet
        chapters[i].snippets.push({ ...line, snippet });
    }
    // Create Pandoc-formatted Markdown file
    let bookText = "";
    for (let chapter of chapters) {
        bookText += `# ${chapter.chapter}\n\n`;
        for (let snippet of chapter.snippets) {
            bookText += `${snippet.snippet}\n\n`;
        }
    }
    // Write file
    const outputFilePath = path.resolve(settings.outputDir, `${settings.videoId}.md`);
    fs.writeFileSync(outputFilePath, bookText);
    return outputFilePath;
}

/**
 * Runs a command in a child process as a Promise
 * @param {String} command The command to run and wait for completion
 * @param {Array} args The arguments to pass to the command
 * @returns 
 */
function runCommand(command, args) {
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

export { checkCmdExists, runCommand, getAccountInfo, getSerpTranscript }