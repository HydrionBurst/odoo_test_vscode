import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { Configuration } from "./configuration";
import { execAsync } from "./tools";

/**
 * delete database
 */
export async function dropDatabase(): Promise<void> {
    const databaseName = Configuration.get("databaseName") as string;
    try {
        await execAsync(`dropdb ${databaseName} --if-exists --force`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to drop database: ${error.message}`);
        throw error;
    }
}

/**
 * create database
 */
export async function createDatabase(): Promise<void> {
    const databaseName = Configuration.get("databaseName") as string;
    try {
        await execAsync(
            `createdb ${databaseName} --encoding=UTF8 --lc-collate=C --lc-ctype=C --template=template0`,
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create database: ${error.message}`);
        throw error;
    }
}

export async function isDatabaseExists(): Promise<boolean> {
    const databaseName = Configuration.get("databaseName") as string;
    const { stdout } = await execAsync(`psql -l | grep ${databaseName} || true`);
    return stdout?.toString().trim() !== "";
}

/**
 * restore database
 */
export async function restoreDatabase(dumpName: string): Promise<void> {
    const databaseName = Configuration.get("databaseName") as string;
    const dumpDir = getDumpDir();
    const dumpFile = path.join(dumpDir, dumpName);
    vscode.window.showInformationMessage(`Restore ${databaseName} from ${dumpName}`);

    try {
        await execAsync(`pg_restore -d ${databaseName} ${dumpFile}`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to restore database: ${error.message}`);
        throw error;
    }
}

/**
 * dump database
 */
export async function dumpDatabase(dumpName: string): Promise<void> {
    const databaseName = Configuration.get("databaseName") as string;
    const dumpDir = getDumpDir();
    const dumpFile = path.join(dumpDir, dumpName);
    vscode.window.showInformationMessage(`Dump ${databaseName} to ${dumpName}`);

    try {
        await execAsync(`pg_dump -Fc -f ${dumpFile} ${databaseName}`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to dump database: ${error.message}`);
        throw error;
    }
}

export function checkDumpExists(dumpName: string): boolean {
    const dumpDir = getDumpDir();
    const dumpFile = path.join(dumpDir, dumpName);
    return fs.existsSync(dumpFile);
}

/**
 * Delete dump file
 */
export function deleteDump(dumpName: string): number {
    if (!checkDumpExists(dumpName)) {
        return 0;
    }
    const dumpDir = getDumpDir();
    const dumpFile = path.join(dumpDir, dumpName);
    fs.unlinkSync(dumpFile);
    return 1;
}

/**
 * Send notification to PostgreSQL using pg_notify
 */
export async function sendNotification(channel: string, payload: string): Promise<void> {
    try {
        // Properly escape the payload for PostgreSQL string literal
        const escapedPayload = payload
            .replace(/\\/g, "\\\\") // Escape backslashes first
            .replace(/'/g, "''") // Escape single quotes for PostgreSQL
            .replace(/"/g, '\\"'); // Escape double quotes for PostgreSQL
        await execAsync(
            `psql -d postgres -c "SELECT pg_notify('${channel}', '${escapedPayload}');"`,
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to send notification: ${error.message}`);
        throw error;
    }
}

function getDumpDir(): string {
    const databaseName = Configuration.get("databaseName") as string;
    const dumpDir = path.join(Configuration.get("dumpPath"), databaseName);
    if (!fs.existsSync(dumpDir)) {
        fs.mkdirSync(dumpDir, { recursive: true });
    }
    return dumpDir;
}
