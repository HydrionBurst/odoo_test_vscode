import {
    checkDumpExists,
    createDatabase,
    dropDatabase,
    dumpDatabase,
    restoreDatabase,
} from "../utils/database";
import { installModule, isModuleInstalled, runStandardTest } from "../utils/odoo";
import { showInformationMessage } from "../utils/vscode";

export async function runTest(module: string, className: string, methodName?: string) {
    const testTags = methodName
        ? `/${module}:${className}.${methodName}`
        : `/${module}:${className}`;
    const testName = methodName || className;
    if (await isModuleInstalled(module)) {
        showInformationMessage("test", `Test: ${testName}`);
        await runStandardTest(testTags);
    } else {
        showInformationMessage("test", `Install & Test: ${testName}`);
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
        showInformationMessage("test", `Upgrade & Test: ${testName}`);
        await runStandardTest(testTags, { update: module });
    } else {
        showInformationMessage("test", `Install & Test: ${testName}`);
        await runStandardTest(testTags, { install: module });
    }
}

export async function runDumpTest(moduleName: string, className: string, methodName?: string) {
    const dumpName = "standard.dump";

    if (!checkDumpExists(dumpName)) {
        const installed = await isModuleInstalled(moduleName);
        if (!installed) {
            showInformationMessage("install", `Install module: ${moduleName}`);
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
