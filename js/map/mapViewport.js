// mapViewport.js
//
// Pan and zoom for the map: mouse wheel zooms towards the cursor, dragging
// pans, double-click resets. The three map layers (drawing, hex grid,
// effects) live inside one wrapper element that this moves as a whole, so
// they can never slide apart.

function setupMapViewport(stage, viewport) {
  const MIN_SCALE = 0.75;
  const MAX_SCALE = 4.5;

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let dragging = false;
  let dragMoved = false;
  let lastX = 0;
  let lastY = 0;

  viewport.style.transformOrigin = "0 0";
  const listeners = [];

  function apply() {
    // Keep the map from being panned off the stage entirely. clientWidth /
    // clientHeight don't force a layout the way getBoundingClientRect does,
    // which matters while dragging.
    const bounds = { width: stage.clientWidth, height: stage.clientHeight };
    const boundX1 = bounds.width - bounds.width * scale;
    const boundY1 = bounds.height - bounds.height * scale;
    const minX = Math.min(0, boundX1);
    const maxX = Math.max(0, boundX1);
    const minY = Math.min(0, boundY1);
    const maxY = Math.max(0, boundY1);
    translateX = Math.min(maxX, Math.max(minX, translateX));
    translateY = Math.min(maxY, Math.max(minY, translateY));
    viewport.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    stage.classList.toggle("is-zoomed", scale > 1.01);
    for (const listener of listeners) listener(getView());
  }

  // The current view, for a minimap: scale, offset, and the stage size.
  function getView() {
    return {
      scale,
      translateX,
      translateY,
      x: translateX,
      y: translateY,
      width: stage.clientWidth,
      height: stage.clientHeight
    };
  }

  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const bounds = stage.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    // Zoom about the cursor: keep the point under it where it is.
    translateX = cursorX - (cursorX - translateX) * (nextScale / scale);
    translateY = cursorY - (cursorY - translateY) * (nextScale / scale);
    scale = nextScale;
    apply();
  }, { passive: false });

  stage.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    dragMoved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.classList.add("is-dragging");
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
    translateX += dx;
    translateY += dy;
    lastX = event.clientX;
    lastY = event.clientY;
    apply();
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
    stage.classList.remove("is-dragging");
  });

  // A drag shouldn't also count as a click on whatever tile it ended over.
  stage.addEventListener("click", (event) => {
    if (dragMoved) {
      event.stopPropagation();
      dragMoved = false;
    }
  }, true);

  stage.addEventListener("dblclick", () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    apply();
  });

  // Zooms so that a point in the map's own coordinate space sits in the
  // middle of the stage. `worldSize` is the map's viewBox size; the map is
  // letterboxed inside the stage, which this accounts for.
  function focusOn(point, worldSize, targetScale) {
    const bounds = stage.getBoundingClientRect();
    const fit = Math.min(bounds.width / worldSize.width, bounds.height / worldSize.height);
    const offsetX = (bounds.width - worldSize.width * fit) / 2;
    const offsetY = (bounds.height - worldSize.height * fit) / 2;
    const stageX = offsetX + point.x * fit;
    const stageY = offsetY + point.y * fit;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale));
    translateX = bounds.width / 2 - stageX * scale;
    translateY = bounds.height / 2 - stageY * scale;
    apply();
  }

  window.addEventListener("resize", apply);

  return {
    reset() { scale = 1; translateX = 0; translateY = 0; apply(); },
    focusOn,
    getView,
    onChange(listener) { listeners.push(listener); },
  };
}
