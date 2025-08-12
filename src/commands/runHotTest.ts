import * as path from "path";
import * as vscode from "vscode";

import { OdooAddonsCodeLensProvider } from "../codelens/OdooAddonsCodeLensProvider";
import { Configuration } from "../utils/configuration";
import { sendNotification } from "../utils/database";
import {
    forceRemoveHackModules,
    installModule,
    isModuleInstalled,
    startHotTestServer,
} from "../utils/odoo";

/**
 * Start hot test mode
 */
export async function startHotTest(odooAddonsCodeLensProvider: OdooAddonsCodeLensProvider) {
    try {
        // Check if hot_test module is installed
        const isInstalled = await isModuleInstalled("hot_test");
        if (!isInstalled) {
            vscode.window.showInformationMessage("Installing hot_test module...");
            const extraAddonsPath = path.join(Configuration.extensionPath, "odoo_addons");
            await installModule("hot_test", [extraAddonsPath]);
        }

        // Set hot test mode to true
        odooAddonsCodeLensProvider.setHotTestMode(true);
        vscode.window.showInformationMessage("Hot test mode enabled");

        // Start hot test server with debug session monitoring
        await startHotTestServer();
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to start hot test: ${error.message}`);
        throw error;
    } finally {
        await forceRemoveHackModules(["hot_test"]);
        odooAddonsCodeLensProvider.setHotTestMode(false);
    }
}

/**
 * Run hot test by sending notification to PostgreSQL
 */
export async function runHotTest(
    odooAddonsCodeLensProvider: OdooAddonsCodeLensProvider,
    moduleName: string,
    className: string,
    methodName?: string,
) {
    if (!odooAddonsCodeLensProvider.isHotTestMode()) {
        vscode.window.showErrorMessage("Hot test mode is not enabled");
        return;
    }

    // Send notification to PostgreSQL
    const testTags = methodName
        ? `/${moduleName}:${className}.${methodName}`
        : `/${moduleName}:${className}`;

    const payload = JSON.stringify({
        jsonrpc: "2.0",
        method: "run_test",
        params: {
            module: moduleName,
            test_tags: testTags,
        },
    });

    if (!isModuleInstalled(moduleName)) {
        vscode.window.showErrorMessage(`Module ${moduleName} is not installed`);
        return;
    }

    try {
        await sendNotification("hot_test", payload);
        const testName = methodName || className;
        vscode.window.showInformationMessage(`Hot test triggered: ${testName}`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to trigger hot test: ${error.message}`);
        throw error;
    }
}

/**
 * Toggle log SQL mode by sending notification to PostgreSQL
 * This function only works during hot test mode
 */
export async function toggleHotTestLogSql(odooAddonsCodeLensProvider: any) {
    try {
        // Toggle the state
        odooAddonsCodeLensProvider.toggleHotTestLogSql();
        const isEnabled = odooAddonsCodeLensProvider.getHotTestLogSqlEnabled();

        // Send notification to PostgreSQL
        const payload = JSON.stringify({
            jsonrpc: "2.0",
            method: "log_sql",
            params: {
                enabled: isEnabled,
            },
        });

        await sendNotification("hot_test", payload);

        const status = isEnabled ? "ON" : "OFF";
        vscode.window.showInformationMessage(`Log SQL mode: ${status}`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to toggle log SQL: ${error.message}`);
        throw error;
    }
}
