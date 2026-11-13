import { spawn, execSync } from "node:child_process";

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
 * Runs a command in a child process as a Promise
 * @param {String} command The command to run and wait for completion
 * @param {Array} args The arguments to pass to the command
 * @returns 
 */
function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args);
        // Pipe output to parent console
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        // Resolve when the process finishes successfully
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Process exited with code ${code}`));
            }
        });
        // Reject if the command fails to start (e.g., command not found)
        child.on('error', (err) => {
            reject(err);
        });
    });
}

export { checkCmdExists, runCommand }