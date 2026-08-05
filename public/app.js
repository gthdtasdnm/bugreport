// Startseite: Formular abschicken und die gemeldeten Fehler anzeigen.

const $ = (id) => document.getElementById(id);

let alle = [];
let filterSpiel = '';
let filterStatus = 'offen';
let schwere = 'stoert';

// ── Tabs ────────────────────────────────────────────────────────────────────
// Der Tab steht im Anker, damit man die Liste direkt verlinken kann (#liste).
function tabZeigen(tab) {
  $('tab-melden').hidden = tab !== 'melden';
  $('tab-liste').hidden = tab !== 'liste';
  for (const k of document.querySelectorAll('[data-tab]')) {
    k.classList.toggle('sel', k.dataset.tab === tab);
  }
  if (tab === 'liste') laden();
}

gruppe(document.querySelector('.tabs'), 'data-tab', (tab) => {
  location.hash = tab === 'liste' ? 'liste' : '';
  tabZeigen(tab);
});


// ── Formular ────────────────────────────────────────────────────────────────
gruppe($('schwere'), 'data-schwere', (wert) => { schwere = wert; });

$('senden').addEventListener('click', async () => {
  const knopf = $('senden');
  const daten = {
    spiel: $('spiel').value,
    titel: $('titel').value,
    beschreibung: $('beschreibung').value,
    schritte: $('schritte').value,
    melder: $('melder').value,
    webseite: $('webseite').value,
    schwere,
  };

  // Dieselben Prüfungen macht der Server noch einmal – hier nur, damit die
  // Rückmeldung ohne Netzwerkweg kommt.
  if (!daten.spiel) return toast('Bitte oben ein Spiel auswählen.', true);
  if (daten.titel.trim().length < 3) return toast('Bitte einen Titel eintragen.', true);
  if (daten.beschreibung.trim().length < 10) return toast('Bitte den Fehler etwas genauer beschreiben.', true);

  knopf.disabled = true;
  try {
    const antwort = await fetch('api/meldungen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(daten),
    });
    const ergebnis = await antwort.json();
    if (!antwort.ok) {
      toast(ergebnis.fehler ?? 'Das hat nicht geklappt.', true);
      return;
    }
    toast('Danke! Die Meldung ist notiert.');
    $('titel').value = '';
    $('beschreibung').value = '';
    $('schritte').value = '';
    await laden();
  } catch {
    toast('Keine Verbindung zum Server.', true);
  } finally {
    knopf.disabled = false;
  }
});

// ── Liste ───────────────────────────────────────────────────────────────────
for (const zeile of document.querySelectorAll('#tab-liste .filter')) {
  gruppe(zeile, 'data-filter-spiel', (w) => { filterSpiel = w; zeichnen(); });
  gruppe(zeile, 'data-filter-status', (w) => { filterStatus = w; zeichnen(); });
}

async function laden() {
  try {
    const antwort = await fetch('api/meldungen');
    const daten = await antwort.json();
    alle = daten.meldungen;
    $('zahlOffen').textContent = daten.zahlen.offen;
    $('zahlErledigt').textContent = daten.zahlen.erledigt;
    $('zahlGesamt').textContent = daten.zahlen.gesamt;
    zeichnen();
  } catch {
    toast('Die Liste konnte nicht geladen werden.', true);
  }
}

function zeichnen() {
  const liste = $('liste');
  liste.replaceChildren();

  const gefiltert = alle.filter((m) =>
    (!filterSpiel || m.spiel === filterSpiel) &&
    (!filterStatus || m.status === filterStatus));

  if (gefiltert.length === 0) {
    liste.append(el('div', 'leer', alle.length === 0
      ? 'Noch nichts gemeldet. Wenn dir etwas auffällt: oben ins Formular damit.'
      : 'Zu diesem Filter gibt es nichts.'));
    return;
  }

  for (const m of gefiltert) liste.append(bugKarte(m));
}

// Beim Laden zeigt die Seite das Formular – außer der Anker sagt etwas anderes.
tabZeigen(location.hash === '#liste' ? 'liste' : 'melden');
