# VIE Tower — Vienna Airport Arrivals & Departures

Live arrivals, departures and operational information for **Vienna International Airport (VIE / LOWW)**.

Dark ops-console style UI. All times in **Europe/Vienna** (Austrian local time).

---

## What you see

### Header
- Airport identity: **VIE**, LOWW, coordinates, elevation
- Live clock: local Vienna time + UTC

### Arrivals
- Scheduled and expected times
- Flight number (with codeshare count when applicable)
- Airline and origin (city + IATA)
- Baggage belt
- Aircraft type
- Status (landed, delayed, cancelled, …) with colour coding
- Search by flight, airline or city
- Auto-refresh every 60 seconds

### Departures
- Same layout as arrivals
- Gate instead of belt
- Destination instead of origin

### Airport
- **METAR** — current observation (wind, visibility, temp/dew, QNH, flight category, raw text)
- **TAF** — forecast
- **ATIS** — VHF frequencies only (Arrival 122.955 · Departure 121.730); no public text ATIS API
- **Frequencies** — Tower, Ground, Delivery, Approach, Director
- **Runways** — 11/29 and 16/34 (length, width, surface)
- **Wind components** — headwind/tailwind and crosswind per runway, calculated from the live METAR

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
| Runways | Published aerodrome data |
| ATIS | VHF only (Austro Control) |

Active runway in use is decided by ATC and published via radio ATIS — it is not available in the public flight feed.
