/* Finite-record screening of classical frequency-synchronisation candidates.
 * No fabricated response or predefined lock-in interval. Not a stability proof. */
(function (root) {
  'use strict';
  const VERSION = 'viv-analysis-20261027a';
  const LIMITS = Object.freeze({ minimumPoints: 3, minimumCycles: 5,
    maximumResolutionRatio: 0.1, naturalFrequencyTolerance: 0.15,
    mutualFrequencyTolerance: 0.1, minimumMotionHalfAmplitude: 1e-6 });

  function assess(point) {
    const p = { ...point }, reasons = [];
    const finitePositive = x => Number.isFinite(x) && x > 0;
    if (typeof p.signature !== 'string' || !p.signature.trim()) reasons.push('missing-condition-signature');
    if (p.fixed !== false) reasons.push('fixed-or-unspecified-motion-condition');
    if (p.valid === false) reasons.push('invalid-record');
    if (p.highFrequencyDominated === true) reasons.push('high-frequency-dominated');
    if (p.halfWindowStable === false) reasons.push('window-not-stable');
    if (![p.U, p.fn, p.fl, p.fy, p.span, p.resolution].every(finitePositive)) reasons.push('missing-or-invalid-frequency-window');
    if (!Number.isFinite(p.half) || p.half <= LIMITS.minimumMotionHalfAmplitude) reasons.push('motion-too-small');
    if (!reasons.includes('missing-or-invalid-frequency-window')) {
      p.Ur = p.U / p.fn;
      p.liftRatio = p.fl / p.fn; p.motionRatio = p.fy / p.fn;
      // Do not use the zero-padded FFT bin spacing as resolving power.
      p.effectiveResolution = Math.max(p.resolution, 1 / p.span);
      if (p.effectiveResolution / p.fn > LIMITS.maximumResolutionRatio + 1e-12) reasons.push('window-resolution-too-coarse');
      if (Math.min(p.fl, p.fy) * p.span < LIMITS.minimumCycles) reasons.push('too-few-cycles');
      if (Math.abs(p.fl - p.fn) / p.fn > LIMITS.naturalFrequencyTolerance ||
          Math.abs(p.fy - p.fn) / p.fn > LIMITS.naturalFrequencyTolerance) reasons.push('not-near-natural-frequency');
      if (Math.abs(p.fl - p.fy) / p.fn > LIMITS.mutualFrequencyTolerance) reasons.push('lift-and-motion-not-close');
    }
    p.candidate = reasons.length === 0; p.reasons = reasons;
    return p;
  }

  /** points have {signature,group,U,fn,fl,fy,span,resolution,half,fixed:false}.
   * signature must encode all fixed conditions including shape, m*, zeta, fn,
   * Re_ref/viscosity, grid, movement condition and scan direction/protocol.
   * Observed sample endpoints are returned, never interpolated lock-in bounds.
   */
  function lockCandidate(points) {
    const input = Array.isArray(points) ? points : [], grouped = new Map();
    input.forEach((p, index) => {
      const item = assess({ ...p, index });
      const key = JSON.stringify([item.signature || '__missing__', item.group || '']);
      if (!grouped.has(key)) grouped.set(key, { signature: item.signature, group: item.group, points: [], ranges: [] });
      grouped.get(key).points.push(item);
    });
    const groups = [...grouped.values()];
    for (const group of groups) {
      // Repeated observations at one speed do not count as extra sweep points.
      // The latest observation at a speed is the one displayed and screened.
      const bySpeed = new Map();
      for (const p of group.points) {
        if (Number.isFinite(p.U)) bySpeed.set(p.U.toPrecision(12), p);
      }
      group.points = [...bySpeed.values()].sort((a, b) => a.U - b.U);
      let run = [];
      function flush() {
        if (run.length >= LIMITS.minimumPoints) {
          group.ranges.push({ signature: group.signature, group: group.group,
            Umin: run[0].U, Umax: run.at(-1).U, UrMin: run[0].Ur, UrMax: run.at(-1).Ur,
            count: run.length, indices: run.map(p => p.index),
            label: '接近固有频率的同步候选点段', boundaries: 'observed sample endpoints; not identified lock-in boundaries' });
        }
        run = [];
      }
      for (const p of group.points) { if (p.candidate) run.push(p); else flush(); }
      flush();
    }
    return { version: VERSION, kind: 'frequency-sync-candidate', groups,
      ranges: groups.flatMap(g => g.ranges), limits: LIMITS,
      caveat: '仅按有限窗内升力/位移频率筛查；至少三个同条件风速点。不能确认流动锁定、起止边界、幅值稳定性或工程安全；低质量系统的同步频率也可能偏离fn。' };
  }
  const api = Object.freeze({ VERSION, limits: LIMITS, assess, lockCandidate, candidate: lockCandidate });
  root.VivAnalysis = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
