// Adminseite: anmelden, Meldungen abhaken, Notiz dranschreiben, Spam löschen.

const $ = (id) => document.getElementById(id);

// sessionStorage, nicht localStorage: mit dem Schließen des Tabs ist man
// abgemeldet. Das Token ist nur ein Passwort, keine Sitzung.
let token = sessionStorage.getItem('bugadmin') ?? '';
let alle = [];
let filterSpiel = '';
let filterStatus = 'offen';

function anfrage(pfad, optionen = {}) {
  return fetch(pfad, {
    ...optionen,
    headers: { ...(optionen.headers ?? {}), 'x-admin-token': token },
  });
}

// ── Anmeldung ───────────────────────────────────────────────────────────────
$('anmelden').addEventListener('click', () => anmelden($('passwort').value));
$('passwort').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') anmelden($('passwort').value);
});

async function anmelden(eingabe) {
  token = eingabe.trim();
  if (!token) return toast('Bitte das Passwort eintragen.', true);
  try {
    const antwort = await anfrage('api/admin/pruefen');
    if (!antwort.ok) {
      sessionStorage.removeItem('bugadmin');
      return toast('Falsches Passwort.', true);
    }
    sessionStorage.setItem('bugadmin', token);
    $('anmeldung').hidden = true;
    $('verwaltung').hidden = false;
    $('passwort').value = '';
    laden();
  } catch {
    toast('Keine Verbindung zum Server.', true);
  }
}

$('abmelden').addEventListener('click', () => {
  sessionStorage.removeItem('bugadmin');
  token = '';
  $('verwaltung').hidden = true;
  $('anmeldung').hidden = false;
});

// ── Liste ───────────────────────────────────────────────────────────────────
// Der Spielfilter kommt aus api/spiele – der Weg ist öffentlich, hier braucht
// es kein Token. `alt` ist mit drin, sonst wären Meldungen zu abgeschalteten
// Spielen nicht mehr auffindbar.
spieleLaden().then(({ spiele, orte, alt }) => {
  spieleInSelect($('filterSpiel'), spiele, 'Alles', [
    { titel: 'Kein Spiel', liste: orte },
    { titel: 'Nicht mehr da', liste: alt },
  ]);
  if (alle.length) zeichnen();
});

$('filterSpiel').addEventListener('change', (e) => { filterSpiel = e.target.value; zeichnen(); });
for (const zeile of document.querySelectorAll('#verwaltung .filter')) {
  gruppe(zeile, 'data-filter-status', (w) => { filterStatus = w; zeichnen(); });
}

async function laden() {
  try {
    const antwort = await anfrage('api/admin/meldungen');
    if (antwort.status === 401) return $('abmelden').click();
    alle = (await antwort.json()).meldungen;
    $('zahlOffen').textContent = alle.filter((m) => m.status === 'offen').length;
    $('zahlErledigt').textContent = alle.filter((m) => m.status === 'erledigt').length;
    $('zahlGesamt').textContent = alle.length;
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
    liste.append(el('div', 'leer', 'Zu diesem Filter gibt es nichts.'));
    return;
  }

  for (const m of gefiltert) liste.append(bugKarte(m, schalter(m)));
}

/** Die Adminzeile unter jeder Karte. */
function schalter(m) {
  const zeile = el('div', 'bug-admin');

  const haken = el('button', 'btn sm ' + (m.status === 'offen' ? 'primary' : 'ghost'),
                   m.status === 'offen' ? '✓ Abhaken' : '↩ Wieder öffnen');
  haken.addEventListener('click', () =>
    aendern(m.id, { status: m.status === 'offen' ? 'erledigt' : 'offen' }));

  const notiz = el('input');
  notiz.type = 'text';
  notiz.maxLength = 300;
  notiz.placeholder = 'Notiz (z. B. „behoben in 1.2")';
  notiz.value = m.notiz ?? '';
  // Enter oder Verlassen des Feldes speichert – ohne extra Knopf.
  notiz.addEventListener('keydown', (e) => { if (e.key === 'Enter') notiz.blur(); });
  notiz.addEventListener('blur', () => {
    if (notiz.value.trim() !== (m.notiz ?? '')) aendern(m.id, { notiz: notiz.value });
  });

  const weg = el('button', 'btn sm gefahr', 'Löschen');
  weg.addEventListener('click', () => loeschen(m));

  const ip = el('span', 'small muted', m.ip ?? '');

  zeile.append(haken, notiz, weg, ip);
  return zeile;
}

async function aendern(id, daten) {
  try {
    const antwort = await anfrage('api/admin/meldungen/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(daten),
    });
    if (!antwort.ok) return toast('Das hat nicht geklappt.', true);
    const { meldung } = await antwort.json();
    const i = alle.findIndex((m) => m.id === id);
    if (i >= 0) alle[i] = meldung;
    $('zahlOffen').textContent = alle.filter((m) => m.status === 'offen').length;
    $('zahlErledigt').textContent = alle.filter((m) => m.status === 'erledigt').length;
    zeichnen();
  } catch {
    toast('Keine Verbindung zum Server.', true);
  }
}

async function loeschen(m) {
  // Bewusst confirm(): Löschen ist endgültig, die Datei kennt kein Rückgängig.
  if (!confirm(`Meldung #${m.id} „${m.titel}" endgültig löschen?`)) return;
  try {
    const antwort = await anfrage('api/admin/meldungen/' + m.id, { method: 'DELETE' });
    if (!antwort.ok) return toast('Das hat nicht geklappt.', true);
    alle = alle.filter((x) => x.id !== m.id);
    $('zahlGesamt').textContent = alle.length;
    $('zahlOffen').textContent = alle.filter((x) => x.status === 'offen').length;
    $('zahlErledigt').textContent = alle.filter((x) => x.status === 'erledigt').length;
    zeichnen();
    toast('Gelöscht.');
  } catch {
    toast('Keine Verbindung zum Server.', true);
  }
}

// Nach einem Neuladen der Seite mit dem gemerkten Passwort direkt weiter.
if (token) anmelden(token);
