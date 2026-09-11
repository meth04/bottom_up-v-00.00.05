# bottom up

A turn-based village game. You start with two people in a single
timbermellow forest on a hand-drawn world, live off the land until it runs
dry, and spread out to find more — exploring wild land, and eventually
seizing it from the villages around you — until you learn to farm.

Runs in any modern browser. Plain HTML/CSS/JS, nothing to install.

---

## Getting it running

The game needs to be served over HTTP (browsers won't let a page opened
straight from a folder load the map data). From the project folder:

```
node scripts/dev-server.js
```

then open **http://localhost:8080** in a browser. Any other static server
works too (`npx serve .`, `python -m http.server 8000`).

### Worlds and seeds

Every world is built from a number called the seed. Open the game with a
seed in the address to get that exact world again:

```
http://localhost:8080/?seed=424242
```

With no seed you get a random world. The seed is shown on the **World**
panel in the top-right corner.

### Saving

The game saves itself at the end of every turn, in the browser, and picks
that save up next time you open the page. The **Menu** tab in the
bottom-right corner has **Save game**, which saves right now, and **New
world**, which throws the save away and starts over on a fresh seed — plus
the switch that turns the map animations off and the one that silences the
learning helper. Saves live in the browser you played in, so a different browser or
a private window starts fresh.

### Just want to look at a map?

```
node scripts/build-standalone.js [seed]
```

writes `map-preview.html`, a single file you can double-click or send to
someone — no server needed. It shows a whole world without the fog, with
a button to roll another one.

---

## How to play

### The goal

There is no score and no ending yet. The story is a village outgrowing its
environment: the forest you start in feeds you for a while, then you have
to push outward. How far you get before the garlocks or the winter catch
up with you is the game.

### The screen

The map fills the window; the controls float over it in panels, laid out
the way RimWorld lays its own out.

* **Colonist bar** (top, middle) — one card per villager and soldier, with
  a name, a face and a bar that empties as the barns do. A warning mark
  means hungry; a roof mark means no house to sleep in. Click one to jump
  the view back to the village.
* **Resource readout** (top left) — work hours left, then each store: what
  is in the barn and, beside it, what is still out there **on land** — on
  the tiles you hold. Then people, barn space, roofs and tiles held. Hover
  any line for what it is and why it matters.
* **World** (top right) — the whole map in miniature, with a box around
  the part you are looking at. Click anywhere on it to jump there.
* **Learning helper** (below it) — tells you what to do next, one thing at
  a time, until you turn it off.
* **Alerts** (right, above the clock) — the things about to go wrong, red
  first: starvation, a raid coming, people without a roof, barns
  overflowing, hours you haven't spent. **Click an alert and it opens the
  button that fixes it and flashes it.**
* **Letters** (under the alerts) — what just happened. The whole history is
  behind **History**.
* **Inspect pane** (bottom left) — the tile you have selected: what is on
  it, how much is left, and whether it regrows. Above it sit its commands —
  **Explore** or **Seize**, and **Centre**. When a command is greyed out,
  the line under the panel says why, and so does its tooltip.
* **Command tabs** (bottom right) — **Gather · Build · People · Research ·
  Villages · History · Menu**. A tab opens its palette of square command
  buttons above it; the little **×5** in a button's corner does the same
  thing five times. Hover any button for what it does, what it costs, and
  — if it's greyed out — what is missing.
* **The clock and End turn** (bottom right corner) — the season, the turn
  and the year, and the big button that ends the turn. It turns red when
  there isn't enough food to feed everyone.

The map itself: click a hex to select it (white corner brackets mark it),
scroll to zoom, drag to pan, double-click to zoom back out. Your villagers
walk out to your tiles to work and come home again; soldiers patrol the
edge of your land. Buildings appear in the village as you build them, and
dirt roads run out to every tile you take.

### The keyboard

| Key | |
| --- | --- |
| **1–5** | Gather, Build, People, Research, Villages |
| **6** | History |
| **Space** | End turn |
| **Esc** | close the history, or open the menu |

### A turn

Each turn you have **work hours** to spend — 4 per human in spring and
autumn, 6 in summer, 2 in winter. Every gathering action costs one hour;
building costs one hour plus materials. When you're done, press **End
turn**:

1. Anything over your **barn space** is lost (the garlocks eat it).
2. Every human and soldier eats **one timbermellow**. If there isn't
   enough, soldiers starve first, then humans.
3. The season moves on, the other villages take their turn, the game saves.

Two turns make a season; four seasons make a year.

### Resources

| | Where it comes from | What it's for |
| --- | --- | --- |
| 🌰 **timbermellow** | timbermellow forests, meadows, forests; grain fields once you can farm | food — one per person per turn; raising humans; provisions for expeditions |
| 🪵 **wood** | forests, dense bush, your home forest | barns, technologies |
| 🪨 **stone** | mountains, rocky outcrops, terraced hills | houses, the stone axe |
| 🌾 **grain** | plains, terraced hills | food, but only after you learn **farming** |

Everything you gather comes off the tiles you hold, oldest first — so your
starting forest is the one you'll watch run dry. Timbermellows, wood and
grain **grow back every autumn**; stone does not. When the stone on your
land is gone, it's gone — find more, or (one day) dig a quarry.

You can't gather timbermellows in winter, and you gather twice as many in
autumn. Stock up before the snow.

### People and buildings

* **Raise a human** — 3 timbermellows and an hour. More humans, more work
  hours, more mouths.
* **Train a soldier** — turns a human into a soldier. Soldiers don't work,
  but they escort expeditions, seize land, and defend the village when the
  garlocks come.
* **Build a barn** — 4 wood. Each barn holds 5 timbermellows. You start
  with one, which is not enough for long.
* **Build a house** — 2 stone. Each house shelters 3 people. Anyone without
  a roof in winter dies of exposure.

### The land

The map starts as blank paper: the world hasn't been drawn where you
haven't been. You can see your own land (gold outline) and the tiles right
next to it. What you've seen stays on the map.

* **Dashed white outline** — wild land next to yours. Select it and press
  **Explore**. An expedition needs 3 humans, 1 soldier as escort, 10
  timbermellows for provisions and 4 work hours. The tile becomes yours,
  whatever is on it joins your stores-on-land, and the tiles beyond it come
  into view.
* **Coloured outline** — land belonging to another village. If it touches
  yours, select it and press **Seize**. That takes soldiers — 2 at least,
  more the bigger that village has grown — and one of them won't come
  back. It also costs 8 timbermellows and 4 hours. You can take the land
  around a village but never the village itself.
* **Blank paper** — unknown. You'll see it once your land reaches it, or
  all at once once you research mapmaking.

The inspect pane, and every button's tooltip, always tells you why a
command is greyed out.

### Seasons

* **Spring** — the year begins; 4 work hours per human.
* **Summer** — longer days, 6 hours per human.
* **Autumn** — the harvest: gather twice as many timbermellows, and the
  land regrows (timbermellows, wood and grain come back on every tile you
  hold).
* **Winter** — 2 hours per human, no timbermellows to gather, and the cold
  takes anyone without a house. Snow falls on the map.

### Technologies

Ideas come as the village grows (they're tied to how many work hours you
have at the start of a turn, so in practice to your population):

| Technology | Comes at | Costs | Does |
| --- | --- | --- | --- |
| **Stone axe** | 25 hours | 20 wood, 30 stone | gather 2 wood per hour |
| **Farming** | 40 hours | 30 wood, 12 hours | grain on plains and terraced hills counts as food |
| **Food basket** | 50 hours | 50 wood, 16 hours | gather 2 timbermellows per hour |
| **Mapmaking** | 60 hours | 20 wood, 10 hours | the whole world is drawn in |

### The neighbours

Five villages share the world: yours, three rivals, and a **garlock camp**
placed as far from you as the map allows. Every turn each of them may
settle one more tile next to its own land — the garlocks more eagerly than
the rest. The **Villages** panel shows how much land each holds once
you've found them.

The garlocks also raid. When your timbermellow stores grow large (25 or
more), scouts are seen, and the attack comes the following turn — from
the direction of their camp. Soldiers defend; without them, the village
is sacked: half your people, all your food, your barns.

### A first game

1. **Turn 1**: gather timbermellows all day. End turn.
2. **Turn 2–3**: gather 4 wood and build a barn — one barn's 5 spaces
   fills up fast. Then food.
3. Raise humans as soon as you can feed them; keep a turn's worth of
   food in hand before you end the turn.
4. Once you have 3 humans and a spare one to train as a soldier, pick the
   most useful tile next door — mountains or rocky outcrop for stone if
   you have none — and **Explore**.
5. Watch the **on land** numbers. When the home forest is running low,
   it's time to spread again.
6. Build a second house before the first winter. Keep some soldiers once
   your barns are full, because the garlocks are watching.

---

## Changing the numbers

Everything about how fast or hard the game is lives in a few obvious
places, with comments next to each number:

| What | Where |
| --- | --- |
| World size, number of villages, starting stores, what each ground holds | `data/map.json` |
| What an expedition or a seizure needs and costs; autumn regrowth | `js/territory.js`, top of file |
| How often the other villages expand, how strong they get | `js/villages.js`, top of file |
| Rock at the edge, rivers, village spacing | `js/map/worldGen.js`, top of file |
| Building costs, technologies, raids, food per person | `js/game.js` |

After changing anything, open `http://localhost:8080/scripts/playtest.html`:
it plays a few turns on a fixed world with the real buttons and prints a
PASS/FAIL line for everything a player would notice if it broke.
