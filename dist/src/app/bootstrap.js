"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boot = boot;
const reducer_1 = require("../domain/reducer");
const types_1 = require("../domain/types");
const runtime_1 = require("./runtime");
async function boot(config, ports) {
    const snapshot = await ports.persistence.loadSnapshot();
    const recovered = (0, reducer_1.recoverState)(snapshot, ports.clock.now());
    const state = {
        ...(snapshot ? recovered : (0, types_1.createInitialState)()),
        acl: config.acl,
    };
    await ports.agent.initialize();
    await ports.persistence.saveSnapshot(state);
    return new runtime_1.AppRuntime(state, ports);
}
