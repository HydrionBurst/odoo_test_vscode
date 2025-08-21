import * as path from "path";
import * as vscode from "vscode";

import { Configuration } from "../utils/configuration";
import { OdooVersion, parseFilePathInfo } from "../utils/odoo";

export class OdooUpgradeCodeLensProvider implements vscode.CodeLensProvider {
    async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken) {
        if (!Configuration.get("odooBinPath") || !Configuration.get("upgradePath")) {
            return [];
        }

        const fileName = document.fileName;
        const [fileCategory, moduleName] = parseFilePathInfo(fileName);
        if (fileCategory !== "upgrade_script" && fileCategory !== "upgrade_test") {
            return [];
        }

        if (token.isCancellationRequested) {
            return [];
        }

        const databaseName = Configuration.get("databaseName") as string;
        const lenses: vscode.CodeLens[] = [];

        // use Pylance/LSP to get document structure
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            "vscode.executeDocumentSymbolProvider",
            document.uri,
        );
        if (!symbols) {
            return [];
        }

        if (token.isCancellationRequested) {
            return [];
        }

        const upgradeFrom = Configuration.get("upgradeFrom") || "current";
        if (fileCategory === "upgrade_test") {
            this.addLensForUpgradeTests(
                lenses,
                symbols,
                fileName,
                moduleName,
                databaseName,
                upgradeFrom,
            );
        } else if (fileCategory === "upgrade_script") {
            const parentDir = path.dirname(fileName);
            const parentName = path.basename(parentDir);
            const version = OdooVersion.parse(parentName);
            if (!version || version.isMaster) {
                return [];
            }
            const previousVersion = version.getPrevious() as OdooVersion;
            const upgradeFromVersion = OdooVersion.parse(upgradeFrom);
            const branchNames: string[] = [];
            if (!upgradeFromVersion) {
                branchNames.push("current");
            } else if (previousVersion.compare(upgradeFromVersion) > 0) {
                branchNames.push(previousVersion.toBranchName());
                branchNames.push(upgradeFrom);
            } else {
                branchNames.push(previousVersion.toBranchName());
            }
            this.addLensForUpgradeScripts(lenses, symbols, moduleName, databaseName, branchNames);
        }

        return lenses;
    }

    private addLensForUpgradeScripts(
        lenses: vscode.CodeLens[],
        symbols: vscode.DocumentSymbol[],
        moduleName: string,
        databaseName: string,
        branchNames: string[],
    ) {
        for (const symbol of symbols) {
            if (symbol.kind === vscode.SymbolKind.Function && symbol.name === "migrate") {
                for (const branchName of branchNames) {
                    lenses.push(
                        new vscode.CodeLens(symbol.range, {
                            title: `$(debug-rerun) Prepare ${branchName}`,
                            command: "odooTest.prepareUpgrade",
                            arguments: [moduleName, branchName, false],
                        }),
                    );
                    lenses.push(
                        new vscode.CodeLens(symbol.range, {
                            title: `$(fold-up) Upgrade`,
                            command: "odooTest.upgradeDatabase",
                            arguments: [moduleName, branchName, false],
                        }),
                    );
                }
                lenses.push(
                    new vscode.CodeLens(symbol.range, {
                        title: `$(trash) ${databaseName}`,
                        command: "odooTest.cleanupTest",
                        arguments: ["upgrade"],
                        tooltip: `Cleanup ${databaseName}`,
                    }),
                );
            }
        }
    }

    private addLensForUpgradeTests(
        lenses: vscode.CodeLens[],
        symbols: vscode.DocumentSymbol[],
        fileName: string,
        moduleName: string,
        databaseName: string,
        upgradeFrom: string,
    ) {
        for (const symbol of symbols) {
            if (symbol.kind === vscode.SymbolKind.Class) {
                let prepareMethod: vscode.DocumentSymbol | undefined = undefined;
                let checkMethod: vscode.DocumentSymbol | undefined = undefined;
                for (const child of symbol.children) {
                    if (child.kind === vscode.SymbolKind.Method && child.name === "prepare") {
                        prepareMethod = child;
                    } else if (child.kind === vscode.SymbolKind.Method && child.name === "check") {
                        checkMethod = child;
                    }
                }

                if (prepareMethod) {
                    lenses.push(
                        new vscode.CodeLens(prepareMethod.range, {
                            title: `$(debug-rerun) Prepare ${upgradeFrom}`,
                            command: "odooTest.prepareUpgrade",
                            arguments: [moduleName, upgradeFrom],
                        }),
                    );
                    lenses.push(
                        new vscode.CodeLens(prepareMethod.range, {
                            title: `$(trash) ${databaseName}`,
                            command: "odooTest.cleanupTest",
                            arguments: ["upgrade"],
                            tooltip: `Cleanup ${databaseName}`,
                        }),
                    );
                }

                if (checkMethod) {
                    if (!prepareMethod) {
                        lenses.push(
                            new vscode.CodeLens(checkMethod.range, {
                                title: `$(debug-rerun) Prepare ${upgradeFrom}`,
                                command: "odooTest.prepareUpgrade",
                                arguments: [moduleName, upgradeFrom],
                            }),
                        );
                    }

                    lenses.push(
                        new vscode.CodeLens(checkMethod.range, {
                            title: `$(fold-up) Upgrade`,
                            command: "odooTest.upgradeDatabase",
                            arguments: [moduleName, upgradeFrom],
                        }),
                    );
                    lenses.push(
                        new vscode.CodeLens(checkMethod.range, {
                            title: `$(play) Check`,
                            command: "odooTest.checkUpgradeTest",
                            arguments: [moduleName, symbol.name, fileName],
                        }),
                    );

                    if (!prepareMethod) {
                        lenses.push(
                            new vscode.CodeLens(checkMethod.range, {
                                title: `$(trash) ${databaseName}`,
                                command: "odooTest.cleanupTest",
                                arguments: ["upgrade"],
                                tooltip: `Cleanup ${databaseName}`,
                            }),
                        );
                    }
                }
            }
        }
    }
}
