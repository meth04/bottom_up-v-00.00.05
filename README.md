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

### The island

**The grid is fine.** The world is 216 × 144 hexes — about thirty-one
thousand of them, three times finer in each direction than it used to be.
A hex is a field, not a county: nine of them cover what one used to. That
is why an expedition settles a district, why a tile holds about a ninth of
what it once did, and why a village on the map is drawn spilling over
several hexes, the way a town on a real map covers more paper than the
field beside it.

The world is one island, ringed by sea and pale shore, and it has a
climate: cold **tundra** and **snowfields** along the northern edge, dry
red **badlands** in the south, and everything temperate between —
**meadows**, **plains**, **forests**, **birch woods**, **dense bush**,
**pine taiga**, **marshes** in the wet lowlands, **terraced hills** beside
the water, and **rocky outcrops** and **mountains** along the high spine.
Rivers run downhill into lakes and out to sea, and a handful of skerries
and sandbars sit out in open water where nobody can reach them.

Nothing on it is drawn twice the same way:

* **Ground blends into ground.** Where meadow meets forest, a wash of the
  neighbour's colour bleeds across the hex line instead of stopping dead at
  it. Every hex of the same terrain also carries its own tone, so a wide
  plain reads as a plain rather than as one flat swatch of paint.
* **The land has relief.** High ground is lit and low ground shaded,
  contour rings ride the peaks, and wherever the ground falls away sharply
  there is a scarp line with hachures hanging down the slope.
* **Ranges are drawn as ranges.** Connected mountain hexes get one long
  crest line laid along their spine, the way a drawn map does it, instead
  of twenty unrelated triangles.
* **Undergrowth.** Every tile scatters its own tufts, pebbles, mushrooms,
  fallen logs — seeded from the tile, so the same hex always grows the same
  things. Deer and boar in the woods, sheep on the meadows, herons in the
  marsh, eagles over the crags, birds anywhere.
* **Things people left.** Cairns, beehives, scarecrows, charcoal burners,
  hunting blinds, standing ruins, sea stacks.
* **The sea.** Waves, a surf line that breathes along every shore, depth
  tinting and bathymetric rings out where there is no land, and — once or
  twice per map — a whale blowing, or a distant sail.

Big stretches of one kind of country carry a name, written across them —
*The Sunworn Barrens*, *The Tangled Wilds*, *The Grey Wall* — and so do the
rivers and lakes, the river names riding the course of the water itself.
No two places on a map are ever named the same thing. The inspect pane
tells you which region a tile belongs to, and what it is like to live on.

Old cart tracks already join the villages to each other, drawn faintly
under everything else. Eight landmarks and wonders are scattered about:
standing stones, a mother tree, dragon bones, a crystal mine, a shipwreck,
a ruined tower, a hot spring, a bone orchard.

The map carries far more than can be read at once, so **how much is drawn
depends on how closely you are looking**: zoomed out, the undergrowth, the
colour blending and the river names step aside; zoomed in, the great region
names and the sheet's border fade back so they don't sit on top of your
village.

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
| World size (216 × 144 hexes), villages, starting stores, what each ground holds | `data/map.json` |
| How much land a village is founded on | `js/territory.js`, `VILLAGE_RADIUS` |
| How much land one expedition settles; autumn regrowth (as a fraction) | `js/territory.js`, top of file |
| Which act begins when, and what each one unlocks | `js/ages.js`, top of file |
| Schools, army camps, the trades and the standing work orders | `js/professions.js`, top of file |
| How often the other villages expand, how strong they get | `js/villages.js`, top of file |
| Coastline, climate bands, rivers, lakes, village spacing, region names | `js/map/worldGen.js`, top of file |
| How a town is laid out and when it gets a wall | `js/map/settlements.js`, top of file |
| How many figures walk the map, and which ground each trade works | `js/map/villagers.js`, top of file |
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
| `js/map/worldPainter.js` | painting it, in layers: ground, relief, water, symbols, scatter |
| `js/map/settlements.js` | towns, camps, working districts and roads |
| `js/map/hexRenderer.js` | the interactive overlay: fog, borders, frontier, selection |
| `js/map/artStyle.js` | every sprite the map is made of |
| `js/map/villagers.js` | the people: trades, where they work, what they do there |
| `js/turnReport.js` | the ledger of what each turn cost |
| `js/empire.js` | the empire screen: population, production, land, rivals, tech |

### Keeping it smooth

A turn-based game can still feel slow. Here is every place this one did,
and what was done about it.

**The map used to stutter constantly, and it was two animations.** The whole
island is one SVG of about three megabytes of path data. Sixty-eight river
paths were animating `stroke-dashoffset` and one foam path following the
entire coastline was animating `opacity` — neither of which a browser can
put on the GPU. So the browser was **repainting the entire island sixty
times a second, forever**, whether or not anything was happening. Three
rules now hold:

1. **Nothing inside the static artwork layer animates. Ever.** The river
   dashes stayed — they still read as current — they just hold still.
2. **Each map layer is its own compositing layer** (`will-change`,
   `contain: layout paint`), so a villager swinging an axe repaints the
   villagers and nothing else.
3. **While the map is being dragged, quality gives way to speed** —
   antialiasing is turned off for the duration, and nobody can tell.

Beyond that:

* **Hovering stopped flushing layout.** Working out which hex is under the
  pointer needs the screen transform, and `getScreenCTM()` forces a layout.
  It was being called on every `mousemove`. It is now cached and thrown
  away only when the view actually moves, and the hover itself is answered
  once a frame at most.
* **Nobody animates what nobody can see.** Zoomed out, the people layer is
  hidden and the walk loop stops stepping it.

And the two places it was slow before that:

* **Booting is staged.** Building the island takes about half a second and
  painting it about as long again; done in one go that is a second of white
  screen with the tab frozen. It is now split into steps with a frame
  handed back to the browser between each, behind a loading card that says
  what is being built.
* **Nothing is counted twice.** "How much food is left on my land" used to
  walk every tile you hold, seven or eight times per click. The map keeps a
  version stamp, and the answer is remembered until the land actually
  changes. That alone made the per-click refresh six times faster.
* **Nothing is rebuilt that has not changed.** The alert list, the inspect
  pane, the colonist bar, the trades and the standing orders are each
  keyed on what they show, and are only redrawn when that moves — which
  also means the tooltip under your cursor survives.
* **Detail costs what it is worth.** A grass tuft three pixels tall used to
  be drawn as three curved blades; it is now two strokes, which looks
  identical and saved a megabyte of path data across the island.

### Drawing thirty thousand hexes

Two rules keep a map this fine inside a browser, and they are worth knowing
before changing anything in `js/map/`:

1. **The ground is batched.** Every hex of the same terrain and tone is one
   `<path>` — a hexagon's outline is identical for every hex of a given
   size, so each one costs an `M x y` plus a constant tail
   (`hexMath.hexOutlineTail`). The whole island is about two thousand
   elements instead of fifty thousand. The relief is drawn on a grid three
   times coarser again, which tiles exactly and looks the same.
2. **Decoration is drawn by area, not by tile.** A forest is a scatter of
   tree symbols at a density measured in pixels, so the island carries the
   same amount of forest however fine the grid is — and every conifer on the
   map is two paths.

The interactive overlay follows the same idea: the fog is *one* path (a
rectangle with the seen tiles punched out of it, so its cost is the size of
your world, not the map's), borders are one path per village colour, and
clicking works out which hex is under the pointer with hex maths
(`hexMath.pixelToAxial`) instead of giving thirty thousand hexes their own
click target. Saves only store tiles that differ from what the seed would
rebuild, so a long game is tens of kilobytes rather than megabytes.

After changing anything, open `http://localhost:8080/scripts/playtest.html`:
it plays a few turns on a fixed world with the real buttons — including
building a school and putting somebody through it — and prints a PASS/FAIL
line for everything a player would notice if it broke.
