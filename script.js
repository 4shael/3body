const canvas = document.getElementById("orbitCanvas");
const ctx = canvas.getContext("2d");

const toggleButton = document.getElementById("toggle");
const resetButton = document.getElementById("reset");
const dtRange = document.getElementById("dtRange");
const dtValue = document.getElementById("dtValue");
const stepValue = document.getElementById("stepValue");
const energyValue = document.getElementById("energyValue");

const state = {
  running: false,
  step: 0,
  dt: parseFloat(dtRange.value),
  softening: 0.02,
  scale: 140,
  bodies: []
};

const colors = ["#ffd86b", "#ff7b72", "#7ad3ff"];

function createInitialBodies() {
  return [
    { m: 1.2, r: { x: -0.6, y: 0.2 }, v: { x: 0.0, y: -0.42 } },
    { m: 1.0, r: { x: 0.6, y: -0.1 }, v: { x: 0.0, y: 0.5 } },
    { m: 0.8, r: { x: 0.0, y: 0.55 }, v: { x: -0.55, y: 0.0 } }
  ].map((body) => ({
    ...body,
    trail: []
  }));
}

function reset() {
  state.bodies = createInitialBodies();
  state.step = 0;
  drawFrame();
}

function computeAccelerations() {
  return state.bodies.map((body, i) => {
    let ax = 0;
    let ay = 0;
    state.bodies.forEach((other, j) => {
      if (i === j) return;
      const dx = other.r.x - body.r.x;
      const dy = other.r.y - body.r.y;
      const distSq = dx * dx + dy * dy + state.softening * state.softening;
      const invDist = 1 / Math.sqrt(distSq);
      const invDist3 = invDist * invDist * invDist;
      const factor = other.m * invDist3;
      ax += dx * factor;
      ay += dy * factor;
    });
    return { x: ax, y: ay };
  });
}

function leapfrogStep() {
  const accelerations = computeAccelerations();
  state.bodies.forEach((body, i) => {
    body.v.x += 0.5 * accelerations[i].x * state.dt;
    body.v.y += 0.5 * accelerations[i].y * state.dt;
  });

  state.bodies.forEach((body) => {
    body.r.x += body.v.x * state.dt;
    body.r.y += body.v.y * state.dt;
  });

  const accelerationsNext = computeAccelerations();
  state.bodies.forEach((body, i) => {
    body.v.x += 0.5 * accelerationsNext[i].x * state.dt;
    body.v.y += 0.5 * accelerationsNext[i].y * state.dt;
  });

  state.step += 1;
}

function computeEnergy() {
  let kinetic = 0;
  let potential = 0;

  state.bodies.forEach((body) => {
    kinetic += 0.5 * body.m * (body.v.x ** 2 + body.v.y ** 2);
  });

  for (let i = 0; i < state.bodies.length; i += 1) {
    for (let j = i + 1; j < state.bodies.length; j += 1) {
      const bodyA = state.bodies[i];
      const bodyB = state.bodies[j];
      const dx = bodyB.r.x - bodyA.r.x;
      const dy = bodyB.r.y - bodyA.r.y;
      const dist = Math.sqrt(dx * dx + dy * dy + state.softening * state.softening);
      potential -= (bodyA.m * bodyB.m) / dist;
    }
  }

  return kinetic + potential;
}

function updateTrails() {
  state.bodies.forEach((body) => {
    body.trail.push({ x: body.r.x, y: body.r.y });
    if (body.trail.length > 260) {
      body.trail.shift();
    }
  });
}

function drawFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b0e17";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  state.bodies.forEach((body, index) => {
    ctx.beginPath();
    body.trail.forEach((point, i) => {
      const x = centerX + point.x * state.scale;
      const y = centerY + point.y * state.scale;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = `${colors[index]}88`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  state.bodies.forEach((body, index) => {
    const x = centerX + body.r.x * state.scale;
    const y = centerY + body.r.y * state.scale;
    ctx.beginPath();
    ctx.arc(x, y, 8 + body.m * 2, 0, Math.PI * 2);
    ctx.fillStyle = colors[index];
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
  });

  dtValue.textContent = state.dt.toFixed(3);
  stepValue.textContent = state.step.toString();
  energyValue.textContent = computeEnergy().toFixed(3);
}

function animate() {
  if (state.running) {
    for (let i = 0; i < 2; i += 1) {
      leapfrogStep();
      updateTrails();
    }
  }
  drawFrame();
  requestAnimationFrame(animate);
}

function toggleRunning() {
  state.running = !state.running;
  toggleButton.textContent = state.running ? "Пауза" : "Пуск";
}

function updateDt(event) {
  state.dt = parseFloat(event.target.value);
}

toggleButton.addEventListener("click", toggleRunning);
resetButton.addEventListener("click", () => {
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
});

dtRange.addEventListener("input", updateDt);

reset();
requestAnimationFrame(animate);
