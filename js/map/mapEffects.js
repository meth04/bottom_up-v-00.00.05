// mapEffects.js
//
// The "sky" layer that sits above the hex grid: drifting clouds, birds,
// smoke from the village, snow in winter, the expedition marker that walks
// out to a newly explored tile, and the little "+3" numbers that float up
// when something is gathered. Purely cosmetic — nothing in here changes
// game state, and it never takes the mouse (pointer-events: none).
//
// Drawn in the same coordinate space as the painted world so positions
// line up.

class MapEffects {
  constructor(container, width, height) {
    this.width = width;
    this.height = height;
    this.svg = svgEl("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width: "100%",
      height: "100%",
      preserveAspectRatio: "xMidYMid meet",
      class: "map-effects",
    });
    // css/style.css reads these so clouds and snow cross the whole sheet
    // whatever its size.
    this.svg.style.setProperty("--drift-width", `${width + 320}px`);
    this.svg.style.setProperty("--fall-height", `${height + 40}px`);

    // Layers, back to front.
    this.smokeLayer = svgEl("g", { class: "fx-layer fx-layer--smoke" });
    this.markerLayer = svgEl("g", { class: "fx-layer fx-layer--markers" });
    this.birdLayer = svgEl("g", { class: "fx-layer fx-layer--birds" });
    this.cloudLayer = svgEl("g", { class: "fx-layer fx-layer--clouds" });
    this.snowLayer = svgEl("g", { class: "fx-layer fx-layer--snow" });
    for (const layer of [this.smokeLayer, this.markerLayer, this.birdLayer, this.cloudLayer, this.snowLayer]) {
      this.svg.appendChild(layer);
    }

    this.drawClouds();
    this.drawBirds();
    this.drawSnow();

    container.innerHTML = "";
    container.appendChild(this.svg);
  }

  // ---- Ambient ---------------------------------------------------------------

  drawClouds() {
    const clouds = [
      { y: 0.12, scale: 1.0, duration: 110, delay: -20 },
      { y: 0.42, scale: 0.8, duration: 140, delay: -70 },
      { y: 0.78, scale: 1.15, duration: 125, delay: -45 },
    ];
    for (const cloud of clouds) {
      const group = svgEl("g", { class: "fx-cloud" });
      group.style.animationDuration = `${cloud.duration}s`;
      group.style.animationDelay = `${cloud.delay}s`;
      const y = this.height * cloud.y;
      const puffs = [[0, 0, 46], [40, -14, 38], [82, 2, 44], [30, 16, 34], [64, 18, 30]];
      for (const [dx, dy, r] of puffs) {
        group.appendChild(svgEl("ellipse", {
          cx: dx * cloud.scale, cy: y + dy * cloud.scale,
          rx: r * cloud.scale, ry: r * 0.62 * cloud.scale,
          fill: "#ffffff", opacity: 0.55,
        }));
      }
      this.cloudLayer.appendChild(group);
    }
  }

  drawBirds() {
    const flights = [
      { y: 0.22, duration: 48, delay: 4 },
      { y: 0.6, duration: 56, delay: 21 },
    ];
    for (const flight of flights) {
      const group = svgEl("g", { class: "fx-bird" });
      group.style.animationDuration = `${flight.duration}s`;
      group.style.animationDelay = `${flight.delay}s`;
      const y = this.height * flight.y;
      for (let i = 0; i < 3; i++) {
        const x = i * 22;
        const yy = y + (i === 1 ? -8 : 0);
        group.appendChild(svgEl("path", {
          d: `M ${x} ${yy} q 6 -6 12 0 q 6 -6 12 0`,
          fill: "none", stroke: "#2b241e", "stroke-width": 2, "stroke-linecap": "round",
          class: "fx-bird__wing",
        }));
      }
      this.birdLayer.appendChild(group);
    }
  }

  drawSnow() {
    const random = createRandom(7);
    // Few enough that a winter doesn't cost a frame rate.
    const flakes = Math.min(36, Math.round(this.width / 50));
    for (let i = 0; i < flakes; i++) {
      const flake = svgEl("circle", {
        cx: random() * this.width, cy: -10,
        r: 2 + random() * 3,
        fill: "#ffffff", opacity: 0.85,
        class: "fx-snow",
      });
      flake.style.animationDuration = `${9 + random() * 8}s`;
      flake.style.animationDelay = `${-random() * 16}s`;
      this.snowLayer.appendChild(flake);
    }
  }

  // Where the village stands: chimney smoke rises from here.
  setVillage(x, y) {
    this.village = { x, y };
    this.smokeLayer.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const puff = svgEl("circle", {
        cx: x + 4, cy: y - 14, r: 4,
        fill: "#e9e4d8", opacity: 0,
        class: "fx-smoke",
      });
      puff.style.animationDelay = `${i * 1.1}s`;
      this.smokeLayer.appendChild(puff);
    }
  }

  // "spring" | "summer" | "autumn" | "winter" — css/style.css does the rest.
  setSeason(name) {
    this.svg.setAttribute("data-season", name);
  }

  // ---- One-off effects ------------------------------------------------------

  // A number that floats up from a point and fades, e.g. "+3".
  floatText(x, y, text, kind) {
    const label = svgEl("text", {
      x, y,
      class: "fx-float" + (kind ? ` fx-float--${kind}` : ""),
      "text-anchor": "middle",
    });
    label.textContent = text;
    this.markerLayer.appendChild(label);
    setTimeout(() => label.remove(), 1400);
  }

  // Walks a banner from one point to another, then calls onArrive. Uses
  // requestAnimationFrame so it also works when CSS animations are off.
  animateExpedition(from, to, color, onArrive) {
    const banner = svgEl("g", { class: "fx-expedition" });
    banner.appendChild(svgEl("circle", { cx: 0, cy: 0, r: 7, fill: "#f3e9d2", stroke: "#2b241e", "stroke-width": 2 }));
    banner.appendChild(svgEl("line", { x1: 0, y1: -5, x2: 0, y2: -22, stroke: "#2b241e", "stroke-width": 2 }));
    banner.appendChild(svgEl("path", { d: "M 0 -22 l 12 4 l -12 4 z", fill: color || "#d9a441", stroke: "#2b241e", "stroke-width": 1.5 }));
    this.markerLayer.appendChild(banner);

    const durationMs = 900;
    const start = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const k = ease(t);
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k - Math.sin(t * Math.PI) * 14;
      banner.setAttribute("transform", `translate(${x} ${y})`);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        banner.remove();
        this.burst(to.x, to.y);
        if (onArrive) onArrive();
      }
    };
    requestAnimationFrame(step);
  }

  // A ring that expands and fades — the moment the fog lifts on a tile.
  burst(x, y) {
    const ring = svgEl("circle", { cx: x, cy: y, r: 16, fill: "none", stroke: "#f6efe0", "stroke-width": 4, class: "fx-burst" });
    ring.style.transformOrigin = `${x}px ${y}px`;
    ring.style.transformBox = "view-box";
    this.markerLayer.appendChild(ring);
    setTimeout(() => ring.remove(), 900);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MapEffects };
}
