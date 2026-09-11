// js/gameFeel.js
//
// Visual juice, micro-interactions, floating notifications,
// season transitions, and game feel enhancements for "bottom up".

const GAME_FEEL = {
  activeFloatingElements: 0,
};

/**
 * Spawns a floating resource text + icon from an element or screen position
 * @param {string} text - e.g. "+1" or "+2"
 * @param {string} iconKey - key in GAME_ICONS (e.g. "timbermellow", "wood")
 * @param {number} [targetX] - optional screen X
 * @param {number} [targetY] - optional screen Y
 */
function spawnFloatingReward(text, iconKey, targetX, targetY) {
  const container = document.getElementById("floatingTextLayer");
  if (!container) return;

  const floater = document.createElement("div");
  floater.className = "floating-reward";

  const iconSvg = typeof getIcon === "function" ? getIcon(iconKey, "floating-reward__icon") : "";
  floater.innerHTML = `${iconSvg}<span class="floating-reward__text">${text}</span>`;

  // Determine starting coordinates
  let x = targetX;
  let y = targetY;
  if (x === undefined || y === undefined) {
    // Default to near bottom-right command palette or center
    const palette = document.getElementById("palette");
    if (palette && !palette.hidden) {
      const rect = palette.getBoundingClientRect();
      x = rect.left + rect.width / 2 + (Math.random() * 60 - 30);
      y = rect.top + 40;
    } else {
      x = window.innerWidth / 2 + (Math.random() * 100 - 50);
      y = window.innerHeight * 0.65;
    }
  }

  floater.style.left = `${x}px`;
  floater.style.top = `${y}px`;

  container.appendChild(floater);

  // Animate and cleanup
  requestAnimationFrame(() => {
    floater.classList.add("is-floating");
  });

  setTimeout(() => {
    if (floater.parentNode) floater.parentNode.removeChild(floater);
  }, 1300);
}

/**
 * Triggers a grand cinematic banner when a season changes
 * @param {string} seasonName - 'spring', 'summer', 'autumn', 'winter'
 * @param {number} year - current year
 */
function showSeasonBanner(seasonName, year) {
  const banner = document.getElementById("seasonBanner");
  if (!banner) return;

  const titles = {
    spring: "Spring Dawns",
    summer: "Summer Solstice",
    autumn: "Autumn Harvest",
    winter: "The Deep Freeze",
  };

  const subtitles = {
    spring: "The snow thaws. Sap rises in the timbermellow groves and work hours renew.",
    summer: "Long daylight grants 6 hours of labor. Dry earth basks in warmth.",
    autumn: "The woodland bounty doubles! Timbermellows and wood replenish on your lands.",
    winter: "Bitter cold arrives. No food grows. Those without a roof face the freezing dark.",
  };

  const icons = {
    spring: "spring",
    summer: "summer",
    autumn: "autumn",
    winter: "winter",
  };

  const s = (seasonName || "spring").toLowerCase();
  const titleEl = document.getElementById("seasonBannerTitle");
  const subEl = document.getElementById("seasonBannerSub");
  const iconEl = document.getElementById("seasonBannerIcon");
  const yearEl = document.getElementById("seasonBannerYear");

  if (titleEl) titleEl.textContent = titles[s] || seasonName;
  if (subEl) subEl.textContent = subtitles[s] || "";
  if (yearEl) yearEl.textContent = `Year ${year}`;
  if (iconEl && typeof getIcon === "function") iconEl.innerHTML = getIcon(icons[s] || "spring");

  banner.className = `season-banner season-banner--${s} is-visible`;

  // Auto-hide after 3.8 seconds
  clearTimeout(banner._hideTimer);
  banner._hideTimer = setTimeout(() => {
    banner.classList.remove("is-visible");
  }, 3800);
}

/**
 * Triggers screen shake and red danger vignette when Garlocks raid
 * @param {string} direction - direction from which attack comes
 */
function triggerRaidAlarm(direction) {
  const stage = document.getElementById("mapstage");
  const vignette = document.getElementById("dangerVignette");

  if (stage) {
    stage.classList.add("screen-shake");
    setTimeout(() => stage.classList.remove("screen-shake"), 900);
  }

  if (vignette) {
    vignette.classList.add("is-active");
    setTimeout(() => vignette.classList.remove("is-active"), 3200);
  }

  // Toast
  if (typeof uiToast === "function") {
    uiToast(
      `WAR HORNS SOUND! Garlock raiding party spotted advancing from the ${direction.toUpperCase()}!`,
      "bad"
    );
  }
}

/**
 * Triggers a milestone celebration modal for major discoveries
 * @param {string} title
 * @param {string} subtitle
 * @param {string} iconKey
 */
function showMilestonePopup(title, subtitle, iconKey) {
  const modal = document.getElementById("milestoneModal");
  if (!modal) return;

  const titleEl = document.getElementById("milestoneTitle");
  const descEl = document.getElementById("milestoneDesc");
  const iconEl = document.getElementById("milestoneIcon");

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = subtitle;
  if (iconEl && typeof getIcon === "function") iconEl.innerHTML = getIcon(iconKey);

  modal.hidden = false;
  modal.classList.add("is-open");
}

function closeMilestonePopup() {
  const modal = document.getElementById("milestoneModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  setTimeout(() => (modal.hidden = true), 300);
}

/**
 * Shows the Chronicle of the Fallen (Game Over screen)
 * @param {string} cause
 * @param {object} stats
 */
function showGameOverScreen(cause, stats = {}) {
  const modal = document.getElementById("gameOverModal");
  if (!modal) return;

  const causeEl = document.getElementById("gameOverCause");
  const statsEl = document.getElementById("gameOverStats");

  if (causeEl) causeEl.textContent = cause;
  if (statsEl) {
    const year = stats.year || 1;
    const turns = stats.turns || 1;
    const tiles = stats.tiles || 1;
    const pop = stats.peakPopulation || 2;

    statsEl.innerHTML = `
      <div class="summary-stat"><b>${year}</b><small>Years Survived</small></div>
      <div class="summary-stat"><b>${turns}</b><small>Total Turns</small></div>
      <div class="summary-stat"><b>${tiles}</b><small>Hexes Claimed</small></div>
      <div class="summary-stat"><b>${pop}</b><small>Peak Settlers</small></div>
    `;
  }

  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-open"));
}

function closeGameOverScreen() {
  const modal = document.getElementById("gameOverModal");
  if (modal) {
    modal.classList.remove("is-open");
    setTimeout(() => (modal.hidden = true), 300);
  }
}
