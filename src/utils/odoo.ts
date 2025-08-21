import * as path from "path";
import * as vscode from "vscode";

import { Configuration } from "./configuration";
import { getDebugConfiguration, startDebuggingAndWait } from "./vscode";
import { execAsync } from "./tools";

export class OdooVersion {
    major: number;
    minor: number;
    isMaster: boolean;

    constructor(major: number = 0, minor: number = 0, isMaster: boolean = false) {
        this.major = major;
        this.minor = minor;
        this.isMaster = isMaster;
    }

    /**
     * Parse Odoo version from Odoo version string or branch name string.
     * Supported formats: "16.0", "saas~16.1", "saas-16.1", "saas-16.1-xxx", "master", "master-xxx"
     */
    static parse(text: string): OdooVersion | null {
        const str = text.trim();
        if (str === "master" || str.startsWith("master-")) {
            return new OdooVersion(0, 0, true);
        }
        const match = str.match(/^(saas~|saas-)?(\d+)\.(\d+)/);
        if (!match) {
            return null;
        }
        const major = parseInt(match[2], 10);
        const minor = parseInt(match[3], 10);
        return new OdooVersion(major, minor);
    }

    /**
     * Compare with another OdooVersion.
     * Returns: -1 if this < other, 0 if equal, 1 if this > other
     */
    compare(other: OdooVersion): number {
        // Handle master branch comparisons
        if (this.isMaster !== other.isMaster) {
            return this.isMaster ? 1 : -1;
        }
        if (this.isMaster && other.isMaster) {
            return 0;
        }

        // Compare version numbers
        if (this.major !== other.major) {
            return this.major < other.major ? -1 : 1;
        }
        if (this.minor !== other.minor) {
            return this.minor < other.minor ? -1 : 1;
        }
        return 0;
    }

    /**
     * Return a new OdooVersion representing the previous version
     * For example: 16.1 - 1 = 16.0, 16.0 - 1 = 15.5,
     */
    getPrevious(): OdooVersion | null {
        if (this.isMaster) {
            return null;
        }
        if (this.minor > 0) {
            return new OdooVersion(this.major, this.minor - 1);
        } else {
            return new OdooVersion(this.major - 1, 5);
        }
    }

    /**
     * Convert to odoo branch name, e.g. "16.0" or "saas-16.1"
     */
    toBranchName(): string {
        if (this.isMaster) {
            return "master";
        }
        return (this.minor === 0 ? "" : "saas-") + `${this.major}.${this.minor}`;
    }
}

/**
 * Parse Odoo test file path to get module name and test category.
 * @param filePath Absolute path of the test file
 * @returns [fileCategory, moduleName] or [undefined, undefined]
 */
export function parseFilePathInfo(
    filePath: string,
): ["addons_test" | "upgrade_test" | "upgrade_script", string] | [undefined, undefined] {
    const baseName = path.basename(filePath);

    const upgradePath = Configuration.get("upgradePath") as string[];
    if (
        baseName.startsWith("pre-") ||
        baseName.startsWith("post-") ||
        baseName.startsWith("end-")
    ) {
        if (upgradePath.some((p) => filePath.startsWith(p))) {
            const parentDir = path.dirname(filePath);
            const parentName = path.basename(parentDir);
            const version = OdooVersion.parse(parentName);
            if (version) {
                return ["upgrade_script", path.basename(path.dirname(parentDir))];
            }
        }
        return [undefined, undefined];
    }

    if (!baseName.startsWith("test_")) {
        return [undefined, undefined];
    }

    const baseAddonsPath = path.join(
        path.dirname(Configuration.get("odooBinPath") as string),
        "odoo",
        "addons",
    );
    const addonsPath = [baseAddonsPath, ...(Configuration.get("addonsPath") as string[])];

    let dir = path.dirname(filePath);
    for (const addonsDir of addonsPath) {
        if (dir.startsWith(addonsDir)) {
            while (true) {
                if (path.basename(dir) === "tests") {
                    return ["addons_test", path.basename(path.dirname(dir))];
                }
                const parentDir = path.dirname(dir);
                if (dir === parentDir) {
                    break;
                }
                dir = parentDir;
            }
            return [undefined, undefined];
        }
    }
    for (const upgradeDir of upgradePath) {
        if (dir.startsWith(upgradeDir)) {
            while (true) {
                if (path.basename(dir) === "tests") {
                    return ["upgrade_test", path.basename(path.dirname(dir))];
                }
                const parentDir = path.dirname(dir);
                if (dir === parentDir) {
                    break;
                }
                dir = parentDir;
            }
            return [undefined, undefined];
        }
    }
    return [undefined, undefined];
}

export async function isUpgradeTestPrepared(module: string, className: string) {
    const databaseName = Configuration.get("databaseName") as string;
    try {
        const { stdout } = await execAsync(
            `psql -d ${databaseName} -t -c "SELECT 'Data Prepared' FROM upgrade_test_data WHERE key like '${module}.tests.%.${className}'"`,
        );
        const result = stdout.toString().trim();
        return result === "Data Prepared";
    } catch {
        return false;
    }
}

/**
 * check if module is installed in database
 */
export async function isModuleInstalled(module: string): Promise<boolean> {
    const databaseName = Configuration.get("databaseName") as string;
    try {
        const { stdout } = await execAsync(
            `psql -d ${databaseName} -t -c "SELECT 'Module Installed' FROM ir_module_module WHERE name = '${module}' AND state = 'installed'"`,
        );
        const result = stdout.toString().trim();
        return result === "Module Installed";
    } catch {
        return false;
    }
}

/**
 * Install an Odoo module by running Odoo with the given launch configuration.
 * This will use VSCode's debug API to start Odoo with -i <module> -d <database> --stop-after-init.
 * Returns true if installation succeeded, false otherwise.
 */
export async function installModule(moduleName: string): Promise<boolean> {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (!wsFolder) {
        vscode.window.showErrorMessage("Cannot find the workspace");
        return false;
    }
    const { workspaceFolder, configuration: debugConfig } = getDebugConfiguration("standard");
    if (!workspaceFolder || !debugConfig) {
        return false;
    }
    const installConfig = {
        ...debugConfig,
        args: [...debugConfig.args, "-i", moduleName, "--stop-after-init"],
        name: `${debugConfig?.name}(Install:${moduleName})`,
    };

    const success = await startDebuggingAndWait(workspaceFolder, installConfig, { noDebug: true });
    if (!success) {
        const databaseName = Configuration.get("databaseName") as string;
        vscode.window.showErrorMessage(
            `Failed to install module ${moduleName} for database(${databaseName}).`,
        );
    }
    return success;
}

export async function startHotTestShell() {
    const { workspaceFolder, configuration: odooTestConfig } = getDebugConfiguration("shell");
    if (!workspaceFolder || !odooTestConfig) {
        return;
    }
    const success = await startDebuggingAndWait(workspaceFolder, odooTestConfig);
    if (!success) {
        vscode.window.showErrorMessage(
            "Failed to start Odoo shell. Please check the configuration in .vscode/launch.json under your Odoo project directory.",
        );
    }
}

export async function runStandardTest(
    testTags: string,
    options?: { install?: string; update?: string },
) {
    const { install, update } = options ?? {};

    const { workspaceFolder, configuration: odooTestConfig } = getDebugConfiguration();
    if (!workspaceFolder || !odooTestConfig) {
        return;
    }

    const database = Configuration.get("databaseName") as string;
    const args = ["--test-tags", testTags, "-d", database, "--stop-after-init"];
    if (install) {
        args.push("-i", install);
    }
    if (update) {
        args.push("-u", update);
    }

    // debugConfig based on odoo_test
    const debugConfig: vscode.DebugConfiguration = {
        ...odooTestConfig,
        args: Array.isArray(odooTestConfig.args) ? [...odooTestConfig.args, ...args] : args,
    };
    const success = await startDebuggingAndWait(workspaceFolder, debugConfig);
    if (!success) {
        vscode.window.showErrorMessage(
            "Failed to start Odoo tests. Please check the configuration in .vscode/launch.json under your Odoo project directory.",
        );
    }
}

export async function runStandaloneTest(standalone: string) {
    const { workspaceFolder, configuration: standaloneConfig } =
        getDebugConfiguration("standalone");
    if (!workspaceFolder || !standaloneConfig) {
        return;
    }
    const args = ["--standalone", standalone];
    const debugConfig: vscode.DebugConfiguration = {
        ...standaloneConfig,
        args: [...standaloneConfig.args, ...args],
    };
    const success = await startDebuggingAndWait(workspaceFolder, debugConfig);
    if (!success) {
        vscode.window.showErrorMessage(
            "Failed to start Odoo standalone test. Please check the configuration in .vscode/launch.json under your Odoo project directory.",
        );
    }
}

export async function runUpgrade() {
    const { workspaceFolder, configuration: upgradeConfig } = getDebugConfiguration("upgrade");
    if (!workspaceFolder || !upgradeConfig) {
        return;
    }

    const args = ["-u", "all", "--stop-after-init"];

    const debugConfig: vscode.DebugConfiguration = {
        ...upgradeConfig,
        args: [...upgradeConfig.args, ...args],
    };

    const success = await startDebuggingAndWait(workspaceFolder, debugConfig);
    if (!success) {
        vscode.window.showErrorMessage(
            "Failed to start Odoo upgrade. Please check the configuration in .vscode/launch.json.",
        );
    }
}

export async function runUpgradeTest(testTags: string) {
    const { workspaceFolder, configuration: upgradeConfig } = getDebugConfiguration("upgrade");
    if (!workspaceFolder || !upgradeConfig) {
        return;
    }

    const args = ["--test-tags", testTags];

    const debugConfig: vscode.DebugConfiguration = {
        ...upgradeConfig,
        args: [...upgradeConfig.args, ...args],
    };

    const success = await startDebuggingAndWait(workspaceFolder, debugConfig);
    if (!success) {
        vscode.window.showErrorMessage(
            "Failed to start Odoo upgrade check. Please check the configuration in .vscode/launch.json.",
        );
    }
}
