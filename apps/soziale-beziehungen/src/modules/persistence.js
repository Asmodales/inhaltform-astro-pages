// Storage is input, not a trusted object graph. Rebuild only the persisted fields
// used by the app; derived coordinates and views are recomputed after loading.
export const MAX_PERSIST_TICKS = 60;
const MAX_STORAGE_CHARS = 2_000_000;
const MAX_NODES = 128;
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const validName = value => typeof value === 'string' && value.length > 0 && value.length <= 18
  && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value) && !reserved.has(value.toLowerCase());
const validColor = value => typeof value === 'string' && /^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/.test(value)
  && value.match(/\d+/g).every(number => Number(number) <= 255);
const fail = () => { throw new Error('Invalid saved state'); };

function nodes(value, type, names) {
  if (!Array.isArray(value) || value.length > MAX_NODES) fail();
  return value.map(node => {
    if (!record(node) || !validName(node.name) || (node.type !== undefined && node.type !== type)) fail();
    const nameKey = node.name.toLowerCase();
    if (names.has(nameKey)) fail();
    names.add(nameKey);
    const colors = Object.create(null);
    if (node.colorLinkMap !== undefined) {
      if (!record(node.colorLinkMap) || Object.keys(node.colorLinkMap).length > 512) fail();
      for (const [name, color] of Object.entries(node.colorLinkMap)) {
        if (!validName(name) || !validColor(color)) fail();
        colors[name] = color;
      }
    }
    const result = {type, name: node.name, colorLinkMap: colors};
    if (node.metaColor !== undefined) {
      if (!validColor(node.metaColor)) fail();
      result.metaColor = node.metaColor;
    }
    // Currently all library feature objects are empty; no feature data is rendered.
    if (node.features !== undefined) result.features = {};
    return result;
  });
}

export function validateWorld(value) {
  if (!record(value)) fail();
  const names = new Set();
  const persons = nodes(value.persons, 'person', names);
  const aspects = nodes(value.aspects, 'aspect', names);
  if (persons.length + aspects.length > MAX_NODES) fail();
  return {persons, aspects};
}

function time(value) {
  if (!record(value) || !integer(value.dayIndex, 0, 4)
    || !integer(value.hour, 0, 23) || !integer(value.minute, 0, 59)) fail();
  return {dayIndex: value.dayIndex, hour: value.hour, minute: value.minute};
}

export function validateTimeline(value) {
  if (!record(value) || !Array.isArray(value.ticks) || !value.ticks.length || value.ticks.length > 2048
    || !record(value.worldByTick) || !record(value.timeByTick)) fail();
  let previous = -1;
  for (const tick of value.ticks) {
    if (!integer(tick, 0, Number.MAX_SAFE_INTEGER - 1) || tick <= previous) fail();
    previous = tick;
  }
  const ticks = value.ticks.slice(-MAX_PERSIST_TICKS);
  if (!ticks.includes(value.current)) fail();
  const currentTime = time({dayIndex: value.currentDayIndex ?? 0,
    hour: value.currentHour ?? 7, minute: value.currentMinute ?? 0});
  const worldByTick = Object.create(null), timeByTick = Object.create(null);
  for (const tick of ticks) {
    if (!Object.hasOwn(value.worldByTick, tick) || !Object.hasOwn(value.timeByTick, tick)) fail();
    worldByTick[tick] = validateWorld(value.worldByTick[tick]);
    timeByTick[tick] = time(value.timeByTick[tick]);
  }
  return {ticks, current: value.current, worldByTick, timeByTick, viewsByTick: {},
    currentDayIndex: currentTime.dayIndex, currentHour: currentTime.hour, currentMinute: currentTime.minute};
}

// Neither malformed JSON nor disabled browser storage may stop initialization.
export function readStored(getStorage, key, validate) {
  try {
    const raw = getStorage().getItem(key);
    if (raw === null) return null;
    if (raw.length > MAX_STORAGE_CHARS) fail();
    return validate(JSON.parse(raw));
  } catch { return null; }
}
