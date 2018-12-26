const assert = require('assert');
const cluster = require('cluster');

const semver = require('semver');
const pkg = require('./package.json');

var RoundRobinHandle;
var rr_prototype;

const init = () => {
    if (!RoundRobinHandle) {
        assert(semver.satisfies(process.version, pkg.engines.node), `Node.js version must be ${pkg.engines.node}`);
        try {
            RoundRobinHandle = require('internal/cluster/round_robin_handle');
        } catch (e) {
            assert.fail('Sticky-iphash requires Node.js started with the --expose-internals flag');
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
