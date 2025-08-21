import * as vscode from "vscode";

import { cleanupTest } from "./commands/cleanupTest";
import { Configuration } from "./utils/configuration";
import { dumpTestDatabase } from "./commands/dumpTestDatabase";
import { OdooStandardCodeLensProvider } from "./codelens/OdooStandardCodeLensProvider";
import { OdooStandaloneCodeLensProvider } from "./codelens/OdooStandaloneCodeLensProvider";
import { OdooUpgradeCodeLensProvider } from "./codelens/OdooUpgradeCodeLensProvider";
import { checkUpgradeTest, prepareUpgrade, upgradeDatabase } from "./commands/runUpgrade";
import { rerun, saveLastCommand } from "./commands/rerun";
import { runStandaloneTest } from "./commands/runStandaloneTest";
import { runDumpTest, runTest, runUpdateTest } from "./commands/runStandardTest";
import { runHotTest, startHotTest, toggleHotTestLogSql } from "./commands/runHotTest";
import { setDatabaseName, setUpgradeFrom } from "./commands/setConfiguration";
import { NonBlockingMutex } from "./utils/tools";

// Use NonBlockingMutex instead of Mutex
const debugCommandMutex = new NonBlockingMutex(() => {
    vscode.window.showWarningMessage("Another command is running, please wait.");
});
const databaseCommandMutex = new NonBlockingMutex(() => {
    vscode.window.showWarningMessage("Database operation is running, please wait.");
});

export function activate(context: vscode.ExtensionContext) {
    if (!Configuration.get("odooBinPath")) {
        Configuration.autoSetPaths();
    }
    Configuration.extensionPath = context.extensionPath;

    const odooStandardCodeLensProvider = new OdooStandardCodeLensProvider();
    const odooStandaloneCodeLensProvider = new OdooStandaloneCodeLensProvider();
    const odooUpgradeCodeLensProvider = new OdooUpgradeCodeLensProvider();

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: "python", scheme: "file" },
            odooStandardCodeLensProvider,
        ),
        vscode.languages.registerCodeLensProvider(
            { language: "python", scheme: "file" },
            odooStandaloneCodeLensProvider,
        ),
        vscode.languages.registerCodeLensProvider(
            { language: "python", scheme: "file" },
            odooUpgradeCodeLensProvider,
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("odooTest.changeDatabaseName", setDatabaseName),
        vscode.commands.registerCommand("odooTest.changeUpgradeFrom", setUpgradeFrom),
    );

    // Register configuration change listener for validation
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration("odooTest")) {
                Configuration.check();
            }
            if (event.affectsConfiguration("odooTest.standardTestLayout")) {
                odooStandardCodeLensProvider.switchButtonLayer(0);
            }
        }),
    );

    const odooTestCommands: [string, any][] = [
        ["odooTest.runTest", debugCommandMutex.guard(runTest)],
        ["odooTest.runUpdateTest", debugCommandMutex.guard(runUpdateTest)],
        ["odooTest.runStandaloneTest", debugCommandMutex.guard(runStandaloneTest)],
        ["odooTest.runDumpTest", debugCommandMutex.guard(runDumpTest)],
        ["odooTest.runHotTest", runHotTest], // Hot test doesn't need mutex since it just sends notification
        ["odooTest.prepareUpgrade", debugCommandMutex.guard(prepareUpgrade)],
        ["odooTest.upgradeDatabase", debugCommandMutex.guard(upgradeDatabase)],
        ["odooTest.checkUpgradeTest", debugCommandMutex.guard(checkUpgradeTest)],
    ];
    for (const [name, func] of odooTestCommands) {
        context.subscriptions.push(
            vscode.commands.registerCommand(name, saveLastCommand(name, func)),
        );
    }

    const otherCommands: [string, any][] = [
        // dumpDatabase during debugging is allowed
        ["odooTest.dumpTestDatabase", databaseCommandMutex.guard(dumpTestDatabase)],
        // cleanupTest during debugging or dumpDatabase is not allowed
        ["odooTest.cleanupTest", debugCommandMutex.guard(databaseCommandMutex.guard(cleanupTest))],

        ["odooTest.switchButtonLayer", () => odooStandardCodeLensProvider.switchButtonLayer()],
        ["odooTest.toggleHotTestLogSql", () => toggleHotTestLogSql(odooStandardCodeLensProvider)],
        [
            "odooTest.startHotTest",
            debugCommandMutex.guard(() => startHotTest(odooStandardCodeLensProvider)),
        ],
        ["odooTest.rerun", rerun],
        ["odooTest.resetPaths", Configuration.autoSetPaths],
        [
            "odooTest.openSettings",
            () =>
                vscode.commands.executeCommand(
                    "workbench.action.openWorkspaceSettings",
                    "odooTest",
                ),
        ],
    ];
    for (const [name, func] of otherCommands) {
        context.subscriptions.push(vscode.commands.registerCommand(name, func));
    }
}

export function deactivate() {}
