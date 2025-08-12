import * as vscode from "vscode";

import { Configuration } from "../utils/configuration";
import { parseFilePathInfo } from "../utils/odoo";

export class OdooAddonsCodeLensProvider implements vscode.CodeLensProvider {
    private _runMode: "standard" | "update" | "dump" = "standard";
    private _hotTestMode: boolean = false;
    private _hotTestlogSqlEnabled: boolean = false;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    public switchRunMode(): void {
        switch (this._runMode) {
            case "standard":
                this._runMode = "update";
                break;
            case "update":
                this._runMode = "dump";
                break;
            case "dump":
                this._runMode = "standard";
                break;
        }
        this._onDidChangeCodeLenses.fire();
    }

    public setHotTestMode(enabled: boolean): void {
        this._hotTestMode = enabled;
        this._hotTestlogSqlEnabled = false;
        this._onDidChangeCodeLenses.fire();
    }

    public isHotTestMode(): boolean {
        return this._hotTestMode;
    }

    public toggleHotTestLogSql(): void {
        this._hotTestlogSqlEnabled = !this._hotTestlogSqlEnabled;
        this._onDidChangeCodeLenses.fire();
    }

    public getHotTestLogSqlEnabled(): boolean {
        return this._hotTestlogSqlEnabled;
    }

    async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken) {
        if (!Configuration.get("odooBinPath")) {
            return [];
        }

        // check if test file
        const fileName = document.fileName;
        const [fileCategory, moduleName] = parseFilePathInfo(fileName);
        if (!fileCategory || fileCategory !== "addons_test") {
            return [];
        }

        if (token.isCancellationRequested) {
            return [];
        }

        const databaseName = Configuration.get("databaseName") as string;
        const lenses: vscode.CodeLens[] = [];

        if (fileCategory === "addons_test") {
            this.addLensForStandaloneTests(lenses, document, moduleName, databaseName);
        }

        if (token.isCancellationRequested) {
            return [];
        }

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

        if (fileCategory === "addons_test") {
            if (this._hotTestMode) {
                this.addLensForHotTests(lenses, symbols, moduleName);
            } else {
                this.addLensForStandardTests(lenses, symbols, moduleName, databaseName);
            }
        }

        return lenses;
    }

    private addLensForStandaloneTests(
        lenses: vscode.CodeLens[],
        document: vscode.TextDocument,
        moduleName: string,
        databaseName: string,
    ) {
        const text = document.getText();
        const standaloneRegex = /@standalone\(([^)]*)\)\s*def\s+([\w_]+)/g;
        let match;
        while ((match = standaloneRegex.exec(text)) !== null) {
            const tagsRaw = match[1];
            // parse tags, support both single and multiple quoted tags
            const tagRegex = /(['"])(.*?)\1/g;
            let tagMatch;
            const tags: string[] = [];
            while ((tagMatch = tagRegex.exec(tagsRaw)) !== null) {
                tags.push(tagMatch[2]);
            }
            // Find the function location for CodeLens
            const funcPos = text.indexOf(match[0]);
            const pos = document.positionAt(funcPos);
            for (const tag of tags) {
                lenses.push(
                    new vscode.CodeLens(new vscode.Range(pos, pos), {
                        title: `$(debug-rerun) Run ${tag}`,
                        command: "odooTest.runStandaloneTest",
                        arguments: [moduleName, tag],
                    }),
                );
            }
            lenses.push(
                new vscode.CodeLens(new vscode.Range(pos, pos), {
                    title: `$(database) Dump`,
                    command: "odooTest.dumpTestDatabase",
                    arguments: [`standalone.dump`],
                }),
            );
            lenses.push(
                new vscode.CodeLens(new vscode.Range(pos, pos), {
                    title: `$(trash) ${databaseName}`,
                    command: "odooTest.cleanupTest",
                    arguments: ["standalone"],
                }),
            );
        }
    }

    private addLensForHotTests(
        lenses: vscode.CodeLens[],
        symbols: vscode.DocumentSymbol[],
        moduleName: string,
    ) {
        for (const symbol of symbols) {
            if (symbol.kind === vscode.SymbolKind.Class) {
                const testMethods = symbol.children.filter(
                    (child) =>
                        child.kind === vscode.SymbolKind.Method && child.name.startsWith("test"),
                );

                if (!testMethods.length) {
                    continue;
                }
                for (const test of [symbol, ...testMethods]) {
                    lenses.push(
                        new vscode.CodeLens(test.range, {
                            title: `$(play) Run Hot`,
                            command: "odooTest.runHotTest",
                            arguments: [
                                this,
                                moduleName,
                                symbol.name,
                                test === symbol ? undefined : test.name,
                            ],
                        }),
                    );

                    // Add log SQL toggle button
                    const logSqlStatus = this._hotTestlogSqlEnabled ? "ON" : "OFF";
                    lenses.push(
                        new vscode.CodeLens(test.range, {
                            title: `$(database) Log SQL (${logSqlStatus})`,
                            command: "odooTest.toggleHotTestLogSql",
                            arguments: [],
                        }),
                    );
                }
            }
        }
    }

    private addLensForStandardTests(
        lenses: vscode.CodeLens[],
        symbols: vscode.DocumentSymbol[],
        moduleName: string,
        databaseName: string,
    ) {
        for (const symbol of symbols) {
            if (symbol.kind === vscode.SymbolKind.Class) {
                const testMethods = symbol.children.filter(
                    (child) =>
                        child.kind === vscode.SymbolKind.Method && child.name.startsWith("test"),
                );

                if (!testMethods.length) {
                    continue;
                }
                for (const test of [symbol, ...testMethods]) {
                    lenses.push(
                        new vscode.CodeLens(test.range, {
                            title: `$(versions)`,
                            command: "odooTest.switchRunMode",
                            arguments: [],
                        }),
                    );

                    if (this._runMode === "standard") {
                        lenses.push(
                            new vscode.CodeLens(test.range, {
                                title: `$(play) Run`,
                                command: "odooTest.runTest",
                                arguments: [
                                    moduleName,
                                    symbol.name,
                                    test === symbol ? undefined : test.name,
                                ],
                            }),
                        );
                    } else if (this._runMode === "update") {
                        lenses.push(
                            new vscode.CodeLens(test.range, {
                                title: `$(run-above) Run Update`,
                                command: "odooTest.runUpdateTest",
                                arguments: [
                                    moduleName,
                                    symbol.name,
                                    test === symbol ? undefined : test.name,
                                ],
                            }),
                        );
                    } else if (this._runMode === "dump") {
                        lenses.push(
                            new vscode.CodeLens(test.range, {
                                title: `$(debug-rerun) Run Dump`,
                                command: "odooTest.runDumpTest",
                                arguments: [
                                    moduleName,
                                    symbol.name,
                                    test === symbol ? undefined : test.name,
                                ],
                            }),
                        );

                        lenses.push(
                            new vscode.CodeLens(test.range, {
                                title: `$(database) Dump`,
                                command: "odooTest.dumpTestDatabase",
                                arguments: ["standard.dump"],
                            }),
                        );
                    }

                    lenses.push(
                        new vscode.CodeLens(test.range, {
                            title: `$(trash) ${databaseName}`,
                            command: "odooTest.cleanupTest",
                            arguments: ["standard"],
                        }),
                    );
                }
            }
        }
    }
}
