// Gemeinsames für Startseite und Adminseite: Namen, Datum, Kurzmeldung und die
// Bugkarte selbst. Kein Build-Schritt, deshalb ganz normale globale Funktionen.

// Welche Spiele es gibt, weiss der Server (er liest es aus spiele.json).
// Hier steht deshalb keine Liste mehr, sondern nur die Zuordnung
// Kurzname -> Titel, die beim Laden der Seite gefüllt wird.
const SPIEL_NAME = {};

/**
 * Spieleliste holen und SPIEL_NAME füllen.
 * `spiele` sind die aktuellen, `alt` die nur noch in Meldungen vorkommenden.
 */
async function spieleLaden() {
  try {
    const antwort = await fetch('api/spiele');
    const daten = await antwort.json();
    const spiele = daten.spiele ?? [];
    const orte = daten.orte ?? [];
    const alt = daten.alt ?? [];
    for (const s of [...spiele, ...orte, ...alt]) SPIEL_NAME[s.name] = s.titel;
    return { spiele, orte, alt };
  } catch {
    return { spiele: [], orte: [], alt: [] };
  }
}

/**
 * Ein <select> mit Spielen füllen. `erste` ist der Eintrag ganz oben,
 * `gruppen` sind weitere Blöcke darunter – `[{ titel, liste }]`, jeder als
 * <optgroup>. So stehen die Spiele oben und die Nicht-Spiele darunter,
 * statt sich alphabetisch dazwischen zu mischen.
 */
function spieleInSelect(feld, liste, erste, gruppen = []) {
  if (!feld) return;
  const vorher = feld.value;
  const alleEintraege = [...liste, ...gruppen.flatMap((g) => g.liste)];
  feld.replaceChildren(new Option(erste, ''));
  // new Option() setzt den Text, nicht HTML – Titel kommen zwar aus unserer
  // eigenen Datei, aber die Regel gilt hier für jeden Text von aussen.
  for (const s of liste) feld.append(new Option(s.titel, s.name));
  for (const g of gruppen) {
    if (!g.liste.length) continue;
    const block = document.createElement('optgroup');
    block.label = g.titel;
    for (const s of g.liste) block.append(new Option(s.titel, s.name));
    feld.append(block);
  }
  if (vorher && alleEintraege.some((s) => s.name === vorher)) feld.value = vorher;
}

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
