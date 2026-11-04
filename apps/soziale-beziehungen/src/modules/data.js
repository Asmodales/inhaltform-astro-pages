/*!
 * data.js – Laden von JSON/Adjektiven & Preload der SVG-Assets
 * (c) 2025 Stefan Pätz, Inhalt & Form Beratungsgesellschaft mbH (LöWe – Lösungsorientierte Weiterbildung)
 * Nutzung: loewe-weiterbildung.de
 * Idee dieser Datei: Datenquellen initialisieren (Adjektive, Figuren-SVGs).
 */

import { PATHS, state, bodies, armsLeft, armsRight, eyes, mouths } from './state.js';

async function preloadSVGs() {
  const path = PATHS.SVGS;
  const fetchText = f => fetch(`${path}${f}`).then(r => r.text());
  state.svgParts.body = await Promise.all(bodies.map(fetchText));
  state.svgParts.armsLeft = await Promise.all(armsLeft.map(fetchText));
  state.svgParts.armsRight = await Promise.all(armsRight.map(fetchText));
  state.svgParts.eyes = await Promise.all(eyes.map(fetchText));
  state.svgParts.mouths = await Promise.all(mouths.map(fetchText));
  state.assetsReady = true;
}

async function loadAdjectives() {
  const [people, aspects, peopleWeighted] = await Promise.all([
    d3.json(`${PATHS.DATA}adjectives_people.json`).catch(() => []),
    d3.json(`${PATHS.DATA}adjectives_aspects.json`).catch(() => []),
    d3.json(`${PATHS.DATA}adjectives_people_weighted_behaviors.json`).catch(() => [])
  ]);

  // Legacy-Pools
  state.adjectivesPeople = Array.isArray(people) ? people : [];
  state.adjectivesAspect = Array.isArray(aspects) ? aspects : [];

  // New weighted pool (robust, falls Datei fehlt oder anderes Format hat)
  state.adjectivesPeopleWeighted = Array.isArray(peopleWeighted) ? peopleWeighted : [];

  // Bisherige Fallback-Logik unverändert, damit nichts bricht
  state.adjectives =
    state.adjectivesPeople.length
      ? state.adjectivesPeople
      : (state.adjectivesAspect.length ? state.adjectivesAspect : []);
}

export async function initData() {
  await loadAdjectives();
  await preloadSVGs();
}
