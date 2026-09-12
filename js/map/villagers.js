// villagers.js
//
// The people on the map, and what they are doing.
//
// Every villager is a little figure that walks out to a piece of your land,
// works it, and comes home. Which piece depends on what they are: a forester
// goes to the trees, a mason to the rock, a farmer to the fields, and while
// they are there the stylesheet swings the tool in their hand — so from the
// map you can see who is chopping and who is hoeing. Soldiers patrol the
// edge of your territory instead.
//
// The square is never empty either: a few townsfolk stay put — somebody at
// the well, somebody minding a stall, children by the fire — so the middle
// of the village looks inhabited even when everybody else is out working.
//
// Purely cosmetic: nothing here changes game state. It runs its own
// requestAnimationFrame loop and pauses when the tab is hidden.

const VILLAGER_WALK_SPEED = 26;      // map units per second
const VILLAGER_MAX_HUMANS = 20;      // figures drawn at most, whatever the head count
const VILLAGER_MAX_SOLDIERS = 8;
const VILLAGER_MAX_TOWNFOLK = 5;     // the ones who never leave the square

// Which ground a trade goes to work. Anything not listed works wherever
// there is something left to gather.
const VILLAGER_WORKPLACES = {
  forester: ["forest", "denseBush", "timbermellowForest", "birchWood", "taiga"],
  mason: ["mountains", "rockyOutcrop", "badlands", "overgrownHighlands"],
  farmer: ["plains", "flowerMeadow", "overgrownHighlands", "timbermellowForest"],
  scout: null,
  scholar: null,
  carrier: null,
};

// What each trade is doing when it gets there — the class the stylesheet
// animates.
const VILLAGER_WORK_MOTION = {
  forester: "chop",
  mason: "chop",
  farmer: "reap",
  scholar: "read",
  scout: "look",
  carrier: "carry",
  soldier: "look",
};

class Villagers {
  constructor(container, world, hexMap) {
    this.world = world;
    this.hexMap = hexMap;
    this.size = world.grid.hexSize;
    // A figure is a person, not a hex: on a fine grid it would be four
    // pixels tall if it followed the grid down.
    this.figure = Math.max(world.grid.hexSize, 15);
    this.random = createRandom(world.seed + 1234);
    this.people = [];
    this.townfolk = [];
    this.crowdKey = "";
    this.running = false;
    this.lastFrame = 0;

    this.svg = svgEl("svg", {
      viewBox: `0 0 ${world.width} ${world.height}`,
      width: "100%",
      height: "100%",
      preserveAspectRatio: "xMidYMid meet",
      class: "map-villagers",
    });
    this.layer = svgEl("g", {});
    this.svg.appendChild(this.layer);
    container.innerHTML = "";
    container.appendChild(this.svg);

    // Neighbours' figures never change, so they're made once.
    for (const village of world.villages) {
      if (village.kind === "player") continue;
      const home = this.tileCenter(hexMap.getTile(village.homeTileId));
      for (let i = 0; i < 3; i++) {
        this.people.push(this.makePerson({
          home, kind: "neighbour", color: village.color,
          isSoldier: village.kind === "garlock" && i === 0,
          trade: village.kind === "garlock" ? "soldier" : (i === 1 ? "farmer" : "carrier"),
        }));
      }
    }
  }

  tileCenter(tile) {
    return worldTileCenter(tile.q, tile.r, this.world.grid);
  }

  homeCenter() {
    // Found once: this is asked for whenever a figure decides where to walk.
    if (!this.home) this.home = this.hexMap.getAllTiles().find((tile) => tile.isStartingTile);
    return this.tileCenter(this.home);
  }

  makePerson({ home, kind, color, isSoldier, trade, child, scale }) {
    const job = trade || (isSoldier ? "soldier" : "carrier");
    const group = svgEl("g", {
      class: `villager villager--${kind}${isSoldier ? " villager--soldier" : ""} villager--${job}`,
    });
    const size = (scale || 0.8) * this.figure;
    if (child) paintChild(group, size, color);
    else paintVillager(group, size, color, { soldier: isSoldier, trade: job, hat: pick(VILLAGER_HATS, this.random) });
    this.layer.appendChild(group);
    const person = {
      el: group, kind, isSoldier, home, trade: job, child: !!child,
      x: home.x + (this.random() - 0.5) * this.figure * 0.5,
      y: home.y + (this.random() - 0.5) * this.figure * 0.4,
      target: null, state: "idle", timer: this.random() * 2,
      speed: VILLAGER_WALK_SPEED * (0.85 + this.random() * 0.3),
    };
    this.place(person);
    return person;
  }

  // How many of each trade should be out there. The specialists the player
  // actually trained get their own figures; everybody else carries baskets.
  tradeRoster(count) {
    const counts = typeof professionCounts === "object" && professionCounts ? professionCounts : {};
    const roster = [];
    for (const trade of ["forester", "mason", "farmer", "scholar", "scout"]) {
      for (let i = 0; i < Math.min(counts[trade] || 0, 3) && roster.length < count; i++) roster.push(trade);
    }
    while (roster.length < count) roster.push("carrier");
    return roster;
  }

  // Matches the figures on the map to the village: how many, of what trade,
  // and who is standing about in the square.
  sync(humans, soldiers) {
    const wantHumans = Math.min(humans, VILLAGER_MAX_HUMANS);
    const wantSoldiers = Math.min(soldiers, VILLAGER_MAX_SOLDIERS);
    const trades = this.tradeRoster(wantHumans);
    // Rebuilding a dozen little SVG people on every screen refresh would be
    // wasteful, so it only happens when the crowd is actually different.
    const key = `${wantHumans}|${wantSoldiers}|${trades.join("")}`;
    if (key === this.crowdKey) return;
    this.crowdKey = key;

    const home = this.homeCenter();
    // Where everyone was standing, so a birth in the village does not
    // teleport the whole population back to the market square.
    const standing = this.people
      .filter((person) => person.kind === "player")
      .map((person) => ({ x: person.x, y: person.y, target: person.target, state: person.state }));
    for (const person of this.people.filter((p) => p.kind === "player")) {
      person.el.remove();
      this.people.splice(this.people.indexOf(person), 1);
    }

    const rebuilt = [];
    for (let i = 0; i < wantHumans; i++) {
      rebuilt.push(this.makePerson({
        home, kind: "player", color: pick(ART_COLORS.tunics, this.random),
        isSoldier: false, trade: trades[i],
      }));
    }
    for (let i = 0; i < wantSoldiers; i++) {
      rebuilt.push(this.makePerson({ home, kind: "player", color: ART_COLORS.soldier, isSoldier: true, trade: "soldier" }));
    }
    rebuilt.forEach((person, index) => {
      const was = standing[index];
      if (was) {
        person.x = was.x;
        person.y = was.y;
        person.target = was.target;
        this.setState(person, was.state);
        this.place(person);
      }
      this.people.push(person);
    });
    this.syncTownfolk(humans + soldiers, home);
  }

  // The people who never leave the square: whoever is at the well, whoever
  // is minding a stall, and the children round the fire. They make the
  // middle of a village look inhabited when everybody else is out working.
  syncTownfolk(population, home) {
    const want = Math.max(1, Math.min(VILLAGER_MAX_TOWNFOLK, Math.floor(population / 3)));
    if (this.townfolk.length === want) return;
    for (const person of this.townfolk) person.el.remove();
    this.townfolk = [];

    const spots = [
      { dx: -0.55, dy: 0.42, trade: "carrier", child: false },
      { dx: 0.62, dy: 0.3, trade: "farmer", child: false },
      { dx: 0.1, dy: 0.7, trade: "none", child: true },
      { dx: -0.25, dy: 0.75, trade: "none", child: true },
      { dx: 0.42, dy: -0.5, trade: "scholar", child: false },
    ];
    for (let i = 0; i < want; i++) {
      const spot = spots[i % spots.length];
      const group = svgEl("g", { class: `villager villager--townfolk villager--${spot.trade} villager--working` });
      const size = this.figure * (spot.child ? 0.8 : 0.78);
      if (spot.child) paintChild(group, size, pick(ART_COLORS.tunics, this.random));
      else paintVillager(group, size, pick(ART_COLORS.tunics, this.random), { trade: spot.trade, hat: pick(VILLAGER_HATS, this.random) });
      const x = home.x + spot.dx * this.figure * 1.7;
      const y = home.y + spot.dy * this.figure * 1.4;
      group.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      this.layer.appendChild(group);
      this.townfolk.push({ el: group });
    }
  }

  trim(kind, isSoldier, keep) {
    const matching = this.people.filter((person) => person.kind === kind && person.isSoldier === isSoldier);
    for (let i = matching.length - 1; i >= keep; i--) {
      matching[i].el.remove();
      this.people.splice(this.people.indexOf(matching[i]), 1);
    }
  }

  // Where to go next. Distances are measured in figures, not in hexes — on
  // this grid a hex is smaller than the person standing on it.
  pickTarget(person) {
    if (person.kind === "neighbour") {
      return {
        x: person.home.x + (this.random() - 0.5) * this.figure * 1.6,
        y: person.home.y + (this.random() - 0.5) * this.figure * 1.2,
      };
    }
    // Only the near fields: nobody walks half the island to pick berries.
    const reach = this.figure * 14;
    const tiles = this.hexMap.getClaimedTiles().filter((tile) => {
      if (tile.isStartingTile) return false;
      const c = this.tileCenter(tile);
      return Math.abs(c.x - person.home.x) < reach && Math.abs(c.y - person.home.y) < reach;
    });
    if (person.isSoldier) {
      const border = tiles.filter((tile) => this.hexMap.getNeighbors(tile.id).some((n) => n.owner !== "player"));
      const pool = border.length ? border : tiles;
      if (!pool.length) return this.nearHome(person, 0.9);
      const tile = pool[Math.floor(this.random() * pool.length)];
      return this.jitter(this.tileCenter(tile), 0.5);
    }

    const worked = tiles.filter((tile) => Object.values(tile.resources).some((entry) => entry.amount > 0));
    if (!worked.length || this.random() < 0.25) return this.nearHome(person, 0.8);

    // A trained villager goes where their trade is: the forester to the
    // trees, the mason to the rock, the farmer to the fields. It is the
    // whole point of having trained them, and it should be visible.
    const wanted = VILLAGER_WORKPLACES[person.trade];
    const suited = wanted ? worked.filter((tile) => wanted.includes(tile.terrainType)) : [];
    const pool = suited.length ? suited : worked;
    const tile = pool[Math.floor(this.random() * pool.length)];
    person.workTerrain = tile.terrainType;
    return this.jitter(this.tileCenter(tile), 0.45);
  }

  nearHome(person, spread) {
    return this.jitter(person.home, spread);
  }

  jitter(point, spread) {
    return {
      x: point.x + (this.random() - 0.5) * this.figure * spread * 1.6,
      y: point.y + (this.random() - 0.5) * this.figure * spread * 1.3,
    };
  }

  place(person) {
    person.el.setAttribute("transform", `translate(${person.x.toFixed(1)} ${person.y.toFixed(1)})`);
  }

  setState(person, state) {
    person.state = state;
    person.el.classList.toggle("villager--walking", state === "walk");
    person.el.classList.toggle("villager--working", state === "work");
    // Which motion: the stylesheet swings the arm differently for chopping,
    // reaping, reading and carrying.
    for (const motion of ["chop", "reap", "read", "look", "carry"]) {
      person.el.classList.remove(`villager--${motion}`);
    }
    if (state === "work") {
      const motion = VILLAGER_WORK_MOTION[person.trade] || "carry";
      person.el.classList.add(`villager--${motion}`);
    }
  }

  step(dt) {
    for (const person of this.people) {
      person.timer -= dt;
      if (person.state === "idle" || person.state === "work") {
        if (person.timer <= 0) {
          person.target = person.state === "work" && person.kind === "player" ? this.nearHome(person, 0.6) : this.pickTarget(person);
          person.facingLeft = person.target.x < person.x;
          this.setState(person, "walk");
        }
        continue;
      }
      // walking
      const dx = person.target.x - person.x;
      const dy = person.target.y - person.y;
      const distance = Math.hypot(dx, dy);
      const stride = person.speed * dt;
      if (distance <= stride) {
        person.x = person.target.x;
        person.y = person.target.y;
        const atHome = Math.hypot(person.x - person.home.x, person.y - person.home.y) < this.figure * 1.2;
        this.setState(person, atHome ? "idle" : "work");
        person.timer = atHome ? 0.6 + this.random() * 2.2 : 1.4 + this.random() * 2.4;
      } else {
        person.x += (dx / distance) * stride;
        person.y += (dy / distance) * stride;
      }
      person.el.setAttribute("transform", `translate(${person.x.toFixed(1)} ${person.y.toFixed(1)})${person.facingLeft ? " scale(-1 1)" : ""}`);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const stage = document.getElementById("mapstage");
    const frame = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      // Zoomed right out a figure is two pixels tall and moving it is
      // wasted work on every frame; zoomed out far enough the stylesheet
      // hides the layer entirely, so there is nothing to move at all.
      const tooFar = stage && stage.classList.contains("is-far");
      if (!document.hidden && !tooFar) this.step(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Villagers };
}
