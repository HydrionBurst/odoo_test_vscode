import * as vscode from "vscode";

import {
    checkDumpExists,
    createDatabase,
    dropDatabase,
    dumpDatabase,
    restoreDatabase,
} from "../utils/database";
import { installModule, isModuleInstalled, runStandardTest } from "../utils/odoo";

export async function runTest(module: string, className: string, methodName?: string) {
    const testTags = methodName
        ? `/${module}:${className}.${methodName}`
        : `/${module}:${className}`;
    const testName = methodName || className;
    if (await isModuleInstalled(module)) {
        vscode.window.showInformationMessage(`Test: ${testName}`);
        await runStandardTest(testTags);
    } else {
        vscode.window.showInformationMessage(`Install & Test: ${testName}`);
        await runStandardTest(testTags, { install: module });
    }
}

export async function runUpdateTest(module: string, className: string, methodName?: string) {
    const testTags = methodName
        ? `/${module}:${className}.${methodName}`
        : `/${module}:${className}`;
    const testName = methodName || className;
    const installed = await isModuleInstalled(module);
    if (installed) {
        vscode.window.showInformationMessage(`Upgrade & Test: ${testName}`);
        await runStandardTest(testTags, { update: module });
    } else {
        vscode.window.showInformationMessage(`Install & Test: ${testName}`);
        await runStandardTest(testTags, { install: module });
    }
}

export async function runDumpTest(moduleName: string, className: string, methodName?: string) {
    const dumpName = "standard.dump";

    if (!checkDumpExists(dumpName)) {
        const installed = await isModuleInstalled(moduleName);
        if (!installed) {
            vscode.window.showInformationMessage(`Install module: ${moduleName}`);
            await installModule(moduleName);
        }
        await dumpDatabase(dumpName);
    } else {
        await dropDatabase();
        await createDatabase();
        await restoreDatabase(dumpName);
    }

    await runTest(moduleName, className, methodName);
}
