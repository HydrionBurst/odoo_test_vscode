import * as path from "path";
import * as vscode from "vscode";

import { OdooStandardCodeLensProvider } from "../codelens/OdooStandardCodeLensProvider";
import { Configuration } from "../utils/configuration";
import { sendNotification } from "../utils/database";
import {
    forceRemoveHackModules,
    installModule,
    isModuleInstalled,
    startHotTestServer,
} from "../utils/odoo";
import { showInformationMessage } from "../utils/vscode";

/**
 * Start hot test mode
 */
export async function startHotTest(odooStandardCodeLensProvider: OdooStandardCodeLensProvider) {
    try {
        // Check if hot_test module is installed
        const isInstalled = await isModuleInstalled("hot_test");
        if (!isInstalled) {
            const extraAddonsPath = path.join(Configuration.extensionPath, "odoo_addons");
            await installModule("hot_test", [extraAddonsPath]);
        }

        // Set hot test mode to true
        odooStandardCodeLensProvider.setHotTestMode(true);
        showInformationMessage("test mode", "Hot test mode enabled");

        // Start hot test server with debug session monitoring
        await startHotTestServer();
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to start hot test: ${error.message}`);
        throw error;
    } finally {
        await forceRemoveHackModules(["hot_test"]);
        odooStandardCodeLensProvider.setHotTestMode(false);
    }
}

/**
 * Run hot test by sending notification to PostgreSQL
 */
export async function runHotTest(
    odooStandardCodeLensProvider: OdooStandardCodeLensProvider,
    moduleName: string,
    className: string,
    methodName?: string,
) {
    if (!odooStandardCodeLensProvider.isHotTestMode()) {
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

    try {
        await sendNotification("hot_test", payload);
        const testName = methodName || className;
        showInformationMessage("test", `Test: ${testName}`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to trigger hot test: ${error.message}`);
        throw error;
    }
}

/**
 * Toggle log SQL mode by sending notification to PostgreSQL
 * This function only works during hot test mode
 */
export async function toggleHotTestLogSql(
    odooStandardCodeLensProvider: OdooStandardCodeLensProvider,
) {
    try {
        // Toggle the state
        odooStandardCodeLensProvider.toggleHotTestLogSql();
        const isEnabled = odooStandardCodeLensProvider.getHotTestLogSqlEnabled();

        // Send notification to PostgreSQL
        const payload = JSON.stringify({
            jsonrpc: "2.0",
            method: "log_sql",
            params: {
                enabled: isEnabled,
            },
        });

        await sendNotification("hot_test", payload);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to toggle log SQL: ${error.message}`);
        throw error;
    }
}
