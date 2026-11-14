/* Particle hologram figures for the Gym and Running panels.
   A simple jointed body (forward kinematics) is covered in points and drawn on a 2D canvas. */
(function () {
  "use strict";
  var D = Math.PI / 180;

  // 3x3 rotation helpers (row-major).
  function rx(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function ry(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rz(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function mm(a, b) {
    var o = new Array(9);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
  }
  function mv(m, x, y, z) { return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z]; }
  function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  /* Skeleton: the figure faces +z, its left is +x, y is up. Lengths in metres.
     shape: [type, len, rx0, rz0, rx1, rz1, bump] for tubes, or ellipsoids [type, cy, rx, ry, rz]. */
  var BONES = [
    { n: "pelvis", p: -1, off: [0, 0, 0], shape: ["ell", 0.04, 0.17, 0.11, 0.11] },
    { n: "spine", p: 0, off: [0, 0.06, 0], shape: ["tube", 0.5, 0.15, 0.1, 0.2, 0.125, 0.06], up: 1 },
    { n: "neck", p: 1, off: [0, 0.5, 0], shape: ["tube", 0.1, 0.055, 0.055, 0.05, 0.05, 0], up: 1 },
    { n: "head", p: 2, off: [0, 0.1, 0], shape: ["ell", 0.12, 0.095, 0.125, 0.11] },
    { n: "uarmL", p: 1, off: [0.2, 0.44, 0], shape: ["tube", 0.3, 0.055, 0.058, 0.042, 0.045, 0.18], side: 1 },
    { n: "farmL", p: 4, off: [0, -0.3, 0], shape: ["tube", 0.27, 0.045, 0.048, 0.03, 0.032, 0.12] },
    { n: "handL", p: 5, off: [0, -0.27, 0], shape: ["ell", -0.05, 0.03, 0.055, 0.042] },
    { n: "uarmR", p: 1, off: [-0.2, 0.44, 0], shape: ["tube", 0.3, 0.055, 0.058, 0.042, 0.045, 0.18], side: -1 },
    { n: "farmR", p: 7, off: [0, -0.3, 0], shape: ["tube", 0.27, 0.045, 0.048, 0.03, 0.032, 0.12] },
    { n: "handR", p: 8, off: [0, -0.27, 0], shape: ["ell", -0.05, 0.03, 0.055, 0.042] },
    { n: "thighL", p: 0, off: [0.095, 0, 0], shape: ["tube", 0.45, 0.085, 0.09, 0.055, 0.058, 0.08] },
    { n: "shinL", p: 10, off: [0, -0.45, 0], shape: ["tube", 0.44, 0.058, 0.062, 0.035, 0.038, 0.14] },
    { n: "footL", p: 11, off: [0, -0.44, 0], shape: ["tube", 0.2, 0.04, 0.03, 0.045, 0.02, 0], fwd: 1 },
    { n: "thighR", p: 0, off: [-0.095, 0, 0], shape: ["tube", 0.45, 0.085, 0.09, 0.055, 0.058, 0.08] },
    { n: "shinR", p: 13, off: [0, -0.45, 0], shape: ["tube", 0.44, 0.058, 0.062, 0.035, 0.038, 0.14] },
    { n: "footR", p: 14, off: [0, -0.44, 0], shape: ["tube", 0.2, 0.04, 0.03, 0.045, 0.02, 0], fwd: 1 },
    { n: "deltL", p: 4, off: [0, -0.02, 0], shape: ["ell", -0.02, 0.07, 0.07, 0.075] },
    { n: "deltR", p: 7, off: [0, -0.02, 0], shape: ["ell", -0.02, 0.07, 0.07, 0.075] }
  ];
  var IDX = {}; BONES.forEach(function (b, i) { IDX[b.n] = i; });

  function sampleBody(n, r, extra) {
    var area = BONES.map(function (b) {
      var s = b.shape;
      if (s[0] === "ell") return 4 * Math.PI * (s[2] * s[3] + s[2] * s[4] + s[3] * s[4]) / 3;
      return Math.PI * (s[2] + s[3] + s[4] + s[5]) / 2 * s[1];
    });
    var tot = area.reduce(function (a, b) { return a + b; }, 0);
    var P = [], B = [], K = [];
    BONES.forEach(function (b, bi) {
      var s = b.shape, m = Math.round(n * area[bi] / tot);
      for (var i = 0; i < m; i++) {
        var x, y, z, kind = 0;
        if (s[0] === "ell") {
          var u = r() * 2 - 1, th = r() * 6.2832, q = Math.sqrt(1 - u * u);
          x = q * Math.cos(th) * s[2]; y = s[1] + u * s[3]; z = q * Math.sin(th) * s[4];
        } else {
          var t = r(), ring = r() < 0.38;
          if (ring) { t = Math.round(t * 7) / 7; kind = 1; }
          var cap = Math.min(1, Math.min(t, 1 - t) * 7 + 0.45);
          var bump = 1 + s[6] * Math.sin(Math.PI * Math.min(1, t * 1.25));
          var a = r() * 6.2832, rxx = lerp(s[2], s[4], t) * bump * cap, rzz = lerp(s[3], s[5], t) * bump * cap;
          var along = t * s[1];
          if (b.fwd) { x = Math.cos(a) * rxx; y = Math.sin(a) * rzz - 0.02; z = along - 0.04; }
          else { x = Math.cos(a) * rxx; z = Math.sin(a) * rzz; y = b.up ? along : -along; }
        }
        P.push(x, y, z); B.push(bi); K.push(kind);
      }
    });
    (extra || []).forEach(function (e) { for (var i = 0; i < e.pts.length; i += 3) { P.push(e.pts[i], e.pts[i + 1], e.pts[i + 2]); B.push(IDX[e.bone]); K.push(2); } });
    return { p: new Float32Array(P), b: new Uint8Array(B), k: new Uint8Array(K), n: B.length };
  }

  function dumbbell(r) {
    var pts = [];
    for (var i = 0; i < 260; i++) {
      var u = r();
      if (u < 0.3) { var t = r() * 0.28 - 0.14, a = r() * 6.28; pts.push(t, -0.06 + Math.cos(a) * 0.016, Math.sin(a) * 0.016); }
      else {
        var side = r() < 0.5 ? -1 : 1, rad = Math.sqrt(r()) * 0.075, a2 = r() * 6.28, w = 0.09 + r() * 0.05;
        if (r() < 0.6) rad = 0.075;
        pts.push(side * w, -0.06 + Math.cos(a2) * rad, Math.sin(a2) * rad);
      }
    }
    return pts;
  }

  /* Pose: angles in degrees, with names that read like anatomy. Converted to bone rotations here. */
  function solve(pose) {
    var R = new Array(BONES.length), O = new Array(BONES.length);
    var root = mm(ry((pose.turn || 0) * D), rx((pose.pitch || 0) * D));
    function local(i) {
      var b = BONES[i].n, d = pose;
      switch (b) {
        case "spine": return mm(ry((d.twist || 0) * D), rx((d.lean || 0) * D));
        case "neck": return rx((d.neck || 0) * D);
        case "uarmL": return mm(rz((d.abdL || 6) * D), rx(-(d.shL || 0) * D));
        case "uarmR": return mm(rz(-(d.abdR || 6) * D), rx(-(d.shR || 0) * D));
        case "farmL": return rx(-(d.elL || 0) * D);
        case "farmR": return rx(-(d.elR || 0) * D);
        case "handL": return rx(-(d.wrL || 0) * D);
        case "handR": return rx(-(d.wrR || 0) * D);
        case "thighL": return mm(rz((d.hipAbL || 2) * D), rx(-(d.hipL || 0) * D));
        case "thighR": return mm(rz(-(d.hipAbR || 2) * D), rx(-(d.hipR || 0) * D));
        case "shinL": return rx((d.kneeL || 0) * D);
        case "shinR": return rx((d.kneeR || 0) * D);
        case "footL": return rx((d.ankL || 0) * D);
        case "footR": return rx((d.ankR || 0) * D);
        default: return [1, 0, 0, 0, 1, 0, 0, 0, 1];
      }
    }
    for (var i = 0; i < BONES.length; i++) {
      var b = BONES[i], L = local(i);
      if (b.p < 0) { R[i] = mm(root, L); O[i] = [0, 0, 0]; }
      else {
        var o = mv(R[b.p], b.off[0], b.off[1], b.off[2]), po = O[b.p];
        R[i] = mm(R[b.p], L); O[i] = [po[0] + o[0], po[1] + o[1], po[2] + o[2]];
      }
    }
    return { R: R, O: O };
  }

  function lerpPose(a, b, t) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in b) o[k] = lerp(a[k] || 0, b[k], t);
    return o;
  }

  /* ---------- a generic hologram stage ---------- */
  function Stage(el, opts) {
    var cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    cv.className = "holo-canvas"; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", opts.label);
    el.appendChild(cv);
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var W = 0, H = 0, dpr = 1, raf = 0, alive = true, t0 = performance.now();
    var view = { yaw: opts.yaw, pitch: opts.pitch || 0.08, drag: 0 }, dragging = false, lx = 0;
    // Fewer points on small screens keeps phones smooth.
    var body = sampleBody(opts.points || (Math.min(screen.width, screen.height) < 700 ? 2400 : 3400), rnd(11), opts.extra);
    var buf = new Float32Array(body.n * 3);
    function size() {
      var w = el.clientWidth, h = el.clientHeight;
      W = w; H = h > 120 ? h : Math.round(w * (opts.ratio || 0.8));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    }
    size();
    cv.addEventListener("pointerdown", function (e) { dragging = true; lx = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", function (e) { if (dragging) { view.drag += (e.clientX - lx) * 0.01; lx = e.clientX; } });
    cv.addEventListener("pointerup", function () { dragging = false; });
    cv.addEventListener("pointercancel", function () { dragging = false; });

    function project(cam, x, y, z) {
      var c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
      var X = c * x + s * z, Z = -s * x + c * z;
      var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), Y = y - cam.cy;
      var Y2 = cp * Y - sp * Z, Z2 = sp * Y + cp * Z;
      var d = cam.dist - Z2; if (d < 0.2) return null;
      var f = cam.f * H / d;
      return [W / 2 + X * f + cam.ox * W, H * 0.5 - Y2 * f, d];
    }

    function frame(now) {
      if (!alive) return;
      var t = (now - t0) / 1000;
      var st = opts.update(t, reduced);
      var sol = solve(st.pose);
      var p = body.p, bi = body.b, minY = 1e9;
      for (var i = 0; i < body.n; i++) {
        var k = bi[i], R = sol.R[k], O = sol.O[k], x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        var X = O[0] + R[0] * x + R[1] * y + R[2] * z, Y = O[1] + R[3] * x + R[4] * y + R[5] * z, Z = O[2] + R[6] * x + R[7] * y + R[8] * z;
        buf[i * 3] = X; buf[i * 3 + 1] = Y; buf[i * 3 + 2] = Z;
        if (Y < minY) minY = Y;
      }
      var lift = -minY + (st.lift || 0), shiftZ = st.z || 0;
      var cam = { yaw: view.yaw + view.drag + (st.yaw || 0), pitch: view.pitch, cy: opts.cy, dist: opts.dist, f: opts.f || 1.25, ox: opts.ox || 0 };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      if (opts.floor) opts.floor(ctx, function (x, y, z) { return project(cam, x, y, z); }, t, st);
      var scan = 2.1 - ((t * 0.5) % 1) * 2.6, glitchY = st.glitch ? (Math.sin(t * 13) * 0.5 + 1) : -9;
      var body3 = opts.color, acc = opts.accent;
      var fade = st.alpha == null ? 1 : st.alpha;
      for (var j = 0; j < body.n; j++) {
        var X2 = buf[j * 3], Y3 = buf[j * 3 + 1] + lift, Z3 = buf[j * 3 + 2] + shiftZ;
        if (Math.abs(Y3 - glitchY) < 0.04) X2 += 0.05;
        var q = project(cam, X2, Y3, Z3); if (!q) continue;
        var band = Math.exp(-Math.pow((Y3 - scan) * 7, 2));
        var depth = Math.max(0.35, Math.min(1, 1.6 - q[2] / opts.dist));
        var a = (body.k[j] === 1 ? 0.6 : 0.4) * depth * (1 + band * 1.6) * fade;
        var col = body.k[j] === 2 ? acc : body3;
        ctx.fillStyle = "rgba(" + col + "," + Math.min(1, a).toFixed(2) + ")";
        var sz = body.k[j] === 1 ? 1.5 : 1.25;
        ctx.fillRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz);
      }
      ctx.globalCompositeOperation = "source-over";
      if (opts.after) opts.after(ctx, W, H, t, st);
      if (!reduced) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    var onResize = function () { size(); if (reduced) requestAnimationFrame(frame); };
    var ro = window.ResizeObserver ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(el); else window.addEventListener("resize", onResize);
    return function () { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); else window.removeEventListener("resize", onResize); };
  }

  /* ---------- Gym: alternating dumbbell curls ---------- */
  function curlArm(ph) {
    // 0-0.35 lift, 0.35-0.45 squeeze, 0.45-0.9 lower, rest.
    if (ph < 0.35) return ease(ph / 0.35);
    if (ph < 0.45) return 1;
    if (ph < 0.9) return 1 - ease((ph - 0.45) / 0.45);
    return 0;
  }
  function gym(el) {
    var r = rnd(5), dbL = dumbbell(r), dbR = dumbbell(r), rep = el.parentNode.querySelector(".holo-rep");
    var period = 2.4;
    return Stage(el, {
      label: "Hologram of a man doing alternating dumbbell curls",
      yaw: -0.95, cy: 0.95, dist: 3.4, f: 1.35, ratio: 0.82, color: "143,220,255", accent: "255,150,105",
      extra: [{ bone: "handL", pts: dbL }, { bone: "handR", pts: dbR }],
      update: function (t, reduced) {
        var a = reduced ? 0.4 : t / period, l = curlArm(a % 1), rr = curlArm((a + 0.5) % 1);
        if (rep && !reduced) rep.textContent = "Rep " + (Math.floor(a * 2) % 12 + 1) + " / 12";
        return {
          pose: {
            lean: 1.5 + Math.sin(t * 1.3) * 0.8, neck: -2, hipL: 2, hipR: 2, kneeL: 4, kneeR: 4, ankL: -4, ankR: -4,
            hipAbL: 5, hipAbR: 5, abdL: 7, abdR: 7,
            shL: 4 + l * 14, shR: 4 + rr * 14, elL: 8 + l * 132, elR: 8 + rr * 132, wrL: -8 * l, wrR: -8 * rr
          },
          glitch: (t % 5.3) < 0.12,
          yaw: Math.sin(t * 0.25) * 0.25
        };
      },
      floor: function (ctx, P, t) {
        // Projector disc under the figure.
        for (var ring = 0; ring < 3; ring++) {
          var rad = 0.32 + ring * 0.16;
          for (var i = 0; i < 70; i++) {
            var a = i / 70 * 6.2832 + t * (ring % 2 ? 0.3 : -0.2), q = P(Math.cos(a) * rad, 0, Math.sin(a) * rad);
            if (!q) continue;
            ctx.fillStyle = "rgba(143,220,255," + (0.28 - ring * 0.06) + ")";
            ctx.fillRect(q[0] - 0.8, q[1] - 0.8, 1.6, 1.6);
          }
        }
      }
    });
  }

  /* ---------- Running: sprint start, sprint, slow down, forward roll, sit ---------- */
  var MARKS = { pitch: 68, lean: 0, neck: -18, shL: 66, shR: 66, abdL: 8, abdR: 8, elL: 0, elR: 0, wrL: -70, wrR: -70,
                hipL: 138, kneeL: 122, ankL: -25, hipR: 72, kneeR: 108, ankR: 10 };
  var SET = { pitch: 98, lean: 0, neck: -22, shL: 98, shR: 98, abdL: 8, abdR: 8, elL: 0, elR: 0, wrL: -80, wrR: -80,
              hipL: 148, kneeL: 92, ankL: -10, hipR: 84, kneeR: 58, ankR: -15 };
  var TUCK = { lean: 28, neck: 35, twist: 0, hipL: 128, hipR: 128, kneeL: 140, kneeR: 140, ankL: 20, ankR: 20,
               shL: 75, shR: 75, elL: 95, elR: 95, abdL: 12, abdR: 12, wrL: 0, wrR: 0 };
  var SEAT = { pitch: 345, lean: 6, neck: -6, twist: 0, hipL: 76, hipR: 72, kneeL: 14, kneeR: 34, ankL: 18, ankR: 10,
               shL: -52, shR: -52, elL: 4, elR: 4, abdL: 16, abdR: 16, wrL: -60, wrR: -60 };
  function sprint(ph, lean, amp) {
    // Angles are thought of against the vertical, then made relative to the leaning pelvis.
    function leg(t) {
      var s = Math.sin(6.2832 * t);
      var hip = 22 + 58 * amp * s;                                           // high knee drive
      var knee = 16 + 128 * amp * Math.pow(Math.max(0, Math.cos(6.2832 * (t - 0.06))), 1.15); // heel to glute
      var ank = 22 * Math.max(0, Math.cos(6.2832 * t)) - 32 * Math.max(0, Math.sin(6.2832 * (t - 0.6)));
      return [hip + lean, knee, ank];
    }
    var L = leg(ph), R = leg(ph + 0.5);
    function arm(t) { return -62 * amp * Math.sin(6.2832 * t) + 12 + lean; }
    return {
      pitch: lean, lean: 0, neck: -lean * 0.7, twist: 9 * amp * Math.sin(6.2832 * ph), turn: 0,
      hipL: L[0], kneeL: L[1], ankL: L[2], hipR: R[0], kneeR: R[1], ankR: R[2],
      shL: arm(ph + 0.5), shR: arm(ph),
      elL: 90 - 22 * amp * Math.sin(6.2832 * (ph + 0.5)), elR: 90 - 22 * amp * Math.sin(6.2832 * ph),
      abdL: 9, abdR: 9, wrL: 0, wrR: 0
    };
  }
  // Timeline in seconds.
  var T = { set: 1.0, go: 2.0, top: 3.3, slow: 5.0, roll: 6.1, rolled: 7.0, seat: 7.5, fade: 9.8, loop: 10.4 };
  function run(el) {
    var cue = el.parentNode.querySelector(".holo-cue");
    var phase = 0, lastT = 0, dist = 0;
    function state(t) {
      var lt = t % T.loop, dt = Math.max(0, Math.min(0.05, lt - lastT)); lastT = lt;
      if (lt < 0.05) { phase = 0; dist = 0; }
      var pose, speed = 0, label = "", lift = 0, alpha = 1;
      if (lt < T.set) { pose = MARKS; label = "On your marks"; }
      else if (lt < T.go) { pose = lerpPose(MARKS, SET, ease((lt - T.set) / 0.45)); label = "Set"; }
      else if (lt < T.roll) {
        var g = lt - T.go, cad, lean, amp;
        if (lt < T.slow) {
          cad = lerp(2.9, 2.35, ease(g / 1.4));            // drive phase: rapid, low steps
          lean = lerp(50, 12, ease(g / 1.5));
          amp = lerp(0.78, 1, ease(g / 1.1));
          speed = lerp(3, 10.5, ease(g / 1.6));
        } else {
          var d = ease((lt - T.slow) / (T.roll - T.slow));   // ease off: upright, shorter strides
          cad = lerp(2.35, 1.5, d); lean = lerp(12, 2, d); amp = lerp(1, 0.55, d); speed = lerp(10.5, 3.2, d);
        }
        phase += dt * cad;
        var p = sprint(phase, lean, amp);
        // Flight phase: both feet leave the ground between steps.
        lift = 0.07 * amp * Math.max(0, Math.sin(6.2832 * 2 * phase + 0.8));
        pose = lt - T.go < 0.3 ? lerpPose(SET, p, ease((lt - T.go) / 0.3)) : p;
        label = g < 0.7 ? "Go!" : "";
        if (lt > T.roll - 0.3) {                             // gather into a crouch
          var c = ease((lt - (T.roll - 0.3)) / 0.3);
          pose = lerpPose(pose, lerpPose(TUCK, { pitch: 55 }, 1), c);
        }
      } else if (lt < T.rolled) {
        var r = ease((lt - T.roll) / (T.rolled - T.roll));
        pose = lerpPose(TUCK, { pitch: lerp(55, 345, r) }, 1);
        speed = lerp(3, 0.4, r);
      } else if (lt < T.seat) {
        pose = lerpPose(lerpPose(TUCK, { pitch: 345 }, 1), SEAT, ease((lt - T.rolled) / (T.seat - T.rolled)));
        speed = lerp(0.4, 0, ease((lt - T.rolled) / 0.3));
      } else {
        var b = Math.sin((lt - T.seat) * 2.4);
        pose = lerpPose(SEAT, { lean: 6 + b * 1.5, neck: -6 - b }, 1);
        if (lt > T.fade) alpha = 1 - ease((lt - T.fade) / (T.loop - T.fade));
      }
      if (lt < 0.3) alpha = ease(lt / 0.3);
      dist += speed * dt;
      return { pose: pose, dist: dist, label: label, lift: lift, alpha: alpha, glitch: lt > T.fade };
    }
    return Stage(el, {
      label: "Hologram of a sprinter: start from the blocks, sprint, slow down, forward roll and sit",
      yaw: -1.42, pitch: 0.1, cy: 0.7, dist: 4.2, f: 1.2, ratio: 0.66, color: "143,220,255", accent: "124,240,176",
      update: function (t, reduced) {
        var s = reduced ? { pose: sprint(0.15, 12, 1), dist: 0, label: "", lift: 0, alpha: 1 } : state(t);
        if (cue) { cue.textContent = s.label; cue.classList.toggle("is-on", !!s.label); }
        return s;
      },
      floor: function (ctx, P, t, s) {
        var dz = s.dist || 0, a0 = s.alpha == null ? 1 : s.alpha;
        function dot(x, z, a, w) {
          var q = P(x, 0, z); if (!q) return;
          ctx.fillStyle = "rgba(124,240,176," + (a * a0 * Math.max(0, 1 - Math.abs(z) / 6)).toFixed(2) + ")";
          ctx.fillRect(q[0] - w / 2, q[1] - w / 2, w, w);
        }
        var lanes = [-1.83, -0.61, 0.61, 1.83];
        for (var li = 0; li < lanes.length; li++) {
          for (var z = -6; z < 6; z += 0.1) dot(lanes[li], z, 0.22, 1.2);           // lane line (static)
          var o = dz % 1;
          for (var m = -6; m < 7; m++) dot(lanes[li], m - o, 0.8, 2.6);            // metre ticks scroll past
        }
        for (var k = 1; k < 30; k++) {                                              // 10 m marks
          var zz = k * 10 - dz + 0.55; if (zz < -6 || zz > 6) continue;
          for (var x2 = -0.61; x2 <= 0.61; x2 += 0.05) dot(x2, zz, 0.45, 1.4);
        }
        var sz = 0.55 - dz;                                                         // start line
        if (sz > -6) for (var x = -1.83; x <= 1.83; x += 0.04) {
          var q2 = P(x, 0, sz); if (!q2) continue;
          ctx.fillStyle = "rgba(255,255,255," + (0.55 * a0) + ")"; ctx.fillRect(q2[0] - 0.8, q2[1] - 0.8, 1.6, 1.6);
        }
      }
    });
  }

  window.MindHolo = { gym: gym, run: run };
})();
