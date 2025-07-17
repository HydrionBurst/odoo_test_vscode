import * as vscode from "vscode";

import {
    checkDumpExists,
    createDatabase,
    deleteDump,
    dropDatabase,
    dumpDatabase,
    restoreDatabase,
} from "../utils/database";
import {
    installModule,
    isModuleInstalled,
    runStandaloneTest as runStandaloneTestOdoo,
} from "../utils/odoo";

export async function runStandaloneTest(moduleName: string, tagName: string) {
    const dumpName = "standalone.dump";
    const dumpExists = checkDumpExists(dumpName);
    if (dumpExists) {
        await dropDatabase();
        await createDatabase();
        await restoreDatabase(dumpName);
    }
    if (!(await isModuleInstalled(moduleName))) {
        vscode.window.showInformationMessage(`Install module: ${moduleName}`);
        await installModule(moduleName);
        deleteDump(dumpName);
        await dumpDatabase(dumpName);
    } else if (!dumpExists) {
        await dumpDatabase(dumpName);
    }

    vscode.window.showInformationMessage(`Run standalone test: ${tagName}`);
    await runStandaloneTestOdoo(tagName);
}
