import * as vscode from "vscode";

// Store the last executed command and its arguments
let lastCommand: {
    command: string;
    args: any[];
} | null = null;

// Function to store the last executed command
export function saveLastCommand(commandName: string, command: Function) {
    return (...args: any[]) => {
        // Deep copy the arguments
        const argsCopy = JSON.parse(JSON.stringify(args));
        lastCommand = { command: commandName, args: argsCopy };
        return command(...args);
    };
}

// Function to rerun the last command
export async function rerun() {
    if (!lastCommand) {
        vscode.window.showWarningMessage("No previous command to rerun.");
        return;
    }

    const { command, args } = lastCommand;

    try {
        await vscode.commands.executeCommand(command, ...args);
        vscode.window.showInformationMessage(`Rerunning: ${command}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to rerun command: ${error}`);
    }
}
