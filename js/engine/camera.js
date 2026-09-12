// camera.js
//
// The view onto the world: where the centre of the screen is in world
// units and how many CSS pixels one world unit takes. Everything that
// draws asks the camera for `getBounds()` to cull, and `applyTo(root)` puts
// the world root container where it belongs.
//
// Input is unified over Pointer Events so mouse, pen and touch share one
// code path: drag pans (with inertia), wheel zooms about the cursor, two
// fingers pinch about their midpoint, a short press taps, a still press
// long-presses, two quick taps zoom in. Motion is smoothed in `update(dt)`
// — the input handlers only set targets — so a 30 Hz touch stream still
// looks like a 60 fps pan.
//
// The world may never leave the screen; when it is smaller than the
// screen it is centred instead.

import { ZOOM_MIN, ZOOM_MAX } from "../world/constants.js";

const TAP_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 30;
const WHEEL_FACTOR = 1.12;
// Inertia: velocity decays as e^(-k t); k = 5 gives ~half a second of glide.
const INERTIA_DECAY = 5;
const INERTIA_STOP_PX_PER_S = 2;
// How fast the zoom eases toward its target (larger = snappier).
const ZOOM_EASE = 18;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class Camera {
  /**
   * @param {HTMLElement} hostElement the element the canvas fills; its client size is the screen size
   * @param {{ worldWidth: number, worldHeight: number, minZoom?: number, maxZoom?: number }} options
   */
  constructor(hostElement, { worldWidth, worldHeight, minZoom = ZOOM_MIN, maxZoom = ZOOM_MAX } = {}) {
    this.host = hostElement;
    this.worldWidth = worldWidth || 1000;
    this.worldHeight = worldHeight || 1000;
    this.hardMinZoom = minZoom;
    this.maxZoom = maxZoom;
    this.screenWidth = Math.max(1, hostElement && hostElement.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 800));
    this.screenHeight = Math.max(1, hostElement && hostElement.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 600));

    this.x = this.worldWidth / 2;
    this.y = this.worldHeight / 2;
    this.zoom = 1;
    // Smooth zoom: the wheel sets a target and an anchor (the screen point
    // that must stay put); update() eases toward it.
    this.targetZoom = 1;
    this.anchorX = this.screenWidth / 2;
    this.anchorY = this.screenHeight / 2;
    // Inertia velocity in world units per second.
    this.vx = 0;
    this.vy = 0;
    // focusOn animation.
    this.anim = null;

    this.listeners = [];
    this.lastEmitted = { x: NaN, y: NaN, zoom: NaN, w: 0, h: 0 };
    this.view = { x: 0, y: 0, zoom: 1, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };

    // Input state (see attachInput).
    this.input = null;
    this.clampZoom();
    this.clampPosition();
  }

  // ---- limits ----------------------------------------------------------------

  /** The smallest zoom that still fills the screen with world, with a little slack. */
  get fitZoom() {
    return Math.min(this.screenWidth / this.worldWidth, this.screenHeight / this.worldHeight);
  }

  get minZoom() {
    // Let the player pull back until the whole world is on screen with a
    // margin, but never below the hard floor.
    return Math.max(this.hardMinZoom, this.fitZoom * 0.9);
  }

  setLimits({ worldWidth, worldHeight, minZoom, maxZoom } = {}) {
    if (worldWidth) this.worldWidth = worldWidth;
    if (worldHeight) this.worldHeight = worldHeight;
    if (minZoom) this.hardMinZoom = minZoom;
    if (maxZoom) this.maxZoom = maxZoom;
    this.clampZoom();
    this.clampPosition();
  }

  /** Re-reads the host size. The renderer calls this on resize. */
  resize(width, height) {
    this.screenWidth = Math.max(1, width || (this.host && this.host.clientWidth) || this.screenWidth);
    this.screenHeight = Math.max(1, height || (this.host && this.host.clientHeight) || this.screenHeight);
    this.clampZoom();
    this.clampPosition();
  }

  clampZoom() {
    const lo = this.minZoom;
    const hi = this.maxZoom;
    if (this.zoom < lo) this.zoom = lo;
    if (this.zoom > hi) this.zoom = hi;
    if (this.targetZoom < lo) this.targetZoom = lo;
    if (this.targetZoom > hi) this.targetZoom = hi;
  }

  /**
   * Keeps the world on screen. If the visible span is wider than the world
   * the world is centred on that axis (the player cannot slide it around).
   */
  clampPosition() {
    const halfW = this.screenWidth / (2 * this.zoom);
    const halfH = this.screenHeight / (2 * this.zoom);
    if (halfW * 2 >= this.worldWidth) this.x = this.worldWidth / 2;
    else this.x = Math.min(this.worldWidth - halfW, Math.max(halfW, this.x));
    if (halfH * 2 >= this.worldHeight) this.y = this.worldHeight / 2;
    else this.y = Math.min(this.worldHeight - halfH, Math.max(halfH, this.y));
  }

  // ---- coordinates ------------------------------------------------------------

  worldToScreen(x, y) {
    return {
      x: (x - this.x) * this.zoom + this.screenWidth / 2,
      y: (y - this.y) * this.zoom + this.screenHeight / 2,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.screenWidth / 2) / this.zoom + this.x,
      y: (sy - this.screenHeight / 2) / this.zoom + this.y,
    };
  }

  /** Visible world rectangle, grown by `margin` world units on every side. */
  getBounds(margin = 0) {
    const halfW = this.screenWidth / (2 * this.zoom);
    const halfH = this.screenHeight / (2 * this.zoom);
    return {
      minX: this.x - halfW - margin,
      minY: this.y - halfH - margin,
      maxX: this.x + halfW + margin,
      maxY: this.y + halfH + margin,
    };
  }

  // ---- movement ---------------------------------------------------------------

  /**
   * Moves the view so (x, y) is centred, optionally at a new zoom.
   * Animated with ease-in-out unless `animate` is false.
   */
  focusOn(x, y, zoom, { animate = true, duration = 0.6 } = {}) {
    const targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom || this.zoom));
    this.vx = 0;
    this.vy = 0;
    if (!animate || duration <= 0) {
      this.anim = null;
      this.zoom = targetZoom;
      this.targetZoom = targetZoom;
      this.x = x;
      this.y = y;
      this.clampPosition();
      return;
    }
    this.anim = {
      fromX: this.x, fromY: this.y, fromZoom: this.zoom,
      toX: x, toY: y, toZoom: targetZoom,
      t: 0, duration,
    };
  }

  /**
   * Multiplies the target zoom by `factor`, keeping the world point under
   * (screenX, screenY) fixed. Defaults to the screen centre.
   */
  zoomBy(factor, screenX, screenY) {
    this.anim = null;
    this.anchorX = screenX === undefined ? this.screenWidth / 2 : screenX;
    this.anchorY = screenY === undefined ? this.screenHeight / 2 : screenY;
    this.targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.targetZoom * factor));
  }

  /** Immediate zoom (used by pinch, which already tracks the fingers). */
  setZoomAt(zoom, screenX, screenY) {
    const next = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = next;
    this.targetZoom = next;
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampPosition();
  }

  /** Pans by a screen-space delta (drag). */
  panByScreen(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clampPosition();
  }

  /**
   * Advances animations, smooth zoom and inertia. Returns true if the view
   * changed. Fires onChange listeners (at most once per call = once per
   * frame) when it did, and flushes the throttled hover callback.
   */
  update(dt) {
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;

    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const k = easeInOut(Math.min(1, a.t / a.duration));
      // Interpolating log(zoom) makes a 4x zoom feel even from start to end.
      this.zoom = Math.exp(a.fromZoom === a.toZoom ? Math.log(a.toZoom) : Math.log(a.fromZoom) + (Math.log(a.toZoom) - Math.log(a.fromZoom)) * k);
      this.targetZoom = this.zoom;
      this.x = a.fromX + (a.toX - a.fromX) * k;
      this.y = a.fromY + (a.toY - a.fromY) * k;
      if (a.t >= a.duration) this.anim = null;
      this.clampPosition();
    } else {
      if (Math.abs(this.targetZoom - this.zoom) > 1e-4) {
        // Exponential ease toward the target about the anchor point.
        const blend = 1 - Math.exp(-ZOOM_EASE * dt);
        const next = this.zoom * Math.pow(this.targetZoom / this.zoom, blend);
        const before = this.screenToWorld(this.anchorX, this.anchorY);
        this.zoom = Math.abs(next - this.targetZoom) < 1e-4 ? this.targetZoom : next;
        const after = this.screenToWorld(this.anchorX, this.anchorY);
        this.x += before.x - after.x;
        this.y += before.y - after.y;
        this.clampPosition();
      }
      if (this.vx !== 0 || this.vy !== 0) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        const decay = Math.exp(-INERTIA_DECAY * dt);
        this.vx *= decay;
        this.vy *= decay;
        const speedPx = Math.hypot(this.vx, this.vy) * this.zoom;
        if (speedPx < INERTIA_STOP_PX_PER_S) {
          this.vx = 0;
          this.vy = 0;
        }
        const bx = this.x;
        const by = this.y;
        this.clampPosition();
        // Hitting the edge kills the glide on that axis so it does not
        // keep "pushing" against the wall.
        if (bx !== this.x) this.vx = 0;
        if (by !== this.y) this.vy = 0;
      }
    }

    if (this.input && this.input.hoverPending) this.flushHover();

    const last = this.lastEmitted;
    const moved = last.x !== this.x || last.y !== this.y || last.zoom !== this.zoom
      || last.w !== this.screenWidth || last.h !== this.screenHeight;
    if (moved) {
      last.x = this.x;
      last.y = this.y;
      last.zoom = this.zoom;
      last.w = this.screenWidth;
      last.h = this.screenHeight;
      this.emitChange();
    }
    return moved;
  }

  onChange(listener) {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  emitChange() {
    const v = this.view;
    v.x = this.x;
    v.y = this.y;
    v.zoom = this.zoom;
    const b = this.getBounds(0);
    v.bounds.minX = b.minX;
    v.bounds.minY = b.minY;
    v.bounds.maxX = b.maxX;
    v.bounds.maxY = b.maxY;
    for (const listener of this.listeners) listener(v);
  }

  /** Positions the world root: scale = zoom, and (x, y) lands on the screen centre. */
  applyTo(container) {
    container.scale.set(this.zoom, this.zoom);
    container.position.set(
      this.screenWidth / 2 - this.x * this.zoom,
      this.screenHeight / 2 - this.y * this.zoom,
    );
  }

  // ---- input -----------------------------------------------------------------

  /**
   * Wires pointer, wheel and double-click handling onto the canvas.
   * Callbacks get screen coordinates relative to the canvas.
   */
  attachInput(canvasElement, handlers = {}) {
    this.detachInput();
    const el = canvasElement;
    el.style.touchAction = "none";
    // A long press on touch would otherwise open the browser's context menu.
    el.style.userSelect = "none";
    el.style.webkitUserSelect = "none";
    el.style.webkitTouchCallout = "none";

    const state = {
      el,
      handlers,
      pointers: new Map(),        // pointerId -> { x, y, startX, startY, type, button }
      dragging: false,
      dragMoved: false,
      longPressTimer: null,
      longPressed: false,
      lastTapTime: 0,
      lastTapX: 0,
      lastTapY: 0,
      // Velocity samples for inertia: (time, x, y) of the last moves.
      samples: [],
      pinchDist: 0,
      pinchZoom: 1,
      hoverPending: false,
      hoverX: 0,
      hoverY: 0,
      listeners: [],
    };
    this.input = state;

    const rectOf = (ev) => {
      const r = el.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      state.listeners.push([target, type, fn, opts]);
    };
    const cancelLongPress = () => {
      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }
    };
    const primaryPointer = () => state.pointers.values().next().value;

    on(el, "pointerdown", (ev) => {
      const p = rectOf(ev);
      const isRightButton = ev.pointerType === "mouse" && ev.button === 2;
      state.pointers.set(ev.pointerId, { x: p.x, y: p.y, startX: p.x, startY: p.y, type: ev.pointerType, button: ev.button, right: isRightButton });
      try { el.setPointerCapture(ev.pointerId); } catch (_) { /* not all browsers allow it for every pointer */ }
      this.anim = null;
      this.vx = 0;
      this.vy = 0;
      cancelLongPress();
      state.longPressed = false;
      if (state.pointers.size === 1) {
        state.dragging = false;
        state.dragMoved = false;
        state.samples.length = 0;
        state.samples.push({ t: performance.now(), x: p.x, y: p.y });
        state.longPressTimer = setTimeout(() => {
          state.longPressTimer = null;
          if (state.pointers.size !== 1 || state.dragMoved) return;
          state.longPressed = true;
          if (handlers.onLongPress) handlers.onLongPress(p.x, p.y);
        }, LONG_PRESS_MS);
      } else if (state.pointers.size === 2) {
        // Second finger: switch from drag to pinch.
        const [a, b] = Array.from(state.pointers.values());
        state.pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        state.pinchZoom = this.zoom;
        state.dragMoved = true;
        if (state.dragging && handlers.onDragEnd) handlers.onDragEnd();
        state.dragging = false;
      }
      if (ev.pointerType === "touch") ev.preventDefault();
    }, { passive: false });

    on(el, "pointermove", (ev) => {
      const p = rectOf(ev);
      const info = state.pointers.get(ev.pointerId);
      if (!info) {
        // Plain hover. Delivered once per frame from update().
        state.hoverPending = true;
        state.hoverX = p.x;
        state.hoverY = p.y;
        return;
      }
      const dx = p.x - info.x;
      const dy = p.y - info.y;
      info.x = p.x;
      info.y = p.y;
      if (state.pointers.size === 1) {
        if (info.right) return;
        if (!state.dragMoved) {
          if (Math.hypot(p.x - info.startX, p.y - info.startY) < TAP_THRESHOLD_PX) return;
          state.dragMoved = true;
          cancelLongPress();
          if (state.longPressed) return;
          state.dragging = true;
          if (handlers.onDragStart) handlers.onDragStart();
        }
        if (!state.dragging) return;
        this.panByScreen(dx, dy);
        const now = performance.now();
        state.samples.push({ t: now, x: p.x, y: p.y });
        while (state.samples.length > 6) state.samples.shift();
      } else if (state.pointers.size === 2) {
        const [a, b] = Array.from(state.pointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        // Pan by the midpoint's motion (this pointer moved by dx, dy, so the
        // midpoint moved by half of that), then zoom about the midpoint.
        this.panByScreen(dx / 2, dy / 2);
        this.setZoomAt(state.pinchZoom * (dist / state.pinchDist), midX, midY);
      }
    });

    const finish = (ev, cancelled) => {
      const info = state.pointers.get(ev.pointerId);
      if (!info) return;
      state.pointers.delete(ev.pointerId);
      try { el.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      cancelLongPress();
      const p = rectOf(ev);
      if (state.pointers.size === 1) {
        // One finger lifted from a pinch: the remaining one continues as a
        // fresh drag, not a tap.
        const rest = primaryPointer();
        rest.startX = rest.x;
        rest.startY = rest.y;
        state.dragMoved = true;
        state.dragging = false;
        return;
      }
      if (state.pointers.size > 0) return;

      if (state.dragging) {
        state.dragging = false;
        if (handlers.onDragEnd) handlers.onDragEnd();
        // Inertia from the last few move samples (ignore a pause before release).
        const s = state.samples;
        const now = performance.now();
        if (!cancelled && s.length >= 2 && now - s[s.length - 1].t < 80) {
          const first = s[0];
          const last = s[s.length - 1];
          const seconds = Math.max(0.016, (last.t - first.t) / 1000);
          this.vx = -((last.x - first.x) / seconds) / this.zoom;
          this.vy = -((last.y - first.y) / seconds) / this.zoom;
        }
        return;
      }
      if (cancelled || state.dragMoved || state.longPressed) return;

      // A tap. Two quick taps at the same spot zoom in (touch double-tap;
      // the mouse uses the native dblclick event so it is skipped here).
      const now = performance.now();
      if (info.type !== "mouse" && now - state.lastTapTime < DOUBLE_TAP_MS
        && Math.hypot(p.x - state.lastTapX, p.y - state.lastTapY) < DOUBLE_TAP_PX) {
        state.lastTapTime = 0;
        this.zoomBy(2, p.x, p.y);
        return;
      }
      state.lastTapTime = now;
      state.lastTapX = p.x;
      state.lastTapY = p.y;
      if (handlers.onTap) handlers.onTap(p.x, p.y, ev);
    };
    on(el, "pointerup", (ev) => finish(ev, false));
    on(el, "pointercancel", (ev) => finish(ev, true));
    on(el, "pointerleave", (ev) => {
      if (!state.pointers.has(ev.pointerId) && handlers.onHover) {
        state.hoverPending = true;
        state.hoverX = -1;
        state.hoverY = -1;
      }
    });

    on(el, "wheel", (ev) => {
      ev.preventDefault();
      const p = rectOf(ev);
      // deltaMode 1 = lines, 2 = pages; normalise to "notches".
      let delta = ev.deltaY;
      if (ev.deltaMode === 1) delta *= 33;
      else if (ev.deltaMode === 2) delta *= 300;
      // Trackpads send many tiny deltas; scale the factor by magnitude so a
      // notch (~100) is one WHEEL_FACTOR and a nudge is a fraction of it.
      const notches = Math.max(-3, Math.min(3, delta / 100));
      const factor = Math.pow(WHEEL_FACTOR, -notches);
      this.zoomBy(factor, p.x, p.y);
    }, { passive: false });

    on(el, "dblclick", (ev) => {
      ev.preventDefault();
      const p = rectOf(ev);
      this.zoomBy(2, p.x, p.y);
    });
    on(el, "contextmenu", (ev) => ev.preventDefault());
    // Old-style touch events still fire alongside pointer events on some
    // browsers and are what actually scrolls the page.
    const swallow = (ev) => { if (ev.cancelable) ev.preventDefault(); };
    on(el, "touchstart", swallow, { passive: false });
    on(el, "touchmove", swallow, { passive: false });
  }

  flushHover() {
    const s = this.input;
    s.hoverPending = false;
    if (s.handlers.onHover) s.handlers.onHover(s.hoverX, s.hoverY);
  }

  detachInput() {
    const s = this.input;
    if (!s) return;
    if (s.longPressTimer) clearTimeout(s.longPressTimer);
    for (const [target, type, fn, opts] of s.listeners) target.removeEventListener(type, fn, opts);
    this.input = null;
  }

  destroy() {
    this.detachInput();
    this.listeners.length = 0;
    this.anim = null;
  }
}
