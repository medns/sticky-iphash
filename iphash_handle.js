'use strict';

const assert = require('assert');
const { sendHelper } = require('internal/cluster/utils');
const uv = process.binding('uv');

const relocate = Symbol('relocate');
const handoff = Symbol('handoff');
const free = Symbol('free');

const kState = Symbol('state');
const kHash = Symbol('hash');

const STATE_PENDING = 0;
const STATE_CALLING = 1;

const hash = (ip) => {
  // Times33 string hashing function.
  // Support ipv4 and ipv6
  let hash = 5381;
  let i = ip.length;
  while (i) {
    hash = (hash * 33) ^ ip.charCodeAt(--i);
  }
  return hash >>> 0;
};

module.exports = {
  add(worker, send) {
    assert(this.free.indexOf(worker) === -1);
    worker[kState] = STATE_PENDING;
    this.free.push(worker);
    this[relocate](); // Relocate handle.

    const done = () => {
      if (this.free.indexOf(worker) === -1) { // Already removed.
        return;
      }

      const out = {};
      const errno = this.handle.getsockname(out);
      if (errno === 0) {
        send(0, { sockname: out }, null);
      } else {
        send(errno, null);
        this.remove(worker);
        return;
      }

      this[handoff](worker);  // In case there are connections pending.
    };

    if (this.server === null) {
      return done();
    }

    // Still busy binding.
    this.server.once('listening', done);
    this.server.once('error', (err) => {
      if (this.free.indexOf(worker) === -1) { // Already removed.
        return;
      }

      // Hack: translate 'EADDRINUSE' error string back to numeric error code.
      // It works but ideally we'd have some backchannel between the net and
      // cluster modules for stuff like this.
      send(uv[`UV_${err.errno}`], null);
    });
  },

  remove(worker) {
    const index = this.free.indexOf(worker);

    if (index >= 0) {
      this.free.splice(index, 1);
    } else {
      return false;
    }

    if (this.free.length > 0) {
      this[relocate](); // Relocate handle.
      return false;
    } else {
      this[free]();
      return true;
    }
  },

  [free]() {
    this.handles.forEach((queue) => queue.forEach((handle) => handle.close()));
    this.handles = [];

    if (this.handle !== null) { // Maybe still busy binding.
      this.handle.close();
      this.handle = null;
    }
  },

  [relocate]() {
    const queues = [];
    for (var i = 0; i < this.free.length; i += 1) {
      queues.push([]);
    }

    for (const queue of this.handles) {
      for (const handle of queue) {
        queues[handle[kHash] % this.free.length].push(handle);
      }
    }

    this.handles = queues;
  },

  distribute(err, handle) {
    if (err !== 0) {
      return;
    }

    const out = {};
    if (handle.getpeername(out) !== 0) {
      handle.close();
      return;
    }
    handle[kHash] = hash(out.address);

    const index = handle[kHash] % this.free.length;

    this.handles[index].push(handle);

    const worker = this.free[index];
    if (worker[kState] === STATE_PENDING) {
      this[handoff](worker);
    }
  },

  [handoff](worker) {
    const index = this.free.indexOf(worker);

    if (index === -1) {
      return; // Worker is closing (or has closed) the server.
    }

    const handle = this.handles[index].shift();

    if (handle === undefined) {
      worker[kState] = STATE_PENDING;
      return;
    } else {
      worker[kState] = STATE_CALLING;
    }

    const message = { act: 'newconn', key: this.key };

    sendHelper(worker.process, message, handle, (reply) => {
      if (reply.accepted) {
        handle.close();
      } else {
        // Worker is shutting down, Add to queue again.
        this.handles[index].push(handle);
      }

      worker[kState] = STATE_PENDING;
      this[handoff](worker);
    });
  },
};