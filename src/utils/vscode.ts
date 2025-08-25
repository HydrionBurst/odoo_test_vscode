import * as path from "path";
import * as vscode from "vscode";

import { Configuration } from "./configuration";

let currentDebugTerminal: vscode.Terminal | undefined;

export async function getCurrentDebugTerminal(
    timeout: number,
): Promise<vscode.Terminal | undefined> {
    const startTime = Date.now();
    while (!currentDebugTerminal) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (Date.now() - startTime > timeout) {
            return undefined;
        }
    }
    return currentDebugTerminal;
}

export function stopCurrentDebugTerminal() {
    if (currentDebugTerminal && !currentDebugTerminal.exitStatus) {
        currentDebugTerminal.dispose();
    }
    currentDebugTerminal = undefined;
}

/**
 * Send text to the current debug terminal.
 * If no terminal is tracked, fallback to the active terminal.
 */
export function sendTextToCurrentDebugTerminal(text: string, shouldExecute: boolean = true) {
    if (!currentDebugTerminal || currentDebugTerminal.exitStatus) {
        vscode.window.showWarningMessage("No debug terminal to send text to.");
        return;
    }
    currentDebugTerminal.sendText(text, shouldExecute);
}

/**
 * Start a VSCode debug session and wait for it to terminate.
 * Returns true if the session started and terminated, false otherwise.
 */
export async function startDebuggingAndWait(
    wsFolder: vscode.WorkspaceFolder,
    debugConfig: vscode.DebugConfiguration,
    options: { noDebug: boolean } | undefined = undefined,
): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const odooTestId = `odoo_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        debugConfig.__odooTestWaitId = odooTestId;

        const debugDisposable = vscode.debug.onDidTerminateDebugSession((session) => {
            if (odooTestId === session.configuration.__odooTestWaitId) {
                currentDebugTerminal = undefined;
                debugDisposable.dispose();
                resolve(true);
            }
        });

        vscode.debug.startDebugging(wsFolder, debugConfig, options).then((success) => {
            if (success) {
                // Note:
                // We can neither know the used terminal from the debug session, nor know if a terminal
                // in vscode.window.terminals is used by which debug session. This is the best effort
                // based on the UI behavior. When the debug session is started, the active terminal will
                // be automatically changed to its debug terminal if the terminal is not activated.
                currentDebugTerminal = vscode.window.activeTerminal;
            } else {
                debugDisposable.dispose();
                resolve(false);
            }
        });
    });
}

/**
 * find the first launch configuration with the given name
 * @param debugConfigurationName name of the launch configuration
 * @returns { workspaceFolder, configuration }
 */
export function getDebugConfiguration(
    name: "standard" | "standalone" | "upgrade" | "shell" = "standard",
): {
    workspaceFolder: vscode.WorkspaceFolder | undefined;
    configuration: vscode.DebugConfiguration | undefined;
} {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
        vscode.window.showWarningMessage("No workspace folders found.");
        return { workspaceFolder: undefined, configuration: undefined };
    }

    const odooBinPath = Configuration.get("odooBinPath"); // absolute path
    // find the the first folder that contains the odoo-bin executable
    let workspaceFolder: vscode.WorkspaceFolder | undefined;
    for (const folder of folders) {
        if (odooBinPath.startsWith(folder.uri.fsPath)) {
            workspaceFolder = folder;
            break;
        }
    }
    if (!workspaceFolder) {
        vscode.window.showWarningMessage("Odoo bin path not found in any workspace folder.");
        return { workspaceFolder: undefined, configuration: undefined };
    }

    let program = odooBinPath;
    if (name === "standalone") {
        program = path.join(
            path.dirname(odooBinPath),
            "odoo",
            "tests",
            "test_module_operations.py",
        );
    }

    const databaseName = Configuration.get("databaseName");
    const args = [];
    if (name === "shell") {
        args.push("shell");
    }
    args.push("-d", databaseName);

    if (Configuration.get("configPath") && name !== "standalone") {
        args.push("-c", Configuration.get("configPath"));
    }

    const addonsPaths = Configuration.get("addonsPath").map((p: string) =>
        path.relative(workspaceFolder.uri.fsPath, p),
    );

    args.push("--addons-path", addonsPaths.join(","));

    if (name === "upgrade") {
        const upgradePath = Configuration.get("upgradePath").map((p: string) =>
            path.relative(workspaceFolder.uri.fsPath, p),
        );
        args.push("--upgrade-path", upgradePath.join(","));
    }

    const configuration: vscode.DebugConfiguration = {
        type: "python",
        request: "launch",
        name: `Launch for ${name}`,
        program: program,
        args: args,
        console: "integratedTerminal",
        cwd: workspaceFolder.uri.fsPath,
    };
    return { workspaceFolder, configuration };
}

export function showInformationMessage(topic: string, message: string, ...items: any[]) {
    if (!Configuration.get("muteMessageTopics").includes(topic)) {
        vscode.window.showInformationMessage(message, ...items);
    }
}
