/* One geometry for the section drawing and actual CFD no-slip mask.
 * Coordinates are normalized by box-girder depth D: x right, y down.
 * All dimensions are illustrative; fine appendages are enlarged to survive
 * the teaching grid. This is not a dimensioned construction detail.
 */
(function (root) {
  'use strict';
  const SHAPES = ['box', 'streamlined', 'slotted', 'stabilizer', 'guide', 'railing', 'rail', 'waterbarrier'];
  const VERSION = 'bridge-section-20261024f';
  const polygon = (coordinates, role) => ({ type: 'polygon', points: coordinates.map(([x, y]) => ({ x, y })), role });
  const rect = (left, top, right, bottom, role) => polygon([[left, top], [right, top], [right, bottom], [left, bottom]], role);
  function pointInPolygon(points, x, y) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      const cross = (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
      if (Math.abs(cross) < 1e-10 && x >= Math.min(a.x, b.x) - 1e-10 && x <= Math.max(a.x, b.x) + 1e-10 && y >= Math.min(a.y, b.y) - 1e-10 && y <= Math.max(a.y, b.y) + 1e-10) return true;
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function containsPart(part, x, y) {
    return part.type === 'circle'
      ? (x - part.x) ** 2 + (y - part.y) ** 2 <= part.r * part.r + 1e-12
      : pointInPolygon(part.points, x, y);
  }
  function contains(section, x, y) {
    return section.bodies.some(body => pointInPolygon(body, x, y)) || section.parts.some(part => containsPart(part, x, y));
  }
  function create(shape = 'box', options = {}) {
    if (!SHAPES.includes(shape)) throw new Error('Unknown bridge section: ' + shape);
    const body = shape === 'box'
      ? polygon([[-4, -.5], [4, -.5], [4, .5], [-4, .5]], 'rectangular-box-girder').points
      : polygon([[-4, -.1], [-3.25, -.5], [3.25, -.5], [4, -.1], [2.7, .5], [-2.7, .5]], 'streamlined-box').points;
    const section = { version: VERSION, shape, B: 8, D: 1, bodies: [body], parts: [],
      options: {}, coordinates: 'x right, y down; depth D=1; bridge axis normal to section',
      notes: ['Illustrative section; thin plates, rail flanges and tubes enlarged for the D=12-cell teaching grid.',
        shape === 'box' ? 'The rectangular box is the control section.' : 'Appendage cases reuse the identical streamlined box girder; the slotted case splits its outer contour into two boxes.'] };
    if (shape === 'slotted') {
      // A central through-slot, not a closed void inside a single solid mask.
      // B is the total envelope, including the illustrative gap g=D.
      const left = [[-4, -.1], [-3.25, -.5], [-.5, -.5], [-.5, .5], [-2.7, .5]];
      section.bodies = [polygon(left, 'left-box').points, polygon(left.map(([x, y]) => [-x, y]).reverse(), 'right-box').points];
      section.options.slotWidthOverD = 1;
      section.options.slotRatio = 1 / 8;
      section.notes.push('Central through-slot: g/D=1, g/B=0.125; B includes the gap. Two disconnected external box contours; transverse connecting beams at other longitudinal stations are omitted in 2-D.');
    } else if (shape === 'stabilizer') {
      const placement = options.stabilizer === undefined ? 'upper' : options.stabilizer;
      if (!['upper', 'lower', 'both'].includes(placement)) throw new Error('stabilizer must be upper, lower or both');
      section.options.stabilizer = placement;
      if (placement === 'upper' || placement === 'both') section.parts.push(rect(-.09, -1.18, .09, -.48, 'central-stabilizer-upper'));
      if (placement === 'lower' || placement === 'both') section.parts.push(rect(-.09, .48, .09, 1.18, 'central-stabilizer-lower'));
    } else if (shape === 'railing') {
      for (const side of [-1, 1]) for (const y of [-.8]) {
        section.parts.push({ type: 'circle', x: side * 3, y, r: .12, role: 'longitudinal-railing-tube' });
      }
      section.notes.push('One railing level: two separate circles, one per edge, are transverse cuts through longitudinal horizontal tubes. Bridge-axis posts are not represented by a 2-D section.');
    } else if (shape === 'waterbarrier') {
      for (const side of [-1, 1]) {
        const x = side * 3;
        section.parts.push(polygon([[x - .09, -.48], [x + .09, -.48], [x + .05, -.8], [x - .05, -.8]], 'continuous-water-barrier'));
      }
      section.options.barrierHeightOverD = .3;
      section.notes.push('Two solid water-barrier profiles model continuous bridge-edge obstacles; no longitudinal gaps. Height above deck is 0.3D (1.2 m at D=4 m). This is a mechanism illustration, not a reconstruction of Humen Bridge or its VIV.');
    } else if (shape === 'rail' || shape === 'guide') {
      for (const side of [-1, 1]) {
        const x = side * 2.35, h = .33 * 130 / 320 / 2, w = .03;
        section.parts.push(rect(x - w, .48, x + w, .56, 'inspection-track-mount'));
        section.parts.push(polygon([[x - h, .55], [x + h, .55], [x + h, .63], [x + w, .63], [x + w, .8],
          [x + h, .8], [x + h, .88], [x - h, .88], [x - h, .8], [x - w, .8], [x - w, .63], [x - h, .63]], 'inspection-track-I-section'));
      }
      section.options.trackHeightOverD = .33;
      section.options.trackWidthOverD = .33 * 130 / 320;
      section.notes.push('Two slender I tracks sit close to the flat soffit on short mounts. H:W=320:130 follows the cited detail; relative to that paper\'s H/D=320/3000, the CFD envelope is enlarged about 3.1x. Flanges and web are additionally thickened for the D=12 grid. Track x=+-2.35D is a teaching placement on the streamlined girder, not an as-built dimension.');
      if (shape === 'guide') {
        // One inner-side plate per track. Based on Zhang et al. (2015),
        // Table 2's 23-degree layout; dimensions here are illustrative.
        // Both the soffit passage and track gap survive the D=12 grid.
        const angle = 23 * Math.PI / 180, thickness = .12;
        const dx = .55, dy = dx * Math.tan(angle);
        const nx = -.5 * thickness * Math.sin(angle), ny = .5 * thickness * Math.cos(angle);
        for (const side of [-1, 1]) {
          const x0 = 1.4, y0 = .74, x1 = x0 + dx, y1 = y0 + dy;
          section.parts.push(polygon([[side * (x0 + nx), y0 + ny], [side * (x0 - nx), y0 - ny],
            [side * (x1 - nx), y1 - ny], [side * (x1 + nx), y1 + ny]], 'inspection-track-inner-guide-plate'));
        }
        section.options.guideAngleDegrees = 23;
        section.notes.push('Guide case includes the same two I tracks plus two separate inner-side plates, sloping 23 degrees downward toward the tracks. Plates do not replace or modify the main girder.');
      }
    }
    const points = section.bodies.flat();
    for (const part of section.parts) {
      if (part.type === 'circle') points.push({ x: part.x - part.r, y: part.y - part.r }, { x: part.x + part.r, y: part.y + part.r });
      else points.push(...part.points);
    }
    section.bounds = { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
    return section;
  }
  const api = { VERSION, SHAPES, create, contains, containsPart, pointInPolygon };
  root.BridgeSection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
