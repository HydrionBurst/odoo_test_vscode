import * as path from "path";
import * as vscode from "vscode";

import { Configuration } from "../utils/configuration";
import {
    checkDumpExists,
    createDatabase,
    deleteDump,
    dropDatabase,
    dumpDatabase,
    restoreDatabase,
} from "../utils/database";
import {
    checkoutGit,
    getGitBranch,
    getGitCommit,
    getGitRepoPaths,
    isGitRepoCommitted,
    isLocalGitBranch,
} from "../utils/git";
import {
    OdooVersion,
    installModule,
    isModuleInstalled,
    isUpgradeTestPrepared,
    runUpgrade,
    runUpgradeTest,
} from "../utils/odoo";
import { showInformationMessage } from "../utils/vscode";

// Run the prepare method of an upgrade test class
export async function prepareUpgrade(
    module: string,
    upgradeFrom: string,
    withPrepare: boolean = true,
) {
    const addonsPaths = Configuration.get("addonsPath");
    const gitCurrents: { [repoPath: string]: string } = {}; // current branch name or commit hash
    if (upgradeFrom !== "current") {
        for (const repoPath of await getGitRepoPaths(addonsPaths)) {
            if (!(await isLocalGitBranch(repoPath, upgradeFrom))) {
                const checkoutBranchName =
                    OdooVersion.parse(repoPath)?.toBranchName() || upgradeFrom;
                if (
                    checkoutBranchName === upgradeFrom ||
                    !(await isLocalGitBranch(repoPath, checkoutBranchName))
                ) {
                    const repoName = path.basename(repoPath);
                    vscode.window.showWarningMessage(
                        `Ignore invalid git local branch: ${checkoutBranchName} for ${repoName}`,
                    );
                    continue;
                }
            }
            let current = await getGitBranch(repoPath);
            if (!current) {
                current = await getGitCommit(repoPath);
            }
            if (current) {
                if (!(await isGitRepoCommitted(repoPath))) {
                    const repoName = path.basename(repoPath);
                    vscode.window.showErrorMessage(`Git repo ${repoName} has uncommitted changes`);
                    return;
                }
                gitCurrents[repoPath] = current;
            }
        }
        if (Object.keys(gitCurrents).length === 0) {
            vscode.window.showErrorMessage(
                `No git valid localbranches repo found in ${addonsPaths.join(", ")}`,
            );
            return;
        }
    }

    try {
        // git checkout to upgradeFrom for each branch
        const checkoutResults = await Promise.all(
            Object.keys(gitCurrents).map((repoPath) => checkoutGit(repoPath, upgradeFrom)),
        );
        if (checkoutResults.some((result) => !result)) {
            return;
        }

        // check if the dump file exists
        const dumpName = `upgrade__${upgradeFrom}.dump`;
        const dumpExists = checkDumpExists(dumpName);
        await dropDatabase();
        if (dumpExists) {
            await createDatabase();
            await restoreDatabase(dumpName);
        }
        // check if the module has been installed
        if (!(await isModuleInstalled(module))) {
            showInformationMessage("install", `Install module: ${module}`);
            const success = await installModule(module);
            if (!success) {
                return;
            }
            if (dumpExists) {
                deleteDump(dumpName);
            }
            await dumpDatabase(dumpName);
        }

        if (!withPrepare) {
            return;
        }

        showInformationMessage("test", `Prepare upgrade test data`);
        await runUpgradeTest("upgrade.test_prepare");
        const dumpPrepareName = `upgrade_prepare__${upgradeFrom}.dump`;
        deleteDump(dumpPrepareName);
        await dumpDatabase(dumpPrepareName);
    } finally {
        // checkout to the original branch for each repo
        await Promise.all(
            Object.entries(gitCurrents).map(([repoPath, branchName]) =>
                checkoutGit(repoPath, branchName),
            ),
        );
    }
}

export async function upgradeDatabase(
    module: string,
    branchName: string,
    withPrepare: boolean = true,
) {
    if (!(await isModuleInstalled(module))) {
        vscode.window.showWarningMessage(`Module ${module} is not installed`);
        return;
    }
    const dumpName = `upgrade${withPrepare ? "_prepare" : ""}__${branchName}.dump`;
    if (!checkDumpExists(dumpName)) {
        vscode.window.showErrorMessage(`Upgrade dump file not found: ${dumpName}`);
        return;
    }
    await dropDatabase();
    await createDatabase();
    await restoreDatabase(dumpName);

    showInformationMessage("test", `Upgrade all modules`);
    await runUpgrade();
}

// Run the check method of an upgrade test class
export async function checkUpgradeTest(module: string, className: string, filePath: string) {
    if (!(await isModuleInstalled(module))) {
        vscode.window.showErrorMessage(`Module ${module} is not installed`);
        return;
    }
    if (!(await isUpgradeTestPrepared(module, className))) {
        vscode.window.showWarningMessage(
            `Upgrade test data for ${className} is not prepared in the database`,
        );
        return;
    }
    // all test_check belongs to the module "testing"
    // test_module_path only support linux path
    const linuxPath = filePath.split(path.sep).join("/");
    // extract /module_name/tests/xxx.py from xxx/xxx/module_name/tests/xxx.py
    const moduleTestPathMatch = linuxPath.match(/(\/[^/]+\/tests\/.*\.py)/);
    const testModulePath = moduleTestPathMatch ? moduleTestPathMatch[1] : "";
    showInformationMessage("test", `Run upgrade check: ${className}`);
    await runUpgradeTest(`upgrade${testModulePath}:${className}.test_check`);
}
