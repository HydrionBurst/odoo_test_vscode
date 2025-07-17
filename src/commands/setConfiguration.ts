import * as vscode from "vscode";

async function setConfig(configName: string, required: boolean = false) {
    const config = vscode.workspace.getConfiguration("odooTest");
    const currentValue = config.get<string>(configName) || "";
    const newValue =
        (await vscode.window.showInputBox({
            prompt: `Enter new ${configName}`,
            value: currentValue,
            placeHolder: configName,
        })) || undefined;
    if ((!required || newValue) && newValue !== currentValue) {
        await config.update(configName, newValue, vscode.ConfigurationTarget.Workspace);
        const newConfig = vscode.workspace.getConfiguration("odooTest");
        vscode.window.showInformationMessage(
            `odooTest.${configName} changed to: ${newConfig.get<string>(configName) || ""}`,
        );
    }
}

export async function setDatabaseName() {
    await setConfig("databaseName", true);
}

export async function setUpgradeFrom() {
    await setConfig("upgradeFrom", false);
}
