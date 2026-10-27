/*
 * Live, fixed-section educational CFD. D2Q9 BGK lattice Boltzmann,
 * halfway stationary bounce-back and link-wise momentum exchange.
 * No stored fields, prescribed shedding wave or assigned mitigation factor.
 * Relaxed equilibrium buffer zones absorb waves at inlet/outlet; y is periodic.
 * This is a deliberately coarse, low-Re, weakly compressible 2-D model, NOT
 * a full-scale bridge prediction or a coupled fluid/structure lock-in solver.
 */
(function (root) {
  'use strict';
  // Both the drawing and every CFD solid cell use the same section definition.
  // The offline bundle preloads it; a network worker imports it relative to itself.
  if (!root.BridgeSection && typeof importScripts === 'function') importScripts('section-geometry.js?v=20261024f');
  const BridgeSection = root.BridgeSection || (typeof require === 'function' ? require('./section-geometry.js') : null);
  if (!BridgeSection) throw new Error('Shared bridge-section geometry is unavailable');
  const CX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
  const CY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
  const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
  const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
  const SHAPES = BridgeSection.SHAPES;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function parameter(name, value, fallback, lo, hi) {
    const v = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(name + ' must lie in [' + lo + ', ' + hi + ']');
    return v;
  }
  class FlowSolver {
    constructor(config = {}) {
      this.shape = config.shape === undefined ? 'box' : config.shape;
      if (!SHAPES.includes(this.shape)) throw new Error('Unknown section: ' + this.shape);
      this.Re = parameter('Re', config.Re, 160, 60, 220);
      this.speed = parameter('speed', config.speed, 1, 0.25, 4);
      this.section = BridgeSection.create(this.shape, { stabilizer: config.stabilizer });
      this.nx = 320; this.ny = 112; this.N = this.nx * this.ny;
      this.D = 12; this.B = this.section.B * this.D; this.xc = 105.5; this.yc = 55.5;
      this.U = 0.05; this.nu = this.U * this.D / this.Re;
      this.tau = 0.5 + 3 * this.nu; this.relaxation = 1 / this.tau;
      this.dt = this.U / this.D;
      this.steps = 0; this.fx = 0; this.fy = 0; this.finite = true;
      this.warmupTime = 24; this.sampleCount = 0; this.sumCl = 0; this.sumCl2 = 0; this.sumCd = 0;
      this.pendingHistory = []; this.rampSteps = 1600;
      this.mask = new Uint8Array(this.N);
      this.f = new Float64Array(this.N * 9); this.g = new Float64Array(this.N * 9);
      this.pull = new Int32Array(this.N * 9); this.boundary = new Uint8Array(this.N);
      this.sponge = new Float64Array(this.N);
      this.local = new Float64Array(9); this.previousUx = null; this.previousUy = null;
      const fluid = [];
      for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) {
        const i = y * this.nx + x, base = i * 9;
        const dx = x - this.xc, dy = y - this.yc;
        const solid = BridgeSection.contains(this.section, dx / this.D, dy / this.D);
        this.mask[i] = solid ? 1 : 0;
        this.boundary[i] = x === 0 ? 1 : x === this.nx - 1 ? 2 : 0;
        this.sponge[i] = x < 18 ? 0.06 * ((18 - x) / 18) ** 2 : x > this.nx - 42 ? 0.06 * ((x - (this.nx - 42)) / 41) ** 2 : 0;
        if (!solid) fluid.push(i);
        // Reproducible non-periodic, tiny initial disturbance. Subsequent motion is solved.
        const hash = (((x * 73856093) ^ (y * 19349663)) >>> 0) / 4294967295 - 0.5;
        const ux = 0;
        const uy = solid ? 0 : 0.04 * this.U * hash * Math.exp(-((dx - 40) ** 2 + dy * dy) / 800);
        for (let k = 0; k < 9; k++) {
          const cu = 3 * (CX[k] * ux + CY[k] * uy);
          this.f[base + k] = W[k] * (1 + cu + 0.5 * cu * cu - 1.5 * (ux * ux + uy * uy));
        }
      }
      this.g.set(this.f); this.fluid = Int32Array.from(fluid);
      this.bounceLinks = 0;
      for (const i of this.fluid) {
        const x = i % this.nx, y = (i / this.nx) | 0, base = i * 9;
        for (let k = 0; k < 9; k++) {
          const sx = clamp(x - CX[k], 0, this.nx - 1);
          const sy = (y - CY[k] + this.ny) % this.ny;
          const source = sy * this.nx + sx;
          this.pull[base + k] = this.mask[source] ? -(base + OPP[k] + 1) : source * 9 + k;
          if (this.mask[source]) this.bounceLinks++;
        }
      }
    }
    _oneStep() {
      const f = this.f, g = this.g, p = this.pull, local = this.local, omega = this.relaxation;
      const ramp = clamp((this.steps + 1) / this.rampSteps, 0, 1);
      const uin = this.U * ramp * ramp * (3 - 2 * ramp);
      let fx = 0, fy = 0;
      for (let j = 0; j < this.fluid.length; j++) {
        const i = this.fluid[j], base = i * 9;
        for (let k = 0; k < 9; k++) {
          const source = p[base + k];
          const value = source < 0 ? f[-source - 1] : f[source];
          local[k] = value;
          if (source < 0) { fx -= 2 * value * CX[k]; fy -= 2 * value * CY[k]; }
        }
        const boundary = this.boundary[i];
        if (boundary) {
          for (let k = 0; k < 9; k++) {
            const cu = 3 * CX[k] * uin;
            local[k] = W[k] * (1 + cu + 0.5 * cu * cu - 1.5 * uin * uin);
          }
        }
        let rho = 0, ux = 0, uy = 0;
        for (let k = 0; k < 9; k++) { const z = local[k]; rho += z; ux += z * CX[k]; uy += z * CY[k]; }
        ux /= rho; uy /= rho;
        const usq = ux * ux + uy * uy;
        if (!Number.isFinite(rho + usq) || rho < 0.5 || rho > 1.5 || usq > 0.16) {
          this.finite = false;
          throw new Error('LBM stability limit at step ' + this.steps + ', cell ' + (i % this.nx) + '/' + ((i / this.nx) | 0) + ', rho ' + rho + ', speed ' + Math.sqrt(usq) + '; reset or reduce Re. No values were clipped.');
        }
        for (let k = 0; k < 9; k++) {
          const cu = 3 * (CX[k] * ux + CY[k] * uy);
          const eq = W[k] * rho * (1 + cu + 0.5 * cu * cu - 1.5 * usq);
          let value = local[k] + omega * (eq - local[k]);
          const damping = this.sponge[i];
          if (damping) {
            const cu0 = 3 * CX[k] * uin;
            const farfield = W[k] * (1 + cu0 + 0.5 * cu0 * cu0 - 1.5 * uin * uin);
            value += damping * (farfield - value);
          }
          g[base + k] = value;
        }
      }
      this.f = g; this.g = f; this.fx = fx; this.fy = fy; this.steps++;
      if (this.steps % 5 === 0) {
        const q = 0.5 * this.U * this.U * this.D;
        this.pendingHistory.push({ time: this.steps * this.dt, cl: -fy / q, cd: fx / q });
      }
      if (this.steps * this.dt >= this.warmupTime) {
        const q = 0.5 * this.U * this.U * this.D;
        const cl = -fy / q;
        this.sampleCount++; this.sumCl += cl; this.sumCl2 += cl * cl; this.sumCd += fx / q;
      }
    }
    step(n = 1) {
      n = Math.floor(parameter('step count', n, 1, 0, 1000000));
      for (let j = 0; j < n; j++) this._oneStep();
      return this.scalars();
    }
    scalars() {
      const q = 0.5 * this.U * this.U * this.D;
      const meanCl = this.sampleCount ? this.sumCl / this.sampleCount : null;
      return { shape: this.shape, nx: this.nx, ny: this.ny, cl: -this.fy / q, cd: this.fx / q,
        steps: this.steps, time: this.steps * this.dt, dt: this.dt, Re: this.Re, speed: this.speed,
        finite: this.finite, warmup: this.steps * this.dt < this.warmupTime, warmupTime: this.warmupTime,
        statistics: { count: this.sampleCount, meanCl, meanCd: this.sampleCount ? this.sumCd / this.sampleCount : null,
          rmsCl: this.sampleCount ? Math.sqrt(Math.max(0, this.sumCl2 / this.sampleCount - meanCl * meanCl)) : null,
          elapsed: this.sampleCount * this.dt, sufficient: this.sampleCount * this.dt >= 30,
          stationarityAssessed: false, definition: 'mean-removed force RMS after startup; sufficient means minimum time window only' },
        geometry: { x: this.xc, y: this.yc, B: this.B, D: this.D, section: this.section },
        row0At: 'top', velocityScale: 'U', vorticityScale: 'U/D', pressureScale: 'Cp', liftPositive: 'up',
        vorticityPositive: 'clockwise in displayed grid coordinates',
        solver: 'D2Q9-BGK', coupling: 'fixed-section; one-way force output',
        parameters: { uLat: this.U, nuLat: this.nu, tau: this.tau, inletMach: Math.sqrt(3) * this.U,
          bounceLinks: this.bounceLinks, solidCells: this.N - this.fluid.length,
          boundary: 'periodic top/bottom; equilibrium inflow/outflow with 18/42-cell absorbing buffer zones',
          initialCondition: 'fluid initially at rest; deterministic non-periodic transverse seed <= 2% U; inlet ramp 1600 steps',
          referenceLength: 'deck D, including when attachments increase total depth' } };
    }
    snapshot() {
      const ux = new Float32Array(this.N), uy = new Float32Array(this.N);
      const pressure = new Float32Array(this.N), omega = new Float32Array(this.N);
      let densityMin = Infinity, densityMax = -Infinity, densitySum = 0, maxVelocity = 0;
      let delta2 = 0, velocity2 = 0, finite = this.finite;
      for (let j = 0; j < this.fluid.length; j++) {
        const i = this.fluid[j], base = i * 9;
        let rho = 0, u = 0, v = 0;
        for (let k = 0; k < 9; k++) { const z = this.f[base + k]; rho += z; u += z * CX[k]; v += z * CY[k]; }
        u /= rho; v /= rho; ux[i] = u / this.U; uy[i] = v / this.U;
        pressure[i] = 2 * (rho - 1) / (3 * this.U * this.U);
        finite = finite && Number.isFinite(rho + u + v);
        densityMin = Math.min(densityMin, rho); densityMax = Math.max(densityMax, rho); densitySum += rho;
        maxVelocity = Math.max(maxVelocity, Math.hypot(u, v));
        if (this.previousUx) delta2 += (ux[i] - this.previousUx[i]) ** 2 + (uy[i] - this.previousUy[i]) ** 2;
        velocity2 += ux[i] * ux[i] + uy[i] * uy[i];
      }
      for (let y = 0; y < this.ny; y++) for (let x = 1; x < this.nx - 1; x++) {
        const i = y * this.nx + x;
        if (this.mask[i]) continue;
        const above = ((y - 1 + this.ny) % this.ny) * this.nx + x;
        const below = ((y + 1) % this.ny) * this.nx + x;
        omega[i] = 0.5 * this.D * (uy[i + 1] - uy[i - 1] - ux[below] + ux[above]);
      }
      const residual = this.previousUx ? Math.sqrt(delta2 / Math.max(velocity2, 1e-30)) : null;
      // Retain private copies: returned buffers may be transferred from the worker.
      this.previousUx = ux.slice(); this.previousUy = uy.slice();
      const history = this.pendingHistory; this.pendingHistory = [];
      return { ...this.scalars(), ux, uy, omega, pressure, mask: this.mask.slice(), finite, residual, history,
        residualDefinition: 'relative L2 velocity change since previous published frame; not a convergence claim',
        diagnostics: { densityMin, densityMax, densityMean: densitySum / this.fluid.length,
          maximumMach: Math.sqrt(3) * maxVelocity, inletMach: Math.sqrt(3) * this.U,
          fieldFinite: finite, fluidCells: this.fluid.length, tau: this.tau } };
    }
  }
  root.FlowSolver = FlowSolver;
  if (typeof module !== 'undefined' && module.exports) module.exports = { FlowSolver, SHAPES };

  // The same file can be required by independent Node checks without starting a timer.
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    let solvers = [], configs = [], paused = true, timer = null, batch = 6, lastFrameAt = 0;
    function sendFrames(reason) {
      const frames = solvers.map(s => s.snapshot());
      const transfers = [];
      for (const f of frames) for (const key of ['ux', 'uy', 'omega', 'pressure', 'mask']) transfers.push(f[key].buffer);
      root.postMessage({ type: 'frame', frames, paused, reason }, transfers);
      lastFrameAt = performance.now();
    }
    function tick() {
      timer = null;
      if (paused || !solvers.length) return;
      const start = performance.now();
      try {
        // Equal step counts, inlet U and Re keep both comparisons synchronized.
        for (const s of solvers) s.step(batch);
        const elapsed = Math.max(1, performance.now() - start);
        const speed = solvers[0].speed;
        batch = clamp(Math.round(batch * (22 * speed / elapsed)), 1, 40);
        if (performance.now() - lastFrameAt >= 95) sendFrames();
        timer = setTimeout(tick, Math.max(0, 4 / speed));
      } catch (error) {
        paused = true;
        root.postMessage({ type: 'error', message: String(error.message || error), paused: true });
      }
    }
    function schedule() { if (timer === null && !paused && solvers.length) timer = setTimeout(tick, 0); }
    root.onmessage = function (event) {
      const m = event.data || {};
      try {
        if (m.type === 'init') {
          const given = Array.isArray(m.configs) && m.configs.length ? m.configs.slice(0, 2) : [{ shape: 'box' }, { shape: 'streamlined' }];
          const commonRe = given[0].Re === undefined ? 160 : given[0].Re;
          const commonSpeed = given[0].speed === undefined ? 1 : given[0].speed;
          const newConfigs = given.map(c => ({ ...c, Re: commonRe, speed: commonSpeed }));
          const newSolvers = newConfigs.map(c => new FlowSolver(c));
          configs = newConfigs; solvers = newSolvers; paused = !!m.paused; batch = 6;
          root.postMessage({ type: 'reset', reason: 'init', configs }); sendFrames('init'); schedule();
        } else if (m.type === 'config') {
          const index = Number.isInteger(m.index) ? m.index : 1;
          if (!solvers[index]) throw new Error('Invalid comparison index');
          const next = m.config || {};
          let newConfigs = configs.map(c => ({ ...c }));
          if (next.shape !== undefined) newConfigs[index].shape = next.shape;
          if (next.stabilizer !== undefined) newConfigs[index].stabilizer = next.stabilizer;
          if (next.Re !== undefined) newConfigs = newConfigs.map(c => ({ ...c, Re: next.Re }));
          if (next.speed !== undefined) newConfigs = newConfigs.map(c => ({ ...c, speed: parameter('speed', next.speed, 1, 0.25, 4) }));
          if (next.shape !== undefined || next.stabilizer !== undefined || next.Re !== undefined) {
            // Reset both so their start-up history is directly comparable.
            const newSolvers = newConfigs.map(c => new FlowSolver(c));
            configs = newConfigs; solvers = newSolvers;
            root.postMessage({ type: 'reset', reason: 'geometry-or-Re', configs });
          } else if (next.speed !== undefined) {
            configs = newConfigs;
            for (const s of solvers) s.speed = configs[0].speed;
          }
          sendFrames('config'); schedule();
        } else if (m.type === 'pause') {
          paused = !!m.paused;
          if (paused && timer !== null) { clearTimeout(timer); timer = null; }
          root.postMessage({ type: 'paused', paused }); sendFrames('pause'); schedule();
        } else if (m.type === 'reset') {
          solvers = configs.map(c => new FlowSolver(c)); batch = 6;
          root.postMessage({ type: 'reset', reason: 'requested', configs }); sendFrames('reset'); schedule();
        }
      } catch (error) { root.postMessage({ type: 'error', message: String(error.message || error), paused }); }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
