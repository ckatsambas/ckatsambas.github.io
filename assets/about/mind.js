/* Mind Galaxy: a particle hologram head that dissolves into seven interest clusters.
   Plain WebGL, no libraries. Falls back to a simple grid without WebGL or with reduced motion. */
(function () {
  "use strict";
  var root = document.getElementById("mind");
  if (!root) return;
  var BASE = new URL(".", document.currentScript.src).href;
  var stage = root.querySelector(".mind-stage");
  var canvas = root.querySelector(".mind-canvas");
  var stars = Array.prototype.slice.call(root.querySelectorAll(".mind-star"));
  var enterBtn = root.querySelector(".mind-enter");
  var backBtn = root.querySelector(".mind-back");
  var hint = root.querySelector(".mind-hint");
  var panel = root.querySelector(".mind-panel");
  var panelBody = root.querySelector(".mind-panel-body");
  var KEYS = stars.map(function (b) { return b.dataset.k; });
  var COLORS = [[0.95, 0.93, 0.88], [1.0, 0.55, 0.38], [0.49, 0.94, 0.69], [0.56, 0.86, 1.0],
                [0.77, 0.61, 1.0], [1.0, 0.82, 0.48], [1.0, 0.48, 0.78]];
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var panelCleanup = null;

  /* ---------- panels (shared by the 3D and the static version) ---------- */
  function openPanel(k) {
    var tpl = root.querySelector('template[data-k="' + k + '"]');
    if (!tpl) return;
    if (panelCleanup) { panelCleanup(); panelCleanup = null; }
    panelBody.innerHTML = "";
    panelBody.appendChild(tpl.content.cloneNode(true));
    panel.hidden = false;
    panel.dataset.k = k;
    root.classList.add("mind--panel");
    stars.forEach(function (b) { b.classList.toggle("is-on", b.dataset.k === k); b.setAttribute("aria-pressed", b.dataset.k === k); });
    requestAnimationFrame(function () { panel.classList.add("is-open"); });
    var h = panelBody.querySelector("h3");
    if (h) h.focus({ preventScroll: true });
    panelCleanup = (PANELS[k] || function () { return null; })(panelBody) || null;
    if (gx) gx.select(KEYS.indexOf(k));
  }
  function closePanel() {
    if (panel.hidden) return;
    if (panelCleanup) { panelCleanup(); panelCleanup = null; }
    panel.classList.remove("is-open");
    root.classList.remove("mind--panel");
    var k = panel.dataset.k;
    stars.forEach(function (b) { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); });
    setTimeout(function () { if (!panel.classList.contains("is-open")) { panel.hidden = true; panelBody.innerHTML = ""; } }, 320);
    if (gx) gx.select(-1);
    var b = root.querySelector('.mind-star[data-k="' + k + '"]');
    if (b) b.focus({ preventScroll: true });
  }
  stars.forEach(function (b) {
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", function () {
      if (panel.dataset.k === b.dataset.k && !panel.hidden) closePanel(); else openPanel(b.dataset.k);
    });
  });
  root.querySelector(".mind-close").addEventListener("click", closePanel);
  root.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!panel.hidden) closePanel(); else if (root.classList.contains("mind--immersive") && exitMind) exitMind();
  });
  var exitMind = null;

  var PANELS = {
    draw: drawPanel,
    gym: function (el) {
      el.querySelectorAll("[data-count]").forEach(function (n) { countUp(n, +n.dataset.count, 900); });
      requestAnimationFrame(function () { el.querySelector(".prs").classList.add("is-in"); });
      return window.MindHolo ? window.MindHolo.gym(el.querySelector(".holo")) : null;
    },
    run: function (el) { return window.MindHolo ? window.MindHolo.run(el.querySelector(".holo")) : null; },
    research: flockPanel,
    music: function (el) {
      var btn = el.querySelector(".song-load");
      btn.addEventListener("click", function () {
        var f = document.createElement("iframe");
        f.src = "https://open.spotify.com/embed/track/6Qyc6fS4DsZjB2mRW9DsQs?utm_source=generator&theme=0";
        f.width = "100%"; f.height = "152"; f.loading = "lazy"; f.title = "Iris by The Goo Goo Dolls on Spotify";
        f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
        f.style.border = "0"; f.style.borderRadius = "12px";
        btn.replaceWith(f);
      });
    }
  };

  function countUp(node, to, ms) {
    if (reduced) { node.textContent = to; return; }
    var t0 = performance.now();
    (function step(t) {
      var p = Math.min(1, (t - t0) / ms);
      node.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---------- drawing panel: particles trace the piece, then the original fades in ---------- */
  var DRAWINGS = 6, drawIdx = 0, drawCache = {};
  function loadDrawing(i) {
    if (drawCache[i]) return drawCache[i];
    var n = ("0" + (i + 1)).slice(-2);
    var pts = fetch(BASE + "d" + n + ".bin").then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var h = new Uint16Array(buf, 0, 3);
      return { n: h[0], w: h[1], h: h[2], q: new Uint8Array(buf, 6) };
    });
    var img = new Promise(function (res) {
      var im = new Image(); im.decoding = "async"; im.onload = function () { res(im); }; im.onerror = function () { res(null); };
      im.src = BASE + "d" + n + ".jpg";
    });
    drawCache[i] = Promise.all([pts, img]);
    return drawCache[i];
  }
  function drawPanel(el) {
    var cv = el.querySelector(".sketch-canvas"), ctx = cv.getContext("2d");
    var count = el.querySelector(".sk-count"), raf = 0, alive = true, token = 0;
    cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    function show(i) {
      drawIdx = (i + DRAWINGS) % DRAWINGS;
      count.textContent = ("0" + (drawIdx + 1)).slice(-2) + " / 0" + DRAWINGS;
      var my = ++token;
      cancelAnimationFrame(raf);
      loadDrawing(drawIdx).then(function (r) { if (alive && my === token) play(r[0], r[1]); });
      loadDrawing((drawIdx + 1) % DRAWINGS);
    }
    function play(d, img) {
      var box = cv.parentNode.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var aspect = d.h / d.w;
      var w = Math.max(200, box.width), h = Math.min(w * aspect, window.innerHeight * 0.52);
      w = h / aspect;
      cv.style.width = w + "px"; cv.style.height = h + "px";
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var acc = document.createElement("canvas"); acc.width = cv.width; acc.height = cv.height;
      var actx = acc.getContext("2d"); actx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var sx = w / 255, sy = h / 255, q = d.q, N = d.n;
      var traceMs = reduced ? 0 : 2600, fadeMs = reduced ? 0 : 900, t0 = performance.now(), drawn = 0;
      function frame(t) {
        var e = t - t0;
        var target = traceMs ? Math.min(N, Math.floor(N * Math.pow(Math.min(1, e / traceMs), 0.85))) : N;
        actx.fillStyle = "rgba(170,225,255,0.85)";
        for (; drawn < target; drawn++) {
          var o = drawn * 3, s = 0.6 + (255 - q[o + 2]) / 255 * 1.1;
          actx.fillRect(q[o] * sx - s / 2, q[o + 1] * sy - s / 2, s, s);
        }
        ctx.clearRect(0, 0, w, h);
        var f = traceMs ? Math.max(0, Math.min(1, (e - traceMs) / fadeMs)) : 1;
        ctx.globalAlpha = 1 - f * 0.85; ctx.drawImage(acc, 0, 0, w, h);
        if (drawn < N && drawn > 0) {
          var p = (drawn - 1) * 3;
          ctx.globalAlpha = 1; ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(q[p] * sx, q[p + 1] * sy, 2.4, 0, 7); ctx.fill();
        }
        if (img && f > 0) { ctx.globalAlpha = f; ctx.drawImage(img, 0, 0, w, h); }
        ctx.globalAlpha = 1;
        if (f < 1 && alive) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }
    el.querySelector(".sk-prev").addEventListener("click", function () { show(drawIdx - 1); });
    el.querySelector(".sk-next").addEventListener("click", function () { show(drawIdx + 1); });
    el.querySelector(".sk-replay").addEventListener("click", function () { show(drawIdx); });
    show(drawIdx);
    return function () { alive = false; cancelAnimationFrame(raf); };
  }

  /* ---------- research panel: a small boids model ---------- */
  function flockPanel(el) {
    var cv = el.querySelector(".flock-canvas"), ctx = cv.getContext("2d");
    var w = cv.parentNode.clientWidth, h = Math.round(w * 0.55), dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var B = [], n = w < 400 ? 55 : 80, mx = -999, my = -999, raf = 0;
    for (var i = 0; i < n; i++) B.push({ x: Math.random() * w, y: Math.random() * h, vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1 });
    function move(e) { var r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; }
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerleave", function () { mx = my = -999; });
    function step() {
      ctx.fillStyle = "rgba(4,10,16,0.35)"; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < n; i++) {
        var b = B[i], ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, c = 0;
        for (var j = 0; j < n; j++) {
          if (i === j) continue;
          var o = B[j], dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < 2500) { c++; cx += o.x; cy += o.y; ax += o.vx; ay += o.vy; if (d2 < 300) { sx -= dx; sy -= dy; } }
        }
        if (c) { b.vx += (ax / c - b.vx) * 0.05 + (cx / c - b.x) * 0.0008; b.vy += (ay / c - b.vy) * 0.05 + (cy / c - b.y) * 0.0008; }
        b.vx += sx * 0.012; b.vy += sy * 0.012;
        var pdx = b.x - mx, pdy = b.y - my, pd = pdx * pdx + pdy * pdy;
        if (pd < 4900) { b.vx += pdx / Math.sqrt(pd + 1) * 0.6; b.vy += pdy / Math.sqrt(pd + 1) * 0.6; }
        var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1, lim = Math.max(1.1, Math.min(2.6, sp));
        b.vx = b.vx / sp * lim; b.vy = b.vy / sp * lim;
        b.x = (b.x + b.vx + w) % w; b.y = (b.y + b.vy + h) % h;
        ctx.fillStyle = "rgba(143,220,255,0.9)";
        ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, 7); ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(step);
    }
    ctx.fillStyle = "#040a10"; ctx.fillRect(0, 0, w, h);
    step();
    return function () { cancelAnimationFrame(raf); };
  }

  /* ---------- WebGL galaxy ---------- */
  var gl = null;
  try { gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: false }); } catch (e) { gl = null; }
  if (!gl || reduced) {
    root.classList.add("mind--static");
    return;
  }
  var gx = null;

  var VS = [
    "attribute vec3 aFace; attribute vec3 aGal; attribute vec3 aCol; attribute vec4 aR; attribute vec2 aW;",
    "uniform mat3 uFaceRot; uniform mat3 uGalRot; uniform vec3 uCam; uniform vec2 uFaceOff;",
    "uniform float uP, uTime, uF, uAspect, uPx, uScan, uGlitch, uGy, uHot, uSel;",
    "varying vec3 vCol; varying float vA;",
    "void main(){",
    "  float e = clamp((uP - aR.x) / 0.65, 0.0, 1.0); e = e*e*(3.0-2.0*e);",
    "  vec3 f = aFace;",
    "  if (abs(f.y - uGy) < 0.05) f.x += 0.06 * uGlitch;",
    "  vec3 fp = uFaceRot * f * 0.82 + vec3(uFaceOff, 0.0);",
    "  vec3 gp = uGalRot * aGal;",
    "  float b = sin(3.14159 * e);",
    "  vec3 swirl = vec3(sin(aR.x*90.0 + uTime*0.7), cos(aR.x*70.0), sin(aR.x*50.0 + 1.0)) * b * (0.5 + aR.y*0.4);",
    "  vec3 w = mix(fp, gp, e) + swirl;",
    "  vec3 v = w - uCam; float zc = -v.z;",
    "  gl_Position = zc > 0.05 ? vec4(v.x*uF/uAspect, v.y*uF, 0.0, zc) : vec4(2.0, 2.0, 2.0, 1.0);",
    "  float scan = exp(-pow((aFace.y - uScan) * 9.0, 2.0));",
    "  float faceA = (0.42 + aW.x*0.9) * (1.0 + 1.6*scan) * (1.0 - 0.25*uGlitch);",
    "  float tw = 0.7 + 0.3*sin(uTime*1.7 + aR.x*61.0);",
    "  float galA = (0.35 + aW.y*1.1) * tw;",
    "  float hot = (abs(aR.z - uHot) < 0.5) ? 1.0 : 0.0;",
    "  float sel = (uSel > -0.5 && abs(aR.z - uSel) > 0.5) ? 0.3 : 1.0;",
    "  galA *= (1.0 + 0.9*hot) * sel;",
    "  vec3 fc = mix(vec3(0.45,0.80,1.0), vec3(0.85,0.97,1.0), aW.x);",
    "  vCol = mix(fc, aCol, e);",
    "  vA = mix(faceA, galA, e);",
    "  float size = aR.y * mix(1.0 + aW.x*0.6, 1.0 + aW.y*1.4 + hot*0.6, e);",
    "  gl_PointSize = max(1.0, size * uPx / zc);",
    "}"].join("\n");
  var FS = [
    "precision mediump float; varying vec3 vCol; varying float vA;",
    "void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard;",
    "  float a = exp(-d * 16.0) - 0.018; gl_FragColor = vec4(vCol, a * vA); }"].join("\n");

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
  } catch (err) { root.classList.add("mind--static"); return; }
  gl.useProgram(prog);
  var U = {};
  ["uFaceRot", "uGalRot", "uCam", "uFaceOff", "uP", "uTime", "uF", "uAspect", "uPx", "uScan", "uGlitch", "uGy", "uHot", "uSel"]
    .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2832 * r()); }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; }
  function mul(a, b) { // column-major 3x3
    var o = [];
    for (var c = 0; c < 3; c++) for (var r = 0; r < 3; r++)
      o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
    return o;
  }
  function apply(m, v) { return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]]; }

  // Cluster centres on a tilted, uneven ring.
  var CENTERS = [];
  for (var c = 0; c < 7; c++) {
    var a = c / 7 * 6.2832 + 0.3, rr = 1.55 + (c % 2 ? 0.25 : -0.1);
    CENTERS.push([Math.cos(a) * rr, Math.sin(a * 2) * 0.35 + (c - 3) * 0.06, Math.sin(a) * rr]);
  }

  function build(buf) {
    var total = new Uint32Array(buf, 0, 1)[0];
    var mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
    var N = Math.min(total, mobile ? 5200 : 10000);
    var P = new Int16Array(buf, 4, total * 3), Wt = new Uint8Array(buf, 4 + total * 6, total);
    var face = new Float32Array(N * 3), gal = new Float32Array(N * 3), col = new Float32Array(N * 3),
        R = new Float32Array(N * 4), W = new Float32Array(N * 2), r = rnd(42);
    var tilts = CENTERS.map(function (_, i) { return mul(rotX((r() - 0.5) * 1.6), rotY(r() * 6.28)); });
    for (var i = 0; i < N; i++) {
      face[i * 3] = P[i * 3] / 1000; face[i * 3 + 1] = P[i * 3 + 1] / 1000; face[i * 3 + 2] = P[i * 3 + 2] / 1000;
      var u = r(), cl, g, wgal;
      if (u < 0.11) { // dust
        cl = -1;
        var th = r() * 6.2832, rad = 0.6 + Math.pow(r(), 0.6) * 3.4;
        g = [Math.cos(th) * rad, gauss(r) * 0.35, Math.sin(th) * rad];
        col.set([0.55, 0.7, 0.9], i * 3); wgal = r() * 0.25;
      } else if (u < 0.16) { // filaments between neighbouring clusters
        cl = -1;
        var k = Math.floor(r() * 7), A = CENTERS[k], Bc = CENTERS[(k + 1) % 7], t = r(), lift = Math.sin(t * 3.14159) * 0.35;
        g = [A[0] + (Bc[0] - A[0]) * t + gauss(r) * 0.04, A[1] + (Bc[1] - A[1]) * t + lift + gauss(r) * 0.04, A[2] + (Bc[2] - A[2]) * t + gauss(r) * 0.04];
        col.set([0.5, 0.75, 1.0], i * 3); wgal = 0.15 + r() * 0.2;
      } else { // a small spiral nebula per interest
        cl = Math.floor(r() * 7);
        var rad2 = Math.abs(gauss(r)) * 0.3 + (r() < 0.25 ? 0 : 0.04);
        var arm = (r() < 0.5 ? 0 : 3.14159), ang = rad2 * 7 + arm + gauss(r) * 0.35;
        var lp = apply(tilts[cl], [Math.cos(ang) * rad2, gauss(r) * 0.03, Math.sin(ang) * rad2]);
        var C = CENTERS[cl];
        g = [C[0] + lp[0], C[1] + lp[1], C[2] + lp[2]];
        var cc = COLORS[cl], mixw = Math.min(1, rad2 * 2.6);
        col.set([cc[0] + (1 - cc[0]) * (1 - mixw) * 0.6, cc[1] + (1 - cc[1]) * (1 - mixw) * 0.6, cc[2] + (1 - cc[2]) * (1 - mixw) * 0.6], i * 3);
        wgal = Math.max(0.12, 1 - rad2 * 2.4);
      }
      gal.set(g, i * 3);
      R.set([r() * 0.35, 0.7 + r() * 0.9, cl, 0], i * 4);
      W.set([Wt[i] / 255, wgal], i * 2);
    }
    function attr(name, data, size) {
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      var l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
    }
    attr("aFace", face, 3); attr("aGal", gal, 3); attr("aCol", col, 3); attr("aR", R, 4); attr("aW", W, 2);
    return N;
  }

  var N = 0, W = 1, H = 1, dpr = 1, running = false, visible = false, started = false;
  var S = {
    p: 0, pT: 0, mode: "face",
    fyaw: 0, fpitch: 0, fyawT: 0, fpitchT: 0,
    yaw: 0.4, pitch: 0.32, vyaw: 0, vpitch: 0, yawT: null,
    cam: [0, 0, 3.7], camT: [0, 0, 3.7],
    hot: -1, sel: -1, glitch: 0, gy: 0, nextGlitch: 2
  };
  var t0 = performance.now(), last = t0, dragging = false, moved = 0, lx = 0, ly = 0, idle = 0;

  function resize() {
    var r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    gl.viewport(0, 0, canvas.width, canvas.height);
    layoutTargets();
  }
  function wide() { return W / H > 1.15 && W > 760; }
  function faceOffset() { return wide() ? [0.95, -0.05] : [0, -0.42]; }
  function layoutTargets() {
    if (S.mode === "face") { S.camT = [0, 0, wide() ? 3.7 : 4.3]; return; }
    var far = wide() ? 5.2 : 7.0;
    if (S.sel < 0) { S.camT = [0, 0.15, far]; return; }
    // Frame the chosen cluster: left of the panel on wide screens, above the sheet on phones.
    var yaw = S.yawT === null ? S.yaw : S.yawT;
    var Cw = apply(mul(rotX(0.25), rotY(yaw)), CENTERS[S.sel]);
    S.camT = wide() ? [Cw[0] + 0.62, Cw[1] + 0.02, Cw[2] + 2.3] : [Cw[0], Cw[1] - 0.55, Cw[2] + 3.0];
  }

  function project(v) {
    var F = 1 / Math.tan(0.31), aspect = W / H;
    var x = v[0] - S.cam[0], y = v[1] - S.cam[1], z = v[2] - S.cam[2], zc = -z;
    if (zc < 0.05) return null;
    return [(x * F / aspect / zc * 0.5 + 0.5) * W, (0.5 - y * F / zc * 0.5) * H, zc];
  }
  function galRot() { return mul(rotX(S.pitch), rotY(S.yaw)); }

  /* ---------- immersive mode: the stage grows from its place on the page to fill the window ---------- */
  var fsBtn = root.querySelector(".mind-fs"), immersive = false, animMs = reduced ? 0 : 650;
  function insetOf(r) {
    return "inset(" + Math.max(0, r.top) + "px " + Math.max(0, window.innerWidth - r.right) + "px " +
      Math.max(0, window.innerHeight - r.bottom) + "px " + Math.max(0, r.left) + "px round 0px)";
  }
  function lockScroll(on) {
    var de = document.documentElement;
    if (on) {
      var sb = window.innerWidth - de.clientWidth;
      de.style.overflow = "hidden"; if (sb > 0) de.style.paddingRight = sb + "px";
    } else { de.style.overflow = ""; de.style.paddingRight = ""; }
  }
  function goImmersive() {
    if (immersive) return;
    immersive = true;
    var r = stage.getBoundingClientRect();
    root.style.height = root.offsetHeight + "px";           // keep the page from jumping underneath
    lockScroll(true);
    stage.style.transition = "none";
    stage.style.clipPath = insetOf(r);
    root.classList.add("mind--immersive");
    resize();
    void stage.offsetWidth;
    stage.style.transition = "clip-path " + animMs + "ms cubic-bezier(.7,0,.2,1)";
    stage.style.clipPath = "inset(0px 0px 0px 0px round 0px)";
    try { if (!history.state || !history.state.mind) history.pushState({ mind: 1 }, ""); } catch (e) {}
    if (fsBtn) fsBtn.hidden = !(document.fullscreenEnabled && window.matchMedia("(pointer: fine)").matches);
  }
  function leaveImmersive() {
    if (!immersive) return;
    immersive = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    if (fsBtn) fsBtn.hidden = true;
    var target = root.getBoundingClientRect();
    stage.style.transition = "clip-path " + animMs + "ms cubic-bezier(.7,0,.2,1)";
    stage.style.clipPath = insetOf(target);
    setTimeout(function () {
      if (immersive) return;
      stage.style.transition = ""; stage.style.clipPath = "";
      root.classList.remove("mind--immersive");
      root.style.height = "";
      lockScroll(false);
      resize();
    }, animMs);
  }
  if (fsBtn) fsBtn.addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else stage.requestFullscreen().catch(function () {});
  });
  document.addEventListener("fullscreenchange", function () {
    if (fsBtn) fsBtn.classList.toggle("is-on", !!document.fullscreenElement);
    setTimeout(resize, 50);
  });
  // The phone's back gesture leaves the galaxy instead of the page.
  window.addEventListener("popstate", function () { if (immersive) leave(true); });
  exitMind = function () { requestLeave(); };
  function requestLeave() {
    var ours = false;
    try { ours = !!(history.state && history.state.mind); } catch (e) {}
    if (ours) history.back(); else leave(true);
  }

  function enter() {
    if (S.mode === "galaxy") return;
    goImmersive();
    S.mode = "galaxy"; S.pT = 1; S.yawT = null;
    root.classList.add("mind--galaxy");
    backBtn.hidden = false; hint.hidden = false;
    layoutTargets();
    setTimeout(function () { stars[0] && stars[0].focus({ preventScroll: true }); }, 50);
  }
  function leave() {
    closePanel();
    leaveImmersive();
    S.mode = "face"; S.pT = 0;
    root.classList.remove("mind--galaxy");
    backBtn.hidden = true; hint.hidden = true;
    layoutTargets();
    enterBtn.focus({ preventScroll: true });
  }
  gx = {
    select: function (i) {
      if (S.mode !== "galaxy") enter();
      S.sel = i;
      if (i >= 0) {
        var C = CENTERS[i];
        // Turn the ring so the chosen cluster faces the camera.
        var target = Math.atan2(-C[0], C[2]);
        var cur = S.yaw, d = ((target - cur + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        S.yawT = cur + d; S.vyaw = 0;
      } else S.yawT = null;
      layoutTargets();
    }
  };
  enterBtn.addEventListener("click", enter);
  backBtn.addEventListener("click", requestLeave);

  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; moved = 0; lx = e.clientX; ly = e.clientY;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", function (e) {
    var r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    S.fyawT = ((x / W) - (wide() ? 0.72 : 0.5)) * 0.9; S.fpitchT = ((y / H) - 0.5) * 0.5;
    if (dragging && S.mode === "galaxy") {
      var dx = e.clientX - lx, dy = e.clientY - ly; moved += Math.abs(dx) + Math.abs(dy);
      S.vyaw = dx * 0.005; S.vpitch = dy * 0.004; S.yaw += S.vyaw; S.pitch += S.vpitch;
      S.pitch = Math.max(-0.6, Math.min(1.1, S.pitch)); S.yawT = null; idle = 0;
    }
    lx = e.clientX; ly = e.clientY;
    if (S.mode === "galaxy" && !dragging) S.hot = pick(x, y);
    canvas.style.cursor = S.mode === "face" ? "pointer" : (S.hot >= 0 ? "pointer" : "grab");
  });
  canvas.addEventListener("pointerup", function (e) {
    dragging = false;
    if (moved > 6) return;
    if (S.mode === "face") { enter(); return; }
    var r = stage.getBoundingClientRect(), k = pick(e.clientX - r.left, e.clientY - r.top);
    if (k >= 0) openPanel(KEYS[k]); else if (!panel.hidden) closePanel();
  });
  canvas.addEventListener("pointerleave", function () { S.hot = -1; S.fyawT = 0; S.fpitchT = 0; });
  function pick(x, y) {
    var m = galRot(), best = -1, bd = 70 * 70;
    for (var i = 0; i < 7; i++) {
      var p = project(apply(m, CENTERS[i])); if (!p) continue;
      var d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  stars.forEach(function (b, i) {
    b.addEventListener("mouseenter", function () { S.hot = i; });
    b.addEventListener("mouseleave", function () { S.hot = -1; });
    b.addEventListener("focus", function () { if (S.mode === "galaxy") S.hot = i; });
    b.addEventListener("blur", function () { S.hot = -1; });
  });

  function lerp(a, b, k) { return a + (b - a) * k; }
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000), t = (now - t0) / 1000; last = now; idle += dt;
    var k = 1 - Math.pow(0.0015, dt);
    // Morph speed is constant so the dissolve always takes about 2.2 s.
    S.p += Math.sign(S.pT - S.p) * Math.min(Math.abs(S.pT - S.p), dt / 2.2);
    S.fyaw = lerp(S.fyaw, S.fyawT + Math.sin(t * 0.4) * 0.12, k * 0.5);
    S.fpitch = lerp(S.fpitch, S.fpitchT + Math.sin(t * 0.3) * 0.04, k * 0.5);
    if (S.mode === "galaxy") {
      if (S.yawT !== null) S.yaw = lerp(S.yaw, S.yawT, k * 0.6);
      else if (!dragging) {
        S.yaw += S.vyaw; S.pitch += S.vpitch; S.vyaw *= 0.93; S.vpitch *= 0.9;
        if (S.sel < 0 && idle > 1.5) S.yaw += dt * 0.06;
      }
      S.pitch = lerp(S.pitch, Math.max(-0.6, Math.min(1.1, S.pitch)), 0.2);
      if (S.sel >= 0 && !dragging) S.pitch = lerp(S.pitch, 0.25, k * 0.4);
    }
    for (var j = 0; j < 3; j++) S.cam[j] = lerp(S.cam[j], S.camT[j], k * 0.55);
    // Occasional hologram glitch.
    if (t > S.nextGlitch) { S.glitch = 1; S.gy = Math.random() * 2 - 1.2; S.nextGlitch = t + 2.5 + Math.random() * 4; }
    S.glitch = Math.max(0, S.glitch - dt * 9);

    var F = 1 / Math.tan(0.31), off = faceOffset();
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.uniformMatrix3fv(U.uFaceRot, false, mul(rotX(S.fpitch), rotY(S.fyaw)));
    gl.uniformMatrix3fv(U.uGalRot, false, galRot());
    gl.uniform3fv(U.uCam, S.cam);
    gl.uniform2fv(U.uFaceOff, off);
    gl.uniform1f(U.uP, S.p * 1.35);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uF, F);
    gl.uniform1f(U.uAspect, W / H);
    gl.uniform1f(U.uPx, (H * dpr) / 120);
    gl.uniform1f(U.uScan, 1.25 - ((t * 0.45) % 1) * 2.8);
    gl.uniform1f(U.uGlitch, S.glitch);
    gl.uniform1f(U.uGy, S.gy);
    gl.uniform1f(U.uHot, S.hot);
    gl.uniform1f(U.uSel, S.sel);
    gl.drawArrays(gl.POINTS, 0, N);

    // Float the interest labels next to their clusters.
    var m = galRot(), show = S.p > 0.8;
    for (var i = 0; i < 7; i++) {
      var p = show ? project(apply(m, CENTERS[i])) : null, b = stars[i];
      if (!p) { b.style.transform = ""; continue; }
      var front = Math.max(0.35, Math.min(1, 1.6 - p[2] / 6));
      var lx2 = Math.max(6, Math.min(W - b.offsetWidth - 6, p[0] + 14)), ly2 = Math.max(58, Math.min(H - b.offsetHeight - 6, p[1] - 12));
      b.style.transform = "translate(" + lx2.toFixed(1) + "px," + ly2.toFixed(1) + "px)";
      b.style.opacity = (S.sel >= 0 && S.sel !== i ? 0.45 : front).toFixed(2);
    }
    requestAnimationFrame(frame);
  }
  function setRunning(on) {
    if (on === running || !started) return;
    running = on;
    if (on) { last = performance.now(); requestAnimationFrame(frame); }
  }

  function start() {
    if (started) return;
    started = true;
    root.classList.add("mind--loading");
    fetch(BASE + "head.bin").then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) {
        N = build(buf);
        root.classList.remove("mind--loading");
        root.classList.add("mind--live");
        resize();
        S.cam = S.camT.slice();
        setRunning(visible && !document.hidden);
      })
      .catch(function () { root.classList.remove("mind--loading"); root.classList.add("mind--static"); });
  }
  var io = new IntersectionObserver(function (es) {
    visible = es[0].isIntersecting;
    if (visible) start();
    setRunning(visible && !document.hidden);
  }, { rootMargin: "300px 0px" });
  io.observe(stage);
  document.addEventListener("visibilitychange", function () { setRunning(visible && !document.hidden); });
  window.addEventListener("resize", function () { if (started) resize(); });
  canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); running = false; root.classList.add("mind--static"); });
})();
