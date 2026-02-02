const canvas = document.getElementById("orbitCanvas");
const ctx = canvas.getContext("2d");

const toggleButton = document.getElementById("toggle");
const resetButton = document.getElementById("reset");
const dtRange = document.getElementById("dtRange");
const speedRange = document.getElementById("speedRange");
const scaleRange = document.getElementById("scaleRange");
const dtValue = document.getElementById("dtValue");
const dtRangeValue = document.getElementById("dtRangeValue");
const stepValue = document.getElementById("stepValue");
const energyValue = document.getElementById("energyValue");
const speedValue = document.getElementById("speedValue");
const scaleValue = document.getElementById("scaleValue");
const applyInitialButton = document.getElementById("applyInitial");
const addBodyButton = document.getElementById("addBody");
const randomizeInitialButton = document.getElementById("randomizeInitial");
const shareInitialButton = document.getElementById("shareInitial");
const bodyCount = document.getElementById("bodyCount");
const icBodies = document.getElementById("icBodies");
const legend = document.getElementById("legend");
const presetSelect = document.getElementById("presetSelect");

const initialConditionFieldLabels = {
  m: "m (масса)",
  color: "цвет",
  x: "x (координата)",
  y: "y (координата)",
  vx: "vₓ (скорость)",
  vy: "vᵧ (скорость)"
};

const MAX_BODIES = 40;

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
  scale: Number.parseFloat(scaleRange?.value ?? "140"),
  pan: { x: 0, y: 0 },
  initialConditions: defaultInitialConditions.map((body) => ({ ...body })),
  bodies: []
};

function pluralizeBodies(count) {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "тел";
  const mod10 = count % 10;
  if (mod10 === 1) return "тело";
  if (mod10 >= 2 && mod10 <= 4) return "тела";
  return "тел";
}

function bodyColor(index, alpha = 1) {
  const base = autoBodyColorHex(index);
  if (alpha >= 1) return base;
  return hexToRgba(base, alpha);
}

function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();

  const long = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (long) return `#${long[1].toLowerCase()}`;

  const short = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (!short) return null;
  const expanded = short[1]
    .split("")
    .map((ch) => ch + ch)
    .join("");
  return `#${expanded.toLowerCase()}`;
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return `rgba(255, 255, 255, ${alpha})`;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clampByte(value) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function toHexByte(value) {
  return clampByte(value).toString(16).padStart(2, "0");
}

function hslToHex(hueDegrees, saturation, lightness) {
  const hue = ((hueDegrees % 360) + 360) % 360;
  const s = clampNumber(saturation, 0, 1);
  const l = clampNumber(lightness, 0, 1);

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp >= 1 && hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp >= 2 && hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp >= 3 && hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp >= 4 && hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = l - c / 2;
  const r = (r1 + m) * 255;
  const g = (g1 + m) * 255;
  const b = (b1 + m) * 255;

  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function autoBodyColorHex(index) {
  const hue = (index * 137.508) % 360;
  return hslToHex(hue, 0.85, 0.65);
}

function solidColorForBody(body, index) {
  return normalizeHexColor(body?.color) ?? autoBodyColorHex(index);
}

function paintColorForBody(body, index, alpha = 1) {
  const solid = solidColorForBody(body, index);
  if (alpha >= 1) return solid;
  return hexToRgba(solid, alpha);
}

const dragState = {
  active: false,
  pointerId: null,
  lastClientX: 0,
  lastClientY: 0
};

function createBodiesFromConditions(conditions) {
  return conditions.map((body, index) => ({
    m: body.m,
    color: solidColorForBody(body, index),
    r: { x: body.x, y: body.y },
    v: { x: body.vx, y: body.vy },
    trail: []
  }));
}

function updateBodyCountLabel() {
  if (!bodyCount) return;
  const count = state.initialConditions.length;
  bodyCount.textContent = `${count} ${pluralizeBodies(count)}`;
}

function renderLegend() {
  if (!legend) return;
  legend.textContent = "";

  const count = state.initialConditions.length;
  const maxShown = 6;
  const shown = Math.min(count, maxShown);

  for (let i = 0; i < shown; i += 1) {
    const item = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = "dot";
    dot.style.background = solidColorForBody(state.initialConditions[i], i);
    item.append(dot, document.createTextNode(`тело ${i + 1}`));
    legend.appendChild(item);
  }

  if (count > maxShown) {
    const more = document.createElement("span");
    more.textContent = `+${count - maxShown}`;
    legend.appendChild(more);
  }
}

function createHeaderCell(text, title = null) {
  const cell = document.createElement("div");
  cell.className = "ic-grid__header";
  cell.textContent = text;
  if (title) {
    cell.title = title;
  }
  return cell;
}

function createNumberInput(bodyIndex, field, value, options = {}) {
  const { step = "0.01", min = null } = options;
  const input = document.createElement("input");
  input.className = "ic-input";
  input.type = "number";
  input.step = step;
  if (min != null) {
    input.min = min;
  }
  input.value = Number.isFinite(value) ? value.toString() : "0";
  input.dataset.body = bodyIndex.toString();
  input.dataset.field = field;
  input.setAttribute("aria-label", `${field}${bodyIndex + 1}`);

  const pretty = initialConditionFieldLabels[field] ?? field;
  input.title = `Тело ${bodyIndex + 1}: ${pretty}`;
  return input;
}

function createColorInput(bodyIndex, value) {
  const input = document.createElement("input");
  input.className = "ic-color";
  input.type = "color";
  input.value = solidColorForBody({ color: value }, bodyIndex);
  input.dataset.body = bodyIndex.toString();
  input.dataset.field = "color";
  input.setAttribute("aria-label", `color${bodyIndex + 1}`);
  input.title = `Тело ${bodyIndex + 1}: ${initialConditionFieldLabels.color}`;
  return input;
}

function renderInitialConditions() {
  if (!icBodies) return;
  icBodies.textContent = "";

  const count = state.initialConditions.length;
  if (addBodyButton) {
    addBodyButton.disabled = count >= MAX_BODIES;
  }

  icBodies.append(
    createHeaderCell(""),
    createHeaderCell("цвет", "Цвет тела на канве и в легенде."),
    createHeaderCell("m"),
    createHeaderCell("x"),
    createHeaderCell("y"),
    createHeaderCell("vₓ"),
    createHeaderCell("vᵧ"),
    createHeaderCell("")
  );

  state.initialConditions.forEach((body, index) => {
    const label = document.createElement("div");
    label.className = "ic-grid__label";
    label.dataset.index = index.toString();

    const dot = document.createElement("i");
    dot.className = "dot";
    dot.style.background = solidColorForBody(body, index);
    const text = document.createElement("span");
    text.textContent = `тело ${index + 1}`;
    label.append(dot, text);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ic-remove";
    removeButton.dataset.action = "remove-body";
    removeButton.dataset.index = index.toString();
    removeButton.title = "Удалить тело";
    removeButton.textContent = "×";
    removeButton.disabled = count <= 1;

    icBodies.append(
      label,
      createColorInput(index, body.color),
      createNumberInput(index, "m", body.m, { step: "any", min: "0" }),
      createNumberInput(index, "x", body.x),
      createNumberInput(index, "y", body.y),
      createNumberInput(index, "vx", body.vx),
      createNumberInput(index, "vy", body.vy),
      removeButton
    );
  });

  updateBodyCountLabel();
  renderLegend();
}

function readInitialConditionsFromDom() {
  const errors = [];
  if (!icBodies) {
    return { conditions: state.initialConditions.map((body) => ({ ...body })), errors };
  }

  const inputs = Array.from(icBodies.querySelectorAll("input.ic-input"));
  const indices = inputs
    .map((input) => Number.parseInt(input.dataset.body ?? "", 10))
    .filter((value) => Number.isInteger(value));
  const count = indices.length > 0 ? Math.max(...indices) + 1 : 0;

  const conditions = Array.from({ length: count }, (_, index) => {
    const readNumberField = (field) =>
      icBodies.querySelector(`input[data-body="${index}"][data-field="${field}"]`)?.valueAsNumber;
    const readStringField = (field) =>
      icBodies.querySelector(`input[data-body="${index}"][data-field="${field}"]`)?.value ?? "";
    const body = {
      m: readNumberField("m"),
      color: normalizeHexColor(readStringField("color")) ?? undefined,
      x: readNumberField("x"),
      y: readNumberField("y"),
      vx: readNumberField("vx"),
      vy: readNumberField("vy")
    };

    const missing = ["m", "x", "y", "vx", "vy"].filter((key) => !Number.isFinite(body[key]));
    if (missing.length > 0) {
      errors.push(`Тело ${index + 1}: заполните все поля.`);
    } else if (body.m <= 0) {
      errors.push(`Тело ${index + 1}: масса должна быть > 0.`);
    }

    return body;
  });

  return { conditions, errors };
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatParam(value) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded.toString();
}

function encodeInitialConditions(conditions) {
  return conditions
    .map((body) => {
      const parts = [body.m, body.x, body.y, body.vx, body.vy].map(formatParam);
      const color = normalizeHexColor(body.color);
      if (color) {
        parts.push(color);
      }
      return parts.join(",");
    })
    .join(";");
}

function parseInitialConditionsParam(value) {
  if (!value) return null;
  const bodies = value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (bodies.length < 1) return null;
  if (bodies.length > MAX_BODIES) {
    bodies.length = MAX_BODIES;
  }

  const parsed = bodies.map((entry) => {
    const parts = entry.split(",").map((part) => part.trim());
    if (parts.length !== 5 && parts.length !== 6) return null;
    const numbers = parts.slice(0, 5).map((part) => Number.parseFloat(part));
    if (numbers.some((number) => !Number.isFinite(number))) return null;
    const [m, x, y, vx, vy] = numbers;
    if (m <= 0) return null;
    const color = parts.length === 6 ? normalizeHexColor(parts[5]) : null;
    return { m, x, y, vx, vy, ...(color ? { color } : {}) };
  });

  if (parsed.some((body) => body === null)) return null;
  return parsed;
}

function applyRangeValue(rangeEl, value) {
  if (!rangeEl) return value;
  const min = Number.parseFloat(rangeEl.min);
  const max = Number.parseFloat(rangeEl.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  const clamped = clampNumber(value, min, max);
  rangeEl.value = clamped.toString();
  return clamped;
}

function applyIntegerRangeValue(rangeEl, value) {
  if (!rangeEl) return value;
  const min = Number.parseInt(rangeEl.min, 10);
  const max = Number.parseInt(rangeEl.max, 10);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  const clamped = clampNumber(value, min, max);
  const rounded = Math.round(clamped);
  rangeEl.value = rounded.toString();
  return rounded;
}

function buildShareUrl(conditions) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";

  url.searchParams.set("v", "2");
  url.searchParams.set("ic", encodeInitialConditions(conditions));
  url.searchParams.set("dt", formatParam(state.dt));
  url.searchParams.set("spf", state.stepsPerFrame.toString());
  url.searchParams.set("sc", formatParam(state.scale));

  return url.toString();
}

function loadSharedParametersFromUrl() {
  const params = new URLSearchParams(window.location.search);

  const icParam = params.get("ic");
  if (icParam) {
    const parsed = parseInitialConditionsParam(icParam);
    if (parsed) {
      state.initialConditions = parsed;
    }
  }

  const dtParam = Number.parseFloat(params.get("dt"));
  if (Number.isFinite(dtParam)) {
    state.dt = applyRangeValue(dtRange, dtParam);
  }

  const spfParam = Number.parseInt(params.get("spf") ?? "", 10);
  if (Number.isFinite(spfParam)) {
    state.stepsPerFrame = applyIntegerRangeValue(speedRange, spfParam);
  }

  const scaleParam = Number.parseFloat(params.get("sc"));
  if (Number.isFinite(scaleParam)) {
    state.scale = applyRangeValue(scaleRange, scaleParam);
  }

  state.initialConditions = ensureConditionColors(state.initialConditions);
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function shareInitialParameters() {
  const { conditions, errors } = readInitialConditionsFromDom();
  if (errors.length > 0) {
    alert([...new Set(errors)].join("\n"));
    return;
  }

  const shareUrl = buildShareUrl(conditions);
  const copied = await copyTextToClipboard(shareUrl);
  if (!copied) {
    prompt("Ссылка для копирования:", shareUrl);
    return;
  }

  if (!shareInitialButton) return;
  const originalText = shareInitialButton.textContent;
  shareInitialButton.textContent = "Скопировано";
  window.setTimeout(() => {
    shareInitialButton.textContent = originalText;
  }, 1200);
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

function ensureConditionColors(conditions) {
  return conditions.map((body, index) => ({
    ...body,
    color: solidColorForBody(body, index)
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

function generateRandomInitialConditions(count) {
  const safeCount = clampNumber(count, 1, MAX_BODIES);
  const radius = 0.85;
  let minSeparation = 0.35 * Math.sqrt(3 / Math.max(3, safeCount));

  const positions = [];
  for (let i = 0; i < safeCount; i += 1) {
    let selected = null;
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const candidate = randomPoint(radius);
      const ok = positions.every(
        (position) => distanceSquared(position, candidate) >= minSeparation ** 2
      );
      if (ok) {
        selected = candidate;
        break;
      }
      if (attempt === 300) {
        minSeparation *= 0.9;
      }
    }
    positions.push(selected ?? randomPoint(radius));
  }

  const velocityScale = 0.7 * Math.sqrt(3 / Math.max(3, safeCount));
  const conditions = positions.map((position) => {
    const velocity = randomPoint(velocityScale);
    return {
      m: 0.6 + Math.random() * 0.8,
      x: position.x,
      y: position.y,
      vx: velocity.x,
      vy: velocity.y
    };
  });

  return normalizeConditions(conditions);
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function buildSolarSystemPreset() {
  const sunMass = 1;
  const sun = { m: sunMass, x: 0, y: 0, vx: 0, vy: 0, color: "#ffd86b" };
  const planets = [
    // Условные единицы: расстояния ~ в а.е., массы ~ в массах Солнца (приближённо).
    { name: "Mercury", m: 1.660e-7, r: 0.387, angle: degreesToRadians(10), color: "#b9c0c7" },
    { name: "Venus", m: 2.447e-6, r: 0.723, angle: degreesToRadians(55), color: "#e7c06d" },
    { name: "Earth", m: 3.003e-6, r: 1.0, angle: degreesToRadians(100), color: "#4ca9ff" },
    { name: "Mars", m: 3.227e-7, r: 1.524, angle: degreesToRadians(145), color: "#ff7b72" },
    { name: "Jupiter", m: 9.545e-4, r: 5.203, angle: degreesToRadians(190), color: "#d2a679" },
    { name: "Saturn", m: 2.858e-4, r: 9.537, angle: degreesToRadians(235), color: "#f5e6b3" },
    { name: "Uranus", m: 4.366e-5, r: 19.191, angle: degreesToRadians(280), color: "#7ad3ff" },
    { name: "Neptune", m: 5.151e-5, r: 30.07, angle: degreesToRadians(325), color: "#7f7bff" }
  ];

  const conditions = [sun];
  planets.forEach((planet) => {
    const x = planet.r * Math.cos(planet.angle);
    const y = planet.r * Math.sin(planet.angle);
    const speed = Math.sqrt(sunMass / planet.r);
    const vx = -Math.sin(planet.angle) * speed;
    const vy = Math.cos(planet.angle) * speed;
    conditions.push({ m: planet.m, x, y, vx, vy, color: planet.color });
  });

  return conditions;
}

function buildTwoPlanetSystemPreset() {
  const starMass = 9;
  const star = { m: starMass, x: 0, y: 0, vx: 0, vy: 0 };
  const planets = [
    { m: 0.35, r: 0.65, angle: degreesToRadians(35) },
    { m: 0.22, r: 1.05, angle: degreesToRadians(205) }
  ];

  const conditions = [star];
  planets.forEach((planet) => {
    const x = planet.r * Math.cos(planet.angle);
    const y = planet.r * Math.sin(planet.angle);
    const speed = Math.sqrt(starMass / planet.r);
    const vx = -Math.sin(planet.angle) * speed;
    const vy = Math.cos(planet.angle) * speed;
    conditions.push({ m: planet.m, x, y, vx, vy });
  });

  return conditions;
}

function buildBinaryPlanetPreset() {
  const m1 = 1.2;
  const m2 = 1.0;
  const separation = 0.7;
  const totalMass = m1 + m2;
  const omega = Math.sqrt(totalMass / separation ** 3);
  const r1 = (separation * m2) / totalMass;
  const r2 = (separation * m1) / totalMass;

  return [
    { m: m1, x: -r1, y: 0, vx: 0, vy: omega * r1 },
    { m: m2, x: r2, y: 0, vx: 0, vy: -omega * r2 }
  ];
}

function buildFigureEightPreset() {
  return [
    { m: 1, x: -0.97000436, y: 0.24308753, vx: 0.466203685, vy: 0.43236573 },
    { m: 1, x: 0.97000436, y: -0.24308753, vx: 0.466203685, vy: 0.43236573 },
    { m: 1, x: 0, y: 0, vx: -0.93240737, vy: -0.86473146 }
  ];
}

const initialConditionPresets = new Map([
  [
    "custom",
    {
      title: "Текущие значения из таблицы начальных условий."
    }
  ],
  [
    "solar",
    {
      title:
        "Солнечная система: Солнце + 8 планет (приближённые массы и расстояния, почти круговые орбиты).",
      settings: { dt: 0.004, stepsPerFrame: 12, scale: 11 },
      getConditions: buildSolarSystemPreset
    }
  ],
  [
    "two-planets",
    {
      title: "Звезда + две планеты на почти круговых орбитах (условные единицы).",
      settings: { dt: 0.0005, stepsPerFrame: 10, scale: 170 },
      getConditions: buildTwoPlanetSystemPreset
    }
  ],
  [
    "binary-planet",
    {
      title: "Две сравнимые по массе планеты на круговой орбите вокруг общего центра масс.",
      settings: { dt: 0.002, stepsPerFrame: 6, scale: 260 },
      getConditions: buildBinaryPlanetPreset
    }
  ],
  [
    "figure-eight",
    {
      title: "Классическая траектория «восьмёрка» для трёх одинаковых тел.",
      settings: { dt: 0.001, stepsPerFrame: 6, scale: 160 },
      getConditions: buildFigureEightPreset
    }
  ]
]);

function updatePresetSelectTitle(presetId) {
  if (!presetSelect) return;
  const preset = initialConditionPresets.get(presetId);
  presetSelect.title = preset?.title ?? "Выберите предустановку начальных условий.";
}

function markPresetAsCustom() {
  if (!presetSelect) return;
  if (presetSelect.value === "custom") return;
  presetSelect.value = "custom";
  updatePresetSelectTitle("custom");
}

function handleInitialConditionsInput(event) {
  markPresetAsCustom();
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.field !== "color") return;
  const index = Number.parseInt(target.dataset.body ?? "", 10);
  if (!Number.isFinite(index)) return;
  const color = normalizeHexColor(target.value);
  if (!color) return;

  if (state.initialConditions[index]) {
    state.initialConditions[index].color = color;
  }
  if (state.bodies[index]) {
    state.bodies[index].color = color;
  }

  const dot = icBodies?.querySelector(`.ic-grid__label[data-index="${index}"] .dot`);
  if (dot) {
    dot.style.background = color;
  }
  renderLegend();
  drawFrame();
}

function applyPreset(presetId) {
  if (!presetSelect) return;
  if (presetId === "custom") {
    updatePresetSelectTitle("custom");
    return;
  }

  const preset = initialConditionPresets.get(presetId);
  if (!preset?.getConditions) {
    presetSelect.value = "custom";
    updatePresetSelectTitle("custom");
    return;
  }

  const conditions = preset.getConditions();
  state.initialConditions = ensureConditionColors(
    normalizeConditions(conditions).map((body) => ({ ...body }))
  );

  if (preset.settings) {
    const { dt, stepsPerFrame, scale } = preset.settings;

    if (Number.isFinite(dt)) {
      state.dt = applyRangeValue(dtRange, dt);
    }

    if (Number.isFinite(stepsPerFrame)) {
      state.stepsPerFrame = applyIntegerRangeValue(speedRange, stepsPerFrame);
      updateSpeed({ target: speedRange ?? { value: state.stepsPerFrame.toString() } });
    }

    if (Number.isFinite(scale)) {
      state.scale = applyRangeValue(scaleRange, scale);
      updateScale({ target: scaleRange ?? { value: state.scale.toString() } });
    }
  }

  state.pan.x = 0;
  state.pan.y = 0;

  renderInitialConditions();
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
  updatePresetSelectTitle(presetId);
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
    ctx.strokeStyle = paintColorForBody(body, index, 0.8);
    ctx.fillStyle = paintColorForBody(body, index, 0.8);
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

  const centerX = canvas.width / 2 + state.pan.x;
  const centerY = canvas.height / 2 + state.pan.y;

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
    ctx.strokeStyle = paintColorForBody(body, index, 0.53);
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
    ctx.fillStyle = solidColorForBody(body, index);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
  });

  dtValue.textContent = state.dt.toFixed(4);
  if (dtRangeValue) {
    dtRangeValue.textContent = state.dt.toFixed(4);
  }
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

function updateScale(event) {
  state.scale = Number.parseFloat(event.target.value);
  if (scaleValue) {
    scaleValue.textContent = state.scale >= 10 ? state.scale.toFixed(0) : state.scale.toFixed(2);
  }
}

function handlePointerDown(event) {
  if (event.button !== 0) return;
  dragState.active = true;
  dragState.pointerId = event.pointerId;
  dragState.lastClientX = event.clientX;
  dragState.lastClientY = event.clientY;
  canvas.classList.add("is-dragging");
  canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!dragState.active || event.pointerId !== dragState.pointerId) return;

  const dxClient = event.clientX - dragState.lastClientX;
  const dyClient = event.clientY - dragState.lastClientY;
  dragState.lastClientX = event.clientX;
  dragState.lastClientY = event.clientY;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  state.pan.x += dxClient * scaleX;
  state.pan.y += dyClient * scaleY;
}

function endPointerDrag(event) {
  if (!dragState.active || event.pointerId !== dragState.pointerId) return;
  dragState.active = false;
  dragState.pointerId = null;
  canvas.classList.remove("is-dragging");
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function applyInitialConditions() {
  const { conditions, errors } = readInitialConditionsFromDom();
  if (errors.length > 0) {
    alert([...new Set(errors)].join("\n"));
    return;
  }

  state.initialConditions = ensureConditionColors(conditions.map((body) => ({ ...body })));
  renderInitialConditions();
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
}

function randomizeInitialConditions() {
  const count = Math.max(1, state.initialConditions.length);
  state.initialConditions = ensureConditionColors(generateRandomInitialConditions(count));
  renderInitialConditions();
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
}

function createAdditionalBodyCondition(existingConditions) {
  const radius = 0.85;
  let minSeparation = 0.22;
  let position = randomPoint(radius);

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = randomPoint(radius);
    const ok = existingConditions.every(
      (body) => distanceSquared(candidate, body) >= minSeparation ** 2
    );
    if (ok) {
      position = candidate;
      break;
    }
    if (attempt === 100) {
      minSeparation *= 0.85;
    }
  }

  const velocity = randomPoint(0.55);
  return {
    m: 0.7 + Math.random() * 0.9,
    x: position.x,
    y: position.y,
    vx: velocity.x,
    vy: velocity.y
  };
}

function addBody() {
  const { conditions, errors } = readInitialConditionsFromDom();
  if (errors.length > 0) {
    alert([...new Set(errors)].join("\n"));
    return;
  }

  if (conditions.length >= MAX_BODIES) return;

  const existingPositions = conditions.map((body) => ({ x: body.x, y: body.y }));
  const newBody = createAdditionalBodyCondition(existingPositions);

  newBody.color = autoBodyColorHex(conditions.length);
  state.initialConditions = ensureConditionColors([...conditions, newBody]);
  renderInitialConditions();
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
}

function removeBodyAt(index) {
  const { conditions, errors } = readInitialConditionsFromDom();
  if (errors.length > 0) {
    alert([...new Set(errors)].join("\n"));
    return;
  }
  if (conditions.length <= 1) return;
  if (index < 0 || index >= conditions.length) return;

  state.initialConditions = ensureConditionColors(conditions.filter((_, i) => i !== index));
  renderInitialConditions();
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
}

toggleButton.addEventListener("click", toggleRunning);
resetButton.addEventListener("click", () => {
  renderInitialConditions();
  reset();
  state.running = false;
  toggleButton.textContent = "Пуск";
});

dtRange.addEventListener("input", updateDt);
speedRange?.addEventListener("input", updateSpeed);
scaleRange?.addEventListener("input", updateScale);
presetSelect?.addEventListener("change", (event) => applyPreset(event.target.value));
applyInitialButton?.addEventListener("click", applyInitialConditions);
addBodyButton?.addEventListener("click", addBody);
randomizeInitialButton?.addEventListener("click", randomizeInitialConditions);
shareInitialButton?.addEventListener("click", shareInitialParameters);

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", endPointerDrag);
canvas.addEventListener("pointercancel", endPointerDrag);

loadSharedParametersFromUrl();
if (presetSelect) {
  presetSelect.value = "custom";
  updatePresetSelectTitle("custom");
}
renderInitialConditions();
icBodies?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='remove-body']");
  if (!button) return;
  const index = Number.parseInt(button.dataset.index ?? "", 10);
  if (!Number.isFinite(index)) return;
  removeBodyAt(index);
});
icBodies?.addEventListener("input", handleInitialConditionsInput);
updateSpeed({ target: speedRange ?? { value: state.stepsPerFrame.toString() } });
updateScale({ target: scaleRange ?? { value: state.scale.toString() } });
reset();
requestAnimationFrame(animate);
