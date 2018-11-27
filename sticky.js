const assert = require('assert');
const cluster = require('cluster');

let RoundRobinHandle;
let rr_prototype;

const init = () => {
    if (!RoundRobinHandle) {
        try {
            RoundRobinHandle = require('internal/cluster/round_robin_handle');
        } catch (e) {
            assert.fail('Sticky-iphash requires node started with the --expose-internals flag');
        }
    }
};

exports.enable = () => {
    init();
    rr_prototype = RoundRobinHandle.prototype;
    RoundRobinHandle.prototype = require('./iphash_handle');
    cluster.schedulingPolicy = cluster.SCHED_RR;
};

exports.disable = () => {
    if (RoundRobinHandle && rr_prototype) {
        RoundRobinHandle.prototype = rr_prototype;
        return true;
    }
    return false;
};
