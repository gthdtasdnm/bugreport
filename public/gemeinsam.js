// Gemeinsames für Startseite und Adminseite: Namen, Datum, Kurzmeldung und die
// Bugkarte selbst. Kein Build-Schritt, deshalb ganz normale globale Funktionen.

const SPIEL_NAME = {
  luckyreflex: 'Lucky Reflex',
  keep: 'Keep',
  cardchaos: 'Card Chaos',
  seconds: 'Seconds',
};

const SCHWERE_NAME = {
  klein: 'Kleinigkeit',
  stoert: 'Stört',
  abbruch: 'Spiel kaputt',
};

/** Kurzform: <div class="bug"> mit Text – Nutzertext geht nur über textContent. */
function el(tag, klasse, text) {
  const n = document.createElement(tag);
  if (klasse) n.className = klasse;
  if (text !== undefined && text !== null && text !== '') n.textContent = text;
  return n;
}

function datum(ms) {
  return new Date(ms).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

let toastTimer = null;
function toast(text, schlecht = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.toggle('bad', schlecht);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/**
 * Eine Meldung als Karte. `zusatz` ist optional und wird unten angehängt –
 * darüber hängt die Adminseite ihre Schalter ein.
 */
function bugKarte(m, zusatz) {
  const karte = el('article', 'bug' + (m.status === 'erledigt' ? ' erledigt' : ''));

  const kopf = el('div', 'bug-kopf');
  kopf.append(el('span', 'bug-nr', '#' + m.id), el('h3', 'bug-titel', m.titel));
  karte.append(kopf);

  const pills = el('div', 'bug-pills');
  pills.append(
    el('span', 'pill spiel', SPIEL_NAME[m.spiel] ?? m.spiel),
    el('span', 'pill ' + m.schwere, SCHWERE_NAME[m.schwere] ?? m.schwere),
    el('span', 'pill ' + (m.status === 'erledigt' ? 'fertig' : 'offen'),
       m.status === 'erledigt' ? 'Erledigt' : 'Offen'),
  );
  karte.append(pills);

  karte.append(el('p', 'bug-text', m.beschreibung));
  if (m.schritte) karte.append(el('p', 'bug-schritte', m.schritte));
  if (m.notiz) karte.append(el('p', 'bug-notiz', 'Notiz: ' + m.notiz));

  const fuss = el('div', 'bug-fuss');
  fuss.append(el('span', null, 'gemeldet ' + datum(m.gemeldet)));
  if (m.melder) fuss.append(el('span', null, 'von ' + m.melder));
  if (m.erledigt) fuss.append(el('span', null, 'erledigt ' + datum(m.erledigt)));
  karte.append(fuss);

  if (zusatz) karte.append(zusatz);
  return karte;
}

/** Umschalter für eine Gruppe von .chip/.seg – setzt .sel und meldet den Wert. */
function gruppe(container, attribut, beiWahl) {
  container.addEventListener('click', (e) => {
    const knopf = e.target.closest('[' + attribut + ']');
    if (!knopf || !container.contains(knopf)) return;
    for (const k of container.querySelectorAll('[' + attribut + ']')) k.classList.remove('sel');
    knopf.classList.add('sel');
    beiWahl(knopf.getAttribute(attribut));
  });
}
