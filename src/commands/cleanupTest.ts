import { Configuration } from "../utils/configuration";
import { deleteDump, dropDatabase } from "../utils/database";
import { showInformationMessage } from "../utils/vscode";

export async function cleanupTest(testCategory: "standard" | "upgrade" | "standalone") {
    showInformationMessage("cleanup", `Cleanup ${testCategory} tests`);

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
