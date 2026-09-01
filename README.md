# VIE-Airport — Vienna Arrivals & Departures

Live arrivals, departures and operational information for **Vienna International Airport (VIE / LOWW)**.

Dark ops-console style UI. All times in **Europe/Vienna** (Austrian local time).

---

## What you see

### Header
- Airport identity: **VIE**, LOWW, coordinates, elevation
- Live clock: local Vienna time + UTC

### Arrivals / Departures
- Scheduled and expected times
- Flight number links to **Flightradar24** for that flight
- Airline and origin/destination (city + IATA)
- Belt (arrivals) or gate (departures)
- Aircraft type and status with colour coding
- Search by flight, airline or city
- Auto-refresh every 60 seconds
- Time window: landed flights drop after ~20 min; departed after ~30 min; delayed flights stay visible

### Airport
- **METAR** — current observation
- **TAF** — forecast
- **Runways** and wind components from live METAR

### ATC
- ATIS, Delivery, Ground, Tower, Director, Approach, INFO and emergency frequencies for LOWW

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
| ATIS | VHF only (Austro Control) |
