/*!
 * config.js – Statische Konfiguration (Styles, Labels, Weights, Libraries, Pfade)
 * (c) 2026 Stefan Pätz, Inhalt & Form Beratungsgesellschaft mbH (LöWe – Lösungsorientierte Weiterbildung)
 * Nutzung: loewe-weiterbildung.de
 * Idee: Alles, was "Konstante" ist (nicht mutiert), lebt hier – getrennt vom Runtime-State.
 */

export const PATHS = {
  DATA: 'src/data/',
  SVGS: 'src/assets/svgs/'
};

// Beziehungsvokabular & Stile
export const EMOTIONAL_STYLES = {
  neutral: { stroke:"#bdbdbd", dasharray:"4,3", width:3, marker:null, extra:null },
  harmonisch:{ stroke:"#43a047", dasharray:"", width:2, marker:null, extra:null },
  eng:{ stroke:"#1b5e20", dasharray:"", width:2, marker:null, extra:"double" },
  distanziert:{ stroke:"#1565c0", dasharray:"1,6", width:3, marker:null, extra:null },
  verdeckt:{ stroke:"#ffb300", dasharray:"", width:2, marker:null, extra:"wave" },
  offen:{ stroke:"#e53935", dasharray:"", width:2, marker:null, extra:"zigzag" },
  bruch:{ stroke:"#212121", dasharray:"8,10", width:3, marker:null, extra:"gap" },
  erotik:{ stroke:"#e91e63", dasharray:"", width:3, marker:null, extra:"wave-pink" },
  kooperativ:{ stroke:"#1976d2", dasharray:"", width:2 },
  rivalitaet:{ stroke:"#c62828", dasharray:"3,5", width:2 },
  hierarchie:{ stroke:"#37474f", dasharray:"", width:2, marker:"arrow" },
  allianz:{ stroke:"#00bcd4", dasharray:"2,2", width:2, extra:"double" },
  rollenbeziehung:{ stroke:"#9e9e9e", dasharray:"1,3", width:1 },
  ignorieren:{ stroke:"#bdbdbd", dasharray:"8,7", width:2, extra:"cut" }
};

export const EMOTIONAL_LABELS = {
  neutral:"Neutral", harmonisch:"Harmonisch", eng:"Freundschaftlich", distanziert:"Distanziert",
  verdeckt:"Verdeckter Konflikt", offen:"Offener Konflikt", bruch:"Bruch / Kontaktabbruch",
  erotik:"Erotische Spannung", kooperativ:"Kooperativ", rivalitaet:"Rivalität",
  hierarchie:"Hierarchie / Abhängigkeit", allianz:"Allianz / Clique",
  rollenbeziehung:"Dienstlich / Rollenbeziehung", ignorieren:"Ignorieren / Vermeidung"
};

export const ASPECT_REL_STYLES = {
  // solide Linien für positive Bedeutungen
  wichtig:       { kind: 'PA', stroke: '#0e88b1', width: 3.0, dasharray: '',        extra: null },
  ressource:     { kind: 'PA', stroke: '#0f6404ff', width: 3.0, dasharray: '',        extra: null },

  // bleibt: gut erkennbar (Dot-Dash)
  belastend:     { kind: 'PA', stroke: '#0e88b1', width: 2.4, dasharray: '6,3,1,3', extra: null },

  // bleibt: Faszination (kurze Striche)
  anziehend:     { kind: 'PA', stroke: '#7b61ff', width: 3.0, dasharray: '2,3',     extra: null },

  // Wunsch: gleicher Charakter, aber rot (kein Extra, kein Wave/Zigzag)
  konflikthaft:  { kind: 'PA', stroke: '#d32f2f', width: 2.6, dasharray: '8,4',     extra: null },

  // Deutlichere Trennung der "neutral-nahen" drei:
  unbewusst:     { kind: 'PA', stroke: '#455a64', width: 2.4, dasharray: '12,3,2,3', extra: null },
  ambivalent: { kind: 'PA', stroke: '#7e57c2', width: 2.8, dasharray: '6,2,2,2,2,2', extra: null },
  vermeidend:    { kind: 'PA', stroke: '#37474f', width: 3.0, dasharray: '1,7',     extra: null },

  // unverändert
  idealisierend: { kind: 'PA', stroke: '#4c6ef5', width: 3.2, dasharray: '',        extra: null },
  routine:       { kind: 'PA', stroke: '#8a9aa6', width: 1.8, dasharray: '',        extra: null }
};

export const ASPECT_REL_LABELS = {
  wichtig:"Wichtig / bedeutsam", ressource:"Ressource / nährend", belastend:"Belastend / drückend",
  konflikthaft:"Innerer Konflikt mit dem Thema", vermeidend:"Vermeidend / aufschiebend",
  unbewusst:"Unbewusst / blinder Fleck", anziehend:"Anziehung / Faszination",
  idealisierend:"Idealisierend / überhöht", ambivalent:"Ambivalent", routine:"Routine / Pflicht"
};

export const AA_LABELS = {
  synergie:"Synergie", spannung:"Spannung / Trade-off", kausal:"Kausal", voraussetzung:"Voraussetzung",
  konflikt:"Konflikt / Widerspruch", konkurrenz:"Konkurrenz um Ressourcen", teil_ganzes:"Teil–Ganzes",
  aehnlichkeit:"Ähnlichkeit / Cluster", abfolge:"Zeitliche Abfolge", redundanz:"Redundanz"
};

// AA_STYLES — klare Linienfamilie ohne Dasharrays
export const AA_STYLES = {
  synergie:      { stroke: '#00BCD4', width: 3.2, dasharray: '', extra: 'double' },
  spannung:      { stroke: '#FF6F00', width: 2.8, dasharray: '', extra: 'zigzag' },
  kausal:        { stroke: '#009688', width: 2.8, dasharray: '', extra: null },
  voraussetzung: { stroke: '#8E24AA', width: 2.8, dasharray: '', extra: 'wave' },
  konflikt:      { stroke: '#C62828', width: 3.0, dasharray: '', extra: 'zigzag' },
  konkurrenz:    { stroke: '#795548', width: 2.6, dasharray: '', extra: null },
  teil_ganzes:   { stroke: '#827717', width: 2.6, dasharray: '', extra: 'double' },
  aehnlichkeit:  { stroke: '#3F51B5', width: 2.6, dasharray: '', extra: 'wave' },
  abfolge:       { stroke: '#FFD600', width: 2.8, dasharray: '', extra: null },
  redundanz:     { stroke: '#607D8B', width: 2.4, dasharray: '', extra: null }
};

export const REL_WEIGHTS_PERSON = {
  neutral:12, harmonisch:10, kooperativ:8, hierarchie:6, allianz:6,
  distanziert:6, rollenbeziehung:6, eng:5, verdeckt:4, rivalitaet:3, offen:2, bruch:1, erotik:1, ignorieren:1
};
export const REL_ASPEKT_WEIGHTS = {
  wichtig:0.12, ressource:0.11, belastend:0.11, vermeidend:0.10, unbewusst:0.10,
  anziehend:0.10, konflikthaft:0.09, idealisierend:0.09, ambivalent:0.09, routine:0.09
};
export const AA_WEIGHTS = {
  synergie:0.12, spannung:0.11, kausal:0.11, voraussetzung:0.10, konflikt:0.10,
  konkurrenz:0.10, teil_ganzes:0.09, aehnlichkeit:0.09, abfolge:0.09, redundanz:0.09
};

// Figuren-Assets (Dateinamen) & Aspekt-Style
export const bodies = ['body1.svg','body2.svg','body3.svg'];
export const armsLeft = ['armlinks1.svg','armlinks2.svg','armlinks3.svg','armlinks4.svg','armlinks5.svg'];
export const armsRight = ['armrechts1.svg','armrechts2.svg','armrechts3.svg','armrechts4.svg','armrechts5.svg'];
export const eyes = Array.from({length:30}, (_,i)=>`augen${i+1}.svg`);
export const mouths = ['mund1.svg','mund2.svg','mund3.svg','mund4.svg','mund5.svg','mund6.svg','mund7.svg','mund8.svg','mund9.svg','mund10.svg'];

export const ASPECT_STYLE = { radius: 48, fill:'#e3f2fd', stroke:'#90caf9', strokeWidth: 3.1 };

// =============================
// Personenbibliothek
// =============================
export const NAME_LIBRARY = [
{ name: "Matthias", features: {} },
  { name: "Ronja", features: {} },
  { name: "Janosch", features: {} },
  { name: "Stefan", features: {} },
  { name: "Dominik", features: {} },
  { name: "Robert", features: {} },
  { name: "Sophie", features: {} },
  { name: "Petra", features: {} },
  { name: "Clemens", features: {} },
  { name: "Chantal", features: {} },
  { name: "Judith", features: {} },
  { name: "Katharina", features: {} },
  { name: "Maren", features: {} },
  { name: "Judith", features: {} },
  { name: "Leano", features: {} },
  { name: "Levi", features: {} },
  { name: "Annegret", features: {} },
  { name: "Annette", features: {} },
  { name: "Max", features: {} },
  { name: "Frank", features: {} },
  { name: "Linda", features: {} },
  { name: "Alexander", features: {} },
  { name: "Vanesssa", features: {} },
  { name: "Fritz", features: {} },
  { name: "Jasmin", features: {} },
  { name: "Viola", features: {} },
  { name: "Jessica", features: {} },
  { name: "Anna", features: {} },
  { name: "Ricarda", features: {} },
  { name: "Kathrin", features: {} },
  { name: "Christoph", features: {} },
  { name: "Mechthild", features: {} },
  { name: "Beate", features: {} },
  { name: "Christina", features: {} }
];

// =============================
// Aspektbibliothek
// =============================
export const ASPECT_LIBRARY = [
  { name: "Geld", features: {} },
  { name: "Erfolg", features: {} },
  { name: "Macht", features: {} },
  { name: "Verantwortung", features: {} },
  { name: "Schuld", features: {} },
  { name: "Vertrauen", features: {} },
  { name: "Liebe", features: {} },
  { name: "Partnerschaft", features: {} },
  { name: "Familie", features: {} },
  { name: "Herkunft", features: {} },
  { name: "Vergangenheit", features: {} },
  { name: "Gegenwart", features: {} },
  { name: "Zukunft", features: {} },
  { name: "Tod", features: {} },
  { name: "Krankheit", features: {} },
  { name: "Gesundheit", features: {} },
  { name: "Angst", features: {} },
  { name: "Wut", features: {} },
  { name: "Trauer", features: {} },
  { name: "Freude", features: {} },
  { name: "Freiheit", features: {} },
  { name: "Sicherheit", features: {} },
  { name: "Kontrolle", features: {} },
  { name: "Loslassen", features: {} },
  { name: "Sinn", features: {} },
  { name: "Identität", features: {} },
  { name: "Selbstwert", features: {} },
  { name: "Beruf", features: {} },
  { name: "Berufung", features: {} },
  { name: "Entscheidung", features: {} },
  { name: "Konflikt", features: {} },
  { name: "Frieden", features: {} },
  { name: "Alkohol", features: {} },
  { name: "Sucht", features: {} },
  { name: "Valentinstag", features: {} },
  { name: "Einsamkeit", features: {} },
  { name: "Gemeinschaft", features: {} },
  { name: "Konstruktivismus", features: {} },
  { name: "Spiritualität", features: {} },
  { name: "Hoffnung", features: {} }
];