/* VIE Tower — live preview (arrivals / departures / METAR / TAF) */

const TZ = "Europe/Vienna";
const REFRESH_MS = 60_000;

const RUNWAYS = [
  { id: "11", heading: 116 },
  { id: "29", heading: 296 },
  { id: "16", heading: 164 },
  { id: "34", heading: 344 },
];

/** @type {{ arrivals: any[], departures: any[], sendDate: string|null, weather: any }} */
const state = {
  arrivals: [],
  departures: [],
  sendDate: null,
  weather: null,
  errorArr: null,
  errorDep: null,
  loading: true,
};

function hhmm(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(d);
}

function minutesDiff(sched, exp) {
  if (!sched || !exp) return null;
  const a = new Date(sched).getTime();
  const b = new Date(exp).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60000);
}

function statusTone(code, delay) {
  const c = String(code || "").toUpperCase();
  if (["CNL", "CANCELLED", "DIV"].includes(c)) return "bad";
  if (["BLI", "LND", "ARR", "DEP", "AIR", "BLO"].includes(c)) return "ok";
  if (delay !== null && delay >= 15) return "warn";
  return "neutral";
}

function mapFlight(raw, dir) {
  const place = (dir === "arrivals" ? raw.origins : raw.destinations)?.[0] ?? {};
  return {
    fn: String(raw.fn ?? "").trim(),
    airline: raw.airline?.name ?? "",
    airlineCode: raw.airline?.iataCode ?? "",
    place: place.nameDE ?? place.nameEN ?? place.name ?? "",
    placeIata: place.iataCode ?? "",
    scheduled: raw.scheduledatetime ?? null,
    expected: raw.actualdatetime ?? null,
    statusCode: raw.status?.code ?? "",
    statusText: raw.status?.description ?? "",
    aircraft: raw.aircraft?.description ?? raw.aircraft?.type ?? "",
    gate: raw.gate ?? null,
    belt: raw.belt?.belt ?? null,
    codeshares: (raw.codeshares ?? []).map((c) => c.fn).filter(Boolean),
  };
}

function filterSort(flights, q) {
  const cutoff = Date.now() - 60 * 60 * 1000;
  let rows = flights.filter((f) => {
    const t = new Date(f.expected ?? f.scheduled ?? "").getTime();
    return Number.isNaN(t) ? true : t >= cutoff;
  });
  const needle = (q || "").trim().toLowerCase();
  if (needle) {
    rows = rows.filter((f) =>
      [f.fn, f.airline, f.place, f.placeIata, f.statusText, ...f.codeshares]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }
  return rows
    .slice()
    .sort(
      (a, b) =>
        new Date(a.scheduled ?? 0).getTime() - new Date(b.scheduled ?? 0).getTime()
    )
    .slice(0, 150);
}

function rowHtml(f, isArr) {
  const delay = minutesDiff(f.scheduled, f.expected);
  const tone = statusTone(f.statusCode, delay);
  const delayHtml =
    delay != null && delay >= 15
      ? `<span class="delay">+${delay}</span>`
      : "";
  const cs =
    f.codeshares.length > 0
      ? `<span class="codeshare" title="${f.codeshares.join(", ")}">+${f.codeshares.length}</span>`
      : "";
  const gateOrBelt = isArr ? f.belt : f.gate;

  return `<tr>
    <td class="num">${hhmm(f.scheduled)}</td>
    <td class="num">${hhmm(f.expected)}${delayHtml}</td>
    <td class="num" style="font-weight:500">${f.fn}${cs}</td>
    <td class="muted">${f.airline}</td>
    <td>${f.place}<span class="num muted" style="margin-left:6px;font-size:11px">${f.placeIata}</span></td>
    <td class="num muted hide-md">${gateOrBelt ?? "—"}</td>
    <td class="num muted hide-lg">${f.aircraft || "—"}</td>
    <td><span class="status ${tone}">${f.statusText || f.statusCode || "—"}</span></td>
  </tr>`;
}

function renderFlights() {
  const q = document.getElementById("search").value;
  const tab = document.querySelector(".tab.active")?.dataset.tab || "arrivals";
  if (tab === "airport") return;

  const isArr = tab === "arrivals";
  const all = isArr ? state.arrivals : state.departures;
  const err = isArr ? state.errorArr : state.errorDep;
  const notice = document.getElementById(isArr ? "notice-arrivals" : "notice-departures");
  const tbody = document.getElementById(isArr ? "tbody-arrivals" : "tbody-departures");
  const meta = document.getElementById("meta-line");

  if (err) {
    notice.innerHTML = `<div class="notice bad"><strong>No live data.</strong> ${err}</div>`;
    tbody.innerHTML = `<tr><td colspan="8" class="empty">—</td></tr>`;
    meta.textContent = "Error loading feed";
    return;
  }
  notice.innerHTML = "";

  const rows = filterSort(all, q);
  if (state.loading && all.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">Loading live ${tab}…</td></tr>`;
    meta.textContent = "Loading…";
    return;
  }
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">No movements match the filter.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map((f) => rowHtml(f, isArr)).join("");
  }

  const send = state.sendDate
    ? ` · as of ${hhmm(state.sendDate)}`
    : "";
  meta.textContent = `${rows.length} of ${all.length} movements · official VIE monitor${send} · auto-refresh 60 s`;
}

function windComponent(rwyHeading, wdir, wspd) {
  const angle = ((wdir - rwyHeading + 540) % 360) - 180;
  const rad = (angle * Math.PI) / 180;
  const head = Math.round(wspd * Math.cos(rad));
  const cross = Math.round(Math.abs(wspd * Math.sin(rad)));
  return { head, cross };
}

function renderWeather() {
  const wx = state.weather;
  const metarEl = document.getElementById("metar-body");
  const tafEl = document.getElementById("taf-body");
  const wcGrid = document.getElementById("wc-grid");

  if (!wx || !wx.ok || !wx.metar) {
    metarEl.innerHTML = `<p class="empty">${wx?.error || "METAR unavailable"}</p>`;
    tafEl.innerHTML = `<pre class="taf">${wx?.taf || "—"}</pre>`;
    wcGrid.innerHTML = `<p class="empty" style="grid-column:1/-1">No wind data</p>`;
    return;
  }

  const m = wx.metar;
  const obs = m.reportTime
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(new Date(m.reportTime)) + " UTC"
    : "—";

  const wind =
    m.wdir != null
      ? `${m.wdir}° / ${m.wspd ?? "—"} kt${m.wgst != null ? ` G${m.wgst}` : ""}`
      : "—";

  const catClass = m.fltCat === "VFR" || m.fltCat === "MVFR" ? "ok" : "";

  metarEl.innerHTML = `
    <dl class="fields">
      <div><dt>Observed</dt><dd class="num">${obs}</dd></div>
      <div><dt>Wind</dt><dd class="num">${wind}</dd></div>
      <div><dt>Visibility</dt><dd class="num">${m.visib != null ? m.visib : "—"}</dd></div>
      <div><dt>Temp / Dew</dt><dd class="num">${m.temp != null ? m.temp + " °C" : "—"} / ${m.dewp != null ? m.dewp + " °C" : "—"}</dd></div>
      <div><dt>QNH</dt><dd class="num">${m.altim != null ? m.altim + " hPa" : "—"}</dd></div>
      <div><dt>Category</dt><dd class="num ${catClass}">${m.fltCat || "—"}</dd></div>
    </dl>
    <pre class="metar">${m.rawOb || "—"}</pre>
  `;

  tafEl.innerHTML = `<pre class="taf">${wx.taf || "No TAF available"}</pre>`;

  if (typeof m.wdir === "number" && typeof m.wspd === "number") {
    wcGrid.innerHTML = RUNWAYS.map((r) => {
      const { head, cross } = windComponent(r.heading, m.wdir, m.wspd);
      const headLabel = head >= 0 ? `Headwind ${head}` : `Tailwind ${-head}`;
      return `<div class="wc">
        <div class="num strong">RWY ${r.id}</div>
        <div class="num muted">${headLabel} kt</div>
        <div class="num muted">Crosswind ${cross} kt</div>
      </div>`;
    }).join("");
  } else {
    wcGrid.innerHTML = `<p class="empty" style="grid-column:1/-1">Variable / calm — no components</p>`;
  }
}

async function loadFlights(direction) {
  const url =
    direction === "departures"
      ? "/api/flights/departures"
      : "/api/flights/arrivals";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const rows = json.monitor?.departure ?? [];
  const mapped = rows.map((r) => mapFlight(r, direction));
  return {
    flights: mapped,
    sendDate: json.monitor?.sendDate ?? null,
    stale: Boolean(json.monitor?.stale),
  };
}

async function loadWeather() {
  const res = await fetch("/api/weather");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function refresh() {
  state.loading = true;
  try {
    const [arr, dep, wx] = await Promise.all([
      loadFlights("arrivals").catch((e) => ({ error: e.message })),
      loadFlights("departures").catch((e) => ({ error: e.message })),
      loadWeather().catch((e) => ({ ok: false, error: e.message })),
    ]);

    if (arr.error) {
      state.errorArr = arr.error;
      state.arrivals = [];
    } else {
      state.errorArr = null;
      state.arrivals = arr.flights;
      state.sendDate = arr.sendDate;
    }

    if (dep.error) {
      state.errorDep = dep.error;
      state.departures = [];
    } else {
      state.errorDep = null;
      state.departures = dep.flights;
      if (!state.sendDate) state.sendDate = dep.sendDate;
    }

    state.weather = wx;
  } finally {
    state.loading = false;
    renderFlights();
    renderWeather();
  }
}

function fmtClock() {
  const now = new Date();
  document.getElementById("local-time").textContent = new Intl.DateTimeFormat(
    "en-GB",
    { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ }
  ).format(now);
  document.getElementById("local-date").textContent =
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: TZ,
    }).format(now) + " · local (Vienna)";
  document.getElementById("utc-time").textContent = new Intl.DateTimeFormat(
    "en-GB",
    { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
  ).format(now);
}

function setTab(tab) {
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("active", p.id === "panel-" + tab);
  });
  const toolbar = document.getElementById("flights-toolbar");
  toolbar.style.display = tab === "airport" ? "none" : "flex";
  renderFlights();
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

document.getElementById("search").addEventListener("input", () => renderFlights());

fmtClock();
setInterval(fmtClock, 1000);
refresh();
setInterval(refresh, REFRESH_MS);
