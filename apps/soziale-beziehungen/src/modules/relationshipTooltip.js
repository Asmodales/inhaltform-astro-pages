// Text from names or restored state must never become HTML, including exports.
export function renderRelationshipTooltip(tooltip, {active, nameA, nameB, label, color}) {
  const bold = text => {
    const element = document.createElement('b');
    element.textContent = text;
    return element;
  };
  const relation = document.createElement('span');
  relation.textContent = label;
  relation.style.color = color;
  relation.style.fontWeight = 'bold';
  tooltip.replaceChildren(bold(active), ' beschreibt die Beziehung', document.createElement('br'),
    'von ', bold(nameA), ' und ', bold(nameB), document.createElement('br'), 'als "', relation, '"');
}
