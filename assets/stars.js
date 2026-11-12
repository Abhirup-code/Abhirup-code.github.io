// A moving starfield behind the whole site: small, sharp stars drift slowly toward the viewer, as if
// flying through space, shift a little with the mouse, and now and then a shooting star crosses. Visitors who turn off
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

  // Each star has a position in 3D. It flies slowly toward the viewer and is drawn where it lands on
  // the screen, so stars spread out from the middle like a calm flight through space.
  var DEPTH = 1000, FOCAL = 360;
  function newStar(far) {
    return {
      x: (Math.random() - 0.5) * W * 2.2,
      y: (Math.random() - 0.5) * H * 2.2,
      z: far ? DEPTH : Math.random() * DEPTH + 1,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.4 + Math.random() * 1.2,
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.min(420, Math.round((W * H) / 3500));
    stars = [];
    for (var i = 0; i < count; i++) stars.push(newStar(false));
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

    var t = now / 1000, cx = W / 2, cy = H / 2;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.z -= 0.018 * dt; // slow: a star takes about a minute to reach you
      var k = FOCAL / s.z;
      var x = cx + s.x * k + offX * 30 * (1 - s.z / DEPTH);
      var y = cy + s.y * k + offY * 30 * (1 - s.z / DEPTH);
      if (s.z < 1 || x < -20 || x > W + 20 || y < -20 || y > H + 20) {
        stars[i] = newStar(true);
        continue;
      }
      var near = 1 - s.z / DEPTH; // 0 far away, 1 right in front
      var r = 0.25 + near * 1.4;
      var a = Math.min(1, 0.15 + near * 1.1) * (0.75 + 0.25 * Math.sin(t * s.twinkle + s.phase));
      ctx.fillStyle = "rgba(" + rgb + "," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    nextShot -= dt;
    if (nextShot <= 0) {
      shoot();
      nextShot = 6000 + Math.random() * 8000; // rare, so each one is a small surprise
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
      var tail = 110;
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
