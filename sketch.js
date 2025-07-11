let recording = true;
let isDrawing = true;
let path = [];
let playbackIndex = 0;
let synth;
let synthStarted = false;

let theta = 0;
let phi = 90;
const radius = 200;

const thetaSpeed = 1.5;
const phiSpeed = 1.5;

let trail = [];

let lastNote = null;
let notePlaying = false;
let lastMoveTime = 0;
const noteHoldThreshold = 150;

let currentPlaybackNote = null;
let playbackTimer = 0;

let playbackSpeed = 1;

let lastRecordTime = 0;

let started = false; // user interaction flag for audio context start

let lastTriggerTime = 0;
const minNoteGap = 50; // minimum gap (ms) between note triggers

function setup() {
  createCanvas(800, 800, WEBGL);
  angleMode(DEGREES);
  textFont('Arial');
  textSize(24);
  fill(255);
  noStroke();

  // Splash screen overlay
  let overlay = createDiv('Click or press any key to start audio');
  overlay.id('overlay');
  overlay.style('position', 'fixed');
  overlay.style('top', '0');
  overlay.style('left', '0');
  overlay.style('width', '100%');
  overlay.style('height', '100%');
  overlay.style('background-color', 'rgba(0,0,0,0.9)');
  overlay.style('color', 'white');
  overlay.style('display', 'flex');
  overlay.style('justify-content', 'center');
  overlay.style('align-items', 'center');
  overlay.style('font-size', '32px');
  overlay.style('z-index', '9999');
  overlay.style('user-select', 'none');
  overlay.style('cursor', 'pointer');

  overlay.mousePressed(startAudio);
  window.addEventListener('keydown', startAudioOnce);
}

function startAudioOnce() {
  if (!started) {
    startAudio();
    window.removeEventListener('keydown', startAudioOnce);
  }
}

async function startAudio() {
  if (started) return;
  started = true;

  const overlay = document.getElementById('overlay');
  if (overlay) overlay.style.display = 'none';

  await Tone.start();

  synth = new Tone.DuoSynth({
    voice0: {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.1, decay: 0.4, sustain: 0.4, release: 1.2 },
    },
    voice1: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.1, decay: 0.4, sustain: 0.4, release: 1.2 },
    },
    harmonicity: 1.25,
    vibratoAmount: 0.2,
  }).toDestination();

  synthStarted = true;
}

function draw() {
  background(0);

  if (!started) {
    // Wait for user to start audio
    return;
  }

  // Adjust playback speed with Q/E keys
  if (keyIsDown(81)) { // Q
    playbackSpeed = max(0.1, playbackSpeed - 0.05);
  }
  if (keyIsDown(69)) { // E
    playbackSpeed = min(3, playbackSpeed + 0.05);
  }

  let moved = false;
  let currentNote = null;

  if (recording) {
    // Move dot on sphere
    if (keyIsDown(LEFT_ARROW)) { theta += thetaSpeed; moved = true; }
    if (keyIsDown(RIGHT_ARROW)) { theta -= thetaSpeed; moved = true; }
    if (keyIsDown(UP_ARROW)) { phi += phiSpeed; moved = true; }
    if (keyIsDown(DOWN_ARROW)) { phi -= phiSpeed; moved = true; }

    theta = (theta + 360) % 360;
    phi = constrain(phi, 1, 179);

    if (moved && isDrawing) {
      const now = millis();
      if (now - lastTriggerTime > minNoteGap) {
        const pitchPhi = phi <= 180 ? phi : 360 - phi;
        const midiNote = map(pitchPhi, 0, 180, 48, 84);
        currentNote = Tone.Frequency(midiNote, 'midi').toNote();

        let duration = now - lastRecordTime;
        if (lastRecordTime === 0) duration = 200;
        lastRecordTime = now;

        path.push({ theta, phi, note: currentNote, duration });
        trail.push(angleToVector(theta, phi, radius));
        lastMoveTime = now;

        safeTriggerAttackRelease(currentNote, duration / 1000);
        lastTriggerTime = now;
        lastNote = currentNote;
      }
    }
  } else if (path.length > 0) {
    // Playback mode - play notes in saved path with speed control
    playbackTimer -= deltaTime;
    if (playbackTimer <= 0) {
      let point = path[playbackIndex];
      theta = point.theta;
      phi = point.phi;

      currentNote = point.note;
      const duration = (point.duration || 200) / playbackSpeed;

      trail.push(angleToVector(theta, phi, radius));

      if (currentPlaybackNote !== null) safeTriggerRelease();
      safeTriggerAttackRelease(currentNote, duration / 1000);
      currentPlaybackNote = currentNote;

      playbackIndex = (playbackIndex + 1) % path.length;
      playbackTimer = duration;
    }
  }

  // Manage note release if no movement or not drawing
  if (recording) {
    if ((!moved || !isDrawing) && millis() - lastMoveTime > noteHoldThreshold) {
      safeTriggerRelease();
      lastNote = null;
    }
  }

  // Dot position on sphere
  const dotPos = angleToVector(theta, phi, radius);
  const camOffset = dotPos.copy().normalize().mult(300);

  camera(
    dotPos.x + camOffset.x,
    dotPos.y + camOffset.y,
    dotPos.z + camOffset.z,
    dotPos.x,
    dotPos.y,
    dotPos.z,
    0,
    1,
    0
  );

  // Draw wireframe orb only in recording
  if (recording) {
    stroke(50);
    noFill();
    sphere(radius);
  } else {
    noStroke();
    noFill();
    sphere(radius);
  }

  // Draw trail of recorded path
  if (trail.length > 0) {
    stroke(255, 50, 50);
    noFill();
    beginShape();
    for (const p of trail) vertex(p.x, p.y, p.z);
    endShape();
  }

  // Draw dot
  push();
  translate(dotPos.x, dotPos.y, dotPos.z);
  noStroke();
  if (recording) fill(isDrawing ? [255, 50, 50] : 120);
  else fill(255, 50, 50);
  sphere(4);
  pop();
}

function angleToVector(theta, phi, r) {
  const x = r * sin(phi) * cos(theta);
  const y = r * cos(phi);
  const z = r * sin(phi) * sin(theta);
  return createVector(x, y, z);
}

// Safe synth calls to avoid errors when not ready
function safeTriggerAttackRelease(note, duration) {
  if (synthStarted && synth) {
    synth.triggerAttackRelease(note, duration);
  }
}

function safeTriggerRelease() {
  if (synthStarted && synth) {
    synth.triggerRelease();
  }
}

function keyPressed() {
  if (!started) {
    // start audio on first keypress
    startAudio();
    return;
  }

  if (key === 'Enter') {
    if (recording) {
      if (path.length === 0) return;
      playbackIndex = 0;
      recording = false;
      lastNote = null;
      notePlaying = false;
      trail = [];
      lastRecordTime = 0;
    } else {
      path = [];
      trail = [];
      playbackIndex = 0;
      recording = true;
      lastNote = null;
      notePlaying = false;
      lastRecordTime = 0;

      if (currentPlaybackNote !== null) {
        safeTriggerRelease();
        currentPlaybackNote = null;
      }
    }
  }

  if (key === ' ') {
    if (recording) {
      isDrawing = !isDrawing;
    }
  }
}
