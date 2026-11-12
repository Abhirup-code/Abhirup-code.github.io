// A moving starfield behind the whole site: stars at three depths drift slowly, twinkle, shift a
// little with the mouse, and now and then a shooting star crosses the sky. Visitors who turn off
// motion keep the still stars drawn in CSS. Star color comes from --star-rgb, so it follows the theme.
(function () {
  if (!window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  canvas.className = "starfield";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  document.documentElement.classList.add("has-starfield");

  var root = document.documentElement;
  var W = 0, H = 0, dpr = 1, rgb = "255,255,255";
  var stars = [], shots = [];
  var mouseX = 0, mouseY = 0, offX = 0, offY = 0;
  var last = 0, nextShot = 1500, running = true, frame = 0;

  function readColor() {
    rgb = getComputedStyle(root).getPropertyValue("--star-rgb").trim() || "255,255,255";
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.min(320, Math.round((W * H) / 5000));
    stars = [];
    for (var i = 0; i < count; i++) {
      var z = [0.3, 0.6, 1][i % 3]; // depth: far stars are small, dim, and slow
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: z,
        r: (Math.random() * 0.8 + 0.4) * z * 1.8,
        phase: Math.random() * Math.PI * 2,
        twinkle: 0.6 + Math.random() * 1.8,
      });
    }
  }

  function shoot() {
    var speed = 0.9 + Math.random() * 0.6; // px per ms
    var angle = Math.PI * (0.72 + Math.random() * 0.12); // heading down and to the left
    shots.push({
      x: W * (0.35 + Math.random() * 0.65),
      y: H * Math.random() * 0.35,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      ttl: 700 + Math.random() * 500,
    });
  }

  function draw(now) {
    if (!running) return;
    var dt = Math.min(now - (last || now), 50);
    last = now;
    if (++frame % 60 === 1) readColor();

    offX += (mouseX - offX) * 0.04;
    offY += (mouseY - offY) * 0.04;
    ctx.clearRect(0, 0, W, H);

    var t = now / 1000;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.x -= s.z * 0.012 * dt; // slow drift to the left, faster up close
      s.y += s.z * 0.004 * dt;
      if (s.x < -5) s.x += W + 10;
      if (s.y > H + 5) s.y -= H + 10;
      var a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.twinkle + s.phase)) * s.z;
      var x = s.x + offX * s.z * 18;
      var y = s.y + offY * s.z * 18;
      ctx.fillStyle = "rgba(" + rgb + "," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.z === 1 && s.r > 1.4) {
        // the brightest stars get a soft cross of light
        ctx.fillStyle = "rgba(" + rgb + "," + (a * 0.35).toFixed(3) + ")";
        ctx.fillRect(x - s.r * 3, y - 0.5, s.r * 6, 1);
        ctx.fillRect(x - 0.5, y - s.r * 3, 1, s.r * 6);
      }
    }

    nextShot -= dt;
    if (nextShot <= 0) {
      shoot();
      nextShot = 2500 + Math.random() * 4000;
    }
    for (var j = shots.length - 1; j >= 0; j--) {
      var p = shots[j];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      var fade = 1 - p.life / p.ttl;
      if (fade <= 0) {
        shots.splice(j, 1);
        continue;
      }
      var tail = 140;
      var g = ctx.createLinearGradient(p.x, p.y, p.x - p.vx * tail, p.y - p.vy * tail);
      g.addColorStop(0, "rgba(" + rgb + "," + fade.toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * tail, p.y - p.vy * tail);
      ctx.stroke();
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", function (e) {
    mouseX = e.clientX / W - 0.5;
    mouseY = e.clientY / H - 0.5;
  });
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) {
      last = 0;
      requestAnimationFrame(draw);
    }
  });

  readColor();
  resize();
  requestAnimationFrame(draw);
})();
