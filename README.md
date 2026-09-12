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

With the server running, open

```
http://localhost:8080/scripts/preview.html?seed=424242
```

It shows the whole world without the fog — every continent, river, road
and settlement — with the same engine the game uses, a terrain legend, a
frame-rate readout, and a button to roll another world. (The old
`build-standalone.js` is gone: the engine is made of ES modules, which a
browser will not load from a double-clicked file.)

### Map detail on slow machines and phones

The game measures the device it is running on and picks a detail level
(how many animals, carts and trees it draws, how many particles fall, the
canvas resolution). It also watches the frame rate while you play and
steps the detail down if a frame starts taking too long, and back up when
there is headroom. **Settings → Map detail** pins a level by hand, and
`?quality=low` in the address does the same for one visit. Press **F3**
for the frame-rate readout.

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
  is in the barn, a green or red marker showing **how much it has moved this
  turn**, and what is still out there **on land** — on the tiles you hold.
  Then people, barn space, roofs and tiles held. Hover any line for what it
  is and why it matters.
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
  or **Seize**, **Find land** (which picks the richest wild ground touching
  yours and takes you to it) and **Centre**. When a command is greyed out,
  the line under the panel says why, and so does its tooltip.
* **Command tabs** (bottom right) — **Gather · Build · People · Research ·
  Villages · History · Menu**, as you unlock them. A tab opens its palette
  of square command buttons above it; **×5** does the same thing five
  times, and **ALL** spends every hour you have left on it — stopping
  before the barns overflow. Hover any button for what it does, what it
  costs, and — if it's greyed out — what is missing.
* **The Ledger** (tab 6) — the empire screen. Everything, counted:
  * **Your people** — workers, how many of each trade, who is away at
    school, soldiers, who is under a roof and who is not.
  * **A turn, in and out** — work hours you have, how many are committed to
    standing orders and how many are yours to spend; what those orders will
    bring in; what the village will eat; and **food, net a turn**, which is
    the single number that tells you whether you are winning.
  * **Your ground** — how many hexes you hold, broken down by terrain, and
    how much food, wood and stone is still standing on them.
  * **The island** — every settlement, yours highlighted, ranked by how
    much land it holds, with the strength of each rival beside it.
  * **The road ahead** — all four technologies from the first turn, the
    ones you have, the one you can take now, and what the locked ones are
    waiting for.
* **Age progress bar** (under the act name) — how close the village is to
  the next act, and what it is waiting for.
* **Unspent hours** — a chip beside the clock that never lets you end a
  turn having forgotten to work. Click it to open Gather.
* **Turn ledger** (above the clock) — after every turn, six lines of what
  actually happened: what you gathered, what was eaten, what spoiled for
  want of barn space, who arrived and who did not survive. Click it to put
  it away; it fades on its own.
* **The clock and End turn** (bottom right corner) — the act, the season,
  the turn and the year, and the big button that ends the turn. It turns
  red when there isn't enough food to feed everyone, and if ending the turn
  would starve somebody, freeze somebody or spoil food, **it asks first**.

The map itself: click a hex to select it (white corner brackets mark it),
scroll to zoom, drag to pan, double-click to zoom back out. Your villagers
walk out to your tiles to work and come home again; soldiers patrol the
edge of your land. Buildings appear in the village as you build them, and
dirt roads run out to every tile you take.

### Things that save you clicking

The game is a clicker, but it should never be busywork:

| | |
| --- | --- |
| **×5** | five hours of one job in one press |
| **ALL** | every hour you have left on one job, stopping before the barns overflow |
| **Standing orders** (Act IV) | villagers who work their job every turn without being told |
| **Alerts** | click one and it opens the button that fixes it, and flashes it |
| **Find land** | picks the best wild ground next to yours and takes you there |
| **Turn ledger** | tells you what a turn cost, so you don't have to reconstruct it |
| **The Ledger (6)** | net food per turn, land by terrain, and how the rivals compare — so you can plan instead of guess |
| **Unspent hours chip** | you can never end a turn having forgotten to work |

### The keyboard

| Key | |
| --- | --- |
| **1–6** | Gather, Build, People, Research, Villages, Ledger (once unlocked) |
| **7** | History |
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

### Your town, and everyone else's

**A village is founded on a valley, not a hex.** Every settlement — yours
and everyone else's — begins holding about **thirty-seven hexes**: the hall,
the cottages, the fields that feed them and the commons beyond. The hall's
own hex is the oldest claim, so it is still the ground you work dry first
and still the thing that sends you looking for more.

It grows in stages you can read from across the map:

* **A clearing** — the great hall, the well, a fire, the market square,
  and the trodden earth they stand on.
* **A fenced village** — once three buildings stand, a palisade of stakes
  goes round it with a gate where the road comes in, and ploughed fields
  fan out beyond the wall.
* **A walled town** — at seven buildings the stakes become a stone curtain
  wall with square towers, crenellations and a gatehouse with an arch.
* Lanes run from the gate through the square; barns, houses, schools and
  army camps fill out concentric rings around it; smoke rises from two or
  three of the roofs; and if there is water next door, a jetty runs out
  into it with a boat tied up at the end.
* **Every household keeps something.** One cottage has a kitchen garden
  behind it, the next a stack of split firewood, the next a line of washing
  moving in the wind — so three cottages in a row never look the same.
* **The square is a working square**: a bread oven with a fire in it, a
  roadside shrine with a lit candle, a handcart, hens under the market
  stalls, a dog by the fire and a pig where the market spills over. Once
  the town is big enough, a windmill turns on the rise outside the walls.
* **The fields change through the year** — turned earth in spring, green in
  summer, standing sheaves at harvest, snow lying in the furrows in winter.
* **Streets, not a wheel.** Six lanes run out of the square and a ring road
  goes round it, with four rings of plots filling the ground between — up
  to forty-one buildings before a town runs out of room.
* **An inn** with a painted sign swinging out front, **stables** with a
  horse in them, **a village pond** with rushes and a duck, and **an
  orchard** planted in rows beyond the fields.

### The people

The figures on the map are not decoration; they are your villagers, and you
can see what they are.

* **Trades show.** A forester carries an axe, a mason a hammer, a farmer a
  hoe, a scholar a book, a scout a staff, a soldier a spear and shield;
  everybody else carries a basket. Train three foresters and three figures
  with axes appear.
* **They go where their trade is.** The forester walks to your woods, the
  mason to your rock, the farmer to your fields. Soldiers patrol the edge
  of your territory instead of working.
* **And they do the work.** A forester visibly chops, a farmer sweeps a
  sickle, a scholar reads, a carrier shifts their load — the arm swings in
  the right way for the job, and stops when they set off home.
* **The square is never empty.** A few townsfolk stay put — somebody at the
  well, somebody minding a stall, children skipping by the fire — so the
  middle of the village looks inhabited even when everybody else is out.

The **rival villages** are built by the same rules, so how much land one of
them has taken is visible at a glance: a hamlet, a fenced village, or a
walled town with a market of its own. The **garlock camps** are not
villages at all — a ring of stakes, war tents, a carved totem, a fire that
never goes out and heaps of bone at the edges.

Out on the land you hold, a **working district** stands about every ninth
field, and what it is follows the ground: a fishery and a jetty on the
water, a lumber camp in the woods, a smithy and quarry works in the rock, a
farmstead with pens and hay on open ground, a hut and a watchtower in hard
country. Roads run from your gate to each of them — and only to them, so
the network reads as roads and not as a brown mat.

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
  scouts. **It settles a whole district**, not a single hex: the tile you
  picked and the wild ground around it, about nineteen hexes. Everything on
  them joins your stores-on-land, and the country beyond comes into view.
  (A hex is a field on this map, not a county — see *The island* below.)
* **Coloured outline** — land belonging to another village. If it touches
  yours, select it and press **Seize**. That takes soldiers — 2 at least,
  more the bigger that village has grown — and one of them won't come
  back. It also costs 8 timbermellows and 4 hours. Like an expedition, it
  takes a district rather than a field. You can take the land around a
  village but never the village itself.
* **Blank paper** — unknown. You'll see it once your land reaches it, or
  all at once once you research mapmaking.
* **Open sea and deep lakes** cannot be settled at all. Your people have no
  boats yet.

### The world

**The grid is fine.** The world is 360 × 240 hexes — more than eighty
thousand of them. A hex is a field, not a county. That is why an
expedition settles a district, why a tile holds a field's worth of food or
wood, and why a village covers several hexes.

**There is more than one continent.** Three to five landmasses with ragged
coasts, bays and peninsulas sit in a wide sea, with islands and skerries
between them. Every coast has a ring of pale **shallows** where boats can
work, **beaches** where the land runs low and **sea cliffs** where it runs
high. Inland, mountain ranges throw **hills** and **rocky outcrops** around
their feet and cast a rain shadow, so one side of a range is green and the
other is **desert** or **badlands**. Cold **tundra** and **snowfields** lie
along the north, and the temperate middle has **meadows**, **plains**,
**forests**, **birch woods**, **dense bush**, **pine taiga**, **marshes** in
the wet lowlands and **terraced hills** beside the water.

**Rivers have a size.** They start as streams on high wet ground, widen as
tributaries join them, drop over **waterfalls** where the ground falls
away, pool into lakes, and reach the sea as broad rivers. Marsh gathers
beside fresh water, an oasis beside desert water, reefs in the shallows.

You begin on the largest continent, with at least three neighbours and a
garlock camp within reach of you. The rest of the settlements are spread
across the other continents; you will find them once you learn mapmaking.

Big stretches of one kind of country carry a name — *The Sunworn Barrens*,
*The Tangled Wilds*, *The Grey Wall* — and so do the rivers, the lakes and
the continents. No two places on a map are ever named the same thing. The
inspect pane tells you the region and the continent a tile belongs to.

### The living map

The rules are turn-based; the map never stops.

* **Villagers walk to work.** Each trade goes to a work site of its own —
  the forester to the lumber camp, the mason to the quarry, the farmer to
  the fields — along the roads, works there, and carries the load home.
  Soldiers patrol the border. A few townsfolk keep the square busy.
* **Carts and boats carry the goods.** Ox carts shuttle between the work
  sites and the barns along your roads, and caravans travel the old tracks
  to any neighbour your roads reach. Fishing boats bob off every fishery;
  trade ships sail the sea lanes between continents.
* **Wildlife.** Deer and boar in the woods, sheep on the meadows, wolves in
  the taiga, herons in the marsh, fish jumping in the lakes, birds crossing
  the sky. Animals flee when your people come near.
* **Weather and light.** Clouds drift over the land and drag their shadows
  with them, rain falls in spring and autumn, snow in winter, petals and
  leaves in their seasons, and the day turns into night and back — windows
  glow in the dark.
* **Roads are real.** Every work site is joined to the village by a road,
  and the old tracks between the villages are roads too. **Land the roads
  reach yields up to 30 % more**, a neighbour your roads reach becomes a
  **trading partner** and sends a caravan every turn, and a village with
  roads to its borders is easier to defend. From Act III the **Place** and
  **Road** tools above the map let you choose where buildings stand and
  draw roads yourself; before that the village decides.
* **Lenses.** Press **L** (or the Lens button) to colour the map by what
  each hex yields, who holds it, how much is left on it, or which of your
  land the roads reach. **G** shows the hex grid.

Everything that moves is only simulated near the part of the map you are
looking at, so a world of eighty thousand hexes costs no more to run than
the screenful you can see.

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
| World size (360 × 240 hexes), continents, villages, starting stores, what each ground holds | `data/map.json` |
| How much land a village is founded on | `js/territory.js`, `VILLAGE_RADIUS` |
| How much land one expedition settles; autumn regrowth; the road bonus and trade income | `js/territory.js`, top of file |
| Which act begins when, and what each one unlocks (including town planning) | `js/ages.js`, top of file |
| Schools, army camps, the trades and the standing work orders | `js/professions.js`, top of file |
| How often the other villages expand, how strong they get | `js/villages.js`, top of file |
| Every kind of ground: colour, what stands on it, how hard it is to cross | `js/world/terrainDefs.js` |
| Continents, climate, rivers, lakes, village placement, names | `js/world/worldGen.js`, top of file |
| Which buildings and work sites exist and where they may stand | `js/world/improvements.js` |
| How many things move, how fast, and where animals live | `js/world/agents.js`, top of file |
| Day length, season tints, rain and snow | `js/world/weather.js`, `js/world/constants.js` |
| Detail levels per device tier and when the game steps them up or down | `js/engine/device.js` |
| Raid rhythm, how angry the garlocks can get, how much one raid can take | `js/game.js`, the garlock section |
| Building costs, technologies, food per person | `js/game.js` |

### The code

The game is two halves with a seam between them, described in full in
`docs/ARCHITECTURE.md`.

**The rules** are classic scripts sharing plain globals — the way the game
was first written, and left that way on purpose so every number is a
variable you can read in the console:

| File | |
| --- | --- |
| `js/game.js` | the village: stores, gathering, building, seasons, raids, the turn |
| `js/ages.js` | the four acts, and which controls the player has earned |
| `js/professions.js` | schools, army camps, trades, trainees, standing orders |
| `js/territory.js` | the bridge between the village and the map: claiming, seizing, gathering, the roads' effects, trade |
| `js/villages.js` | the other villages' turn |
| `js/ui.js` | the HUD: tabs, tooltips, alerts, colonist bar, learning helper |
| `js/turnReport.js`, `js/empire.js`, `js/gameFeel.js`, `js/icons.js` | the turn ledger, the empire screen, the juice, the icons |
| `js/bridge.js` | the seam: hands the module side a snapshot of the rules' numbers |

**The world and the engine** are ES modules (no build step) drawn with
PixiJS (WebGL):

| File | |
| --- | --- |
| `js/main.js` | boot, wiring the two halves together, the map tools, the inspect pane |
| `js/world/hexMath.js`, `constants.js` | hex maths, the seeded random, the numbers everyone shares |
| `js/world/terrainDefs.js` | the catalogue of ground |
| `js/world/worldGen.js` (+ `.worker.js`) | the continents, in a Web Worker so the boot screen keeps moving |
| `js/world/hexMap.js` | the tiles, ownership, fog, roads, improvements, and the change bus the renderer listens to |
| `js/world/roads.js` | road network, A* pathfinding, connectivity |
| `js/world/improvements.js` | buildings and work sites, and where they may stand |
| `js/world/agents.js` | everything that moves: villagers, carts, boats, animals, birds |
| `js/world/weather.js` | season, time of day, rain and snow |
| `js/engine/renderer.js` | the PixiJS application, the layer stack, input, the frame loop |
| `js/engine/camera.js` | pan, zoom, pinch, inertia |
| `js/engine/terrainLayer.js` | the ground: one mesh per chunk of 16 × 16 hexes, coloured in a shader |
| `js/engine/atlas.js` | every sprite, drawn into a texture atlas at boot |
| `js/engine/featureLayer.js`, `roadLayer.js`, `overlayLayer.js`, `unitLayer.js`, `weatherLayer.js`, `labelLayer.js` | trees and buildings; rivers and roads; fog, borders, selection and lenses; the moving things; clouds, rain and light; names |
| `js/engine/device.js` | device tiers, detail levels, the frame-rate meter and the adaptive step-down |
| `js/engine/minimap.js` | the world panel |

### Keeping it smooth

The old map was one SVG of three megabytes of path data, and every
animation on it repainted the whole island. The new one follows a few
rules that hold whatever the size of the world:

1. **Nothing per frame touches every hex.** The world is cut into chunks
   of 16 × 16 hexes. Only the chunks in view are drawn, only the chunks
   that changed are rebuilt (the map tells the renderer exactly which tiles
   moved), and everything that moves is only simulated near the camera.
2. **The ground is a mesh, not sprites.** Each chunk is one triangle mesh
   with a colour per hex, drawn by a small shader that also paints the
   grid, the fog and the moving light on the water. Eighty thousand hexes
   are a few hundred draw calls at most, and usually a few dozen.
3. **Detail follows the zoom.** Zoomed out you see the land, the mountains
   and the names; zoom in and the trees, the animals, the carts and the
   lens numbers appear. Nothing is drawn that would be smaller than a
   pixel.
4. **Detail follows the device.** A phone gets fewer trees, animals and
   particles and a lower canvas resolution than a desktop, and the game
   keeps watching the frame time and steps the detail down (and back up)
   as it plays. Press **F3** to watch it.
5. **Everything is pooled.** Sprites, agents and particles are reused, not
   created and thrown away, so the garbage collector never stalls a frame.
6. **The HUD only redraws what changed.** The alert list, the inspect pane,
   the colonist bar and the trades are each keyed on what they show.

After changing anything, open `http://localhost:8080/scripts/playtest.html`:
it plays a few turns on a fixed world with the real buttons and prints a
PASS/FAIL line for everything a player would notice if it broke. The
engine has its own smoke pages under `scripts/` (`engine-smoke.html`,
`atlas-preview.html`, `preview.html`).
