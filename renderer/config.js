// ------------------------------------------------------------------
// Everything you'd want to tweak lives here.
// ------------------------------------------------------------------
const CONFIG = {
  // Where the thread is anchored, as a fraction of the screen (0..1).
  // 0.86, 0.0 = near the top-right corner.
  anchor: { xFrac: 0.86, yFrac: 0.0 },

  // Rope / web thread
  rope: {
    segments: 25,
    segmentLength: 10,
    stiffness: 4,
    gravity: 0.55,

    // Very high damping gives the rope a smooth, natural movement.
    damping: 0.997,

    // --------------------------------------------------------------
    // Natural air / wind movement
    // --------------------------------------------------------------
    // This moves the complete rope gradually instead of only
    // pushing the character at the bottom.
    wind: {
      enabled: true,

      // Keep this small for a subtle natural movement.
      // 0.035 = soft breeze
      // 0.055 = slightly more visible
      // 0.020 = extremely subtle
      strength: 0.060,

      // How quickly the wind direction changes.
      // Smaller = slower, calmer movement.
      speed: 0.030,

      // Adds a second slower wave so the movement doesn't look
      // like a simple repeating sine wave.
      variation: 0.8
    },

    // Thread draws as 3 layered strokes (shadow + body + sheen)
    // instead of one flat line.
    lineWidthNear: 3,
    lineWidthFar: 2,

    shadowColor: 'rgba(0,0,0,0.45)',
    bodyColor: 'rgba(215,215,215,0.9)',
    sheenColor: 'rgba(255,255,255,0.55)',
    sheenOffset: 0.6
  },

  // The character hanging on the end of the rope.
  character: {
    // Same character size.
    width: 170,
    height: 157,

    imageSrc: '../assets/character.png',

    // Character position relative to rope endpoint.
    // Negative value moves the character upward toward the rope.
    attachOffsetY: -35,

    // Soft pastel-pink glow.
    glow: {
      enabled: true,
      color: 'rgba(255,140,190,0.22)',
      midColor: 'rgba(255,140,190,0.08)',
      radius: 150,
      verticalOffsetFrac: 0.5
    }
  },

  // Idle behaviour.
  //
  // Disabled because the new wind system already provides
  // continuous natural movement to the COMPLETE rope.
  //
  // Keeping this disabled prevents the character from receiving
  // additional random end-point pushes.
  idle: {
    enabled: false,
    intervalMs: 4200,
    forceMin: 1.3,
    forceMax: 2.6
  },

  // Drag / throw interaction
  interaction: {
    // Grabbing hit-tests the character's whole rendered rectangle.
    grabPadding: 12,

    // How close the cursor needs to be to grab the thread.
    threadGrabRadius: 16,

    // How tightly the character follows your cursor while dragging.
    dragSmoothing: 0.35
  }
};