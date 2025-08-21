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
import { showInformationMessage } from "../utils/vscode";

export async function runStandaloneTest(moduleName: string, tagName: string) {
    const dumpName = "standalone.dump";
    const dumpExists = checkDumpExists(dumpName);
    if (dumpExists) {
        await dropDatabase();
        await createDatabase();
        await restoreDatabase(dumpName);
    }
    if (!(await isModuleInstalled(moduleName))) {
        showInformationMessage("install", `Install module: ${moduleName}`);
        await installModule(moduleName);
        deleteDump(dumpName);
        await dumpDatabase(dumpName);
    } else if (!dumpExists) {
        await dumpDatabase(dumpName);
    }

    showInformationMessage("test", `Run standalone test: ${tagName}`);
    await runStandaloneTestOdoo(tagName);
}
