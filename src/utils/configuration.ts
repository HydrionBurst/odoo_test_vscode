import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { OdooVersion } from "./odoo";

export class Configuration {
    static extensionPath: string;

    static get(key: string): any {
        const config = vscode.workspace.getConfiguration("odooTest");
        if (!config.has(key)) {
            throw new Error(`Key ${key} not found in odooTest configuration`);
        }
        return config.get(key);
    }

    static async autoSetPaths() {
        // looking for odoo-bin
        let odooBinPath = undefined;
        for (const folder of vscode.workspace.workspaceFolders || []) {
            // check workspace has odoo-bin
            odooBinPath = path.join(folder.uri.fsPath, "odoo-bin");
            if (await Configuration.checkIsFile(odooBinPath)) {
                break;
            }
            odooBinPath = path.join(folder.uri.fsPath, "odoo", "odoo-bin");
            if (await Configuration.checkIsFile(odooBinPath)) {
                break;
            }
            odooBinPath = undefined;
        }

        if (!odooBinPath) {
            return;
        }

        const addonsPath = [];
        addonsPath.push(path.join(path.dirname(odooBinPath), "odoo", "addons"));
        addonsPath.push(path.join(path.dirname(odooBinPath), "addons"));
        for (const folder of vscode.workspace.workspaceFolders || []) {
            if (await Configuration.isAddonsPath(folder.uri.fsPath)) {
                if (!addonsPath.includes(folder.uri.fsPath)) {
                    addonsPath.push(folder.uri.fsPath);
                }
            } else {
                const items = await fs.promises.readdir(folder.uri.fsPath);
                for (const item of items) {
                    if (item.includes(".")) {
                        continue;
                    }
                    const p = path.join(folder.uri.fsPath, item);
                    if (await Configuration.isAddonsPath(p)) {
                        if (!addonsPath.includes(p)) {
                            addonsPath.push(p);
                        }
                    }
                }
            }
        }

        const upgradePath = [];
        // add upgrade-util
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const p = path.join(folder.uri.fsPath, "src", "util", "modules.py");
            if (await Configuration.checkIsFile(p)) {
                upgradePath.push(path.join(folder.uri.fsPath, "src"));
            } else {
                const p = path.join(folder.uri.fsPath, "upgrade-util", "src", "util", "modules.py");
                if (await Configuration.checkIsFile(p)) {
                    upgradePath.push(path.join(folder.uri.fsPath, "upgrade-util", "src"));
                }
            }
        }
        // add module upgrade
        for (const folder of vscode.workspace.workspaceFolders || []) {
            if (await Configuration.isModuleUpgradePath(folder.uri.fsPath)) {
                upgradePath.push(folder.uri.fsPath);
                continue;
            }
            const p = path.join(folder.uri.fsPath, "migrations");
            if (await Configuration.isModuleUpgradePath(p)) {
                upgradePath.push(p);
                continue;
            }
            for (const item of await fs.promises.readdir(folder.uri.fsPath)) {
                if (item.includes(".")) {
                    continue;
                }
                if (!(await Configuration.checkIsDirectory(path.join(folder.uri.fsPath, item)))) {
                    continue;
                }
                let p = path.join(folder.uri.fsPath, item);
                if (await Configuration.isModuleUpgradePath(p)) {
                    upgradePath.push(p);
                    continue;
                }
                p = path.join(p, "migrations");
                if (await Configuration.isModuleUpgradePath(p)) {
                    upgradePath.push(p);
                    continue;
                }
            }
        }

        let configPath: string | undefined = undefined;
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const p = path.join(folder.uri.fsPath, "odoo.conf");
            if (await Configuration.checkIsFile(p)) {
                configPath = p;
                break;
            }
        }

        let dumpPath: string | undefined = undefined;
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const p = path.join(folder.uri.fsPath, ".dumps");
            if (await Configuration.checkIsDirectory(p)) {
                dumpPath = p;
                break;
            }
        }
        if (!dumpPath) {
            dumpPath = path.join(
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
                ".dumps",
            );
        }

        const config = vscode.workspace.getConfiguration("odooTest");
        config.update("odooBinPath", odooBinPath, vscode.ConfigurationTarget.Workspace);
        config.update("addonsPath", addonsPath, vscode.ConfigurationTarget.Workspace);
        config.update("upgradePath", upgradePath, vscode.ConfigurationTarget.Workspace);
        if (configPath) {
            config.update("configPath", configPath, vscode.ConfigurationTarget.Workspace);
        }
        if (dumpPath) {
            config.update("dumpPath", dumpPath, vscode.ConfigurationTarget.Workspace);
        }
        vscode.commands.executeCommand("workbench.action.openWorkspaceSettings", "odooTest");
    }

    static async check(): Promise<void> {
        const config = vscode.workspace.getConfiguration("odooTest");
        let hasErrors = false;

        // Database name
        const dbName = config.get<string>("databaseName");
        if (!dbName) {
            vscode.window.showErrorMessage("Database name cannot be empty");
            hasErrors = true;
        } else if (!/^[\w-]+$/.test(dbName)) {
            vscode.window.showErrorMessage(
                "Database name can only contain letters, numbers, hyphens and underscores",
            );
            hasErrors = true;
        }

        // Upgrade from version
        const upgradeFrom = config.get<string>("upgradeFrom");
        if (upgradeFrom && upgradeFrom !== "current") {
            const version = OdooVersion.parse(upgradeFrom);
            if (!version || upgradeFrom.includes("~")) {
                vscode.window.showErrorMessage(
                    "Upgrade from version is not a valid Odoo branch name",
                );
                hasErrors = true;
            }
        }

        // odoo-bin path
        const odooBinPath = config.get<string>("odooBinPath");
        if (!odooBinPath || odooBinPath.trim() === "") {
            vscode.window.showErrorMessage("Odoo binary path cannot be empty");
            hasErrors = true;
        } else {
            const binPathExists = await Configuration.checkPathExists(odooBinPath);
            if (!binPathExists) {
                vscode.window.showErrorMessage(`Odoo binary path does not exist: ${odooBinPath}`);
                hasErrors = true;
            } else {
                const fileName = path.basename(odooBinPath);
                if (fileName !== "odoo-bin") {
                    vscode.window.showErrorMessage(
                        `File name should be 'odoo-bin', found: ${fileName}`,
                    );
                    hasErrors = true;
                }
            }
        }

        // Addons path
        const addonsPath = config.get<string[]>("addonsPath") || [];
        if (addonsPath.length === 0) {
            vscode.window.showErrorMessage("At least one valid addons path is required");
            hasErrors = true;
        } else {
            for (const addonPath of addonsPath) {
                const pathExists = await Configuration.checkPathExists(addonPath);
                if (!pathExists) {
                    vscode.window.showErrorMessage(`Addons path does not exist: ${addonPath}`);
                    hasErrors = true;
                } else {
                    const isDirectory = await Configuration.checkIsDirectory(addonPath);
                    if (!isDirectory) {
                        vscode.window.showErrorMessage(
                            `Addons path is not a directory: ${addonPath}`,
                        );
                        hasErrors = true;
                    }
                }
            }
        }

        // odoo config path (optional)
        const configPath = config.get<string>("configPath");
        if (configPath) {
            if (!(await Configuration.checkIsFile(configPath))) {
                vscode.window.showErrorMessage(`Odoo config file does not exist: ${configPath}`);
                hasErrors = true;
            }
        }

        // Upgrade path
        const upgradePath = config.get<string[]>("upgradePath") || [];
        if (upgradePath.length > 0) {
            for (const upgPath of upgradePath) {
                const pathExists = await Configuration.checkPathExists(upgPath);
                if (!pathExists) {
                    vscode.window.showErrorMessage(`Upgrade path does not exist: ${upgPath}`);
                    hasErrors = true;
                } else {
                    const isDirectory = await Configuration.checkIsDirectory(upgPath);
                    if (!isDirectory) {
                        vscode.window.showErrorMessage(
                            `Upgrade path is not a directory: ${upgPath}`,
                        );
                        hasErrors = true;
                    }
                }
            }
        }

        // Show success message if no errors
        if (!hasErrors) {
            vscode.window.showInformationMessage("Configuration validation passed successfully!");
        }
    }

    private static async checkPathExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private static async checkIsDirectory(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    private static async checkIsFile(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.isFile();
        } catch {
            return false;
        }
    }

    private static async isAddonsPath(dirPath: string): Promise<boolean> {
        // check if have dirPath/addonsName/__manifest__.py
        if (!(await Configuration.checkIsDirectory(dirPath))) {
            return false;
        }
        const items = await fs.promises.readdir(dirPath);
        let checkedSubDirNo = 0;
        for (const item of items) {
            if (item.includes(".")) {
                continue;
            }
            if (!(await Configuration.checkIsDirectory(path.join(dirPath, item)))) {
                continue;
            }
            const manifestPath = path.join(dirPath, item, "__manifest__.py");
            if (await Configuration.checkIsFile(manifestPath)) {
                return true;
            }
            checkedSubDirNo++;
            if (checkedSubDirNo > 3) {
                break;
            }
        }
        return false;
    }

    private static async isModuleUpgradePath(dirPath: string): Promise<boolean> {
        // check if have dirPath/addonsName/__manifest__.py
        if (!(await Configuration.checkIsDirectory(dirPath))) {
            return false;
        }
        const items = await fs.promises.readdir(dirPath);
        let checkedSubDirNo = 0;
        for (const item of items) {
            if (item.includes(".")) {
                continue;
            }
            if (!(await Configuration.checkIsDirectory(path.join(dirPath, item)))) {
                continue;
            }
            for (const subItem of await fs.promises.readdir(path.join(dirPath, item))) {
                if (subItem.startsWith(".")) {
                    continue;
                }
                if (!(await Configuration.checkIsDirectory(path.join(dirPath, item, subItem)))) {
                    continue;
                }
                // check if have file name strats with "pre-" or "post-" or "end-"
                const subItemPath = path.join(dirPath, item, subItem);
                for (const file of await fs.promises.readdir(subItemPath)) {
                    if (
                        file.startsWith("pre-") ||
                        file.startsWith("post-") ||
                        file.startsWith("end-")
                    ) {
                        return true;
                    }
                }
            }
            checkedSubDirNo++;
            if (checkedSubDirNo > 3) {
                break;
            }
        }
        return false;
    }
}
