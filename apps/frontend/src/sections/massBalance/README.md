# Mass & Balance Calculator

Interactive weight and balance calculator for Diamond aircraft flight planning.

## Features

### Aircraft Support

- **OH-IHQ**: Diamond DV20 (2-seater)
- **OH-STL**: Diamond DA 40 NG Star (4-seater with single rear seat)

### Calculations

- Real-time weight and center of gravity calculations
- Zero fuel weight, takeoff weight, and landing weight
- Flight envelope validation using point-in-polygon algorithm
- Fuel burn calculations with endurance display

### User Interface

- **Loading Panel**: Interactive weight controls with sliders and input fields
- **Fuel Planning Panel**: Dedicated fuel flow and flight time controls
- **Weight Summary**: Real-time display of all weight calculations
- **Status Indicator**: Color-coded validation (green/yellow/red)
- **Flight Envelope Chart**: Visual weight and balance envelope with current aircraft position
- **Responsive layout**: below the `sm` breakpoint (600px) the read-only blocks — disclaimer
  text, Weight Summary, Aircraft Specifications and Conversion Factors — start collapsed, so
  the loading inputs are reachable without scrolling (#382). Each stays open once tapped, and
  from `sm` up they are all open as before.

### International Support

- Dual-unit displays (metric and imperial)
- Fuel flow: L/h and USG/h
- Weight: kg and lbs
- Multilingual interface (English, Finnish, Swedish)

## Architecture

### Data Loading

Aircraft specifications are loaded from JSON files in `/public/specs/`:

- `oh-ihq.json` - Diamond DV20 specifications
- `oh-stl.json` - Diamond DA 40 NG specifications

### Key Components

- `MassBalance.tsx` - Main calculator component
- `specsParser.ts` - Aircraft data loading and validation utility
- `WeightBalanceEnvelope.tsx` - Flight envelope visualization

### Validation

- Weight limits validation against aircraft specifications
- Center of gravity validation using flight envelope polygon
- Real-time color-coded feedback for all inputs

## Usage

1. Select aircraft from dropdown
2. Enter pilot, passenger, and baggage weights
3. Set fuel quantity and taxi fuel
4. Configure fuel flow and planned flight time
5. Monitor weight summary and status indicator
6. Verify position on flight envelope chart

## Data Sources

Aircraft specifications are based on:

- **OH-IHQ**: Official Weighing Report 2025, Diamond DV20 POH
- **OH-STL**: OH-STL weighing report (07.04.2016) and NG AFM Rev3

All moment arms, weight limits, and flight envelope coordinates are derived from official aircraft documentation.
