import * as vscode from "vscode";

import { Configuration } from "../utils/configuration";
import { parseFilePathInfo } from "../utils/odoo";

export class OdooStandardCodeLensProvider implements vscode.CodeLensProvider {
    private _buttonLayer: number = 0;
    private _buttons: string[] = [];
    private _hotTestMode: boolean = false;
    private _hotTestlogSqlEnabled: boolean = false;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {
        this.switchButtonLayer(0);
    }

    public switchButtonLayer(layer: number | undefined = undefined): void {
        const layout = Configuration.get("standardTestLayout") as string[][];
        this._buttonLayer = (layer ?? this._buttonLayer + 1) % layout.length;
        this._buttons = layout[this._buttonLayer];
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
                    if (this._buttons?.length > 1) {
                        lenses.push(
                            new vscode.CodeLens(test.range, {
                                title: `$(versions)`,
                                command: "odooTest.switchButtonLayer",
                                arguments: [],
                            }),
                        );
                    }

                    for (const button of this._buttons) {
                        switch (button) {
                            case "run":
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
                                break;
                            case "updateRun":
                                lenses.push(
                                    new vscode.CodeLens(test.range, {
                                        title: `$(run-above) Update & Run`,
                                        command: "odooTest.runUpdateTest",
                                        arguments: [
                                            moduleName,
                                            symbol.name,
                                            test === symbol ? undefined : test.name,
                                        ],
                                    }),
                                );
                                break;
                            case "runDump":
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
                                break;
                            case "dump":
                                lenses.push(
                                    new vscode.CodeLens(test.range, {
                                        title: `$(database) Dump`,
                                        command: "odooTest.dumpTestDatabase",
                                        arguments: ["standard.dump"],
                                    }),
                                );
                                break;
                            case "cleanup":
                                lenses.push(
                                    new vscode.CodeLens(test.range, {
                                        title: `$(trash) ${databaseName}`,
                                        command: "odooTest.cleanupTest",
                                        arguments: ["standard"],
                                        tooltip: `Cleanup ${databaseName}`,
                                    }),
                                );
                                break;
                        }
                    }
                }
            }
        }
    }
}
