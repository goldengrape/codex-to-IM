"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryPersistenceStore = void 0;
class InMemoryPersistenceStore {
    snapshot = null;
    events = [];
    audits = [];
    async loadSnapshot() {
        return this.snapshot;
    }
    async saveSnapshot(state) {
        this.snapshot = state;
    }
    async appendEvent(event) {
        this.events.push(event);
    }
    async appendAudit(topic, payload) {
        this.audits.push({ topic, payload });
    }
}
exports.InMemoryPersistenceStore = InMemoryPersistenceStore;
