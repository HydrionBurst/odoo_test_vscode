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
