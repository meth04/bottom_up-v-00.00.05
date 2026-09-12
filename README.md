# bottom up

A turn-based village game. You start with two people in a single
timbermellow grove on a hand-drawn island, live off the land until it runs
dry, and spread out to find more — exploring wild land, and eventually
seizing it from the villages around you — until you learn to farm.

The game opens almost empty. One button, one thing to worry about. Every
other control arrives when you have earned it.

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
learning helper. Saves live in the browser you played in, so a different
browser or a private window starts fresh.

### Just want to look at a map?

```
node scripts/build-standalone.js [seed]
```

writes `map-preview.html`, a single file you can double-click or send to
someone — no server needed. It shows a whole island without the fog, with
a button to roll another one.

---

## How to play

### The goal

There is no score and no ending yet. The story is a village outgrowing its
environment, and it runs in **four acts** (see below). How far you get
before the garlocks, the winter or the famine catch up with you is the game.

### The four acts of the First Age

The game keeps track of which act you are in — it is written above the
clock in the bottom-right corner. Each act opens new controls.

| | | Begins when | What it gives you |
| --- | --- | --- | --- |
| **Act I** | The First Winter | you start | gathering, barns, houses, people |
| **Act II** | The Growing Years | you have lived a full year with three people | research, the school, the army camp, trades |
| **Act III** | The Garlock Raids | you have had a few turns to grow, and are worth robbing | raids every ~6 turns |
| **Act IV** | The Timbermellow Famine | the land starts failing, or the raids have run their course | farming, standing work orders |

**Act I** teaches the three things that kill villages: people eat every
turn; anything that will not fit in a barn is taken; and winter is coming.

**Act II** has no hurdle at all. Build what you like, train who you like,
push outward and see what turns up.

**Act III** is the garlocks knocking your growth back a peg — not
destroying you. Keep soldiers standing and a raid costs you almost nothing.

**Act IV** is the lesson that the land is finite. The grove withers, and
from then on it comes back a little smaller every autumn. Learn farming,
take more land, and put people on standing orders so you stop clicking for
every hour.

### The screen

The map fills the window; the controls float over it in panels, laid out
the way RimWorld lays its own out. **Controls you have not earned yet are
not there at all** — the tab row grows as you play.

* **Colonist bar** (top, middle) — one card per villager, soldier and
  trainee, with a name, a face and a bar that empties as the barns do. A
  warning mark means hungry; a roof mark means no house to sleep in. Click
  one to jump the view back to the village.
* **Resource readout** (top left) — work hours left, then each store: what
  is in the barn and, beside it, what is still out there **on land** — on
  the tiles you hold. Then people, barn space, roofs and tiles held. Hover
  any line for what it is and why it matters.
* **World** (top right) — the whole island in miniature, with a box around
  the part you are looking at. The sea is always drawn, so the shape of the
  island reads even through the fog. Click anywhere on it to jump there.
* **Learning helper** (below it) — tells you what to do next, one thing at
  a time, until you turn it off.
* **Alerts** (right, above the clock) — the things about to go wrong, red
  first: starvation, a raid coming, people without a roof, barns
  overflowing, empty training places, hours you haven't spent. **Click an
  alert and it opens the button that fixes it and flashes it.**
* **Letters** (under the alerts) — what just happened. The whole history is
  behind **History**.
* **Inspect pane** (bottom left) — the tile you have selected: what part of
  the country it is in, what it is like to live on, what is on it, how much
  is left, and whether it regrows. Above it sit its commands — **Explore**
  or **Seize**, and **Centre**. When a command is greyed out, the line
  under the panel says why, and so does its tooltip.
* **Command tabs** (bottom right) — **Gather · Build · People · Research ·
  Villages · History · Menu**, as you unlock them. A tab opens its palette
  of square command buttons above it; the little **×5** in a button's
  corner does the same thing five times. Hover any button for what it does,
  what it costs, and — if it's greyed out — what is missing.
* **The clock and End turn** (bottom right corner) — the act, the season,
  the turn and the year, and the big button that ends the turn. It turns
  red when there isn't enough food to feed everyone.

The map itself: click a hex to select it (white corner brackets mark it),
scroll to zoom, drag to pan, double-click to zoom back out. Your villagers
walk out to your tiles to work and come home again; soldiers patrol the
edge of your land. Buildings appear in the village as you build them, and
dirt roads run out to every tile you take.

### The keyboard

| Key | |
| --- | --- |
| **1–5** | Gather, Build, People, Research, Villages (once unlocked) |
| **6** | History |
| **Space** | End turn |
| **Esc** | close the history, or open the menu |

### A turn

Each turn you have **work hours** to spend — 4 per human in spring and
autumn, 6 in summer, 2 in winter. Every gathering action costs one hour;
building costs one hour plus materials. When you're done, press **End
turn**:

1. The garlocks raid, if this is their turn (Act III onward).
2. Anyone at school comes a turn closer to qualifying.
3. Anything over your **barn space** is lost (the garlocks eat it).
4. Every human, soldier **and trainee** eats one timbermellow. If there
   isn't enough, soldiers starve first, then humans.
5. The season moves on, standing orders are worked, the other villages take
   their turn, the game saves.

Two turns make a season; four seasons make a year.

### Resources

| | Where it comes from | What it's for |
| --- | --- | --- |
| 🌰 **timbermellow** | timbermellow groves, meadows, forests, birch woods, marsh, tundra; grain fields once you can farm | food — one per person per turn; raising humans; provisions for expeditions and trainees |
| 🪵 **wood** | forests, birch woods, dense bush, taiga, marsh, your home grove | barns, the school, the army camp, technologies |
| 🪨 **stone** | mountains, rocky outcrops, terraced hills, badlands, tundra, snowfields, the shore | houses, the school, the army camp, the stone axe |
| 🌾 **grain** | plains, terraced hills, badlands | food, but only after you learn **farming** |

Everything you gather comes off the tiles you hold, oldest first — so your
starting grove is the one you'll watch run dry. Timbermellows, wood and
grain **grow back every autumn**; stone does not. When the stone on your
land is gone, it's gone — find more, or (one day) dig a quarry.

You can't gather timbermellows in winter, and you gather twice as many in
autumn. Stock up before the snow.

Every world is checked before you ever see it: if the two rings of hexes
around your home were short of food, wood or stone, the least useful tile
out there is quietly turned into ground that has it. No start is a dead end.

### People, trades and buildings

* **Raise a human** — 3 timbermellows and an hour. More humans, more work
  hours, more mouths.
* **Train a soldier** — turns a human into a soldier. Soldiers don't work,
  but they escort expeditions, seize land, and defend the village.
* **Build a barn** — 4 wood. Each barn holds 5 timbermellows.
* **Build a house** — 2 stone. Each house shelters 3 people. Anyone without
  a roof in winter dies of exposure.
* **Build a school** — 8 wood, 6 stone, 2 hours. Trains farmers, foresters,
  masons and scholars.
* **Build an army camp** — 10 wood, 8 stone, 2 hours. Trains scouts and
  captains, and is itself worth a point of defence.

**Trades.** With a school or camp standing, a villager can be taken off the
work rota to learn one. They are gone for a turn or two — and still eat —
then come back qualified. Each building teaches one person at a time.

| Trade | Where | Turns | Does |
| --- | --- | --- | --- |
| **Farmer** | school | 2 | +1 timbermellow per hour spent gathering food |
| **Forester** | school | 2 | +1 wood per hour spent cutting |
| **Mason** | school | 2 | +1 stone per hour spent quarrying |
| **Scholar** | school | 3 | every technology costs 20% fewer hours |
| **Scout** | camp | 2 | expeditions cost 2 less food and 1 less hour |
| **Captain** | camp | 3 | +2 to the village's defence in a raid |

Only the **first three** of a trade add to its bonus — a fourth farmer is
just another mouth.

**Standing orders** (Act IV). Assign villagers to gathering food, wood or
stone and they work it every turn the moment the turn begins, spending
their own hours, without a single click. This is what lets a village of
twenty be played at all.

### The land

The map starts as blank paper: the world hasn't been drawn where you
haven't been. You can see your own land (gold outline) and the tiles right
next to it. What you've seen stays on the map.

* **Dashed white outline** — wild land next to yours. Select it and press
  **Explore**. An expedition needs 3 humans, 1 soldier as escort, 10
  timbermellows for provisions and 4 work hours — less once you have
  scouts. The tile becomes yours, whatever is on it joins your
  stores-on-land, and the tiles beyond it come into view.
* **Coloured outline** — land belonging to another village. If it touches
  yours, select it and press **Seize**. That takes soldiers — 2 at least,
  more the bigger that village has grown — and one of them won't come
  back. It also costs 8 timbermellows and 4 hours. You can take the land
  around a village but never the village itself.
* **Blank paper** — unknown. You'll see it once your land reaches it, or
  all at once once you research mapmaking.
* **Open sea and deep lakes** cannot be settled at all. Your people have no
  boats yet.

### The island

The world is one island, ringed by sea and pale shore, and it has a
climate: cold **tundra** and **snowfields** along the northern edge, dry
red **badlands** in the south, and everything temperate between —
**meadows**, **plains**, **forests**, **birch woods**, **dense bush**,
**pine taiga**, **marshes** in the wet lowlands, **terraced hills** beside
the water, and **rocky outcrops** and **mountains** along the high spine.
Rivers run downhill into lakes and out to sea.

Big stretches of one kind of country carry a name, written across them —
*The Silent Waste*, *The Hollow Fens*, *The Iron Spine*. The inspect pane
tells you which one a tile belongs to, and what it is like to live on.

Old cart tracks already join the villages to each other, drawn faintly
under everything else. Five landmarks and a few wonders are scattered
about: standing stones, a mother tree, dragon bones, a crystal mine, a
shipwreck, a ruined tower, a hot spring, a bone orchard.

### Seasons

* **Spring** — the year begins; 4 work hours per human.
* **Summer** — longer days, 6 hours per human.
* **Autumn** — the harvest: gather twice as many timbermellows, and the
  land regrows (timbermellows, wood and grain come back on every tile you
  hold). Once the famine has begun, only half as much comes back, and each
  tile's ceiling drops a little further every year.
* **Winter** — 2 hours per human, no timbermellows to gather, and the cold
  takes anyone without a house. Snow falls on the map.

### Technologies

Ideas start arriving in Act II, and are tied to how many work hours you
have at the start of a turn — so in practice to your population. Scholars
make each of them cheaper.

| Technology | Comes at | Costs | Does |
| --- | --- | --- | --- |
| **Stone axe** | 25 hours | 20 wood, 30 stone | gather 2 wood per hour |
| **Farming** | 40 hours, or the famine | 30 wood, 12 hours | grain on plains and terraced hills counts as food |
| **Food basket** | 50 hours | 50 wood, 16 hours | gather 2 timbermellows per hour |
| **Mapmaking** | 60 hours | 20 wood, 10 hours | the whole world is drawn in |

### The neighbours

Twelve villages share the island: yours, the rivals, and one or two
**garlock camps** placed as far from you as the map allows. Every turn each
of them may settle one more tile next to its own land — the garlocks more
eagerly than the rest, and nobody settles rock, snow or water. The
**Villages** panel shows how much land each holds once you've found them.

From **Act III** the garlocks raid on a rhythm, roughly every six turns,
from the direction of their camp. Scouts are seen a turn before the attack.

Your defence is `3 × soldiers + 2 × captains + army camps`. Match their
strength and they break on your line and go home, taking a soldier or two.
Fall short and they take food, wood and a barn or two — but never your last
barn, your last house, or your last villager. Stand completely undefended
against a heavy raid and the village is sacked.

They get angrier each time they get through and calmer each time they are
turned away, but only within limits: a raid is a setback, not a death
spiral.

### A first game

1. **Turn 1**: gather timbermellows all day. That is the only button there
   is. End turn.
2. After a few timbermellows someone notices the deadwood — now you can cut
   wood. Four wood makes a barn, and the barn is what stops the garlocks
   eating your surplus.
3. Raise humans as soon as you can feed them; keep a turn's worth of food
   in hand before you end the turn, and several turns' worth before winter.
4. Once you have 3 humans and a spare one to train as a soldier, pick the
   most useful tile next door — rock for stone if you have none — and
   **Explore**.
5. Survive the first winter. That is Act I.
6. In Act II, build a school early. A forester pays for himself in two
   turns of cutting.
7. Watch the **on land** numbers. When the home grove runs low, it's time
   to spread again — and to take tiles that have what you are short of, not
   just the richest tile on the frontier.
8. Keep soldiers standing from Act III on. A defended raid costs almost
   nothing; an undefended one costs a year.

---

## Changing the numbers

Everything about how fast or hard the game is lives in a few obvious
places, with comments next to each number:

| What | Where |
| --- | --- |
| World size, number of villages, starting stores, what each ground holds | `data/map.json` |
| Which act begins when, and what each one unlocks | `js/ages.js`, top of file |
| Schools, army camps, the trades and the standing work orders | `js/professions.js`, top of file |
| What an expedition or a seizure needs and costs; autumn regrowth | `js/territory.js`, top of file |
| How often the other villages expand, how strong they get | `js/villages.js`, top of file |
| Coastline, climate bands, rivers, lakes, village spacing, region names | `js/map/worldGen.js`, top of file |
| Raid rhythm, how angry the garlocks can get, how much one raid can take | `js/game.js`, the garlock section |
| Building costs, technologies, food per person | `js/game.js` |

### The code

| File | |
| --- | --- |
| `js/game.js` | the village: stores, gathering, building, seasons, raids, the turn |
| `js/ages.js` | the four acts, and which controls the player has earned |
| `js/professions.js` | schools, army camps, trades, trainees, standing orders |
| `js/territory.js` | the bridge between the village and the map |
| `js/villages.js` | the other villages' turn |
| `js/ui.js` | the HUD: tabs, tooltips, alerts, colonist bar, learning helper |
| `js/main.js` | boot, the minimap, the inspect pane, reacting to events |
| `js/map/worldGen.js` | the island: climate, coast, rivers, lakes, regions, roads |
| `js/map/worldPainter.js` | painting it, in layers: ground, relief, water, sprites, scatter |
| `js/map/artStyle.js` | every sprite the map is made of |

After changing anything, open `http://localhost:8080/scripts/playtest.html`:
it plays a few turns on a fixed world with the real buttons — including
building a school and putting somebody through it — and prints a PASS/FAIL
line for everything a player would notice if it broke.
