const TZ = "Europe/Vienna";
const REFRESH_MS = 60_000;
const API = "https://vie-tower-proxy.lukas-burtan2020.workers.dev";

const PAST_LANDED_MIN = 20;
const PAST_DEPARTED_MIN = 30;
const FUTURE_WINDOW_H = 12;

const RUNWAYS = [
  { id: "11", heading: 116 },
  { id: "29", heading: 296 },
  { id: "16", heading: 164 },
  { id: "34", heading: 344 },
];

const state = {
  arrivals: [],
  departures: [],
  sendDate: null,
  weather: null,
  errorArr: null,
  errorDep: null,
  loading: true,
  lastRefresh: null,
  refreshing: false,
};

function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const str = String(value).trim();

  if (!str) return null;

  let date = new Date(str);

  if (!Number.isNaN(date.getTime())) {
    return date;
  }

  const match = str.match(
    /^(\d{4})[-/.](\d{2})[-/.](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) return null;

  const [, year, month, day, hour = "00", minute = "00", second = "00"] =
    match;

  date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function hhmm(value) {
  const date = parseDate(value);

  if (!date) return "—";

  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TZ,
    }).format(date);
  } catch {
    return "—";
  }
}

function minutesDiff(sched, exp) {
  const a = parseDate(sched);
  const b = parseDate(exp);

  if (!a || !b) return null;

  return Math.round((b.getTime() - a.getTime()) / 60000);
}

function statusTone(code, delay) {
  const c = String(code || "").toUpperCase();

  if (["CNL", "CANCELLED", "DIV"].includes(c)) return "bad";
  if (["BLI", "LND", "ARR", "DEP", "AIR", "BLO"].includes(c)) return "ok";
  if (delay !== null && delay >= 15) return "warn";

  return "neutral";
}

function isCompleted(code) {
  const c = String(code || "").toUpperCase();

  return ["BLI", "LND", "ARR", "DEP", "BLO"].includes(c);
}

function isCancelled(code) {
  const c = String(code || "").toUpperCase();

  return ["CNL", "CANCELLED"].includes(c);
}

function fr24Url(fn) {
  const slug = String(fn || "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .toLowerCase();

  if (!slug) return null;

  return `https://www.flightradar24.com/data/flights/${slug}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function mapFlight(raw, dir) {
  const place =
    (dir === "arrivals" ? raw.origins : raw.destinations)?.[0] ?? {};

  return {
    fn: String(raw.fn ?? "").trim(),

    airline: raw.airline?.name ?? "",
    airlineCode: raw.airline?.iataCode ?? "",

    place:
      place.nameEN ??
      place.nameDE ??
      place.name ??
      "",

    placeIata: place.iataCode ?? "",

    scheduled:
      raw.scheduledatetime ??
      raw.scheduledDateTime ??
      raw.scheduled ??
      null,

    expected:
      raw.actualdatetime ??
      raw.actualDateTime ??
      raw.expected ??
      null,

    statusCode:
      raw.status?.code ??
      raw.statusCode ??
      "",

    statusText:
      raw.status?.description ??
      raw.statusText ??
      "",

    aircraft:
      raw.aircraft?.description ??
      raw.aircraft?.type ??
      "",

    gate: raw.gate ?? null,

    belt:
      raw.belt?.belt ??
      raw.belt ??
      null,

    codeshares: Array.isArray(raw.codeshares)
      ? raw.codeshares
          .map((c) => c.fn)
          .filter(Boolean)
      : [],
  };
}

function inTimeWindow(f, direction) {
  const now = Date.now();

  const pastLimit =
    direction === "arrivals"
      ? PAST_LANDED_MIN * 60_000
      : PAST_DEPARTED_MIN * 60_000;

  const futureLimit =
    FUTURE_WINDOW_H * 60 * 60_000;

  const schedDate = parseDate(f.scheduled);
  const expectedDate = parseDate(f.expected);

  const sched = schedDate?.getTime() ?? NaN;
  const expected = expectedDate?.getTime() ?? NaN;

  const ref = !Number.isNaN(expected)
    ? expected
    : sched;

  if (isCancelled(f.statusCode)) {
    if (Number.isNaN(sched)) return true;

    return sched >= now - 30 * 60_000;
  }

  if (isCompleted(f.statusCode)) {
    if (Number.isNaN(ref)) return false;

    return ref >= now - pastLimit;
  }

  if (Number.isNaN(ref)) return true;

  if (ref > now + futureLimit) return false;
  if (ref < now - 6 * 60 * 60_000) return false;

  return true;
}

function filterSort(flights, q, direction) {
  let rows = flights.filter((f) =>
    inTimeWindow(f, direction)
  );

  const needle = (q || "").trim().toLowerCase();

  if (needle) {
    rows = rows.filter((f) =>
      [
        f.fn,
        f.airline,
        f.place,
        f.placeIata,
        f.statusText,
        ...f.codeshares,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }

  return rows
    .slice()
    .sort((a, b) => {
      const aDate =
        parseDate(a.scheduled)?.getTime() ?? 0;

      const bDate =
        parseDate(b.scheduled)?.getTime() ?? 0;

      return aDate - bDate;
    })
    .slice(0, 150);
}

function rowHtml(f, isArr) {
  const delay = minutesDiff(
    f.scheduled,
    f.expected
  );

  const tone = statusTone(
    f.statusCode,
    delay
  );

  const delayHtml =
    delay != null && delay >= 15
      ? `<span class="delay">+${delay}</span>`
      : "";

  const cs =
    f.codeshares.length > 0
      ? `<span class="codeshare" title="${escapeHtml(
          f.codeshares.join(", ")
        )}">+${f.codeshares.length}</span>`
      : "";

  const gateOrBelt = isArr
    ? f.belt
    : f.gate;

  const fr = fr24Url(f.fn);

  const flightCell = fr
    ? `<a class="flight-link" href="${fr}" target="_blank" rel="noopener noreferrer" title="Open on Flightradar24">${escapeHtml(
        f.fn
      )}</a>${cs}`
    : `${escapeHtml(f.fn)}${cs}`;

  return `<tr>
    <td class="num">${hhmm(f.scheduled)}</td>
    <td class="num">${hhmm(f.expected)}${delayHtml}</td>
    <td class="num flight-cell">${flightCell}</td>
    <td class="muted airline-cell">${escapeHtml(f.airline)}</td>
    <td class="place-cell">${escapeHtml(
      f.place
    )}<span class="num muted iata">${escapeHtml(
      f.placeIata
    )}</span></td>
    <td class="num muted hide-md">${escapeHtml(
      gateOrBelt ?? "—"
    )}</td>
    <td class="num muted hide-lg">${escapeHtml(
      f.aircraft || "—"
    )}</td>
    <td><span class="status ${tone}">${escapeHtml(
      f.statusText ||
        f.statusCode ||
        "—"
    )}</span></td>
  </tr>`;
}

function renderFlights() {
  const search =
    document.getElementById("search");

  const q = search?.value ?? "";

  const tab =
    document.querySelector(
      ".tab.active"
    )?.dataset.tab || "arrivals";

  if (
    tab === "airport" ||
    tab === "atc"
  ) {
    return;
  }

  const isArr = tab === "arrivals";

  const all = isArr
    ? state.arrivals
    : state.departures;

  const err = isArr
    ? state.errorArr
    : state.errorDep;

  const notice =
    document.getElementById(
      isArr
        ? "notice-arrivals"
        : "notice-departures"
    );

  const tbody =
    document.getElementById(
      isArr
        ? "tbody-arrivals"
        : "tbody-departures"
    );

  const meta =
    document.getElementById(
      "meta-line"
    );

  if (!notice || !tbody || !meta) {
    return;
  }

  if (err) {
    notice.innerHTML =
      `<div class="notice bad"><strong>No live data.</strong> ${escapeHtml(
        err
      )}</div>`;

    tbody.innerHTML =
      `<tr><td colspan="8" class="empty">—</td></tr>`;

    meta.textContent =
      "Error loading feed";

    return;
  }

  notice.innerHTML = "";

  const rows = filterSort(
    all,
    q,
    isArr
      ? "arrivals"
      : "departures"
  );

  if (
    state.loading &&
    all.length === 0
  ) {
    tbody.innerHTML =
      `<tr><td colspan="8" class="empty">Loading live ${tab}…</td></tr>`;

    meta.textContent =
      "Loading…";

    return;
  }

  if (rows.length === 0) {
    tbody.innerHTML =
      `<tr><td colspan="8" class="empty">No movements in the current time window.</td></tr>`;
  } else {
    tbody.innerHTML = rows
      .map((f) =>
        rowHtml(f, isArr)
      )
      .join("");
  }

  const send = state.sendDate
    ? ` · as of ${hhmm(
        state.sendDate
      )}`
    : "";

  const upd = state.refreshing
    ? " · updating…"
    : "";

  meta.textContent =
    `${rows.length} shown · official VIE monitor${send}${upd}`;
}

function windComponent(
  rwyHeading,
  wdir,
  wspd
) {
  const angle =
    ((wdir -
      rwyHeading +
      540) %
      360) -
    180;

  const rad =
    (angle * Math.PI) /
    180;

  const head = Math.round(
    wspd * Math.cos(rad)
  );

  const cross = Math.round(
    Math.abs(
      wspd * Math.sin(rad)
    )
  );

  return {
    head,
    cross,
  };
}

function renderWeather() {
  const wx = state.weather;

  const metarEl =
    document.getElementById(
      "metar-body"
    );

  const tafEl =
    document.getElementById(
      "taf-body"
    );

  const wcGrid =
    document.getElementById(
      "wc-grid"
    );

  if (!metarEl) return;

  if (
    !wx ||
    !wx.ok ||
    !wx.metar
  ) {
    metarEl.innerHTML =
      `<p class="empty">${escapeHtml(
        wx?.error ||
          "METAR unavailable"
      )}</p>`;

    if (tafEl) {
      tafEl.innerHTML =
        `<pre class="taf">${escapeHtml(
          wx?.taf || "—"
        )}</pre>`;
    }

    if (wcGrid) {
      wcGrid.innerHTML =
        `<p class="empty" style="grid-column:1/-1">No wind data</p>`;
    }

    return;
  }

  const m = wx.metar;

  let obs = "—";

  const reportDate =
    parseDate(m.reportTime);

  if (reportDate) {
    try {
      obs =
        new Intl.DateTimeFormat(
          "en-GB",
          {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
          }
        ).format(reportDate) +
        " UTC";
    } catch {
      obs = "—";
    }
  }

  const wind =
    m.wdir != null
      ? `${m.wdir}° / ${
          m.wspd ?? "—"
        } kt${
          m.wgst != null
            ? ` G${m.wgst}`
            : ""
        }`
      : "—";

  const catClass =
    m.fltCat === "VFR" ||
    m.fltCat === "MVFR"
      ? "ok"
      : "";

  metarEl.innerHTML = `
    <dl class="fields">
      <div>
        <dt>Observed</dt>
        <dd class="num">${obs}</dd>
      </div>

      <div>
        <dt>Wind</dt>
        <dd class="num">${escapeHtml(
          wind
        )}</dd>
      </div>

      <div>
        <dt>Visibility</dt>
        <dd class="num">${escapeHtml(
          m.visib != null
            ? m.visib
            : "—"
        )}</dd>
      </div>

      <div>
        <dt>Temp / Dew</dt>
        <dd class="num">${
          m.temp != null
            ? `${m.temp} °C`
            : "—"
        } / ${
          m.dewp != null
            ? `${m.dewp} °C`
            : "—"
        }</dd>
      </div>

      <div>
        <dt>QNH</dt>
        <dd class="num">${
          m.altim != null
            ? `${m.altim} hPa`
            : "—"
        }</dd>
      </div>

      <div>
        <dt>Category</dt>
        <dd class="num ${catClass}">${escapeHtml(
          m.fltCat || "—"
        )}</dd>
      </div>
    </dl>

    <pre class="metar">${escapeHtml(
      m.rawOb || "—"
    )}</pre>
  `;

  if (tafEl) {
    tafEl.innerHTML =
      `<pre class="taf">${escapeHtml(
        wx.taf ||
          "No TAF available"
      )}</pre>`;
  }

  if (wcGrid) {
    if (
      typeof m.wdir ===
        "number" &&
      typeof m.wspd ===
        "number"
    ) {
      wcGrid.innerHTML =
        RUNWAYS.map((r) => {
          const {
            head,
            cross,
          } = windComponent(
            r.heading,
            m.wdir,
            m.wspd
          );

          const headLabel =
            head >= 0
              ? `Headwind ${head}`
              : `Tailwind ${-head}`;

          return `
            <div class="wc">
              <div class="num strong">
                RWY ${r.id}
              </div>

              <div class="num muted">
                ${headLabel} kt
              </div>

              <div class="num muted">
                Crosswind ${cross} kt
              </div>
            </div>
          `;
        }).join("");
    } else {
      wcGrid.innerHTML =
        `<p class="empty" style="grid-column:1/-1">Variable / calm — no components</p>`;
    }
  }
}

function updateRefreshStatus() {
  const el =
    document.getElementById(
      "refresh-status"
    );

  if (!el) return;

  if (state.refreshing) {
    el.textContent =
      "Refreshing…";
    return;
  }

  if (state.lastRefresh) {
    try {
      const t =
        new Intl.DateTimeFormat(
          "en-GB",
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: TZ,
          }
        ).format(
          state.lastRefresh
        );

      el.textContent =
        `Live data · last update ${t} · auto-refresh 60 s`;
    } catch {
      el.textContent =
        "Live data · auto-refresh every 60 s";
    }
  } else {
    el.textContent =
      "Live data · auto-refresh every 60 s";
  }
}

async function loadFlights(direction) {
  const path =
    direction === "departures"
      ? "/api/flights/departures"
      : "/api/flights/arrivals";

  const res = await fetch(
    API + path,
    {
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}`
    );
  }

  const text =
    await res.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      "Flight API returned invalid JSON"
    );
  }

  let rows = [];

  if (Array.isArray(json)) {
    rows = json;
  } else if (
    Array.isArray(json.flights)
  ) {
    rows = json.flights;
  } else if (
    direction === "arrivals" &&
    Array.isArray(
      json.monitor?.arrival
    )
  ) {
    rows = json.monitor.arrival;
  } else if (
    direction === "departures" &&
    Array.isArray(
      json.monitor?.departure
    )
  ) {
    rows = json.monitor.departure;
  } else {
    throw new Error(
      "Unexpected flight data format"
    );
  }

  const mapped = rows
    .map((r) =>
      mapFlight(
        r,
        direction
      )
    );

  return {
    flights: mapped,
    sendDate:
      json.monitor?.sendDate ??
      null,
    stale: Boolean(
      json.monitor?.stale
    ),
  };
}

async function loadWeather() {
  const res = await fetch(
    API + "/api/weather",
    {
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}`
    );
  }

  return res.json();
}

async function refresh() {
  if (state.refreshing) return;

  state.refreshing = true;

  state.loading =
    state.arrivals.length === 0 &&
    state.departures.length === 0;

  updateRefreshStatus();
  renderFlights();

  try {
    const [
      arr,
      dep,
      wx,
    ] = await Promise.all([
      loadFlights(
        "arrivals"
      ).catch((e) => ({
        error:
          e instanceof Error
            ? e.message
            : String(e),
      })),

      loadFlights(
        "departures"
      ).catch((e) => ({
        error:
          e instanceof Error
            ? e.message
            : String(e),
      })),

      loadWeather().catch(
        (e) => ({
          ok: false,
          error:
            e instanceof Error
              ? e.message
              : String(e),
        })
      ),
    ]);

    if (arr.error) {
      state.errorArr =
        arr.error;

      if (
        state.arrivals.length === 0
      ) {
        state.arrivals = [];
      }
    } else {
      state.errorArr = null;
      state.arrivals =
        arr.flights;
      state.sendDate =
        arr.sendDate;
    }

    if (dep.error) {
      state.errorDep =
        dep.error;

      if (
        state.departures.length === 0
      ) {
        state.departures = [];
      }
    } else {
      state.errorDep = null;
      state.departures =
        dep.flights;

      if (!state.sendDate) {
        state.sendDate =
          dep.sendDate;
      }
    }

    state.weather = wx;
    state.lastRefresh =
      new Date();
  } finally {
    state.loading = false;
    state.refreshing = false;

    renderFlights();
    renderWeather();
    updateRefreshStatus();
  }
}

function fmtClock() {
  const now =
    new Date();

  const localTime =
    document.getElementById(
      "local-time"
    );

  const localDate =
    document.getElementById(
      "local-date"
    );

  const utcTime =
    document.getElementById(
      "utc-time"
    );

  if (localTime) {
    localTime.textContent =
      new Intl.DateTimeFormat(
        "en-GB",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: TZ,
        }
      ).format(now);
  }

  if (localDate) {
    localDate.textContent =
      new Intl.DateTimeFormat(
        "en-GB",
        {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: TZ,
        }
      ).format(now) +
      " · local (Vienna)";
  }

  if (utcTime) {
    utcTime.textContent =
      new Intl.DateTimeFormat(
        "en-GB",
        {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        }
      ).format(now);
  }
}

function setTab(tab) {
  document
    .querySelectorAll(".tab")
    .forEach((b) => {
      b.classList.toggle(
        "active",
        b.dataset.tab === tab
      );
    });

  document
    .querySelectorAll(".panel")
    .forEach((p) => {
      p.classList.toggle(
        "active",
        p.id ===
          "panel-" + tab
      );
    });

  const toolbar =
    document.getElementById(
      "flights-toolbar"
    );

  if (toolbar) {
    toolbar.style.display =
      tab === "arrivals" ||
      tab === "departures"
        ? "flex"
        : "none";
  }

  renderFlights();
}

document
  .querySelectorAll(".tab")
  .forEach((btn) => {
    btn.addEventListener(
      "click",
      () => {
        setTab(
          btn.dataset.tab
        );
      }
    );
  });

const search =
  document.getElementById(
    "search"
  );

if (search) {
  search.addEventListener(
    "input",
    () => {
      renderFlights();
    }
  );
}

setInterval(() => {
  if (!state.refreshing) {
    renderFlights();
  }
}, 30_000);

fmtClock();

setInterval(
  fmtClock,
  1_000
);

refresh();

setInterval(
  refresh,
  REFRESH_MS
);

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      document.visibilityState ===
      "visible"
    ) {
      refresh();
    }
  }
);
