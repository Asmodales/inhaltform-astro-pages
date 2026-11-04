var e=document.querySelector(`#page`),t=document.querySelector(`#viewport`),n=document.querySelector(`#section`),r=document.querySelector(`#layout`),i=document.querySelector(`#status`),a=[...document.querySelectorAll(`[data-variant]`)],o=document.body.dataset.base,s={startseite:``,ideenwerkstatt:`ideenwerkstatt/`,kompakt:`weiterbildung/loewe-kompakt/`},c=new URLSearchParams(location.search),l=c.get(`variante`);if(c.get(`seite`)in s&&(e.value=c.get(`seite`)),[`390`,`768`,`1440`].includes(c.get(`breite`))&&(t.value=c.get(`breite`)),l===`old`||l===`compact`){document.body.dataset.single=l;for(let e of a)e.hidden=e.dataset.variant!==l}function u(){let e=Number(t.value),n=e===390?844:e===768?1024:900;for(let t of a){if(t.hidden)continue;let r=t.querySelector(`.preview`),i=t.querySelector(`iframe`),a=document.body.dataset.single!==void 0,o=t.clientWidth,s=a?1:Math.min(1,o/e);i.style.width=`${a?o:e}px`,i.style.height=`${a?Math.max(500,innerHeight-r.getBoundingClientRect().top-8):n}px`,i.style.transform=`scale(${s})`,r.style.width=`${a?o:e*s}px`,r.style.height=`${Number.parseFloat(i.style.height)*s}px`}}function d(){for(let e of a){let t=e.querySelector(`iframe`),r=t.contentDocument,i=t.contentWindow;if(!r||!i)continue;let a=n.value?r.querySelector(n.value):null,o=Number.parseFloat(i.getComputedStyle(r.documentElement).getPropertyValue(`--frame-top-height`))*16;i.scrollTo({top:a?i.scrollY+a.getBoundingClientRect().top-o-24:0,behavior:`instant`})}}function f(t){n.replaceChildren(new Option(`Seitenanfang`,``));let r=e.value===`startseite`?[`.concern-explorer__header`,`.concern-explorer__panel.is-active`]:e.value===`ideenwerkstatt`?[`.werkstatt-section`]:[`.course-page__section`,`.course-faq__group`];for(let e of r)[...t.querySelectorAll(e)].forEach((t,r)=>{let i=t.querySelector(`h2, h3`);if(i){n.add(new Option(i.textContent.trim(),t.id?`#${t.id}`:`${e}[data-spacing-section="${r}"]`));for(let t of a)t.querySelector(`iframe`).contentDocument?.querySelectorAll(e).forEach((e,t)=>e.setAttribute(`data-spacing-section`,String(t)))}})}var p=0,m=``;function h(r=!1){m=r?n.selectedOptions[0]?.textContent??``:``,p=0,i.textContent=`Vorschauen werden geladen …`,n.replaceChildren(new Option(`Seitenanfang`,``));for(let n of a){let r=n.querySelector(`iframe`);r.src=o+s[e.value];let i=n.querySelector(`[data-large]`),a=new URLSearchParams({seite:e.value,breite:t.value,variante:n.dataset.variant});i.href=`${location.pathname}?${a}`}}for(let t of a){let r=t.querySelector(`iframe`);r.addEventListener(`load`,async()=>{let o=r.contentDocument;if(!o)return;o.documentElement.dataset.spacingPreview=t.dataset.variant===`compact`?`compact`:`original`;let s=o.createElement(`style`);if(s.dataset.spacingOverride=``,s.textContent=t.dataset.variant===`compact`?`/* Paket 8: nur vom Vergleich in dessen Vorschau-Dokument geladen. */
html[data-spacing-preview="compact"] {
  --preview-section-space: var(--space-xl);
  --preview-heading-space: var(--space-s);
}

html[data-spacing-preview="compact"] .werkstatt-section,
html[data-spacing-preview="compact"] .course-page__section {
  padding-block: var(--preview-section-space);
}

html[data-spacing-preview="compact"] .course-page__section {
  row-gap: var(--preview-heading-space);
}

html[data-spacing-preview="compact"] .course-editorial-section__copy,
html[data-spacing-preview="compact"] .course-editorial-section--editorial-rows .course-editorial-section__copy {
  row-gap: var(--preview-heading-space);
}

html[data-spacing-preview="compact"] .werkstatt-section > h2,
html[data-spacing-preview="compact"] .archive-intro h2,
html[data-spacing-preview="compact"] .concern-explorer__title {
  margin-block-end: var(--preview-heading-space);
}

html[data-spacing-preview="compact"] .werkstatt-concept-intro {
  margin-block-start: 0;
}

/* Container und Header erzeugen bisher gemeinsam den großen oberen Abstand. */
html[data-spacing-preview="compact"] .concern-explorer__container {
  padding-block-start: 0;
}

html[data-spacing-preview="compact"] .concern-explorer__header {
  padding-block: var(--preview-section-space);
}

html[data-spacing-preview="compact"] .concern-explorer__service-heading,
html[data-spacing-preview="compact"] .concern-explorer__index-heading {
  padding-block-start: var(--preview-section-space);
}

@media (max-width: 767px) {
  html[data-spacing-preview="compact"] {
    --preview-section-space: var(--space-m);
  }
}
`:`/* Gesicherte Abstände vor Paket 8, ausschließlich in der Vergleichsvorschau. */
html[data-spacing-preview="original"] .werkstatt-section { padding-block: var(--space-3xl); }
html[data-spacing-preview="original"] .ideenwerkstatt-page { padding-block-end: var(--space-xl); }
html[data-spacing-preview="original"] .werkstatt-concept-intro { margin-block-start: var(--space-m); }
html[data-spacing-preview="original"] .course-page { padding-block-end: var(--space-4xl); }
html[data-spacing-preview="original"] .course-page__section {
  padding-block: clamp(3.5rem, 7vw, 7rem);
  row-gap: clamp(2rem, 5vw, 5rem);
}
html[data-spacing-preview="original"] .course-editorial-section__copy { row-gap: clamp(1.5rem, 4vw, 4rem); }
html[data-spacing-preview="original"] .course-editorial-section--editorial-rows .course-editorial-section__copy { row-gap: clamp(2.5rem, 6vw, 5rem); }
html[data-spacing-preview="original"] .about-intro__statement { padding-block: var(--space-3xl); }
html[data-spacing-preview="original"] .concern-explorer__container {
  padding-block: clamp(2.5rem, 5vw, 5rem) clamp(4rem, 8vw, 7.5rem);
}
html[data-spacing-preview="original"] .concern-explorer:has(.concern-explorer__panel--loewe.is-active) .concern-explorer__container {
  padding-block-end: clamp(2.5rem, 4vw, 4rem);
}
html[data-spacing-preview="original"] .concern-explorer__header { padding-block: var(--space-3xl); }
html[data-spacing-preview="original"] .concern-explorer__title { margin-block-end: clamp(1.25rem, 2vw, 2rem); }
html[data-spacing-preview="original"] .concern-explorer__service-heading,
html[data-spacing-preview="original"] .concern-explorer__index-heading { padding-block-start: clamp(2rem, 4vw, 4rem); }
@media (max-width: 991px) {
  html[data-spacing-preview="original"] .concern-explorer__index-heading { padding-block-start: 2rem; }
}
@media (max-width: 767px) {
  html[data-spacing-preview="original"] .werkstatt-section { padding-block: var(--space-xl); }
  html[data-spacing-preview="original"] .course-page { padding-block-end: var(--space-3xl); }
  html[data-spacing-preview="original"] .concern-explorer__container { padding-block: 2.5rem 4rem; }
}
`,o.head.append(s),await o.fonts.ready,p+=1,p===a.length){let t=a[0].querySelector(`iframe`).contentDocument;f(t);let r=e.value===`startseite`?`Wobei wir unterstützen.`:e.value===`ideenwerkstatt`?`Das Programm entsteht mit dir.`:`Häufig gestellte Fragen`,o=[...n.options].find(e=>e.textContent===(m||r));o&&(n.value=o.value),d(),i.textContent=`Beide Fassungen bereit. Die normalen Seiten verwenden jetzt die bestätigten kompakten Abstände.`}})}e.addEventListener(`change`,()=>h()),t.addEventListener(`change`,()=>{u(),h(!0)}),n.addEventListener(`change`,d),r.addEventListener(`change`,()=>{document.body.dataset.comparisonLayout=r.value,u(),d()}),new ResizeObserver(u).observe(document.querySelector(`main`)),window.addEventListener(`resize`,u),u(),h();