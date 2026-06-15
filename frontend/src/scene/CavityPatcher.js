import * as THREE from 'three';
import { SeamlessTerrain } from './SeamlessTerrain.js';
import { RayRefractionTracer } from '../utils/ray_tracer.js';

const SLICE_ACC_PINGS = 6;
const SLICE_SPACING = 0.25;
const MAX_ACTIVE_WORKERS = 2;
const WORKER_POOL_SIZE = 2;

export class CavityPatcher {
  constructor(scene) {
    this.scene = scene;
    this.tracer = new RayRefractionTracer();
    this.terrain = new SeamlessTerrain(scene);
    this._sliceBuf = [];
    this._sliceAcc = [];
    this._lastPos = null;
    this._sliceId = 0;
    this._pending = new Map();
    this._sliceCounter = 0;
    this._initWorkerPool();
  }

  _initWorkerPool() {
    this._workerPool = [];
    this._busy = new Array(WORKER_POOL_SIZE).fill(false);
    this._queue = [];
    for (let i = 0; i < WORKER_POOL_SIZE; i++) {
      const w = new Worker(new URL('../worker/DelaunayWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._onWorkerDone(i, e.data);
      w.onerror = (e) => {
        console.warn('[Delaunay worker error]', e.message || e);
        this._busy[i] = false;
        this._flushQueue();
      };
      this._workerPool.push(w);
    }
  }

  _onWorkerDone(workerIdx, msg) {
    this._busy[workerIdx] = false;
    if (msg && msg.type === 'slice_done') {
      const result = msg.payload || {};
      const id = result.sliceId;
      if (this._pending.has(id)) {
        const meta = this._pending.get(id);
        this.terrain.uploadSlice(result, meta.tick);
        this._pending.delete(id);
      }
    }
    this._flushQueue();
  }

  _flushQueue() {
    while (this._queue.length > 0) {
      let free = -1;
      for (let i = 0; i < WORKER_POOL_SIZE; i++) {
        if (!this._busy[i]) { free = i; break; }
      }
      if (free < 0) break;
      const job = this._queue.shift();
      if (!job) break;
      this._busy[free] = true;
      this._workerPool[free].postMessage({ type: 'process', payload: job.payload }, [job.payload.points3D.buffer]);
    }
  }

  _submitSlice(points3D, tick) {
    const id = this._sliceCounter++;
    this._pending.set(id, { tick });
    const payload = { sliceId: id, points3D: new Float32Array(points3D) };
    this._queue.push({ payload });
    this._flushQueue();
  }

  pushPing(ping, tick) {
    const beams = ping.beams;
    const n = beams.count;
    if (n <= 0) return;
    const positions = this.tracer.computeBeamPositions(
      beams.ranges_m, beams.depth_deltas_m, beams.angles_rad,
      ping.rov.quat, ping.rov.pos
    );

    const rov = ping.rov.pos;
    let spacingOk = true;
    if (this._lastPos) {
      const dx = rov[0] - this._lastPos[0], dy = rov[1] - this._lastPos[1], dz = rov[2] - this._lastPos[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      spacingOk = d >= SLICE_SPACING;
    }

    for (let i = 0; i < n; i++) {
      this._sliceAcc.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }

    const pingsEnough = this._sliceAcc.length / 3 >= SLICE_ACC_PINGS * Math.min(n, 256);

    if (pingsEnough && (spacingOk || this._sliceAcc.length / 3 > SLICE_ACC_PINGS * n * 2.5)) {
      this._submitSlice(this._sliceAcc.slice(), tick);
      this._sliceAcc.length = 0;
      this._lastPos = [rov[0], rov[1], rov[2]];
    }
  }

  update(dt) {
    this.terrain.updateTick(dt);
  }

  clear() {
    this._sliceAcc.length = 0;
    this._pending.clear();
    this._queue.length = 0;
    this.terrain.clear();
  }

  dispose() {
    for (const w of this._workerPool) { try { w.terminate(); } catch (_) {} }
    this.terrain.dispose();
  }
}
