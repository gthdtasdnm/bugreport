// Bugreport – Fehlermeldungen zu Lucky Reflex, Keep, Card Chaos und Seconds
// Start:  deno run --allow-net --allow-read --allow-write --allow-env --allow-sys server.js
//
// Zero-Dependency: HTTP kommt komplett aus der Deno-Runtime, gespeichert wird
// in einer JSON-Datei. Kein WebSocket – die Seite fragt beim Laden einmal ab.

const PORT = Number(Deno.env.get("PORT") ?? 8000);
// Lokal 0.0.0.0, damit man vom Handy im WLAN draufkommt. Hinter dem Reverse
// Proxy gehört HOST=127.0.0.1 gesetzt, sonst ist der Dienst unter Umgehung
// von Apache auch ohne HTTPS erreichbar.
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";
const PUBLIC_DIR = new URL("./public/", import.meta.url);
const DATA_FILE = Deno.env.get("BUGREPORT_DATA") ?? "./data/reports.json";

// Ohne gesetztes Token wird eines gewürfelt und ins Log geschrieben. So läuft
// die Admin-Seite nie versehentlich ungeschützt – im Dienst gehört
// Environment=BUGREPORT_ADMIN_TOKEN=… in die Unit.
const ADMIN_TOKEN = Deno.env.get("BUGREPORT_ADMIN_TOKEN") ?? crypto.randomUUID().slice(0, 8);
const TOKEN_AUS_ENV = Boolean(Deno.env.get("BUGREPORT_ADMIN_TOKEN"));

// Muss zu den Optionen in public/index.html passen.
const SPIELE = ["luckyreflex", "keep", "cardchaos", "seconds"];
const SCHWERE = ["klein", "stoert", "abbruch"];
const STATUS = ["offen", "erledigt"];

const MAX_TITEL = 120;
const MAX_TEXT = 2000;
const MAX_NAME = 40;
const MAX_MELDUNGEN = 2000;

// ---------------------------------------------------------------------------
// Speicher: eine JSON-Datei, im RAM gehalten, verzögert geschrieben
// ---------------------------------------------------------------------------
let meldungen = [];
let naechsteId = 1;
let dirty = false;

async function laden() {
  try {
    const roh = JSON.parse(await Deno.readTextFile(DATA_FILE));
    meldungen = Array.isArray(roh) ? roh : [];
  } catch {
    meldungen = [];
  }
  naechsteId = meldungen.reduce((max, m) => Math.max(max, m.id), 0) + 1;
}

async function schreiben() {
  if (!dirty) return;
  dirty = false;
  try {
    const ordner = DATA_FILE.replace(/\/[^/]+$/, "");
    if (ordner && ordner !== DATA_FILE) await Deno.mkdir(ordner, { recursive: true });
    await Deno.writeTextFile(DATA_FILE, JSON.stringify(meldungen, null, 1));
  } catch (e) {
    console.error("Meldungen konnten nicht gespeichert werden:", e.message);
  }
}

setInterval(() => schreiben(), 3000);
globalThis.addEventListener?.("unload", () => schreiben());

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
function json(daten, status = 200) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fehler(text, status = 400) {
  return json({ fehler: text }, status);
}

function saubern(wert, max) {
  if (typeof wert !== "string") return "";
  // Steuerzeichen raus, Zeilenumbruch und Tab bleiben – eine Fehlerbeschreibung
  // ist oft mehrzeilig. Angezeigt wird ohnehin nur als Text, nie als HTML.
  return wert.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, max);
}

/** Einzeiler wie Titel und Name: dort ist auch der Umbruch fehl am Platz. */
function einzeilig(wert, max) {
  return saubern(wert, max).replace(/\s+/g, " ");
}

/** Hinter Apache ist remoteAddr immer 127.0.0.1 – die echte IP steht im Header. */
function absender(req, info) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return info?.remoteAddr?.hostname ?? "unbekannt";
}

/** Vergleich ohne frühen Abbruch, damit die Laufzeit nichts über das Token verrät. */
function tokenGleich(a, b) {
  if (typeof a !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function istAdmin(req) {
  return tokenGleich(req.headers.get("x-admin-token") ?? "", ADMIN_TOKEN);
}

// Einfache Bremse gegen Spam: fünf Meldungen je IP in zehn Minuten.
const LIMIT = 5;
const FENSTER = 10 * 60 * 1000;
const zuletzt = new Map();

function darfMelden(ip) {
  const jetzt = Date.now();
  const liste = (zuletzt.get(ip) ?? []).filter((t) => jetzt - t < FENSTER);
  zuletzt.set(ip, liste);
  return liste.length < LIMIT;
}

/** Erst nach dem Speichern zählen – ein Tippfehler im Formular soll nicht
 *  auf das Kontingent gehen. */
function vermerken(ip) {
  zuletzt.set(ip, [...(zuletzt.get(ip) ?? []), Date.now()]);
}

// Alte Einträge wegräumen, damit die Map nicht endlos wächst.
setInterval(() => {
  const jetzt = Date.now();
  for (const [ip, liste] of zuletzt) {
    const rest = liste.filter((t) => jetzt - t < FENSTER);
    if (rest.length === 0) zuletzt.delete(ip);
    else zuletzt.set(ip, rest);
  }
}, FENSTER);

/** Öffentliche Sicht – ohne IP, die geht niemanden außer den Admin etwas an. */
function oeffentlich(m) {
  return {
    id: m.id,
    spiel: m.spiel,
    titel: m.titel,
    beschreibung: m.beschreibung,
    schritte: m.schritte,
    schwere: m.schwere,
    melder: m.melder,
    status: m.status,
    gemeldet: m.gemeldet,
    erledigt: m.erledigt ?? null,
    notiz: m.notiz ?? "",
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function api(req, url, info) {
  const pfad = url.pathname;

  // --- Liste (öffentlich) ---------------------------------------------------
  if (pfad === "/api/meldungen" && req.method === "GET") {
    // Neueste zuerst, offene vor erledigten.
    const liste = [...meldungen].sort((a, b) => {
      if (a.status !== b.status) return a.status === "offen" ? -1 : 1;
      return b.gemeldet - a.gemeldet;
    });
    return json({
      meldungen: liste.map(oeffentlich),
      zahlen: {
        gesamt: meldungen.length,
        offen: meldungen.filter((m) => m.status === "offen").length,
        erledigt: meldungen.filter((m) => m.status === "erledigt").length,
      },
    });
  }

  // --- Neue Meldung (öffentlich) -------------------------------------------
  if (pfad === "/api/meldungen" && req.method === "POST") {
    const ip = absender(req, info);
    if (!darfMelden(ip)) {
      return fehler("Zu viele Meldungen in kurzer Zeit. Bitte später noch einmal.", 429);
    }

    let daten;
    try { daten = await req.json(); } catch { return fehler("Kaputtes JSON."); }

    // Honigtopf: das Feld ist im Formular versteckt, nur Bots füllen es aus.
    // Für die sieht es aus, als hätte es geklappt – sonst probieren sie weiter.
    if (einzeilig(daten.webseite, 50)) return json({ ok: true, id: 0 }, 201);

    const spiel = SPIELE.includes(daten.spiel) ? daten.spiel : null;
    const titel = einzeilig(daten.titel, MAX_TITEL);
    const beschreibung = saubern(daten.beschreibung, MAX_TEXT);
    const schritte = saubern(daten.schritte, MAX_TEXT);
    const melder = einzeilig(daten.melder, MAX_NAME);
    const schwere = SCHWERE.includes(daten.schwere) ? daten.schwere : "stoert";

    if (!spiel) return fehler("Bitte ein Spiel auswählen.");
    if (titel.length < 3) return fehler("Der Titel ist zu kurz.");
    if (beschreibung.length < 10) return fehler("Bitte beschreibe den Fehler etwas genauer.");

    if (meldungen.length >= MAX_MELDUNGEN) {
      return fehler("Die Liste ist voll – bitte beim Betreiber melden.", 507);
    }

    const m = {
      id: naechsteId++,
      spiel,
      titel,
      beschreibung,
      schritte,
      melder,
      schwere,
      status: "offen",
      gemeldet: Date.now(),
      erledigt: null,
      notiz: "",
      ip,
    };
    meldungen.push(m);
    vermerken(ip);
    dirty = true;
    console.log(`  🐞  neue Meldung #${m.id} (${spiel}): ${titel}`);
    return json({ ok: true, meldung: oeffentlich(m) }, 201);
  }

  // --- Ab hier nur mit Token ------------------------------------------------
  if (pfad === "/api/admin/pruefen" && req.method === "GET") {
    return istAdmin(req) ? json({ ok: true }) : fehler("Falsches Passwort.", 401);
  }

  if (pfad.startsWith("/api/admin/")) {
    if (!istAdmin(req)) return fehler("Nicht angemeldet.", 401);

    // Adminliste: wie die öffentliche, aber mit IP und in Meldereihenfolge.
    if (pfad === "/api/admin/meldungen" && req.method === "GET") {
      const liste = [...meldungen].sort((a, b) => b.gemeldet - a.gemeldet);
      return json({ meldungen: liste.map((m) => ({ ...oeffentlich(m), ip: m.ip })) });
    }

    const treffer = pfad.match(/^\/api\/admin\/meldungen\/(\d+)$/);
    if (treffer) {
      const id = Number(treffer[1]);
      const m = meldungen.find((x) => x.id === id);
      if (!m) return fehler("Meldung gibt es nicht.", 404);

      if (req.method === "PATCH") {
        let daten;
        try { daten = await req.json(); } catch { return fehler("Kaputtes JSON."); }

        if (daten.status !== undefined) {
          if (!STATUS.includes(daten.status)) return fehler("Unbekannter Status.");
          m.status = daten.status;
          m.erledigt = daten.status === "erledigt" ? Date.now() : null;
        }
        if (daten.notiz !== undefined) m.notiz = einzeilig(daten.notiz, 300);
        dirty = true;
        return json({ ok: true, meldung: { ...oeffentlich(m), ip: m.ip } });
      }

      if (req.method === "DELETE") {
        meldungen = meldungen.filter((x) => x.id !== id);
        dirty = true;
        return json({ ok: true });
      }
    }
  }

  return fehler("Unbekannter Endpunkt.", 404);
}

// ---------------------------------------------------------------------------
// Statische Dateien
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveStatic(pathname) {
  let rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  // Ohne Endung auf .html raten, damit /admin genügt.
  if (!rel.includes(".")) rel += ".html";
  if (rel.includes("..")) return new Response("Nope", { status: 400 });
  const url = new URL(rel, PUBLIC_DIR);
  if (!url.href.startsWith(PUBLIC_DIR.href)) return new Response("Nope", { status: 400 });
  try {
    const data = await Deno.readFile(url);
    const ext = rel.slice(rel.lastIndexOf("."));
    return new Response(data, {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-cache" },
    });
  } catch {
    return new Response("404 – nicht gefunden", { status: 404 });
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
await laden();

Deno.serve({ port: PORT, hostname: HOST, onListen: ({ port }) => {
  console.log(`\n  🐞  Bugreport läuft:  http://localhost:${port}`);
  try {
    for (const net of Deno.networkInterfaces()) {
      if (net.family === "IPv4" && !net.address.startsWith("127.")) {
        console.log(`      im Netzwerk:     http://${net.address}:${port}`);
      }
    }
  } catch { /* ohne --allow-sys einfach überspringen */ }
  console.log(`      Admin:           http://localhost:${port}/admin`);
  if (TOKEN_AUS_ENV) {
    console.log("      Admin-Passwort:  aus BUGREPORT_ADMIN_TOKEN");
  } else {
    console.log(`      Admin-Passwort:  ${ADMIN_TOKEN}  (gewürfelt – BUGREPORT_ADMIN_TOKEN setzen)`);
  }
  console.log(`      Datei:           ${DATA_FILE}  (${meldungen.length} Meldungen)\n`);
} }, (req, info) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) {
    return api(req, url, info).catch((e) => {
      console.error("Fehler:", e);
      return fehler("Interner Fehler.", 500);
    });
  }
  return serveStatic(url.pathname);
});
