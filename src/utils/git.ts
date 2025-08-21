import * as path from "path";
import * as vscode from "vscode";

import { execAsync } from "./tools";
import { showInformationMessage } from "./vscode";

export async function getGitRepoPaths(paths: string[]): Promise<string[]> {
    const gitRepos = await Promise.all(
        paths.map(async (addonsPath: string) => {
            try {
                const { stdout } = await execAsync("git rev-parse --show-toplevel", {
                    cwd: addonsPath,
                });
                return stdout?.toString().trim();
            } catch {
                return null;
            }
        }),
    );
    const uniqueRepos = [...new Set(gitRepos.filter((repo): repo is string => repo !== null))];
    return uniqueRepos;
}

export async function getGitBranch(repoPath: string): Promise<string> {
    try {
        const { stdout } = await execAsync("git branch --show-current ", { cwd: repoPath });
        return stdout?.toString().trim() || "";
    } catch (error: any) {
        vscode.window.showErrorMessage(
            `Failed to get git branch for ${repoPath}: ${error.message}`,
        );
        return "";
    }
}

export async function getGitCommit(repoPath: string): Promise<string> {
    try {
        const { stdout } = await execAsync("git rev-parse HEAD", {
            cwd: repoPath,
        });
        return stdout?.toString().trim() || "";
    } catch (error: any) {
        vscode.window.showErrorMessage(
            `Failed to get git commit for ${repoPath}: ${error.message}`,
        );
        return "";
    }
}

export async function isGitRepoCommitted(repoPath: string): Promise<boolean> {
    try {
        const { stdout } = await execAsync("git status --porcelain", { cwd: repoPath });
        return stdout?.toString().trim() === "";
    } catch (error: any) {
        vscode.window.showErrorMessage(
            `Failed to check git status for ${repoPath}: ${error.message}`,
        );
        return true;
    }
}

export async function isLocalGitBranch(path: string, branch: string): Promise<boolean> {
    try {
        const { stdout } = await execAsync(`git branch --list ${branch}`, { cwd: path });
        return stdout?.toString().trim() !== "";
    } catch (error: any) {
        vscode.window.showErrorMessage(`Fail git branch --list ${branch}: ${error}`);
        return false;
    }
}

/**
 * Checkout to a git branch
 * @param repoPath - The path to checkout to
 * @param name - The branch/commit to checkout to
 */
export async function checkoutGit(repoPath: string, name: string): Promise<boolean> {
    const repoName = path.basename(repoPath);
    try {
        showInformationMessage("git", `Checkout to ${name} for ${repoName}`);
        await execAsync(`git checkout ${name}`, { cwd: repoPath });
        return true;
    } catch (error: any) {
        vscode.window.showErrorMessage(
            `Failed to checkout to ${name} for ${repoName}: ${error.message}`,
        );
        return false;
    }
}
