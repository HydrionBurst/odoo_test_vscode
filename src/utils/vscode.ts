import * as path from "path";
import * as vscode from "vscode";

import { Configuration } from "./configuration";

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

        const terminateDisposable = vscode.debug.onDidTerminateDebugSession((session) => {
            if (odooTestId === session.configuration.__odooTestWaitId) {
                terminateDisposable.dispose();
                resolve(true);
            }
        });

        vscode.debug.startDebugging(wsFolder, debugConfig, options).then((success) => {
            if (!success) {
                terminateDisposable.dispose();
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
export function getDebugConfiguration(name: "standard" | "standalone" | "upgrade" = "standard"): {
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
    const args = ["-d", databaseName];

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
