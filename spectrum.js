/* Finite-window spectrum of uniformly sampled solver records. No resampling. */
(function (root) {
  'use strict';
  const MAX_SPAN = 60, LOW_MIN = 0.04, LOW_MAX = 0.6;

  function fft(real, imag) {
    const n = real.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const r = real[i], q = imag[i];
        real[i] = real[j]; imag[i] = imag[j]; real[j] = r; imag[j] = q;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const a = -2 * Math.PI / size, stepR = Math.cos(a), stepI = Math.sin(a);
      const half = size / 2;
      for (let start = 0; start < n; start += size) {
        let wr = 1, wi = 0;
        for (let j = 0; j < half; j++) {
          const u = start + j, v = u + half;
          const tr = wr * real[v] - wi * imag[v], ti = wr * imag[v] + wi * real[v];
          real[v] = real[u] - tr; imag[v] = imag[u] - ti;
          real[u] += tr; imag[u] += ti;
          const next = wr * stepR - wi * stepI;
          wi = wr * stepI + wi * stepR; wr = next;
        }
      }
    }
  }

  /**
   * Return null for invalid, <5-time-unit / <32-sample, or near-constant records.
   * Otherwise return the full spectrum diagnostics even when low-band f is null.
   * f: local peak in [0.04,0.6], >=3 observed cycles and >=0.1% band energy.
   * fullDominant / dominantFrequency: peak over ALL positive sampled frequencies.
   * Fractions use one-sided Hann-windowed power, excluding DC. They sum to 1.
   * resolution=1/span is the finite-record scale, not the zero-padded FFT spacing.
   * A Hann peak has finite width; values do not establish stationarity or lock-in.
   */
  function estimate(rows, key) {
    if (!Array.isArray(rows) || rows.length < 32 || typeof key !== 'string') return null;
    const end = rows[rows.length - 1]?.t;
    if (!Number.isFinite(end)) return null;
    let first = rows.length - 1;
    while (first > 0 && rows[first - 1].t >= end - MAX_SPAN) first--;
    const n = rows.length - first, start = rows[first]?.t, span = end - start;
    if (n < 32 || !Number.isFinite(span) || span < 3 / LOW_MAX) return null;
    const dt = span / (n - 1), tolerance = Math.max(1e-9, dt * 0.001);
    if (!(dt > 0)) return null;
    let mean = 0, maxAbs = 0;
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const row = rows[first + i], x = row[key];
      if (!Number.isFinite(x) || !Number.isFinite(row.t)) return null;
      if (i && Math.abs(row.t - rows[first + i - 1].t - dt) > tolerance) return null;
      values[i] = x; mean += x; maxAbs = Math.max(maxAbs, Math.abs(x));
    }
    mean /= n;
    let variance = 0, sumW = 0, sumW2 = 0, weightedMean = 0;
    const window = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
      window[i] = w; sumW += w; sumW2 += w * w;
      weightedMean += w * (values[i] - mean);
      variance += (values[i] - mean) ** 2;
    }
    const rms = Math.sqrt(variance / n), amplitudeFloor = Math.max(1e-8, 64 * Number.EPSILON * maxAbs);
    if (!(rms > amplitudeFloor)) return null;
    weightedMean /= sumW;
    // Preserve every native sample. Padding refines displayed peak location only;
    // it neither filters high frequencies nor adds physical spectral resolution.
    let nfft = 1;
    while (nfft < n * 2) nfft *= 2;
    const real = new Float64Array(nfft), imag = new Float64Array(nfft);
    for (let i = 0; i < n; i++) real[i] = (values[i] - mean - weightedMean) * window[i];
    fft(real, imag);
    const last = nfft / 2, df = 1 / (nfft * dt), nyquist = 1 / (2 * dt);
    const power = new Float64Array(last + 1), normalization = nfft * sumW2;
    let totalPower = 0, lowPower = 0, highPower = 0, subLowPower = 0, fullPeak = 1;
    for (let k = 1; k <= last; k++) {
      const p = (real[k] ** 2 + imag[k] ** 2) * (k === last ? 1 : 2) / normalization;
      power[k] = p; totalPower += p;
      const frequency = k * df;
      if (frequency < LOW_MIN) subLowPower += p;
      else if (frequency <= LOW_MAX) lowPower += p;
      else highPower += p;
      if (p > power[fullPeak]) fullPeak = k;
    }
    if (!(totalPower > amplitudeFloor ** 2)) return null;
    function peakFrequency(k) {
      if (k <= 1 || k >= last) return k * df;
      const left = Math.log(Math.max(power[k - 1], Number.MIN_VALUE));
      const center = Math.log(Math.max(power[k], Number.MIN_VALUE));
      const right = Math.log(Math.max(power[k + 1], Number.MIN_VALUE));
      const denominator = left - 2 * center + right;
      const shift = denominator < -1e-14 ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator)) : 0;
      return (k + shift) * df;
    }
    let lowPeak = 0;
    for (let k = Math.max(1, Math.floor(LOW_MIN / df)); k <= Math.min(last - 1, Math.ceil(LOW_MAX / df)); k++) {
      if (power[k] < power[k - 1] || power[k] < power[k + 1]) continue;
      const frequency = peakFrequency(k);
      if (frequency < LOW_MIN || frequency > LOW_MAX) continue;
      if (!lowPeak || power[k] > power[lowPeak]) lowPeak = k;
    }
    const lowBandFraction = lowPower / totalPower, highBandFraction = highPower / totalPower;
    let f = lowPeak ? peakFrequency(lowPeak) : null;
    const candidateFrequency = f, cycles = f === null ? 0 : f * span;
    let lowPeakStatus = 'available';
    if (f === null) lowPeakStatus = 'no-local-peak';
    else if (lowBandFraction < 0.001 || lowPower < amplitudeFloor ** 2) { f = null; lowPeakStatus = 'weak-low-band'; }
    else if (cycles < 3) { f = null; lowPeakStatus = 'fewer-than-three-cycles'; }
    const dominantFrequency = peakFrequency(fullPeak);
    return {
      f, dominantFrequency, fullDominant: dominantFrequency,
      lowBandFraction, highBandFraction, subLowBandFraction: subLowPower / totalPower,
      highFrequencyDominated: highBandFraction > 0.5,
      resolution: 1 / span, fftBinSpacing: df,
      hannEquivalentBandwidth: sumW2 / (dt * sumW * sumW),
      span, start, end, samples: n, dt, nyquist, rms,
      cycles, candidateFrequency, lowPeakStatus,
      power: { total: totalPower, low: lowPower, high: highPower, subLow: subLowPower },
      lowBand: [LOW_MIN, LOW_MAX], window: 'Hann', method: 'native-sample FFT; weighted-mean removed; no decimation'
    };
  }
  /**
   * Display spectrum with native samples, physical ordinate scaling and a
   * selectable observation span. It deliberately does not change estimate().
   * amplitude is sinusoidal peak amplitude (not RMS), corrected by sum(window).
   * psd integrates to window-weighted mean-square, in signal-unit^2/frequency.
   * Every frequency through Nyquist is returned: a display zoom never filters.
   */
  function spectrum(rows, key, options = {}) {
    const requestedSpan = Number(options.span ?? 60);
    if (!Array.isArray(rows) || rows.length < 32 || typeof key !== 'string' ||
        !Number.isFinite(requestedSpan) || requestedSpan <= 0 || requestedSpan > 120) return null;
    const end = rows.at(-1)?.t;
    if (!Number.isFinite(end)) return null;
    let first = rows.length - 1;
    while (first > 0 && rows[first - 1].t >= end - requestedSpan - 1e-10) first--;
    const n = rows.length - first, start = rows[first]?.t, span = end - start;
    if (n < 32 || !(span > 0)) return null;
    const dt = span / (n - 1), tolerance = Math.max(1e-9, dt * 0.001);
    let mean = 0, maxAbs = 0;
    const values = new Float64Array(n), window = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const row = rows[first + i], value = row[key];
      if (!Number.isFinite(row.t) || !Number.isFinite(value) ||
          (i && Math.abs(row.t - rows[first + i - 1].t - dt) > tolerance)) return null;
      values[i] = value; mean += value; maxAbs = Math.max(maxAbs, Math.abs(value));
    }
    mean /= n;
    let sumW = 0, sumW2 = 0, weightedMean = 0, variance = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
      window[i] = w; sumW += w; sumW2 += w * w;
      weightedMean += w * (values[i] - mean);
      variance += (values[i] - mean) ** 2;
    }
    weightedMean /= sumW;
    let nfft = 1;
    while (nfft < n * 2) nfft *= 2;
    const real = new Float64Array(nfft), imag = new Float64Array(nfft);
    for (let i = 0; i < n; i++) real[i] = (values[i] - mean - weightedMean) * window[i];
    fft(real, imag);
    const df = 1 / (nfft * dt), last = nfft / 2, nyquist = 1 / (2 * dt);
    const bins = new Array(last + 1);
    let totalPower = 0, lowPower = 0, highPower = 0, fullPeak = 1, lowPeakIndex = -1;
    for (let k = 0; k <= last; k++) {
      const multiplier = k === 0 || k === last ? 1 : 2;
      const magnitude2 = real[k] ** 2 + imag[k] ** 2, frequency = k * df;
      const amplitude = multiplier * Math.sqrt(magnitude2) / sumW;
      const psd = multiplier * magnitude2 * dt / sumW2;
      bins[k] = { frequency, amplitude, psd };
      if (!k) continue;
      totalPower += psd * df;
      if (frequency >= LOW_MIN && frequency <= LOW_MAX) lowPower += psd * df;
      else if (frequency > LOW_MAX) highPower += psd * df;
      if (psd > bins[fullPeak]?.psd) fullPeak = k;
    }
    function peakAt(k) {
      if (k < 1 || k > last) return null;
      let shift = 0;
      if (k > 1 && k < last) {
        const a = Math.log(Math.max(bins[k - 1].psd, Number.MIN_VALUE));
        const b = Math.log(Math.max(bins[k].psd, Number.MIN_VALUE));
        const d = Math.log(Math.max(bins[k + 1].psd, Number.MIN_VALUE));
        const denominator = a - 2 * b + d;
        if (denominator < -1e-14) shift = Math.max(-0.5, Math.min(0.5, 0.5 * (a - d) / denominator));
      }
      const frequency = (k + shift) * df, cycles = frequency * span;
      // Peak ordinate remains a measured FFT ordinate; interpolation only refines f.
      return { ...bins[k], frequency, binFrequency: bins[k].frequency, index: k, cycles, mature: cycles >= 3 };
    }
    for (let k = Math.max(1, Math.floor(LOW_MIN / df)); k <= Math.min(last - 1, Math.ceil(LOW_MAX / df)); k++) {
      if (bins[k].psd < bins[k - 1].psd || bins[k].psd < bins[k + 1].psd) continue;
      const peak = peakAt(k);
      if (peak.frequency < LOW_MIN || peak.frequency > LOW_MAX) continue;
      if (lowPeakIndex < 0 || bins[k].psd > bins[lowPeakIndex].psd) lowPeakIndex = k;
    }
    const rms = Math.sqrt(variance / n), amplitudeFloor = Math.max(1e-8, 64 * Number.EPSILON * maxAbs);
    const signalPresent = rms > amplitudeFloor && totalPower > amplitudeFloor ** 2;
    const peak = signalPresent ? peakAt(fullPeak) : null;
    const lowPeak = signalPresent ? peakAt(lowPeakIndex) : null;
    const lowBandFraction = totalPower > 0 ? lowPower / totalPower : 0;
    if (lowPeak) lowPeak.valid = lowPeak.mature && lowBandFraction >= 0.001 && lowPower > amplitudeFloor ** 2;
    return {
      bins, span, start, end, samples: n, dt, nyquist, resolution: 1 / span,
      fftBinSpacing: df, hannEquivalentBandwidth: sumW2 / (dt * sumW * sumW),
      requestedSpan, window: 'Hann', rms, mean, signalPresent,
      peak, lowPeak, lowBand: [LOW_MIN, LOW_MAX], lowBandFraction,
      highBandFraction: totalPower > 0 ? highPower / totalPower : 0,
      totalPower, amplitudeConvention: 'one-sided sinusoidal peak amplitude; Hann coherent-gain correction',
      psdConvention: 'one-sided density; integral equals Hann-weighted fluctuation mean-square',
      method: 'native-sample FFT; weighted-mean removed; no decimation; zero padding does not add resolution'
    };
  }
  const api = Object.freeze({ estimate, spectrum });
  root.LabSpectrum = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
