# bottom up — The Game Guide

**Version v00.00.05 · A Village Survival Story**

This is the player-facing guide: what the game is, how every rule works, and
every number behind it. It is written for someone who wants to understand the
game without reading the code. The technical README (`README.md`) is a
separate document and still describes the code and the engine.

> **One note on "why the numbers look odd":** the barn stores food in
> *calories*, but the player only ever sees *timbermellows*. **1 timbermellow =
> 1,000 calories.** Everywhere in this guide a number is given in both, the
> player-facing one comes first. This is deliberate — see
> [§6](#6-the-two-currencies-timbermellows-and-work-hours).

---

## Table of Contents

**Part I — The game in brief**
1. [The one-paragraph summary](#1-the-one-paragraph-summary)
2. [What kind of game this is](#2-what-kind-of-game-this-is)
3. [The core loop](#3-the-core-loop)

**Part II — The rules**
4. [The world](#4-the-world)
5. [Time: turns and seasons](#5-time-turns-and-seasons)
6. [The two currencies: timbermellows and work hours](#6-the-two-currencies-timbermellows-and-work-hours)
7. [Your people](#7-your-people)
8. [Buildings](#8-buildings)
9. [Land: claims, districts, exploring, seizing](#9-land-claims-districts-exploring-seizing)
10. [Roads](#10-roads)
11. [Work sites and improvements](#11-work-sites-and-improvements)
12. [Resources and the land's finite pool](#12-resources-and-the-lands-finite-pool)
13. [Technologies](#13-technologies)
14. [Professions and training](#14-professions-and-training)
15. [Standing work orders (jobs)](#15-standing-work-orders-jobs)
16. [The garlocks](#16-the-garlocks)
17. [Rival villages, raids, vassals and trade](#17-rival-villages-raids-vassals-and-trade)
18. [The four acts](#18-the-four-acts)
19. [Objectives](#19-objectives)
20. [Victory and defeat](#20-victory-and-defeat)

**Part III — What the player sees**
21. [The interface, screen by screen](#21-the-interface-screen-by-screen)
22. [The numbers on the map that move](#22-the-numbers-on-the-map-that-move)
23. [Weather and the look of the world](#23-weather-and-the-look-of-the-world)

**Part IV — Status**
24. [Known gaps and open questions](#24-known-gaps-and-open-questions)
25. [What is being worked on now](#25-what-is-being-worked-on-now)

**Appendices**
- [A. Every number in one place](#appendix-a-every-number-in-one-place)
- [B. The terrain catalogue](#appendix-b-the-terrain-catalogue)
- [C. Glossary](#appendix-c-glossary)

---

# Part I — The game in brief

## 1. The one-paragraph summary

`bottom up` is a turn-based village survival game played in a browser. You
start with one small hall, two villagers, and a valley of about thirty-seven
hexes. You click buttons to send people out to gather food and wood, to raise
children, to build barns and houses, to research ideas, and to take land from
your neighbours. Every turn you must feed every mouth, and every season the
price of an hour changes. The game tells a story in four acts: you learn that
people eat, then that you can grow, then that the garlocks will come and take
what you cannot defend, and finally that the land itself runs out. You win by
making three vassals — or by taking the whole continent — and you lose by
starving three turns in a row.

## 2. What kind of game this is

- **A clicker / idle-adjacent game at heart.** The player interacts almost
  entirely by pressing buttons. The design note behind it is: *"Think two
  buttons but as they play longer more and more details will appear through
  resource check points and research."* You begin with almost nothing on
  screen, and the interface reveals itself as you earn it.
- **Turn-based, not real-time.** Nothing bad happens while you think. You press
  **End Turn** when you are ready. (There is a cosmetic day/night cycle and
  little figures walking around, but none of it changes a rule.)
- **A game about misunderstanding the world.** The design note is explicit:
  *"You don't understand the world and you will make mistakes as you learn
  about it."* You will build the wrong thing. You will find out that
  timbermellows do not come back the way you assumed.
- **A short story, not a long campaign.** The title screen promises about
  **30 minutes**, and the design notes say the first age should take "a year or
  two at most" of in-game time. A year is 8 turns.
- **Hand-drawn.** Every icon and map decoration is a hand-drawn SVG or a
  hand-drawn atlas sprite. There is no sound in the game at all (see
  [§24](#24-known-gaps-and-open-questions)).

## 3. The core loop

```
   ┌──────────────────────────────────────────────────────────────┐
   │  1. LOOK      What does the land hold? What is the season?   │
   │               What does the Ledger say I am short of?        │
   ├──────────────────────────────────────────────────────────────┤
   │  2. SPEND     The hours you have. Gather, build, research,   │
   │               train, explore, raid.                          │
   ├──────────────────────────────────────────────────────────────┤
   │  3. END TURN  Every mouth eats. The season turns over. The   │
   │               garlocks and your neighbours move. The land    │
   │               regrows (or does not).                         │
   ├──────────────────────────────────────────────────────────────┤
   │  4. READ      The turn report tells you what changed, in six │
   │               lines. Then go back to step 1.                 │
   └──────────────────────────────────────────────────────────────┘
```

Everything in this guide is a detail of one of those four steps.

---

# Part II — The rules

## 4. The world

### 4.1 The size and shape of it

| Thing | Value |
|---|---|
| World grid | **360 × 240 = 86,400 hexes** |
| Continents per world | **4** (configurable 1–8) |
| Villages in a world | **42** (including yours) |
| Garlock camps | **2** (or 1, or 0 — see below) |
| Land share | ~50% land, the rest sea |
| A hex is | **a field, not a county** |

The map is generated once per world and never changes shape. It is built as
several continents on a wide sea, with mountain spines, rivers and lakes,
deserts in the rain shadow of the mountains, and cold tundra in the north.
Continents get names like *The Sunward Reach*; regions of one terrain get names
like *The Grey Woods*.

**Important framing:** a single hex is a *field*, not a whole county. One
expedition claims a **district** of up to 19 hexes at once. This matters for
every land rule below.

### 4.2 What a hex holds

Every hex is one of **22 terrain types** (the full catalogue with colours and
yields is in [Appendix B](#appendix-b-the-terrain-catalogue)). Each hex may
also carry:

- **Resources** — timbermellow (food), grain (food, once you farm), wood, or
  stone. Each resource on a hex has an amount and a maximum, and either
  regrows or does not.
- **A feature** — waterfall, oasis, reef, hot spring, or ford.
- **A landmark** — one of ten: standing stones, a mother tree, dragon bones, a
  crystal mine, a shipwreck, a ruined tower, a hot spring, a bone orchard, a
  volcano, an oasis. There are up to 3 of each per world, so **up to 30
  landmarks**, spaced at least 25 hexes apart.
- **A village** — yours, a rival's, or a garlock camp.

### 4.3 The guarantee that your start is survivable

This is one of the most important rules in the game, because it is invisible
and it saves runs.

Every village — yours and every rival's — gets a **radius-3 patch around it
checked for stone, wood and food in that order**. If any of the three is
missing inside that patch, the generator **converts a whole 7-hex patch** of
the least useful nearby terrain into whatever is missing:

| Missing | Becomes | Sacrifices (in order of preference) |
|---|---|---|
| stone | Rocky outcrop | plains, flowering meadow, tundra, badlands, desert, hills |
| wood | Forest | plains, flowering meadow, tundra, badlands, desert, hills |
| food | Flowering meadow | plains, badlands, tundra, desert, rocky outcrop |

It converts a **7-hex patch, not one hex** — the comment in the code is *"one
hex of stone is barely two loads."*

On top of that:

- **Your hall's hex is always a timbermellow grove**, whatever the terrain
  under it was.
- **Its resources are replaced outright** with a fixed starting stock:
  **90,000 timbermellow** (regrows), **44 wood** (regrows), **24 stone** (does
  **not** regrow). That is 90 timbermellows of food, 44 wood and 24 stone by the
  numbers the player sees.
- Any mountain next to the hall is turned into a rocky outcrop, and any deep
  water next to it is turned into a shore hex — so the very first ring around
  your hall is always workable.

### 4.4 Who else is out there

- **Your continent is guaranteed at least 6 villages**, including yours.
- Villages are shared out between continents in proportion to how much land
  each has, with the player's continent getting its guarantee first (taken from
  the smallest continents if necessary).
- **The garlocks are your closest neighbours.** After all villages are placed,
  the generator sorts the other villages on your continent by distance from
  your hall and turns the **nearest two** into garlock camps (if there are 5 or
  more other villages), or the **nearest one** (if there is 1 or more), or
  **none** (if you have the continent to yourself). They are named **"Garlock
  Stronghold"** and **"Garlock Outpost"**.
- Rivals get names from a list of 60 and one of 8 colours. Your village is
  always **"Your village"**, in gold (`#d9a441`).

### 4.5 The world's own roads

The generator lays a **trade route network** — a minimum spanning tree per
continent, walked with A* — and those routes become **real roads on the map
from turn one**. This means neighbouring villages you have not met yet may
already be reachable. Sea lanes between continents are also generated; they
matter later, for docks and trade ships.

---

## 5. Time: turns and seasons

### 5.1 The turn

Everything in the game happens on a **turn**. There is no clock; you press
**End Turn** when you are done.

**The exact order of a turn** (this is the spine of the whole game):

1. The season advances (`1 → 2 → 3 → 4 → 1`), and the turn counter goes up.
2. A snapshot of the village is taken (this is what the turn report compares
   against).
3. If it is a new season, the season's effect fires (see 5.3).
4. The turn heading is written into the log.
5. **The garlocks take their turn** (scouts spotted, or the raid resolves).
6. **Professions advance** — trainees lose a turn off their training.
7. **Spoilage** — anything over the barns' capacity is lost, *before* anyone
   eats.
8. **The famine check** — is the barn short of food?
9. **Eating** — every mouth eats its ration; villagers eat more if there is
   more; this sets the turn's work hours.
10. Work hours are recomputed from what the villagers actually ate.
11. The season's work-hour effects apply.
12. The land regrows what it regrows this turn.
13. **Standing work orders run** (the jobs you assigned).
14. **Technologies are checked** (has your day grown big enough to unlock one?).
15. The screen updates.
16. **Everything else takes its turn** — rival villages expand, trade arrives,
    the game saves, and the victory/defeat checks run.
17. The **turn report** is shown, and a fresh snapshot is taken.

### 5.2 The year

**4 seasons, 2 turns each, 8 turns to a year.** Spring is where you start. The
in-game year number is `floor((turns - 1) / 8) + 1`.

| Season | # | What it is for | Hours per villager | Food per hour |
|---|---|---|---|---|
| **Spring** | 1 | Where you start | 4 | 1 (base) |
| **Summer** | 2 | **More work hours** — an hour is cheaper | **6** | 1 (base) |
| **Autumn** | 3 | **More food** — double the base harvest, and the big regrowth | 4 | **2** |
| **Winter** | 4 | **The thing you prepare for** | **2** | **Nothing grows** |

**Autumn's double harvest applies to the base rate only.** Baskets and farmers
add *after* the doubling, so the +3 cap on specialists still means something.
The code comment says it plainly: *"Autumn doubles the base harvest only."*

**Winter stops the farmers entirely.** No gathering of food is possible in
winter by any means — the food button is disabled, and the standing-order
system skips food jobs. What is in the barn on the first turn of winter is
what you have until spring.

### 5.3 What each season does, exactly

- **Spring** — nothing special. The turn's capacity is recorded.
- **Summer** — *"the day are longer in summer, each human gets 50% more time to
  work."* In practice this is expressed as a **cheaper hour**: an hour costs
  167 calories instead of 250, so the same plate buys 6 hours instead of 4.
- **Autumn** — the land regrows (see [§12.3](#123-when-and-how-the-land-regrows)),
  and gathering food yields double the base rate.
- **Winter** — the hour becomes **expensive**: 500 calories per hour, so the
  same plate buys half the day it did in summer. Winter also brings **exposure
  deaths** (see [§7.5](#75-death)).

### 5.4 The two difficulty levels

The title screen offers **Normal** and **Hard**:

- **Normal** — *"the village never falls below two."*
- **Hard** — *"the garlocks may take everyone."*

**The only mechanical difference in the entire game is one argument on the
garlock sacking.** On Normal, any effect that kills villagers is floored at 2
villagers. On Hard, that floor is lifted for the garlock sacking specifically,
which means an empty village becomes a real defeat on Hard and is effectively
impossible on Normal.

That is it. Everything else — costs, yields, raids, famine — is identical.

---

## 6. The two currencies: timbermellows and work hours

This is the single most confusing thing in the game, and it is worth
understanding before anything else.

### 6.1 Timbermellows are food

- **1 timbermellow = 1,000 calories.**
- The barn stores **calories**. The player only ever sees **timbermellows**.
- Every place the game shows a food number, it divides by 1,000 and rounds
  down. Every place the game spends food, it multiplies back.
- **Why:** the game used to count food in whole timbermellows, which meant a
  villager's day could only be bought in chunks of 1. Counting calories
  underneath lets a ration be split — which is what makes the work-hour system
  work at all. This was the last item on the design notes' fix list, and it is
  done.

### 6.2 Work hours are what you actually spend

- Work hours are the game's real currency. **Almost every action costs hours.**
- You do **not** have a fixed number of hours per turn. You **buy** them with
  food.
- The price of an hour changes with the season:

| Season | Calories per hour | Hours bought by one bare ration (1,000 cal) |
|---|---|---|
| Spring | 250 | 4 |
| Summer | 167 | **6** |
| Autumn | 250 | 4 |
| Winter | **500** | **2** |

The formula is: `calories per hour = 1,000 ÷ (hours per villager that season)`.

### 6.3 How a turn's hours are actually computed

1. **Every mouth eats a bare ration** — 1,000 calories per person. This
   includes villagers, soldiers, **and trainees**. It buys nothing on its own.
2. **Whatever is left in the barn is then offered to the villagers**, up to a
   per-person cap (see 6.4). Soldiers and trainees get nothing extra — they eat
   and do not work, so feeding them more would be buying hours from nobody.
3. **Your hours = floor(villagers' calories ÷ calories per hour).**

So a village of 4 in spring with a full barn floor gets 4 villagers × 4 hours =
16 hours. In summer the same food buys 24. In winter, 8.

**This means eating more literally buys more hours**, and eating less saves
food at the cost of the turn's work.

### 6.4 The feast cap — the most one person can usefully eat

A villager cannot eat without limit. The cap starts at **1,000 calories** and
**widens by 250 calories for every 10 turns in a row without a villager
dying**, up to a maximum of **2,500 calories**.

| Turns without a death | Cap per villager |
|---|---|
| 0–9 | 1,000 (1 timbermellow) |
| 10–19 | 1,250 |
| 20–29 | 1,500 |
| 30–39 | 1,750 |
| 40–49 | 2,000 |
| 50+ | 2,250 … max **2,500** |

**Any villager death resets the streak to zero.** The comment in the code is
worth quoting, because it explains the design: *"It is a calorie cap, not an
hour cap: the same plate is 10 hours in spring and 15 in summer."*

### 6.5 Barns, capacity and spoilage

- **A barn holds 8 timbermellows.** `capacity = barns × 8 × 1,000 calories`.
- You always have at least **1 barn** — the hall counts as the first one, and
  the first one can never be lost.
- **Spoilage happens before eating, every turn.** Anything over capacity is
  lost. This is the reason to build barns before a good autumn.

---

## 7. Your people

### 7.1 The four kinds of person

| Kind | Works? | Eats? | Counts toward the people cap? |
|---|---|---|---|
| **Villager** (`humans`) | Yes — this is your labour pool | Yes, 1 ration | Yes |
| **Soldier** (`human_army`) | No | Yes, 1 ration | No |
| **Trainee** | No — they are off the rota | Yes, 1 ration | No |
| **Village floor** | — | — | — |

`mouths to feed = villagers + soldiers + trainees`. Every one of them eats
**1,000 calories per turn**, no exceptions.

### 7.2 The people cap

`cap = max(6, houses × 3)`

- **The floor is 6** — *"Roofs never count for fewer than six, so the founding
  village cannot freeze to death in a winter it had no way to prepare for."*
- Each house adds **3** to the cap.
- You start with 1 house (the hall counts as the first house), so you start
  with a cap of 6.
- If you are over the cap when winter comes, people freeze — see 7.5.

### 7.3 Making a villager

| Cost | Value |
|---|---|
| Food | **3 timbermellows** (3,000 calories) |
| Work hours | **1** |

The ×5 button does five at once (15 timbermellows, 5 hours). The buttons are
disabled when you cannot afford it, and — importantly — **the ×5 buttons are
hidden until you research work gangs** (see [§13](#13-technologies)).

### 7.4 Making a soldier

| Cost | Value |
|---|---|
| A villager | **1** — they leave the rota permanently |
| Work hours | **1** |
| Food | none |

**You need at least 3 villagers to make one soldier** (`humans > 2`), because
the village never drops below 2. The ×5 button needs at least 7.

Soldiers are the only thing standing between the garlocks and your barns, so
this is a real cost: every soldier is a villager who will never gather again.

### 7.5 Death

Death comes from three places:

1. **Starvation.** When the barn cannot feed everyone, the shortfall is taken
   out of **soldiers first**, then villagers. Soldiers starve proportionally —
   a shortfall of 2 rations eats 2 soldiers, not all of them.
2. **Winter exposure.** Each winter turn, **at most 2 people freeze**, and only
   if you are over the people cap. You get a warning in the End Turn dialog
   when it is coming: *"N have no roof in the frost."*
3. **The garlock sacking.** Only when the village has stood completely
   undefended through a raid, and only when the garlocks are already angry
   (see [§16](#16-the-garlocks)).

**Any villager death resets the feast cap streak to zero.**

**The two-villager floor:** `killVillagers()` refuses to go below 2 villagers
unless explicitly told otherwise. The only place that tells it otherwise is the
garlock sacking **on Hard difficulty**.

---

## 8. Buildings

Five things you build with wood and stone. All of them cost work hours as well
as materials.

| Building | Wood | Stone | Hours | What it does |
|---|---|---|---|---|
| **Barn** | 4 | — | 1 | +8 timbermellows of storage |
| **House** | — | 2 | 1 | +3 to the people cap (floor 6) |
| **School** | 8 | 6 | 2 | Trains farmers, foresters, masons, scholars |
| **Army camp** | 10 | 8 | 2 | Trains scouts and captains; **+1 defence each** |
| **Dock** | 6 | — | 1 | Unlocks sea trade; needed for fishing boats |

Notes:

- **The hall counts as the first barn and the first house.** So you begin with
  1 barn and 1 house already, and the first barn and first house **can never be
  lost** — a raid takes at most `barns - 1`.
- Building your **first** school fires a milestone popup ("The School"), and so
  does your first army camp ("The Army Camp").
- **Schools and army camps also count toward defence**, indirectly: every army
  camp is +1 defence on its own, on top of what captains give.
- The build palette on the map also offers **work sites** — farm, pasture,
  lumber camp, quarry, fishery, mine. Those are not "buildings"; they are
  covered in [§11](#11-work-sites-and-improvements).

---

## 9. Land: claims, districts, exploring, seizing

### 9.1 You start owning your valley

When the world is created, you claim your hall's hex and then **every hex
within 3** of it — a hexagon of radius 3, which is **37 hexes**. The hall is
claimed first, so it is the oldest claim and therefore **the first patch of
land the village works dry**.

### 9.2 One action claims a district

This is the key land rule: **you never claim one hex at a time.** Every land
action claims a **district** around the hex you picked.

| Action | Radius | Hexes claimed |
|---|---|---|
| Starting valley | 3 | **37** |
| Explore | 2 | up to **19** |
| Seize | 2 | up to **19** |

A radius-2 district is a hexagon of 19 hexes: the centre plus 6 plus 12. The
district only takes hexes that are unowned and settleable — it never steals
from someone else, and it never claims open sea or a lake.

### 9.3 Exploring — claiming wild land

**Explore** takes a hex you can see that touches your land and claims a
district around it.

| Requirement | Value |
|---|---|
| Minimum villagers | **3** |
| Minimum soldiers | **1** — but see the escort rule |
| Food | **6 timbermellows** (6,000 calories) |
| Work hours | **3** |

**The escort rule is subtle and important.** The very first steps out need no
soldier at all. Once your valley has grown **past 40 claimed hexes**,
expeditions need **1 soldier as escort**. The code comment says: *"the very
first step out needs no escort… Once the valley (~37 hexes) has grown past 40
tiles, expeditions need their soldier again."*

Exploring is blocked for a specific reason, in this order, and the game tells
you which:

1. The map hasn't loaded.
2. No tile picked.
3. That land is already yours.
4. That land belongs to someone else — *"it would have to be seized."*
5. Open sea — *"Your people have no boats yet."*
6. A lake — *"nobody can settle a lake."*
7. Not next to your own land.
8. Fewer than 3 villagers.
9. Past 40 hexes and no soldier as escort.
10. Fewer than 6 timbermellows.
11. Fewer than 3 work hours.

### 9.4 Seizing — taking land from a neighbour

**Seize** takes a district from another village's territory.

| Requirement | Value |
|---|---|
| Minimum soldiers | **2** — but rises with the target's strength |
| Food | **8 timbermellows** (8,000 calories) |
| Work hours | **4** |
| Soldiers lost | **1** — unless you bring 3 extra |

**The soldier requirement scales with the target's strength:**

`needed = max(2, ceil(targetStrength ÷ 4))`

where `targetStrength = base + round(tilesOwned ÷ 8) × 2`, and base is **4 for
a garlock camp** and **2 for a rival village**.

| Target | Tiles held | Strength | Soldiers needed |
|---|---|---|---|
| Rival | 0–27 | 2–8 | 2 |
| Rival | 28–35 | 10 | 3 |
| Rival | 60–67 | 18 | 5 |
| Garlock | 0–3 | 4 | 2 |
| Garlock | 28–35 | 12 | 3 |

**"One doesn't come back" — with an exception.** Normally a seizure costs
**exactly 1 soldier**. But if you bring **3 or more soldiers above the
requirement**, nobody dies. The code calls this *"overwhelming force takes
ground clean."*

**You can never take the village itself.** The hex a village stands on is
exempt — *"{name} itself cannot be taken — only the land around it."* The
district also skips that hex when it transfers.

Seizing is blocked, in this order:

1. That is your own land (or nobody's).
2. That is the village hex itself.
3. Not adjacent to your land.
4. You have not scouted it — *"Scout it first — you cannot seize land you have
   not seen."*
5. Not enough soldiers.
6. Not enough food for the march.
7. Not enough work hours.

### 9.5 Who owns what, and why it matters

Only land you own can be gathered from. Wild land and enemy land are untouched.
Ownership is what makes a hex's resources available, and — because
`take()` always drains **the oldest claim first** — the order you claimed land
in determines the order you work it dry. Your starting valley is worked out
before anything you explore later.

---

## 10. Roads

Roads are one of the most quietly powerful things in the game. They do four
separate jobs.

### 10.1 What a road does

| Effect | Amount |
|---|---|
| **Gathering bonus** | up to **+30%** on everything you gather |
| **Trade** | a rival whose hall is road-connected becomes a trade partner |
| **Defence** | **+1 defence per 15 connected hexes, capped at +3** |
| **Site delivery** | a work site delivers nothing until a road reaches it |

The gathering bonus is **not a flat 30%**. It is
`1 + 0.3 × (share of your resource-bearing hexes that a road connects to the
hall)`. If only half your working land is connected, you get +15%. If you have
no resource-bearing hexes at all, the multiplier is exactly 1.

### 10.2 Laying a road

The road tool takes **two clicks** — a start and an end. The game finds the
cheapest path (preferring to follow existing roads), and reports:

- *"No way through for a road there."* — no path exists.
- *"There is already a road all the way."* — nothing to build.

| Cost | Value |
|---|---|
| Wood | **1 per new hex** |
| Work hours | **1 per 4 hexes**, minimum 1 |

A road **never crosses land that belongs to somebody else** — *"so a village
never paves its neighbour's fields."* It may cross wild land.

### 10.3 The trade network the world already has

The generator's trade routes become real roads from turn one, so some
neighbours are already connected when you start. On top of that, the game
**automatically lays roads from your hall out to each new work site**, up to 40
hexes. Beyond 40 hexes the site simply stays off the network until you draw a
road to it yourself.

---

## 11. Work sites and improvements

Work sites are how land becomes production. They are not buildings — they are
placed on the map, on specific terrain, and they need a road to pay out.

### 11.1 The six work sites

| Site | Build on | Produces |
|---|---|---|
| **Farm** | Plains, meadow, terraced hills, hills, badlands | Food (needs farming learned) |
| **Pasture** | Meadow, plains, hills, tundra | Food |
| **Lumber camp** | Any woodland | Wood |
| **Quarry** | Rock, hills, tundra, shore | Stone |
| **Fishery** | Any hex **beside water** | Food |
| **Mine** | Mountains, rocky outcrops | Stone |

### 11.2 Placement rules

- **Spacing:** work sites need **a hex of open ground between them**. Two sites
  may not be adjacent.
- **Ownership:** you can only build on your own land.
- **Water:** nothing is built on water (except a fishery, which needs water
  *beside* it, not under it).
- **Cap:** the number of sites you may have is
  `max(1, round(resource-bearing hexes ÷ 9))`. Rivals use the same rule but
  with a divisor of 12 — they work their land more thinly than you.

### 11.3 The variety guarantee

This is a small, kind rule worth knowing: for each of **food, wood and stone**
that your land actually carries, **at least one site must produce it**. If the
valley is crowded, the spacing rule is relaxed to "not on top of another" so
the guarantee can still be met.

The comment explains why: *"a valley with woods and rock in it should not end
up with four pastures and nothing else — the carts would only ever bring
food."*

### 11.4 Learning farming changes your sites

Once you learn **farming**, two things happen:

- **Pastures on ploughable ground with grain become farms.**
- **Grain starts counting as food** — before farming, only timbermellow counts.

This is the mechanical heart of the last act: farming is how you escape a land
that has been stripped of timbermellows.

### 11.5 The town grows around your hall

Your buildings appear on the map as a little town, laid out in rings around the
hall, and the layout follows its own rules:

- **Town buildings must stand within 3 hexes of the hall.**
- Plots nearer the hall are used first, and **a plot beside a road is preferred
  over one without** — so the town grows along its own streets.
- A **well** appears once you have 2 houses. A **market** at 4. A **dock** when
  the town stands by water and you have 3 houses. A **watchtower** once you
  have an army camp.
- **Palisades** prefer the middle rings; **watchtowers** prefer the outer rings
  and hexes facing somebody else's land or the wild.

---

## 12. Resources and the land's finite pool

### 12.1 The four resources

| Resource | Is food? | Regrows? |
|---|---|---|
| **Timbermellow** | Yes | **Yes** |
| **Grain** | Yes — **only after farming** | **Yes** |
| **Wood** | No | **Yes** |
| **Stone** | No | **NO — never** |

**Stone is the one truly finite resource in the game.** Every stone entry in
the world is marked non-renewable, and no amount of waiting brings it back. It
is also the resource that matters least early and most later, because houses,
schools and army camps all want it.

### 12.2 What each terrain holds

Amounts below are **calories for food** and **plain units for wood and stone**.
Divide food by 1,000 for the number the player sees. Full detail in
[Appendix B](#appendix-b-the-terrain-catalogue).

| Terrain | Timbermellow | Grain | Wood | Stone |
|---|---|---|---|---|
| Timbermellow grove | **28,000** | — | 11 | — |
| Flowering meadow | 17,000 | — | — | — |
| Marshland | 10,000 | — | 9 | — |
| Birch wood | 9,000 | — | 19 | — |
| Forest | 7,000 | — | 22 | — |
| Dense bush | 5,000 | — | **28** | — |
| Cold tundra | 5,000 | — | — | 7 |
| Pine taiga | 3,000 | — | 26 | — |
| Plains | — | **28,000** | — | — |
| Terraced hills | — | 22,000 | — | 11 |
| Rolling hills | — | 6,000 | — | 5 |
| Badlands | — | 5,000 | — | 22 |
| Rocky outcrop | — | — | — | **28** |
| Mountains | — | — | — | **28** |
| Snowfield | — | — | — | 9 |
| Sea cliffs | — | — | — | 9 |
| Shore | — | — | — | 7 |
| Desert | — | — | — | 2 |
| River, lake, sea, shallows | — | — | — | — |

### 12.3 When and how the land regrows

Regrowth happens in **two places**, and both of them are easy to miss:

**1. Every turn of spring and summer** — a small trickle:

| Resource | Per turn, spring/summer | During famine |
|---|---|---|
| Timbermellow | **9.8%** of the tile's maximum | 4.9% |
| Wood | **7%** | 3.5% |
| Grain | **11.2%** | 5.6% |

**Nothing regrows in autumn or winter** on the between-turn trickle. The design
note explains why the trickle exists at all: *"waiting a whole year for the
grove to refill made the early game feel like standing still."*

**2. Once, in autumn** — the harvest:

| Resource | Autumn regrowth | During famine |
|---|---|---|
| Timbermellow | **28%** | 14% |
| Wood | **20%** | 10% |
| Grain | **32%** | 16% |

**Two rules make regrowth work the way it does:**

- Growth is computed **off the tile's maximum, not its current amount**, and
  rounded **up**. A nearly-empty tile refills at the same absolute rate as a
  full one — and a full tile gains nothing.
- **Only renewable entries regrow.** Stone never does.

### 12.4 Gathering — the actual yields

Per hour of work:

| Resource | Base | Stone axe | Food basket | Autumn | Specialist bonus |
|---|---|---|---|---|---|
| Food | 1 | — | +1 | **×2 base only** | +1 per farmer (max +3) |
| Wood | 1 | **+1** | — | — | +1 per forester (max +3) |
| Stone | 1 | — | — | — | +1 per mason (max +3) |

Then the **road multiplier** is applied to the total, and the result is rounded
— but **never down to zero**: `max(1, round(amount × roadMultiplier))`. The
comment: *"Never rounds a real hour's work down to nothing."*

The specialist cap of **+3** is shared across the road bonus's meaning: autumn
doubles the *base* only, so a farmer's bonus is not itself doubled.

---

## 13. Technologies

### 13.1 The rule that gates everything

**Technologies only start appearing once you reach Act II, The Growing Years.**
Before that, the code returns immediately: ideas do not arrive until the
village has room to think. (The Ledger says it in plain language: *"nobody has
time to think yet — it comes with Act II."*)

### 13.2 How a technology unlocks

Unlocking is measured by **the size of the day**, not by the hours you have
left at the moment you click. Specifically it uses `hoursCapacity`, which is
`villagers × hours per villager that season` — recorded by the season effect
*before* the turn's work is spent.

The code comment is worth quoting, because it explains a real bug that was
fixed: *"unlocks measure capacity (people × season hours), not the leftover
hours at click time. Spending all hours no longer locks techs out."*

**Practical consequence:** a village of 7 in summer has a capacity of 42, which
unlocks everything. A village of 4 in winter has a capacity of 8, which unlocks
nothing. **You research in summer, not in winter.**

### 13.3 The five technologies

| Technology | Unlocks at capacity | Wood | Base hours | What it does |
|---|---|---|---|---|
| **Stone axe** | **25** | 20 | 8 | +1 wood per hour |
| **Work gangs** | **35** | 25 | 10 | Shows the ×5 buttons |
| **Farming** | **40** | 30 | 12 | Grain counts as food; pastures become farms |
| **Food basket** | **50** | 50 | 16 | +1 food per hour |
| **Mapmaking** | **60** | 20 | 10 | Lifts the fog of war entirely |

There is no research building and no research queue. Each technology is a
single button that costs materials and hours, and each disappears from the
screen once it is made.

### 13.4 Scholars make research cheaper

Every technology's work-hour price is multiplied by
`1 − (scholars × 0.2)`, floored at 1 hour:

| Scholars | Multiplier | Stone axe (base 8h) | Food basket (base 16h) |
|---|---|---|---|
| 0 | 1.0 | 8 | 16 |
| 1 | 0.8 | 6 | 13 |
| 2 | 0.6 | 5 | 10 |
| 3 | **0.4** | 3 | 6 |

**Note a known inconsistency:** the button tooltips quote the **base** hours,
not the scholar-discounted price. A player with three scholars will be told a
food basket costs 16 hours and then be charged 6.

---

## 14. Professions and training

### 14.1 The idea

A profession is a villager who has **left the work rota permanently** to become
permanently better at one thing. Training them costs a villager for 2–3 turns
plus a lump of food up front — and the trainee still eats while training.

### 14.2 The six professions

| Profession | Trained at | Turns | Food up front | Effect |
|---|---|---|---|---|
| **Farmer** | School | 2 | 4 | +1 food per hour gathering |
| **Forester** | School | 2 | 4 | +1 wood per hour cutting |
| **Mason** | School | 2 | 4 | +1 stone per hour quarrying |
| **Scholar** | School | 3 | 6 | Every technology costs 20% fewer hours (up to 60%) |
| **Scout** | Army camp | 2 | 6 | Expeditions cost 2 less food and 1 less hour |
| **Captain** | Army camp | 3 | 6 | +2 defence whenever the garlocks come |

**Food costs are paid in timbermellows** — 4 or 6 of them, so 4,000 or 6,000
calories.

### 14.3 The rules of training

1. **You need a building.** No school, no farmers, foresters, masons or
   scholars. No army camp, no scouts or captains.
2. **One trainee per building.** N schools = N simultaneous trainees. The
   message is *"Every school is already teaching someone. Build another, or
   wait."*
3. **Three of each, maximum.** A fourth farmer teaches the village nothing —
   the game refuses it outright rather than letting you waste a villager. The
   message is *"Three farmers already teach the village everything they can."*
4. **You need at least 4 villagers.** *"You need four villagers before you can
   spare one to train."* The reasoning in the code: *"Taking one of three
   workers off the rota is not a choice, it is a wound."*
5. **You pay the food up front**, and the trainee **still eats every turn** of
   their training.

### 14.4 The bonuses are capped

Each gathering bonus is capped at **+3** — three farmers, three foresters,
three masons. There is no reason to train a fourth of any of them.

**A subtlety about the army camp:** an army camp gives **+1 defence by itself**,
on top of a captain's +2. So an army camp is worth having even before you have
a captain.

### 14.5 Scout discounts, exactly

| Scouts | Expedition food | Expedition hours |
|---|---|---|
| 0 | 6 timbermellows | 3 |
| 1 | **4** | **2** |
| 2+ | 4 (floor) | 2 (floor) |

**A known inconsistency:** the blocker message for exploring still says
*"An expedition needs 6 timbermellows as provisions"* even when scouts have
discounted the real price to 4.

---

## 15. Standing work orders (jobs)

### 15.1 What they are

Standing work orders are the game's answer to *"I am tired of clicking the
gather button."* You tell the village "N villagers gather food, M cut wood, K
quarry stone", and at the end of every turn the game does it for you.

They are **not** a priority system and they are **not** free — they run **after
your own clicks**, on whatever hours are left.

### 15.2 When they unlock

`jobs` unlocks when **you reach Act III (The Garlock Raids)** *or* **you have 6
villagers** — whichever comes first.

### 15.3 The reserve

Standing orders can **never spend your whole day**. They hold back
`max(1 hour, 10% of the day)` so you can always still build something yourself.
The code comment explains the change: *"It used to be a flat hour, which was
half the winter day."*

### 15.4 How the hours are split

```
assigned   = food + wood + stone workers
dayHours   = your remaining work hours
reserved   = max(1, ceil(dayHours × 0.10))
perWorker  = floor((dayHours − reserved) ÷ assigned)
```

Then each type in order — **food, then wood, then stone** — takes
`workers × perWorker` hours, capped by what is left.

**Note the order matters:** because each type spends from the same shrinking
pool, and because the cap is re-checked each time, **food gets first claim on
the hours, then wood, then stone.**

### 15.5 What they produce

Standing orders produce **exactly what a manual click would** — the same season
rates, the same basket and specialist bonuses, and the same road multiplier.
They simply spend the hours for you.

**In winter, food jobs are skipped entirely.** There is nothing to gather.

### 15.6 The automatic trimming rule

If a raid or a bad winter leaves you with **fewer villagers than assigned
jobs**, the game trims the orders automatically — **from the end of the list
backwards**: stone first, then wood, then food. The message is *"N standing
orders were dropped — there are not enough villagers left to work them."*

The reasoning in the code: *"a raid or a bad winter can leave three jobs and
one villager… the orders are trimmed to fit."*

---

## 16. The garlocks

### 16.1 Who they are

The garlocks are the game's antagonist: an orc-like neighbour who lives in a
camp on your continent and whose only interest is what you have in your barns.
They are always your **closest** neighbours — the generator makes sure of it.

They are **not "people"** in the game's terms: animals do not flee from them,
and they never trade.

### 16.2 When the raids begin

**Nothing happens until Act III.** The code returns immediately if you have not
reached the raids act.

Once you have:

- The first raid is scheduled **8 turns** after the act begins.
- After that, each raid is scheduled **8 turns** after the previous one
  resolves.
- **One turn before they arrive, you are warned:** *"Garlock scouts are
  watching the village to the north-west. They will come next turn."* — and the
  screen shakes, a vignette closes in, and a toast appears. (There is no sound
  in the game; the "war horns" are text and a shake.)

### 16.3 How strong the raid is

```
raid strength = 3
              + (garlock rage × 2)
              + floor((villagers + soldiers) ÷ 4)
              + min(4, floor(your claimed hexes ÷ 70))
```

**Garlock rage** rises by 1 each time a raid is scheduled, and again by 1 each
time a raid succeeds. It falls by 1 every time you **answer a raid and win**.
It is capped at **3** — the comment explains why: *"Without a ceiling a village
that loses one raid loses every raid after it, which is a death spiral, not 'a
peg'."*

So the raid's strength grows with **your population** and, up to a cap, **your
land**. Growing is the core loop, so the punishment for growing is deliberately
bounded.

### 16.4 How strong your defence is

```
defence = soldiers × 3
        + min(3, captains) × 2
        + army camps
        + min(3, floor(connected road hexes ÷ 15))
```

### 16.5 What happens when they arrive

**If defence ≥ raid strength — you hold.** The garlocks break on your shield
line and go back into the trees. Your rage drops by 1, which keeps future raids
small. If your defence was **not overwhelming** — that is, less than 1.5× the
raid's strength — you still lose some soldiers.

**If defence < raid strength — they get through.** How badly depends on the
shortfall, capped at **4** so that no single raid can end a run:

| What is lost | Amount |
|---|---|
| Soldiers | `ceil(shortfall ÷ 2)`, capped at what you have |
| Barns | `1 + floor(shortfall ÷ 3)`, never the last barn |
| Food | **half the barn, plus shortfall × 1 timbermellow** |
| Wood | `shortfall × 3` |

That food line is the harshest thing in the game: a raid that gets through
takes **half of everything in your barns**.

### 16.6 The sacking

There is a second, worse outcome, and it only happens under specific
conditions:

```
defence == 0  AND  shortfall >= 4  AND  garlock rage >= 2
```

In words: **you left the village completely undefended, the raid was at full
strength, and the garlocks were already angry from a previous raid.**

When that happens:

- **2 villagers are killed** — floored at 2 on Normal, **not floored on Hard**.
- Houses are destroyed: `1 + floor(shortfall ÷ 5)`, never the last house.
- The log says *"The village was sacked — nobody stood in their way."*

The design intent is explicit: *"A first undefended raid loots; a repeated one
sacks."* You get one free mistake.

---

## 17. Rival villages, raids, vassals and trade

### 17.1 What rivals do on their turn

Each rival village takes a turn after yours. The rules are simple and
deliberately modest:

- **Rivals settle new land with a 20% chance per turn.** Garlocks: **35%**.
- When they do, they take a **radius-1 patch (7 hexes)** — the target plus its
  neighbours, each with a **75% chance** of being taken. So an expansion turn
  wins roughly **1 to 7 hexes**, averaging about 5.5.
- **They never take mountains, snowfields, open sea or lakes.**
- **They never gather, never build, never train, and never gain free
  resources.** They only claim land.
- Their expansion is **deterministic per world seed and turn**, so the same
  world always plays out the same way.
- You are told about it only if you have scouted the hex: *"Ashford has settled
  new land to the north-east."* For a garlock the message is flagged as bad
  news; for a rival it is neutral.

**Their strength** is what you must beat to seize from them:
`2 (rival) or 4 (garlock) + round(tiles ÷ 8) × 2`.

### 17.2 Your raids on them

You can raid a rival village for loot. A raid is a real military action with
real costs.

| Requirement | Value |
|---|---|
| Minimum soldiers | **2** |
| Food | **6 timbermellows** |
| Work hours | **4** |
| Travel | **1 turn** |
| Outgoing raids at once | **2 maximum** |

**Attack strength** = `soldiers × 3 + min(3, captains) × 2 + (1 if you have a
scout)`. The roll is **±20%** — `attack × (0.8 + random × 0.4)`. The game shows
you the odds in words: **sure, good, even, risky, hopeless**.

**Their defence** = `villageStrength + (3 if they hold ≥40 hexes) +
(2 if ≥80) + (2 if they are a garlock)`. A **vassal's defence is halved.**

**If you win:**

- You loot **`clamp(round(their hexes × 0.25), 3, 30)` timbermellows** per tile
  — so between 3 and 30, scaled to how big they are.
- **Food only fits if your barns have room.** Wood and stone come at half rate.
- **Win twice against the same village, or win with double their strength, and
  they become your vassal.**

**If you lose:** your soldiers die, and the target remembers. A village you have
raided **will not trade with you** until the grudge decays — **8 turns**.

### 17.3 Vassals and tribute

A vassal is a beaten village that pays you instead of trading with you:

| Tribute | Per turn |
|---|---|
| Food | **4 timbermellows** |
| Wood | **3** |

Two victories against the same village, or one victory at double their
strength, is enough.

### 17.4 Trade

Trade is the peaceful alternative, and it requires a **road or a sea lane** to
the other village's hall.

- A rival whose hall your road network reaches becomes a partner.
- **Garlocks never trade.**
- Villages you have raided do not trade until the grudge fades.
- **Vassals pay tribute instead of trading.**

| Trade income | Per partner, per turn |
|---|---|
| Food | **2 timbermellows** — only if your barns have room |
| Wood | **1** — unconditional |

**You are capped at 4 partners.** The comment explains the design: *"A road
network that reaches the whole continent is not a trade empire on turn one:
only the nearest few markets send caravans."*

So the ceiling is **8 food and 4 wood per turn**, and only from villages you
can physically reach.

### 17.5 The defences you can build

| Structure | Wood | Stone | Hours | Defence | Max |
|---|---|---|---|---|---|
| **Palisade** | 12 | — | 2 | **3** | 3 |
| **Watchtower** | 6 | 4 | 1 | **2** | 3 |

Rivals build these too, and you can see them on the map: **a rival gets a
watchtower once it holds 40 hexes, and a stub of palisade at 80** — *"so the
player can see from the map what a raid would be walking into."*

---

## 18. The four acts

The game's story is told through four acts. Each one changes what the interface
shows you and what the world does to you.

### Act I — The First Winter (dawn)

**What you learn:** people eat, and the garlocks will steal any surplus, so you
need barns. Then winter comes and shows you the real hurdle.

**How it starts:** you begin here.

**How it ends:** turn 6 or later, and 3 or more villagers.

**What is hidden in this act:** almost everything. The objectives panel is
hidden. The tutorial is hidden. The "Next" button is hidden. **Only bad news
alerts are shown** — the game deliberately does not tell you about anything
neutral or good while you are still learning that people eat.

### Act II — The Growing Years (growth)

**What you learn:** nothing in particular. There is **no hurdle in this act on
purpose.** The design note: *"There is no main hurdle in this phase the player
should be let to learn and expand freely with new things popping up to spend
there resource on."*

**How it ends:** 6 or more turns in this act, and either 5 or more villagers or
50 or more claimed hexes.

### Act III — The Garlock Raids (raids)

**What you learn:** that growing has a cost. The garlocks come to break your
barns and steal your wood and food. The design note: *"This is to beat the
players growth down a peg before they find out that timbermellow will run
out."*

**How it ends:** either early — the land's food drops to **45,000 calories**
(45 timbermellows) or below **35% of its all-time peak** — or after at least 5
turns in the act, when you reach 6 villagers, 80 hexes, or 12 turns of
patience.

### Act IV — The Timbermellow Famine (famine)

**What you learn:** that the resources you use are **finite**, and that farming
and expansion are the only way out.

**How it begins — and this is the dramatic moment of the game:**

- **34% of every standing grove is destroyed**, and the tile's **permanent
  maximum drops by the same 34%.** Not just the food that was there — the land's
  capacity to ever hold it again.
- **Farming is granted free**, immediately, whether you researched it or not.

**And it never ends.** The famine is permanent, and it compounds:

- Autumn regrowth is **halved**.
- **6% of the land's carrying capacity is destroyed every autumn**, forever.

The comment in the code says exactly what this is for: *"the grove never comes
all the way back: half as much returns, and the land's carrying capacity
shrinks with it. This is what teaches the player that the resource pool is
finite."*

### 18.5 What the acts unlock, in order

The interface reveals itself piece by piece. In order of arrival:

| Unlock | Condition |
|---|---|
| The minimal Act I view | At the start |
| Gathering food | At the start |
| Gathering wood | 3 or more villagers |
| The People panel | 2 or more barns, or 6,000 calories stored |
| The ×5 buttons | Work gangs researched |
| Gathering stone | Having survived the first winter |
| Soldiers | 3 or more villagers |
| The Empire/Ledger panel | Turn 3 or later |
| The Villages panel | — |
| Research | — |
| Training buildings | — |
| Professions | — |
| Standing jobs | Act III, or 6 villagers |
| Defences | 1 or more soldiers |
| Raiding | 2 or more soldiers |
| Planning | Act III |

Anything not yet earned is **force-hidden**, not merely disabled. The game
actively hides the ids of everything you have not unlocked, so you cannot
stumble onto a screen you were not meant to see yet.

---

## 19. Objectives

There are **24 objectives**, shown **3 at a time**, in order. Act I hides the
panel entirely.

Each objective has:

- a **check** (the condition that completes it),
- a **progress readout**,
- a **reward** (always food, paid in timbermellows),
- a **hint**, and
- a **button that takes you to the thing it is about**.

Three objectives fire a **milestone popup** when completed: **60 hexes**,
**your first vassal**, and **taking a whole continent**.

There is also a **5-step intro card** at the very start, and the victory screen
reports **Turns, Year, Hexes Held, Vassals, and Raids Won**.

---

## 20. Victory and defeat

### 20.1 How you win

Either of these:

- **Take the whole continent** — every non-player village on your continent
  becomes your vassal, **or**
- **Reach 3 vassals.**

### 20.2 How you lose

Either of these:

- **Three turns in a row with the barns short of food.** The message is:
  *"Three turns with nothing in the barns. Hunger took the last of them."*
- **Your village is empty** — no villagers and no soldiers left. The message
  is: *"Famine and the bitter elements have claimed the final settler…"*

**On Normal difficulty the second one is effectively impossible**, because
every villager-killing effect is floored at 2 except the garlock sacking, which
is also floored at 2 on Normal. On Normal, **starvation is the only real way to
lose.**

### 20.3 The game-over screen

It reports **Years Survived**, **Total Turns**, **Hexes Claimed**, and **Peak
Settlers**.

---

# Part III — What the player sees

## 21. The interface, screen by screen

### 21.1 The title screen

> **BOTTOM UP**
> *A Hand-Drawn Village Survival Odyssey*
> "Survive winter, hold off garlocks, make 3 vassals in ~30 min"

With a difficulty choice: **Normal** — *"the village never falls below two"*,
and **Hard** — *"the garlocks may take everyone."*

### 21.2 The map

The centre of the screen is the world. Tools along the top:

| Tool | What it does |
|---|---|
| **Grid** | Toggle the hex grid |
| **Lens** | Overlay modes: **None, Yields, Territory, "What is left", Roads** |
| **Place** | Put a work site or building down |
| **Road** | Draw a road, two clicks |
| **FPS** | Performance readout |

**The "What is left" lens is the most important one in the game** — it shows
you at a glance how much of each hex's resources remain. This is the lens that
teaches the last act.

Keyboard shortcuts: **L** cycles the lens, **G** the grid, **B** place,
**R** road, **F3** the FPS counter.

### 21.3 The colonist bar

A row of little figures showing your villagers, soldiers and townsfolk, with
their current trades. This is cosmetic — the figures are a picture of the
numbers, and the game never asks them anything.

### 21.4 "Stores & Dominion"

The readout rows showing your food, wood, stone, people, cap, hours and land,
each with a tooltip explaining the number. The food row shows timbermellows,
never calories.

### 21.5 The right column

| Panel | What it holds |
|---|---|
| **World / minimap** | A small map with your land and the known villages |
| **Objectives** | The 3 current objectives, with progress and rewards |
| **Guide & Chronicle** | The lesson text, and the log |

### 21.6 The inspect pane

Click a hex and this pane tells you what is on it, in plain language: terrain
name, owner, resources remaining, and whether they regrow. Empty hexes say
*"nothing to gather"*. It offers the actions available for that hex —
**Explore**, **Find land**, **Raid**, **Centre**.

### 21.7 The command tabs

Along the bottom, on number keys:

| Key | Tab |
|---|---|
| **1** | Gather |
| **2** | Build |
| **3** | People |
| **4** | Research |
| **5** | Villages |
| **6** | Ledger |
| **7** | History |
| **esc** | Menu |

Every button carries its label, a **cost chip**, and a tooltip. The tabs
themselves appear only as the acts unlock them.

### 21.8 The Ledger (key 6)

The Ledger is the game's explainer, in five sections:

1. **Your people**
2. **A turn in and out**
3. **Your ground**
4. **The island**
5. **The road ahead**

It also lists the technologies with their unlock thresholds (25 / 40 / 50 / 60
/ 35), and says *"nobody has time to think yet — it comes with Act II"* before
you reach that act.

### 21.9 The turn report

After every turn, a panel of **at most 6 lines** appears — what you gained,
what you lost, how many people, how many tiles, how many buildings, and any
notes. It **hides itself after 9 seconds.**

### 21.10 The alerts

Up to **4 alerts** show at once, each with a trigger and a severity. In Act I,
**only the bad ones are shown** — the game deliberately withholds good news
while you are still learning the basics.

The alerts cover: hunger, an incoming raid, winter exposure, empty barns, no
work hours, idle villagers, unconnected work sites, vassals, and several
others.

### 21.11 The lessons

There are **12 lesson texts** in the Guide & Chronicle, each appearing at the
right moment to explain a new mechanic. They are the game's tutorial, and they
are the only tutorial there is — there is no forced walkthrough.

### 21.12 The end-turn dialog

Pressing **End Turn** only shows a confirmation dialog **when there is
something to warn you about** — people who will go unfed, people who will
freeze. If nothing is wrong, the turn simply ends.

### 21.13 Real-time site income

Work sites pay out a little **every 12 seconds** in real time, not on the turn
— this is what makes the map feel alive. **Nothing accrues while the browser
tab is hidden.**

---

## 22. The numbers on the map that move

The map is populated with little figures, all of which are **cosmetic**. The
code comment is explicit: *"None of it changes a rule. game.js never asks an
agent anything; this is the picture of the numbers."*

| What | How many | Speed |
|---|---|---|
| **Villagers** | up to 40, split by trade (max 3 each of forester, mason, farmer, scholar, scout; the rest are carriers) | 26 |
| **Soldiers** | up to 8 | 26 |
| **Townsfolk** | 3–5, from population | 14 |
| **Ox carts** | up to 12, one per 2 work sites | 34 on road, 20 off |
| **Fishing boats** | one per fishery, up to 8 | 22 |
| **Caravans** | one per trade route, once both ends are revealed | 22 |
| **Trade ships** | one per sea lane, once both ends are revealed | 22 |
| **Rival figures** | 2–3 per village, tinted the village colour | 26 |
| **Garlocks** | 5 per raid, marching from camp to hall over ~6 seconds | 26 |
| **Expeditions** | 3 villagers + 1 soldier, out and back | 30 |
| **Animals** | deer, boar, sheep, wolves, herons, fish — per visible chunk | 7–20 |
| **Birds** | 55% chance per revealed chunk | 40 |

Two details worth knowing:

- **Winter stops the farmers walking.** *"Nothing grows"* — the farmer agents
  have nowhere to go.
- **Carts always serve the same site**, and **caravans carry food out and wood
  back** — the animation is honest about what trade is doing.

Ambient life is **deterministic per chunk and world seed** — *"the same wood has
the same deer."* It is spawned only where you are looking and thrown away when
you look away.

---

## 23. Weather and the look of the world

All of this is **purely cosmetic**. The comment says it plainly: *"the season
comes from game.js and nothing here changes a rule."*

| Season | Tint | Weather | Rain chance | Clouds |
|---|---|---|---|---|
| **Spring** | light green | **falling petals** | 25% | 45% |
| **Summer** | warm gold | nothing | 8% | 28% |
| **Autumn** | orange | **falling leaves** | 30% | 55% |
| **Winter** | pale cold blue | **snow** | **70%** | 70% |

- **Rain comes in 40-second spells**, and fades in and out over 6 seconds
  rather than switching.
- In winter, precipitation is **snow**; the rest of the year it is **rain**.
- **The wind never stops entirely** — *"clouds that hang still look like a
  bug."*
- **Morning mist** is thickest just after sunrise, and there is a flat extra
  mist all winter.
- A day/night cycle runs on a **150-second** loop. The game starts you at
  **mid-morning**, *"so nobody boots into the dark."*

**Quality tiers** — the game picks one automatically from the device:

| Tier | Max figures | Ambient life per chunk | Resolution |
|---|---|---|---|
| **Low** | 120 | 2 | 1× |
| **Mid** | 350 | 3 | up to 1.5× |
| **High** | 800 | 5 | up to 2× |

---

# Part IV — Status

## 24. Known gaps and open questions

These are places where **the game's prose and the game's code disagree**, or
where something exists but is not finished. They are listed here so they can be
fixed rather than rediscovered.

1. **The README says "Twelve villages share the island."** The map actually
   creates **42**. This is a stale sentence in the old document.
2. **The "walled town" stage is documentation, not code.** The town is
   described as growing from a clearing (3 buildings) to a fenced village to a
   walled town at 7 buildings with a stone curtain wall. **No stone wall exists
   in the code** — the only thing that reacts to building count is the hall's
   sprite, which grows from hut to hall to keep. The thresholds 3 and 7 appear
   only in prose.
3. **There is no sound in the game at all.** The "war horns" that announce a
   raid are a text toast plus a screen shake. No audio system exists anywhere
   in the project.
4. **Technology tooltips quote base hours, not the scholar-discounted price.**
   A player with three scholars is told a food basket costs 16 hours and is
   charged 6.
5. **The explore blocker quotes the undiscounted food price.** It says *"needs
   6 timbermellows"* even when scouts have cut it to 4.
6. **Roads contribute defence invisibly.** Up to +3 defence comes from having a
   connected road network, and nothing in the interface ever tells the player
   this.
7. **Act I hides more than it says.** The tutorial, the objectives panel, the
   "Next" button, and every non-bad alert are hidden in Act I. This is
   deliberate, but it is not documented anywhere the player can see.
8. **The raid log is saved but never shown.** There is a log of past raids that
   is written into the save file and rendered nowhere.
9. **Act I's objectives need turn 9, but Act II can begin at turn 6.** The two
   progression systems do not line up: an objective can be gated behind a
   milestone the player has already passed.
10. **The famine's early exit has no minimum-turn gate.** It can trigger the
    moment the act begins if the land is already stripped.
11. **`ageFlags` is dead state.** It is stored and never read.
12. **On Normal, the "empty village" defeat is effectively unreachable.** The
    only loss that can actually happen on Normal is starvation.
13. **Four sprites exist in the atlas with no way to place them:** a windmill
    (with animation frames), two bridge variants, and a lighthouse.
14. **Badlands carry grain but do not count toward the start guarantee.** A
    start repaired for food will not consider badlands grain as food, even
    though it is.

## 25. What is being worked on now

This is the state of the current work, as of **v00.00.05**. The seven items
below are the design notes' own fix list.

| # | Item | Status |
|---|---|---|
| 1 | Move the turn log to the left of the turn bubble | **Done** |
| 2 | The player can no longer go under 2 people (the soft lock) | **Done** |
| 3 | Hide all ×5 buttons — they are a technology | **Done** (behind work gangs) |
| 4 | Hide stone and houses — also a technology | **Done** (stone arrives after the first winter) |
| 5 | Shrink the resources tab | **Done** (readout is 178px, down from 250) |
| 6 | One wood technology at 3 people, unlocking wood and barns together | **Mismatched** — wood unlocks at 3 people, but barns unlock separately |
| 7 | Convert all food to calories | **Done** (the barn counts calories; the player still sees timbermellows) |

**Where the design was left off:** the note in the previous Q&A is *"explore()
was where he left off"* — *"they start on one timbermellow tile and then when
they start to use it up will need to spread out to find more food till they
learn to farm."* Exploration, claiming and seizing are all implemented. What
follows — the famine, farming, and the tools that limit clicking (standing work
orders) — is also implemented.

**The open design question** the notes record, in the author's own words: *"I
dont know rn i think it will be fine rn i dont plan on making this version to
complcated rn its kinda ment to tell a story of you out growing your
environment."*

---

# Appendix A: Every number in one place

### Costs

| Action | Food | Wood | Stone | Hours | Other |
|---|---|---|---|---|---|
| Make a villager | 3 | — | — | 1 | — |
| Make a soldier | — | — | — | 1 | −1 villager |
| Build a barn | — | 4 | — | 1 | — |
| Build a house | — | — | 2 | 1 | — |
| Build a school | — | 8 | 6 | 2 | — |
| Build an army camp | — | 10 | 8 | 2 | — |
| Build a dock | — | 6 | — | 1 | — |
| Explore | 6 | — | — | 3 | 3 villagers |
| Seize | 8 | — | — | 4 | 2+ soldiers |
| Raid a village | 6 | — | — | 4 | 2+ soldiers |
| Palisade | — | 12 | — | 2 | — |
| Watchtower | — | 6 | 4 | 1 | — |
| Road | — | 1/hex | — | 1 per 4 hexes | — |

### Technologies

| Technology | Capacity gate | Wood | Base hours |
|---|---|---|---|
| Stone axe | 25 | 20 | 8 |
| Work gangs | 35 | 25 | 10 |
| Farming | 40 | 30 | 12 |
| Food basket | 50 | 50 | 16 |
| Mapmaking | 60 | 20 | 10 |

### Training

| Profession | Building | Turns | Food | Effect |
|---|---|---|---|---|
| Farmer | School | 2 | 4 | +1 food/hour |
| Forester | School | 2 | 4 | +1 wood/hour |
| Mason | School | 2 | 4 | +1 stone/hour |
| Scholar | School | 3 | 6 | −20% research hours (max −60%) |
| Scout | Army camp | 2 | 6 | −2 food, −1 hour on expeditions |
| Captain | Army camp | 3 | 6 | +2 defence |

### Per-turn rates

| Thing | Amount |
|---|---|
| Ration per mouth | 1,000 calories |
| Feast cap | 1,000 → 2,500 calories (+250 per 10 clean turns) |
| Barn capacity | 8 timbermellows per barn |
| Hours per villager | 4 spring/autumn · **6 summer** · **2 winter** |
| Food per hour | 1 (+1 autumn base ×2, +1 basket, +1 per farmer) |
| Wood per hour | 1 (+1 stone axe, +1 per forester) |
| Stone per hour | 1 (+1 per mason) |
| Road gathering bonus | up to +30% |
| Road defence | +1 per 15 connected hexes, max +3 |
| Trade income | 2 food + 1 wood per partner, max 4 partners |
| Vassal tribute | 4 food + 3 wood |
| Autumn regrowth | 28% food, 20% wood, 32% grain |
| Turn trickle (spring/summer) | 9.8% food, 7% wood, 11.2% grain |
| Famine autumn regrowth | halved, plus 6% permanent capacity loss |

### The garlocks

| Thing | Value |
|---|---|
| Raid interval | 8 turns |
| Warning | 1 turn before |
| Rage cap | 3 |
| Raid strength | 3 + rage×2 + floor((people)÷4) + min(4, floor(hexes÷70)) |
| Max bite | 4 |
| Your defence | soldiers×3 + captains×2 + camps + min(3, roads÷15) |
| Sacking needs | defence 0, shortfall ≥4, rage ≥2 |
| Sacking kills | 2 villagers (floored at 2 on Normal) |

### Rivals

| Thing | Value |
|---|---|
| Expansion chance | 20% rival, 35% garlock |
| Expansion size | radius 1 (7 hexes), each 75% |
| Strength | 2 rival / 4 garlock, +2 per 8 tiles |
| Grudge decay | 8 turns |
| Vassal | 2 wins, or 1 win at double strength |
| Rival watchtower | at 40 tiles |
| Rival palisade | at 80 tiles |

---

# Appendix B: The terrain catalogue

Food amounts are in **calories** (divide by 1,000 for timbermellows). Wood and
stone are plain units. **Every stone entry is non-renewable.**

| # | Terrain | Food | Wood | Stone | Movement cost |
|---|---|---|---|---|---|
| 1 | Open sea | — | — | — | impassable |
| 2 | Shallows | — | — | — | impassable |
| 3 | Lake | — | — | — | impassable |
| 4 | River | — | — | — | 3 |
| 5 | Shore | — | — | 7 | 1.2 |
| 6 | Sea cliffs | — | — | 9 | 3 |
| 7 | Plains | 28,000 grain | — | — | **1** |
| 8 | Flowering meadow | 17,000 | — | — | **1** |
| 9 | Rolling hills | 6,000 grain | — | 5 | 1.6 |
| 10 | Terraced hills | 22,000 grain | — | 11 | 1.8 |
| 11 | Forest | 7,000 | 22 | — | 1.7 |
| 12 | Birch wood | 9,000 | 19 | — | 1.5 |
| 13 | Dense bush | 5,000 | **28** | — | 2.2 |
| 14 | Pine taiga | 3,000 | 26 | — | 2.2 |
| 15 | Timbermellow grove | **28,000** | 11 | — | 1.4 |
| 16 | Marshland | 10,000 | 9 | — | 3 |
| 17 | Cold tundra | 5,000 | — | 7 | 1.4 |
| 18 | Snowfield | — | — | 9 | 2.2 |
| 19 | Badlands | 5,000 grain | — | 22 | 1.6 |
| 20 | Desert | — | — | 2 | 1.5 |
| 21 | Rocky outcrop | — | — | **28** | 2.5 |
| 22 | Mountains | — | — | **28** | **6** |

**Where villages may be founded:** flowering meadow, plains, forest, birch
wood, terraced hills, rolling hills.

**Where each profession works:** foresters in woodland; masons on rock, hills
and cliffs; farmers on plains, meadow, terraced hills, groves and hills.

---

# Appendix C: Glossary

| Term | Meaning |
|---|---|
| **Timbermellow** | The food item, and the name of the tree it grows on. 1 = 1,000 calories. |
| **Work hour** | The currency of action. Bought with food; the price changes by season. |
| **Mouth** | Anybody who eats: villager, soldier, or trainee. |
| **District** | The radius-2 (19-hex) or radius-3 (37-hex) patch claimed in one action. |
| **Claim** | Land you own. Only claimed land can be gathered from. |
| **Frontier** | An unowned hex touching land somebody owns. |
| **Seize** | Taking a district from another village. |
| **Vassal** | A beaten village that pays tribute. |
| **Garlock** | The antagonist. Never trades, never becomes a vassal. |
| **Rage** | How angry the garlocks are, 0–3. Rises when they succeed, falls when you win. |
| **Bite** | The maximum damage one raid can do, 4. |
| **Feast cap** | The most one villager can usefully eat, 1,000–2,500 calories. |
| **Shortfall** | How far your defence fell below the raid's strength. |
| **Capacity** | `villagers × hours per villager this season` — the number that gates technologies. |
| **The Ledger** | The explainer panel on key 6. |
| **The Lens** | The map overlay, cycled with L. |

---

*This guide describes the game as it behaves in v00.00.05. Where the game and
this document disagree, the game is right — and the disagreement is worth
reporting as a bug in the code, not in the document.*
