import * as vscode from "vscode";

import { deleteDump, dumpDatabase, isDatabaseExists } from "../utils/database";
import { Configuration } from "../utils/configuration";

export async function dumpTestDatabase(dumpName: string) {
    if (!(await isDatabaseExists())) {
        const databaseName = Configuration.get("databaseName") as string;
        vscode.window.showErrorMessage(`Database ${databaseName} does not exist`);
        return;
    }
    deleteDump(dumpName);
    await dumpDatabase(dumpName);
}
