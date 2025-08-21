import * as vscode from "vscode";

import { Configuration } from "../utils/configuration";
import { parseFilePathInfo } from "../utils/odoo";

export class OdooStandaloneCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

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
                    tooltip: `Cleanup ${databaseName}`,
                }),
            );
        }
    }
}
