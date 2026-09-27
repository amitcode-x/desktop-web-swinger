// ------------------------------------------------------------------
// Minimal Verlet-integration rope.
//
// Each point stores its current and previous position.
// Velocity is implicit (current - previous), which makes the whole
// thread swing, stretch slightly and settle naturally.
// ------------------------------------------------------------------

class RopePoint {
  constructor(x, y, pinned = false) {
    this.x = x;
    this.y = y;

    // Previous position used by Verlet integration.
    this.px = x;
    this.py = y;

    this.pinned = pinned;
  }
}

class Rope {
  constructor({
    anchorX,
    anchorY,
    segments,
    segmentLength,
    gravity,
    damping,
    stiffness,
    wind = {}
  }) {
    this.segmentLength = segmentLength;
    this.gravity = gravity;
    this.damping = damping;
    this.stiffness = stiffness;

    // --------------------------------------------------------------
    // Natural wind settings
    // --------------------------------------------------------------
    this.windEnabled = wind.enabled ?? false;
    this.windStrength = wind.strength ?? 0.035;
    this.windSpeed = wind.speed ?? 0.018;
    this.windVariation = wind.variation ?? 0.8;

    // Random starting phase so the movement doesn't always start
    // from exactly the same position.
    this.windTime = Math.random() * Math.PI * 2;

    this.points = [];

    // Create rope points.
    //
    // Point 0 = fixed anchor.
    // Last point = character.
    for (let i = 0; i < segments; i++) {
      this.points.push(
        new RopePoint(
          anchorX,
          anchorY + i * segmentLength,
          i === 0
        )
      );
    }
  }

  setAnchor(x, y) {
    const p = this.points[0];

    p.x = x;
    p.y = y;

    // Keep the anchor completely fixed.
    p.px = x;
    p.py = y;
  }

  // --------------------------------------------------------------
  // Push the free end.
  //
  // Used by idle nudges / initial movement / any existing throw
  // behaviour.
  // --------------------------------------------------------------
  applyImpulseToEnd(fx, fy) {
    const end = this.points[this.points.length - 1];

    end.px -= fx;
    end.py -= fy;
  }

  // --------------------------------------------------------------
  // Drag the end point directly to a position.
  //
  // While dragging, the end point is temporarily pinned.
  // --------------------------------------------------------------
  dragEndTo(x, y, smoothing = 0.35) {
    const end = this.points[this.points.length - 1];

    end.pinned = true;

    const oldX = end.x;
    const oldY = end.y;

    end.x += (x - end.x) * smoothing;
    end.y += (y - end.y) * smoothing;

    // Preserve movement velocity for smooth release.
    end.px = oldX;
    end.py = oldY;
  }

  // --------------------------------------------------------------
  // Give control of the end point back to physics.
  // --------------------------------------------------------------
  releaseEnd() {
    this.points[this.points.length - 1].pinned = false;
  }

  // --------------------------------------------------------------
  // Natural wind force.
  //
  // The anchor remains fixed.
  // Wind becomes gradually stronger farther down the rope.
  //
  // Two sine waves are combined so it doesn't look like a simple
  // robotic left-right animation.
  // --------------------------------------------------------------
  applyWind(i) {
    if (!this.windEnabled) return;

    const lastIndex = this.points.length - 1;

    if (lastIndex <= 0) return;

    // 0 near anchor -> 1 near character.
    const normalized = i / lastIndex;

    // Make the lower part of the rope move more than the top.
    // This creates a pendulum-like natural movement.
    const falloff = 0.20 + normalized * 0.80;

    // Main slow wind wave.
    const wave1 = Math.sin(
      this.windTime + i * 0.18
    );

    // Secondary slower wave.
    const wave2 = Math.sin(
      this.windTime * 0.63 + i * 0.11
    );

    // Combine both waves.
    const combinedWave =
      wave1 +
      wave2 * this.windVariation;

    // Apply only horizontal movement.
    //
    // Keeping vertical wind very small makes it feel like air,
    // rather than the rope being pulled randomly.
    const windX =
      combinedWave *
      this.windStrength *
      falloff;

    const windY =
      Math.sin(this.windTime * 0.45 + i * 0.15) *
      this.windStrength *
      0.08 *
      falloff;

    this.points[i].x += windX;
    this.points[i].y += windY;
  }

  // --------------------------------------------------------------
  // Main physics update.
  // --------------------------------------------------------------
  update() {
    // Slowly advance the wind.
    this.windTime += this.windSpeed;

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];

      // Pinned points are controlled externally.
      if (p.pinned) continue;

      // Verlet velocity.
      const vx = (p.x - p.px) * this.damping;
      const vy = (p.y - p.py) * this.damping;

      // Store current position as previous position.
      p.px = p.x;
      p.py = p.y;

      // Normal physics.
      p.x += vx;
      p.y += vy + this.gravity;

      // ----------------------------------------------------------
      // Natural air movement.
      //
      // This affects the entire rope progressively.
      // ----------------------------------------------------------
      this.applyWind(i);
    }

    // Restore rope segment lengths.
    this.applyConstraints();
  }

  // --------------------------------------------------------------
  // Constraint solver.
  //
  // Keeps every rope segment at approximately segmentLength.
  // --------------------------------------------------------------
  applyConstraints() {
    for (let iter = 0; iter < this.stiffness; iter++) {
      for (let i = 0; i < this.points.length - 1; i++) {
        const a = this.points[i];
        const b = this.points[i + 1];

        const dx = b.x - a.x;
        const dy = b.y - a.y;

        const dist =
          Math.sqrt(dx * dx + dy * dy) || 0.0001;

        const diff =
          (dist - this.segmentLength) / dist;

        const offsetX =
          dx * 0.5 * diff;

        const offsetY =
          dy * 0.5 * diff;

        if (!a.pinned) {
          a.x += offsetX;
          a.y += offsetY;
        }

        if (!b.pinned) {
          b.x -= offsetX;
          b.y -= offsetY;
        }
      }
    }
  }

  // --------------------------------------------------------------
  // Return the last rope point.
  // This is where the character is attached.
  // --------------------------------------------------------------
  end() {
    return this.points[this.points.length - 1];
  }
}

// Node/CommonJS compatibility.
if (typeof module !== 'undefined') {
  module.exports = {
    Rope,
    RopePoint
  };
}