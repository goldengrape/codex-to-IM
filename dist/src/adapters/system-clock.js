"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemClock = void 0;
class SystemClock {
    now() {
        return new Date().toISOString();
    }
    onTick(cb, intervalMs) {
        const timer = setInterval(() => cb(this.now()), intervalMs);
        return () => clearInterval(timer);
    }
}
exports.SystemClock = SystemClock;
