// villagers.js
//
// The people on the map. Every human in the village is a little figure
// that walks out to one of your tiles, works there for a moment, and comes
// home; soldiers patrol the edges of your land. The other villages get a
// couple of figures pottering around their homes so they look lived-in.
//
// Purely cosmetic: nothing here changes game state. It runs its own
// requestAnimationFrame loop and pauses when the tab is hidden or the
// motion switch is off.

const VILLAGER_WALK_SPEED = 26;      // map units per second
const VILLAGER_MAX_HUMANS = 14;      // figures drawn at most, whatever the head count
const VILLAGER_MAX_SOLDIERS = 6;

class Villagers {
  constructor(container, world, hexMap) {
    this.world = world;
    this.hexMap = hexMap;
    this.size = world.grid.hexSize;
    this.random = createRandom(world.seed + 1234);
    this.people = [];
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
      for (let i = 0; i < 2; i++) {
        this.people.push(this.makePerson({ home, kind: "neighbour", color: village.color, isSoldier: village.kind === "garlock" && i === 0 }));
      }
    }
  }

  tileCenter(tile) {
    return worldTileCenter(tile.q, tile.r, this.world.grid);
  }

  homeCenter() {
    return this.tileCenter(this.hexMap.getAllTiles().find((tile) => tile.isStartingTile));
  }

  makePerson({ home, kind, color, isSoldier }) {
    const group = svgEl("g", { class: `villager villager--${kind}${isSoldier ? " villager--soldier" : ""}` });
    paintVillager(group, this.size * 0.7, color, isSoldier);
    this.layer.appendChild(group);
    const person = {
      el: group, kind, isSoldier, home,
      x: home.x + (this.random() - 0.5) * this.size * 0.5,
      y: home.y + (this.random() - 0.5) * this.size * 0.4,
      target: null, state: "idle", timer: this.random() * 2,
      speed: VILLAGER_WALK_SPEED * (0.85 + this.random() * 0.3),
    };
    this.place(person);
    return person;
  }

  // Matches the figures to the head count: adds or removes as needed.
  sync(humans, soldiers) {
    const wantHumans = Math.min(humans, VILLAGER_MAX_HUMANS);
    const wantSoldiers = Math.min(soldiers, VILLAGER_MAX_SOLDIERS);
    const home = this.homeCenter();
    const mine = this.people.filter((person) => person.kind === "player");
    const haveHumans = mine.filter((person) => !person.isSoldier).length;
    const haveSoldiers = mine.filter((person) => person.isSoldier).length;

    for (let i = haveHumans; i < wantHumans; i++) {
      this.people.push(this.makePerson({ home, kind: "player", color: pick(ART_COLORS.tunics, this.random), isSoldier: false }));
    }
    for (let i = haveSoldiers; i < wantSoldiers; i++) {
      this.people.push(this.makePerson({ home, kind: "player", color: ART_COLORS.soldier, isSoldier: true }));
    }
    this.trim("player", false, wantHumans);
    this.trim("player", true, wantSoldiers);
  }

  trim(kind, isSoldier, keep) {
    const matching = this.people.filter((person) => person.kind === kind && person.isSoldier === isSoldier);
    for (let i = matching.length - 1; i >= keep; i--) {
      matching[i].el.remove();
      this.people.splice(this.people.indexOf(matching[i]), 1);
    }
  }

  // Where to go next.
  pickTarget(person) {
    if (person.kind === "neighbour") {
      return { x: person.home.x + (this.random() - 0.5) * this.size * 1.1, y: person.home.y + (this.random() - 0.5) * this.size * 0.8 };
    }
    const tiles = this.hexMap.getClaimedTiles().filter((tile) => !tile.isStartingTile);
    if (person.isSoldier) {
      const border = tiles.filter((tile) => this.hexMap.getNeighbors(tile.id).some((n) => n.owner !== "player"));
      const pool = border.length ? border : tiles;
      if (!pool.length) return this.nearHome(person, 0.9);
      const tile = pool[Math.floor(this.random() * pool.length)];
      return this.jitter(this.tileCenter(tile), 0.5);
    }
    const worked = tiles.filter((tile) => Object.values(tile.resources).some((entry) => entry.amount > 0));
    if (!worked.length || this.random() < 0.3) return this.nearHome(person, 0.8);
    const tile = worked[Math.floor(this.random() * worked.length)];
    return this.jitter(this.tileCenter(tile), 0.45);
  }

  nearHome(person, spread) {
    return this.jitter(person.home, spread);
  }

  jitter(point, spread) {
    return { x: point.x + (this.random() - 0.5) * this.size * spread, y: point.y + (this.random() - 0.5) * this.size * spread * 0.8 };
  }

  place(person) {
    person.el.setAttribute("transform", `translate(${person.x.toFixed(1)} ${person.y.toFixed(1)})`);
  }

  setState(person, state) {
    person.state = state;
    person.el.classList.toggle("villager--walking", state === "walk");
    person.el.classList.toggle("villager--working", state === "work");
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
        const atHome = Math.hypot(person.x - person.home.x, person.y - person.home.y) < this.size * 0.7;
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
    const frame = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      if (!document.hidden) this.step(dt);
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
