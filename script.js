const canvas = document.getElementById("orbitCanvas");
const ctx = canvas.getContext("2d");

const toggleButton = document.getElementById("toggle");
const resetButton = document.getElementById("reset");
const dtRange = document.getElementById("dtRange");
const speedRange = document.getElementById("speedRange");
const dtValue = document.getElementById("dtValue");
const stepValue = document.getElementById("stepValue");
const energyValue = document.getElementById("energyValue");
const speedValue = document.getElementById("speedValue");
const applyInitialButton = document.getElementById("applyInitial");
const randomizeInitialButton = document.getElementById("randomizeInitial");
const initialConditionInputs = Array.from(document.querySelectorAll(".ic-input"));

const defaultInitialConditions = [
  { m: 1.2, x: -0.6, y: 0.2, vx: 0.0, vy: -0.42 },
  { m: 1.0, x: 0.6, y: -0.1, vx: 0.0, vy: 0.5 },
  { m: 0.8, x: 0.0, y: 0.55, vx: -0.55, vy: 0.0 }
];

const state = {
  running: false,
  hasStarted: false,
  step: 0,
  dt: parseFloat(dtRange.value),
  stepsPerFrame: parseInt(speedRange?.value ?? "2", 10),
  softening: 0.02,
  scale: 140,
  initialConditions: defaultInitialConditions.map((body) => ({ ...body })),
  bodies: []
};

const colors = ["#ffd86b", "#ff7b72", "#7ad3ff"];

function createBodiesFromConditions(conditions) {
  return conditions.map((body) => ({
    m: body.m,
    r: { x: body.x, y: body.y },
    v: { x: body.vx, y: body.vy },
    trail: []
  }));
}

function setInitialConditionInputs(conditions) {
  const byKey = new Map(
    conditions.flatMap((body, index) => [
      [`${index}:m`, body.m],
      [`${index}:x`, body.x],
      [`${index}:y`, body.y],
      [`${index}:vx`, body.vx],
      [`${index}:vy`, body.vy]
    ])
  );

  initialConditionInputs.forEach((input) => {
    const bodyIndex = input.dataset.body;
    const field = input.dataset.field;
    if (bodyIndex == null || field == null) return;
    const key = `${bodyIndex}:${field}`;
    if (!byKey.has(key)) return;
    input.value = Number(byKey.get(key)).toString();
  });
}

function readInitialConditionsFromInputs() {
  const conditions = Array.from({ length: 3 }, () => ({}));
  const errors = [];

  initialConditionInputs.forEach((input) => {
    const bodyIndex = Number.parseInt(input.dataset.body ?? "", 10);
    const field = input.dataset.field;
    if (!Number.isInteger(bodyIndex) || bodyIndex < 0 || bodyIndex > 2 || !field) {
      return;
    }
    const value = input.valueAsNumber;
    if (!Number.isFinite(value)) {
      errors.push("Заполните все поля начальных условий.");
      return;
    }
    conditions[bodyIndex][field] = value;
  });

  conditions.forEach((body, index) => {
    const missing = ["m", "x", "y", "vx", "vy"].filter((key) => !Number.isFinite(body[key]));
    if (missing.length > 0) {
      errors.push(`Тело ${index + 1}: отсутствуют поля ${missing.join(", ")}.`);
    }
    if (Number.isFinite(body.m) && body.m <= 0) {
      errors.push(`Тело ${index + 1}: масса должна быть > 0.`);
    }
  });

  return { conditions, errors };
}

function normalizeConditions(conditions) {
  const totalMass = conditions.reduce((sum, body) => sum + body.m, 0);
  const comX = conditions.reduce((sum, body) => sum + body.m * body.x, 0) / totalMass;
  const comY = conditions.reduce((sum, body) => sum + body.m * body.y, 0) / totalMass;
  const vComX = conditions.reduce((sum, body) => sum + body.m * body.vx, 0) / totalMass;
  const vComY = conditions.reduce((sum, body) => sum + body.m * body.vy, 0) / totalMass;

  return conditions.map((body) => ({
    ...body,
    x: body.x - comX,
    y: body.y - comY,
    vx: body.vx - vComX,
    vy: body.vy - vComY
  }));
}

function randomPoint(radius) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function generateRandomInitialConditions() {
  const radius = 0.85;
  const minSeparation = 0.35;
  let positions = null;

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = [randomPoint(radius), randomPoint(radius), randomPoint(radius)];
    const ok =
      distanceSquared(candidate[0], candidate[1]) >= minSeparation ** 2 &&
      distanceSquared(candidate[0], candidate[2]) >= minSeparation ** 2 &&
      distanceSquared(candidate[1], candidate[2]) >= minSeparation ** 2;
    if (ok) {
      positions = candidate;
      break;
    }
  }

  if (!positions) {
    positions = [randomPoint(radius), randomPoint(radius), randomPoint(radius)];
  }

  const velocities = [randomPoint(0.7), randomPoint(0.7), randomPoint(0.7)];
  const masses = [0, 0, 0].map(() => 0.6 + Math.random() * 0.8);

  const conditions = masses.map((m, i) => ({
    m,
    x: positions[i].x,
    y: positions[i].y,
    vx: velocities[i].x,
    vy: velocities[i].y
  }));

  return normalizeConditions(conditions);
}

function reset() {
  state.bodies = createBodiesFromConditions(state.initialConditions);
  state.hasStarted = false;
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

function drawVelocityArrows(centerX, centerY) {
  const arrowScale = state.scale * 0.9;
  const maxLength = 140;
  const headLength = 11;
  const headAngle = Math.PI / 7;

  state.bodies.forEach((body, index) => {
    let dx = body.v.x * arrowScale;
    let dy = body.v.y * arrowScale;
    const length = Math.hypot(dx, dy);
    if (length < 6) return;
    if (length > maxLength) {
      const k = maxLength / length;
      dx *= k;
      dy *= k;
    }

    const startX = centerX + body.r.x * state.scale;
    const startY = centerY + body.r.y * state.scale;
    const endX = startX + dx;
    const endY = startY + dy;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = `${colors[index]}cc`;
    ctx.fillStyle = `${colors[index]}cc`;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - headLength * Math.cos(angle - headAngle),
      endY - headLength * Math.sin(angle - headAngle)
    );
    ctx.lineTo(
      endX - headLength * Math.cos(angle + headAngle),
      endY - headLength * Math.sin(angle + headAngle)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
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

  if (!state.hasStarted) {
    drawVelocityArrows(centerX, centerY);
  }

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

  dtValue.textContent = state.dt.toFixed(4);
  stepValue.textContent = state.step.toString();
  energyValue.textContent = computeEnergy().toFixed(3);
}

function animate() {
  if (state.running) {
    for (let i = 0; i < state.stepsPerFrame; i += 1) {
      leapfrogStep();
      updateTrails();
    }
  }
  drawFrame();
  requestAnimationFrame(animate);
}

function toggleRunning() {
  state.running = !state.running;
  if (state.running) {
    state.hasStarted = true;
  }
  toggleButton.textContent = state.running ? "Пауза" : "Пуск";
}

function updateDt(event) {
  state.dt = parseFloat(event.target.value);
}

function updateSpeed(event) {
  state.stepsPerFrame = Number.parseInt(event.target.value, 10);
  if (speedValue) {
    speedValue.textContent = `${state.stepsPerFrame}×`;
  }
}

function applyInitialConditions() {
  const { conditions, errors } = readInitialConditionsFromInputs();
  if (errors.length > 0) {
    alert([...new Set(errors)].join("\n"));
    return;
  }

  state.initialConditions = conditions.map((body) => ({ ...body }));
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
}

function randomizeInitialConditions() {
  state.initialConditions = generateRandomInitialConditions();
  setInitialConditionInputs(state.initialConditions);
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
}

toggleButton.addEventListener("click", toggleRunning);
resetButton.addEventListener("click", () => {
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
});

dtRange.addEventListener("input", updateDt);
speedRange?.addEventListener("input", updateSpeed);
applyInitialButton?.addEventListener("click", applyInitialConditions);
randomizeInitialButton?.addEventListener("click", randomizeInitialConditions);

setInitialConditionInputs(state.initialConditions);
updateSpeed({ target: speedRange ?? { value: state.stepsPerFrame.toString() } });
reset();
requestAnimationFrame(animate);
