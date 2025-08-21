import * as vscode from "vscode";

import { OdooStandardCodeLensProvider } from "../codelens/OdooStandardCodeLensProvider";
import { installModule, isModuleInstalled, startHotTestShell } from "../utils/odoo";
import { indentPython } from "../utils/tools";
import {
    getCurrentDebugTerminal,
    sendTextToCurrentDebugTerminal,
    showInformationMessage,
    stopCurrentDebugTerminal,
} from "../utils/vscode";

export async function startHotTest(odooStandardCodeLensProvider: OdooStandardCodeLensProvider) {
    try {
        // Set hot test mode to true
        if (!(await isModuleInstalled("base"))) {
            await installModule("base");
        }
        odooStandardCodeLensProvider.setHotTestMode(true);
        showInformationMessage("test mode", "Hot test mode enabled");

        // Start hot test server with debug session monitoring
        await startHotTestShell();
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to start hot test: ${error.message}`);
        throw error;
    } finally {
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
    if (!(await isModuleInstalled(moduleName))) {
        stopCurrentDebugTerminal();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await installModule(moduleName);
        vscode.commands.executeCommand("odooTest.startHotTest"); // start hot test with command lock
        await getCurrentDebugTerminal(10000);
    }

    // Send notification to PostgreSQL
    const testTags = methodName
        ? `/${moduleName}:${className}.${methodName}`
        : `/${moduleName}:${className}`;

    try {
        sendTextToCurrentDebugTerminal(
            indentPython(`
            from odoo.tests.shell import run_tests
            run_tests(env,["${moduleName}"], "${testTags}")
        `),
        );
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

        // Also send a sample command to Odoo shell terminal
        sendTextToCurrentDebugTerminal(
            indentPython(`
            import logging
            logging.getLogger("odoo.sql_db").setLevel(${isEnabled ? "logging.DEBUG" : "logging.INFO"})
        `),
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to toggle log SQL: ${error.message}`);
        throw error;
    }
}
