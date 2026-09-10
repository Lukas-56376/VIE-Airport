# VIE-Airport — Vienna Arrivals & Departures

Live arrivals, departures and operational information for **Vienna International Airport (VIE / LOWW)**.

**Live demo:** [https://lukas-56376.github.io/VIE-Airport/](https://lukas-56376.github.io/VIE-Airport/)

---

## What you see

### Header
- Airport identity: **VIE**, LOWW, coordinates, elevation
- Live clock: local Vienna time + UTC
- Dark / light theme toggle (preference saved)

### Arrivals / Departures
- Scheduled and expected times
- Flight number links to **Flightradar24**
- Airline and origin/destination (city + IATA)
- Belt (arrivals) or gate (departures)
- Aircraft type and status with colour coding
- Search by **flight number, airline or city** (status text excluded)
- Filter by status: on time, delayed, landed/departed, cancelled
- Sort by time, status or city
- Auto-refresh every 60 seconds
- Time window: landed flights drop after ~20 min; departed after ~30 min; delayed flights stay visible

### Airport
- **METAR** — current weather
- **TAF** — forecast
- **Runways** and wind components calculated from live METAR

### ATC
- ATIS, Delivery, Ground, Tower, Director, Approach, INFO and emergency frequencies for LOWW
- **Listen live** links to LiveATC.net for LOWW audio streams, DISLAIMER: LiveATC.net doesn't have LOWW yet.

---

## Status colours

| Tone | Meaning |
|------|---------|
| Green | Landed / departed / on blocks / airborne |
| Amber | Delay ≥ 15 minutes |
| Red | Cancelled / diverted |
| Neutral | Scheduled / expected |

---

## Data sources

| Data | Source |
|------|--------|
| Flights | Official Vienna Airport flight monitor |
| METAR / TAF | NOAA Aviation Weather Center (LOWW) |
| Flight links | Flightradar24 |
| Frequencies | Published aerodrome / AIP data |
| Live ATC audio | LiveATC.net (volunteer feeds) |

> **Not for operational flight planning or navigation.** Always verify with official sources.

---

## Journey / how this project evolved

This board started as a practical dashboard for people around Vienna who want a clean view of arrivals and departures without opening several sites.

**Early version** focused on live data: flights from the official VIE monitor, METAR/TAF from NOAA, static runway and frequency tables. One long build session got the core working.

**Feedback** from reviews pointed at three main areas:
1. Search was too broad (matched status text) and there was no way to filter or sort.
2. UI needed a proper dark/light theme and clearer hierarchy.
3. Documentation was thin — only one long 8-hour style log.

### What I learned
- Live airport data needs careful time windows (landed/departed drop-off, delayed stay visible).
- Small filters and a scoped search make a table much more usable than “search everything”.
- Theme support and a strong disclaimer matter for a public dashboard.
- Short, focused devlogs are easier for reviewers to follow than one long dump.

### What’s next
- Support for more airports (structure is ready to generalise).
- Optional interactive map / aircraft position for a selected flight.
- More detailed loading skeletons and offline-friendly messaging.

---

## Tech

- Plain **HTML + CSS + JS** (no framework)
- Custom dark/light UI
- Deployed on **GitHub Pages**
- Data via a small proxy worker to the official VIE flight feed + NOAA

---

## Run locally

```bash
# simple static server (any will do)
python serve.py
# or
npx serve .
```

Open the printed URL. Live data requires network access to the proxy and NOAA.

---

## Licence / disclaimer

Informational use only. Not for operational flight planning or navigation. Flight data comes from the official Vienna Airport monitor; weather from NOAA; audio from LiveATC.net volunteer feeds. Frequencies can change — always check current AIP / ATIS.
