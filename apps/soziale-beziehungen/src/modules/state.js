/*!
 * state.js – Zentrale Zustände, Konstanten & Utilities
 * (c) 2026 Stefan Pätz, Inhalt & Form Beratungsgesellschaft mbH (LöWe – Lösungsorientierte Weiterbildung)
 * Nutzung: loewe-weiterbildung.de
 * Idee dieser Datei: Eine gemeinsame, mutierbare Quelle für App-Zustände und Konstanten (ohne Re-Assigns).
 */

// ✅ Re-Export: bestehende Imports bleiben kompatibel
export {
  PATHS,
  EMOTIONAL_STYLES, EMOTIONAL_LABELS,
  ASPECT_REL_STYLES, ASPECT_REL_LABELS,
  AA_STYLES, AA_LABELS,
  REL_WEIGHTS_PERSON, REL_ASPEKT_WEIGHTS, AA_WEIGHTS,
  bodies, armsLeft, armsRight, eyes, mouths,
  ASPECT_STYLE,
  NAME_LIBRARY, ASPECT_LIBRARY
} from './config.js';

// ✅ Für interne Utilities in dieser Datei brauchen wir echte Imports:
import {
  EMOTIONAL_STYLES, EMOTIONAL_LABELS,
  ASPECT_REL_STYLES, ASPECT_REL_LABELS,
  AA_STYLES, AA_LABELS,
  REL_WEIGHTS_PERSON, REL_ASPEKT_WEIGHTS, AA_WEIGHTS
} from './config.js';

export const state = {
  // View & D3
  view: { svg: null, g: null, width: 900, height: 720 },

  // World
  persons: [],
  aspects: [],
  links: [],

  // Adjektive
  adjectivesPeople: [],
  adjectivesPeopleWeighted: [], // NEU: [{ adjective, connotation_weight, behaviors: [...] }, ...]
  adjectivesAspect: [],
  adjectives: [],

  // Zeit & Timeline
  WEEKDAYS: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'],
  currentDayIndex: 0,
  currentHour: 7,
  currentMinute: 0,
  timeline: { ticks: [], current: 0, timeByTick: {}, worldByTick: {}, viewsByTick: {} },

  // Genogramm
  genogrammMode: false,
  genogrammQualities: {},
  genogrammFocusName: null,

  // Assets
  svgParts: { body: [], armsLeft: [], armsRight: [], eyes: [], mouths: [] },
  assetsReady: false,

  // Icons (SVG inline)
  ICON_BEZIEHUNG: `<svg width="20" height="20" viewBox="0 0 16 16">
    <circle cx="8" cy="4" r="3" stroke="#1565c0" stroke-width="1.2" fill="none"/>
    <line x1="8" y1="7" x2="8" y2="13" stroke="#1565c0" stroke-width="1.2"/>
    <line x1="8" y1="9" x2="4" y2="12.5" stroke="#1565c0" stroke-width="1.2"/>
    <line x1="8" y1="9" x2="12" y2="12.5" stroke="#1565c0" stroke-width="1.2"/>
  </svg>`,
  ICON_GENOGRAMM: `<svg width="20" height="20" viewBox="0 0 20 20">
    <polyline points="2,12 6,8 10,12 14,8 18,12" fill="none" stroke="#e53935" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="2" y1="15" x2="18" y2="15" stroke="#e53935" stroke-width="2" stroke-dasharray="2,3"/>
  </svg>`,
  ICON_META: `<svg width="20" height="20" viewBox="0 0 16 16">
    <circle cx="4" cy="12" r="2" stroke="#2e7d32" stroke-width="1.2" fill="none"/>
    <circle cx="12" cy="4" r="2" stroke="#2e7d32" stroke-width="1.2" fill="none"/>
    <line x1="5.4" y1="10.6" x2="10.6" y2="5.4" stroke="#2e7d32" stroke-width="1.2"/>
  </svg>`
};
// ✅ Guard: verhindert, dass UI-Felder versehentlich wieder auf state angelegt werden.
// (ESM = strict mode) -> state.clickState = ... würde dann sofort auffallen.
Object.preventExtensions(state);

/* ---------- Utilities ---------- */
export const isAspect = n => n && n.type === 'aspect';
export const isPerson = n => n && n.type === 'person';
export const getAllNodes = () => [...state.persons, ...state.aspects];

export function randomBaseColor(){
  const r = Math.floor(Math.random()*200)+30;
  const g = Math.floor(Math.random()*200)+30;
  const b = Math.floor(Math.random()*200)+30;
  return `rgb(${r},${g},${b})`;
}
export const rand = (min,max)=>Math.floor(Math.random()*(max-min+1))+min;
export const clamp = v => Math.max(0, Math.min(255, v));
export const randomFrom = arr => arr[Math.floor(Math.random()*arr.length)];

export function nameExistsInPersons(name){ return state.persons.some(p => p.name.toLowerCase() === name.toLowerCase()); }
export function nameExistsInAspects(name){ return state.aspects.some(a => a.name.toLowerCase() === name.toLowerCase()); }

export function assignColors(){
  const nodes = getAllNodes();
  nodes.forEach(p => {
    p.colorLinkMap = p.colorLinkMap || {};
    if (isPerson(p)) p.metaColor = p.metaColor || randomBaseColor();
  });
  for (let i=0;i<nodes.length;i++){
    for (let j=i+1;j<nodes.length;j++){
      const a = nodes[i], b = nodes[j];
      if (isAspect(a) && isAspect(b)) continue;
      const col = a.colorLinkMap[b.name] || b.colorLinkMap[a.name] || randomBaseColor();
      a.colorLinkMap[b.name] = col; b.colorLinkMap[a.name] = col;
    }
  }
}

export function updateModel(){
  state.links = [];
  const nodes = getAllNodes();
  for (let i=0;i<nodes.length;i++){
    for (let j=i+1;j<nodes.length;j++){
      const a = nodes[i], b = nodes[j];
      if (isAspect(a) && isAspect(b)) continue;
      state.links.push({ source:a, target:b, color: a.colorLinkMap[b.name] || b.colorLinkMap[a.name] || randomBaseColor() });
    }
  }
  sessionStorage.setItem('persons', JSON.stringify(state.persons));
  sessionStorage.setItem('aspects', JSON.stringify(state.aspects));
}

export function adjectivesPoolFor(node){
  // WICHTIG: Diese Funktion liefert weiterhin Strings,
  // damit Simulation/Render (Legacy) nicht kaputtgehen.
  if (isPerson(node)) return state.adjectivesPeople.length ? state.adjectivesPeople : state.adjectives;
  return state.adjectivesAspect.length ? state.adjectivesAspect : state.adjectives;
}

export function getPairType(a,b){
  const isAAspect = a && a.type === 'aspect';
  const isBAspect = b && b.type === 'aspect';
  if (!isAAspect && !isBAspect) return 'PP';
  if (isAAspect && isBAspect)   return 'AA';
  return 'PA';
}

export function pickWeightedRelationshipSafe(weights){
  const keys = Object.keys(weights);
  const total = keys.reduce((sum,k)=>sum+weights[k],0);
  let r = Math.random()*total;
  for (let k of keys){ if (r < weights[k]) return k; r -= weights[k]; }
  return keys[0];
}

export function pickWeightedRelationForPair(a,b){
  const t = getPairType(a,b);
  if (t==='PP'){
    const rel = pickWeightedRelationshipSafe(REL_WEIGHTS_PERSON);
    return { kind:'PP', rel };
  }
  if (t==='PA'){
    const keys = Object.keys(REL_ASPEKT_WEIGHTS);
    const total = keys.reduce((s,k)=>s+REL_ASPEKT_WEIGHTS[k],0);
    let r = Math.random()*total;
    for (let k of keys){ if (r < REL_ASPEKT_WEIGHTS[k]) return { kind:'PA', rel:k }; r -= REL_ASPEKT_WEIGHTS[k]; }
    return { kind:'PA', rel:'routine' };
  }
  const keys = Object.keys(AA_WEIGHTS);
  const total = keys.reduce((s,k)=>s+AA_WEIGHTS[k],0);
  let r = Math.random()*total;
  for (let k of keys){ if (r < AA_WEIGHTS[k]) return { kind:'AA', rel:k }; r -= AA_WEIGHTS[k]; }
  return { kind:'AA', rel:'aehnlichkeit' };
}

export function resolveRelationStyle(desc){
  if (!desc) return EMOTIONAL_STYLES.neutral;
  if (typeof desc==='string') return EMOTIONAL_STYLES[desc] || EMOTIONAL_STYLES.neutral;
  if (desc.kind==='PA') return ASPECT_REL_STYLES[desc.rel] || ASPECT_REL_STYLES.routine;
  if (desc.kind==='AA') return AA_STYLES[desc.rel] || AA_STYLES.aehnlichkeit;
  return EMOTIONAL_STYLES[desc.rel] || EMOTIONAL_STYLES.neutral;
}
export function resolveRelationLabel(desc){
  if (!desc) return 'Neutral';
  if (typeof desc==='string') return EMOTIONAL_LABELS[desc] || desc;
  if (desc.kind==='PA') return ASPECT_REL_LABELS[desc.rel] || desc.rel;
  if (desc.kind==='AA') return AA_LABELS[desc.rel] || desc.rel;
  return EMOTIONAL_LABELS[desc.rel] || desc.rel;
}

export function randomVariation(col){
  const nums = col.match(/\d+/g).map(Number);
  return `rgb(${clamp(nums[0]+rand(-20,20))},${clamp(nums[1]+rand(-20,20))},${clamp(nums[2]+rand(-20,20))})`;
}