import * as vscode from "vscode";

import { Configuration } from "../utils/configuration";
import { deleteDump, dropDatabase } from "../utils/database";

export async function cleanupTest(testCategory: "standard" | "upgrade" | "standalone") {
    vscode.window.showInformationMessage(`Cleanup ${testCategory} tests`);

    let dumpNames: string[];
    if (testCategory === "upgrade") {
        const upgradeFrom = Configuration.get("upgradeFrom") as string;
        dumpNames = [`upgrade__${upgradeFrom}.dump`, `upgrade_prepare__${upgradeFrom}.dump`];
    } else {
        dumpNames = [`${testCategory}.dump`];
    }
    for (const dumpName of dumpNames) {
        deleteDump(dumpName);
    }
    await dropDatabase();
}
