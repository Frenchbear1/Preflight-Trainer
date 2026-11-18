# Preflight Trainer

An interactive 3D preflight and checklist trainer, starting with the **Piper PA-28-181 Pilot 100i** (G3X Touch, G5, GNX 375, GNC 255A, GFC 500).

Open it in Safari on an iPad (or any modern browser): **https://frenchbear1.github.io/Preflight-Trainer/**

## What's in it now (stage 1: the airplane)

- **Exterior** built to the POH three-view (Figure 1-1): 35'6" span, 24' length, 7'3.5" height, semi-tapered wing with 7° dihedral, all-moving stabilator with trim tab, rudder, flaps (0/10/25/40), ailerons, air-oil struts, brakes, tires, cowling, oil door and dipstick, fuel caps (with fuel level and the 17-gal tab), sump and strainer drains, tank vents, fresh air inlets, pitot/static head, stall warning detector, OAT probe, wing-tip lights, antennas, static wicks, tie-downs, chocks and the pitot cover.
- **Cockpit** laid out from the POH instrument panel drawing (Figure 7-19): G3X PFD with engine strip and CAS messages, G5 standby, GNX 375, GNC 255A, GMC 507, the eight-switch electrical row, magnetos, ENGINE START, both rows of circuit breakers (Figure 7-17, with ratings from Figure 7-15), dimmers, ALT AIR, heat/defrost, ELT remote, Hobbs meters, quadrant (Figure 7-1), rudder trim, parking brake, flap handle and trim wheel (Figure 7-3), fuel selector (Figure 7-11), alternate static, pitot/static drains, yokes, pedals and seats.
- **Everything moves.** Tap switches and breakers, drag levers, the yoke, trims and flaps. The airplane reacts: the buses power up, displays boot, CAS messages come and go, lights work outside, the stall horn sounds when you lift the vane with the battery on, and the engine can be primed, started and run.

## Using it

- **Outside:** drag to walk around the airplane, pinch to zoom, tap a part to see what it is and what it's set to.
- **Cockpit:** drag to look around, pinch to zoom in on the panel, tap or drag controls.
- **Parts** lists every part; picking one flies the camera to it. **Reset** puts the airplane back to parked.

## Coming next

1. Preflight walk-around, step by step outside the airplane
2. Cockpit checklists through landing and shutdown, with the camera zooming to each item and an enlarged view for small ones
3. Emergency checklists
4. Free play with full control

## Notes

- This is a study aid. The airplane's own POH (Piper report VB-2960) and placards always take priority. The POH itself is not included in this repository.
- Screens are simplified training drawings, not copies of the manufacturer's displays.
- Runs as plain static files. To try it locally: `python3 -m http.server` in this folder, then open `http://localhost:8000`.
- Uses [three.js](https://threejs.org) (MIT license, in `vendor/three`).
