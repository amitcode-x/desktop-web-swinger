(async function () {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  let width = window.innerWidth;
  let height = window.innerHeight;

  // Canvas backing resolution must match devicePixelRatio.
  function fitCanvasToScreen() {
    const dpr = window.devicePixelRatio || 1;

    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  fitCanvasToScreen();

  // ------------------------------------------------------------------
  // Load character art
  // ------------------------------------------------------------------
  const heroImg = new Image();

  let heroReady = false;

  heroImg.onload = () => {
    heroReady = true;
  };

  heroImg.src = CONFIG.character.imageSrc;

  // ------------------------------------------------------------------
  // Rope setup
  // ------------------------------------------------------------------
  let anchorX = width * CONFIG.anchor.xFrac;
  let anchorY = height * CONFIG.anchor.yFrac;

  let rope = new Rope({
    anchorX,
    anchorY,
    segments: CONFIG.rope.segments,
    segmentLength: CONFIG.rope.segmentLength,
    gravity: CONFIG.rope.gravity,
    damping: CONFIG.rope.damping,
    stiffness: CONFIG.rope.stiffness,

    // Natural full-rope wind.
    wind: CONFIG.rope.wind
  });

  // Give it a very small initial push so it isn't perfectly still
  // when the application starts.
  rope.applyImpulseToEnd(6, -2);

  let paused = false;
  let dragging = false;

  let mouse = {
    x: 0,
    y: 0
  };

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  function isOverEnd(x, y) {
    // Full-rectangle hit test.
    //
    // Transforms the mouse point into the character's own local
    // un-rotated space and checks it against the exact rectangle
    // drawImage() uses.

    const end = rope.end();

    const prev =
      rope.points[rope.points.length - 2] || end;

    const angle =
      (
        Math.atan2(
          end.y - prev.y,
          end.x - prev.x
        ) -
        Math.PI / 2
      ) * 0.55;

    const dx = x - end.x;
    const dy = y - end.y;

    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    let localX =
      dx * cos -
      dy * sin;

    let localY =
      dx * sin +
      dy * cos;

    localY -= (
      CONFIG.character.attachOffsetY ?? 0
    );

    const w = CONFIG.character.width;
    const h = CONFIG.character.height;
    const pad = CONFIG.interaction.grabPadding;

    return (
      localX >= -w / 2 - pad &&
      localX <= w / 2 + pad &&
      localY >= -pad &&
      localY <= h + pad
    );
  }

  function isOverGrabZone(x, y) {
    // Character.
    if (isOverEnd(x, y)) {
      return true;
    }

    // Thread itself.
    for (const p of rope.points) {
      if (
        Math.hypot(
          x - p.x,
          y - p.y
        ) <= CONFIG.interaction.threadGrabRadius
      ) {
        return true;
      }
    }

    return false;
  }

  // ------------------------------------------------------------------
  // Existing idle behaviour.
  //
  // Disabled in config because natural wind now moves the entire rope.
  // Kept here so the old functionality isn't removed.
  // ------------------------------------------------------------------

  function idleNudge() {
    if (paused || dragging) return;

    const f =
      CONFIG.idle.forceMin +
      Math.random() *
        (
          CONFIG.idle.forceMax -
          CONFIG.idle.forceMin
        );

    const dir =
      Math.random() < 0.5
        ? -1
        : 1;

    rope.applyImpulseToEnd(
      dir * f,
      -Math.random() * 0.6
    );
  }

  if (CONFIG.idle.enabled) {
    setInterval(
      idleNudge,
      CONFIG.idle.intervalMs
    );
  }

  // ------------------------------------------------------------------
  // Mouse tracking
  // ------------------------------------------------------------------

  let overGrabZone = false;

  window.addEventListener(
    'mousemove',
    (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;

      if (dragging) return;

      const now =
        isOverGrabZone(
          mouse.x,
          mouse.y
        );

      if (now !== overGrabZone) {
        overGrabZone = now;

        window.desktopPet?.setIgnoreMouse(
          !overGrabZone
        );

        document.body.style.cursor =
          overGrabZone
            ? 'grab'
            : 'default';
      }
    }
  );

  window.addEventListener(
    'mousedown',
    () => {
      if (!overGrabZone) return;

      dragging = true;

      document.body.style.cursor =
        'grabbing';
    }
  );

  window.addEventListener(
    'mouseup',
    () => {
      if (!dragging) return;

      dragging = false;

      document.body.style.cursor =
        overGrabZone
          ? 'grab'
          : 'default';

      // Release back to normal physics.
      rope.releaseEnd();
    }
  );

  // ------------------------------------------------------------------
  // Window resize
  // ------------------------------------------------------------------

  window.addEventListener(
    'resize',
    () => {
      fitCanvasToScreen();

      anchorX =
        width *
        CONFIG.anchor.xFrac;

      anchorY =
        height *
        CONFIG.anchor.yFrac;
    }
  );

  // ------------------------------------------------------------------
  // Desktop pet events
  // ------------------------------------------------------------------

  window.desktopPet?.onSetPaused(
    (v) => {
      paused = v;
    }
  );

  window.desktopPet?.onResetPosition(
    () => {
      rope = new Rope({
        anchorX,
        anchorY,
        segments: CONFIG.rope.segments,
        segmentLength: CONFIG.rope.segmentLength,
        gravity: CONFIG.rope.gravity,
        damping: CONFIG.rope.damping,
        stiffness: CONFIG.rope.stiffness,

        // Preserve natural wind after reset.
        wind: CONFIG.rope.wind
      });
    }
  );

  // ------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------

  function drawRope() {
    const pts = rope.points;
    const n = pts.length - 1;
    const rc = CONFIG.rope;

    // Draw segment-by-segment so thickness can taper from anchor
    // to character.

    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[i + 1];

      const t =
        i /
        (n - 1 || 1);

      const w =
        rc.lineWidthNear +
        (
          rc.lineWidthFar -
          rc.lineWidthNear
        ) * t;

      // ------------------------------------------------------------
      // Shadow
      // ------------------------------------------------------------

      ctx.strokeStyle =
        rc.shadowColor;

      ctx.lineWidth =
        w + 1.1;

      ctx.lineCap =
        'round';

      ctx.beginPath();

      ctx.moveTo(
        a.x,
        a.y
      );

      ctx.lineTo(
        b.x,
        b.y
      );

      ctx.stroke();

      // ------------------------------------------------------------
      // Body
      // ------------------------------------------------------------

      ctx.strokeStyle =
        rc.bodyColor;

      ctx.lineWidth =
        w;

      ctx.beginPath();

      ctx.moveTo(
        a.x,
        a.y
      );

      ctx.lineTo(
        b.x,
        b.y
      );

      ctx.stroke();

      // ------------------------------------------------------------
      // Sheen
      // ------------------------------------------------------------

      const dx =
        b.x - a.x;

      const dy =
        b.y - a.y;

      const len =
        Math.hypot(
          dx,
          dy
        ) || 1;

      const nx =
        -dy / len;

      const ny =
        dx / len;

      ctx.strokeStyle =
        rc.sheenColor;

      ctx.lineWidth =
        Math.max(
          0.6,
          w * 0.35
        );

      ctx.beginPath();

      ctx.moveTo(
        a.x +
          nx *
            rc.sheenOffset,

        a.y +
          ny *
            rc.sheenOffset
      );

      ctx.lineTo(
        b.x +
          nx *
            rc.sheenOffset,

        b.y +
          ny *
            rc.sheenOffset
      );

      ctx.stroke();
    }
  }

  // ------------------------------------------------------------------
  // Glow
  // ------------------------------------------------------------------

  function drawGlow(end, h) {
    const g =
      CONFIG.character.glow;

    if (!g || !g.enabled) {
      return;
    }

    const cx = end.x;

    const cy =
      end.y +
      h *
        g.verticalOffsetFrac;

    const gradient =
      ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        g.radius
      );

    gradient.addColorStop(
      0,
      g.color
    );

    gradient.addColorStop(
      0.55,
      g.midColor ||
        g.color
    );

    gradient.addColorStop(
      1,
      'rgba(0,0,0,0)'
    );

    ctx.save();

    ctx.fillStyle =
      gradient;

    ctx.beginPath();

    ctx.arc(
      cx,
      cy,
      g.radius,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
  }

  // ------------------------------------------------------------------
  // Character
  // ------------------------------------------------------------------

  function drawCharacter() {
    const end = rope.end();

    const prev =
      rope.points[
        rope.points.length - 2
      ] || end;

    const angle =
      Math.atan2(
        end.y - prev.y,
        end.x - prev.x
      ) -
      Math.PI / 2;

    const w =
      CONFIG.character.width;

    const h =
      CONFIG.character.height;

    // Glow behind character.
    drawGlow(
      end,
      h
    );

    ctx.save();

    // Attach character to rope endpoint.
    ctx.translate(
      end.x,
      end.y
    );

    // Damp rotation so character doesn't over-spin.
    ctx.rotate(
      angle * 0.55
    );

    // Character attachment offset.
    ctx.translate(
      0,
      CONFIG.character.attachOffsetY ?? 0
    );

    if (heroReady) {
      ctx.drawImage(
        heroImg,

        -w / 2,
        0,

        w,
        h
      );
    } else {
      // Fallback placeholder.
      ctx.fillStyle =
        '#3b3fa0';

      ctx.beginPath();

      ctx.ellipse(
        0,
        h * 0.35,
        w * 0.28,
        h * 0.35,
        0,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.fillStyle =
        '#c23b3b';

      ctx.beginPath();

      ctx.arc(
        0,
        h * 0.08,
        w * 0.2,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    ctx.restore();
  }

  // ------------------------------------------------------------------
  // Main animation frame
  // ------------------------------------------------------------------

  function frame() {
    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    // Keep rope anchored to the correct screen position.
    rope.setAnchor(
      anchorX,
      anchorY
    );

    if (dragging) {
      // Smoothly follow cursor.
      rope.dragEndTo(
        mouse.x,
        mouse.y,
        CONFIG.interaction.dragSmoothing
      );

      // Let the rest of the rope settle around the held point.
      rope.applyConstraints();
    } else if (!paused) {
      // Normal rope physics + natural wind.
      rope.update();
    }

    // Draw rope first.
    drawRope();

    // Draw character on top.
    drawCharacter();

    requestAnimationFrame(
      frame
    );
  }

  // Start animation.
  requestAnimationFrame(
    frame
  );
})();  