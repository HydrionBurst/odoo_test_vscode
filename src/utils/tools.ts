import { exec } from "child_process";
import * as util from "util";

export const execAsync = util.promisify(exec);

export class NonBlockingMutex {
    private locked: boolean;
    private onLocked: () => void;

    constructor(onConflict: () => void) {
        this.locked = false;
        this.onLocked = onConflict;
    }

    guard(func: (...args: any[]) => Promise<void>) {
        return async (...args: any[]) => {
            if (this.locked) {
                this.onLocked();
                return;
            }
            try {
                this.locked = true;
                await func(...args);
            } finally {
                this.locked = false;
            }
        };
    }
}

const whitespaceOnlyRe = /^[ ]+$/gm;
const leadingWhitespaceRe = /^([ ]*)(?:[^ \n])/gm;

export function indentPython(code: string, prefix: string = ""): string {
    code = code.replace(whitespaceOnlyRe, "");
    const indents = [...code.matchAll(leadingWhitespaceRe)].map((match) => match[1]);
    const margin = Math.min(...indents.map((indent) => indent.length));
    if (margin > 0) {
        code = code.replace(new RegExp(`^${" ".repeat(margin)}`, "gm"), "");
    }
    code = code.trim();
    if (prefix) {
        code = code.replace(/^(?!\s*$)/gm, prefix);
    }
    return code;
}
