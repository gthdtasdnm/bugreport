# Bugreport

Eine Seite, auf der Spieler Fehler in **allen Spielen auf inf-zeus.de** melden.
Die Meldungen sind öffentlich sichtbar, damit niemand dreimal dasselbe
schreibt; abgehakt werden sie auf einer Adminseite.

Wie die Spiele selbst: Deno, keine Abhängigkeiten, kein Build-Schritt, läuft
hinter Apache unter einem Unterpfad. Das Aussehen kommt aus derselben
`lobby-base.css` wie bei den Spielen.

## Welche Spiele zur Auswahl stehen

Nicht in diesem Repo. Die Liste kommt aus der `spiele.json` des Servers
(Vorgabe `../spiele.json`, umstellbar über `BUGREPORT_SPIELE`) – dieselbe
Datei, aus der auch die Spieleübersicht lebt. Alles daraus zählt als Spiel
außer `art: "werkzeug"`, das ist der Bugreport selbst.

Gelesen wird beim Start und danach jede Minute. **Ein neues Spiel steht also
spätestens eine Minute nach dem Eintrag in `spiele.json` im Formular, ohne
Neustart und ohne dass hier jemand etwas nachträgt.**

Ist die Datei nicht lesbar, bleibt die zuletzt gelesene Liste stehen; vor dem
ersten erfolgreichen Lesen gilt eine Notliste im Kopf von `server.js`. Der
Dienst startet damit auch dann, wenn dieses Repo allein ausgecheckt ist.

Verschwindet ein Spiel aus `spiele.json`, kann es niemand mehr melden – die
alten Meldungen dazu bleiben aber sicht- und filterbar (`alt` in
`GET /api/spiele`).

`/bugreport/?spiel=<kurzname>` wählt ein Spiel im Formular vor. Der
Anleitungsdialog auf `spiele/` verlinkt so.

## Starten

```bash
deno task start        # http://localhost:8000
deno task dev          # mit --watch
```

| Umgebungsvariable | Vorgabe | Wofür |
|---|---|---|
| `PORT` | `8000` | Port |
| `HOST` | `0.0.0.0` | in Produktion `127.0.0.1` |
| `BUGREPORT_DATA` | `./data/reports.json` | wo die Meldungen liegen |
| `BUGREPORT_ADMIN_TOKEN` | gewürfelt | Passwort für `/admin` |
| `BUGREPORT_SPIELE` | `../spiele.json` | woher die Spieleliste kommt |

Ohne gesetztes `BUGREPORT_ADMIN_TOKEN` würfelt der Start eines und schreibt es
ins Log – praktisch lokal, in Produktion gehört es in die systemd-Unit, sonst
ändert sich das Passwort bei jedem Neustart.

## Die drei Seiten

| Pfad | Was |
|---|---|
| `/` | Formular („Fehler melden") und die Liste aller Meldungen |
| `/#liste` | dasselbe, direkt auf der Liste – so ist die Liste verlinkbar |
| `/admin` | Passwort, dann abhaken, Notiz dranschreiben, löschen |

## API

Alles JSON, alles unter `/api/`. Die Adminwege wollen den Header
`x-admin-token`.

| Methode | Pfad | Wer |
|---|---|---|
| `GET` | `/api/spiele` | alle – `{spiele, alt}`, beides `[{name, titel}]` |
| `GET` | `/api/meldungen` | alle – Liste plus Zählerstände |
| `POST` | `/api/meldungen` | alle – `{spiel, titel, beschreibung, schritte?, melder?, schwere?}` |
| `GET` | `/api/admin/pruefen` | Admin – Passwort testen |
| `GET` | `/api/admin/meldungen` | Admin – wie oben, zusätzlich mit IP |
| `PATCH` | `/api/admin/meldungen/<id>` | Admin – `{status?, notiz?}` |
| `DELETE` | `/api/admin/meldungen/<id>` | Admin – endgültig weg |

`spiel` ist ein `name` aus `/api/spiele`; `schwere` eins aus `klein`,
`stoert`, `abbruch`; `status` `offen` oder `erledigt`. Formular und Filter
bauen sich aus `/api/spiele` – im HTML steht kein einziger Spielname mehr.

## Speicher

Eine JSON-Datei, im RAM gehalten und alle drei Sekunden geschrieben. Für ein
paar hundert Meldungen reicht das und es gibt nichts zu installieren. Bei 2000
Meldungen nimmt der Server keine neuen mehr an – dann von Hand aufräumen.

Die IP des Melders steht in der Datei und ist nur über die Adminwege sichtbar.
Sie ist die einzige Handhabe gegen Spam, wenn jemand die Bremse aussitzt.

## Was gegen Spam eingebaut ist

- Fünf **gespeicherte** Meldungen je IP in zehn Minuten. Abgelehnte Formulare
  zählen nicht mit, ein Tippfehler soll niemandem das Kontingent wegnehmen.
- Ein verstecktes Feld („Webseite"), das nur Bots ausfüllen. Wer es ausfüllt,
  bekommt ein freundliches „gespeichert" und nichts wird gespeichert.
- Längenbegrenzungen und Steuerzeichenfilter auf jedem Feld.

Nutzertext wird ausschließlich über `textContent` in die Seite gesetzt, nie als
HTML. Deshalb kann in einer Meldung stehen, was will.

## Deployment

Siehe `SERVER.md`. Die fertigen Dateien liegen unter `deploy/`.
