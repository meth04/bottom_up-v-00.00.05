// turnReport.js
//
// What just happened, in six lines.
//
// A turn in this game resolves a lot at once — everyone eats, the surplus
// spoils, the garlocks may arrive, the season turns, standing orders are
// worked, the land regrows — and all of it used to go past in the letter
// feed, four lines at a time, gone in six seconds. If the player looks away
// they have no idea why they have nine fewer timbermellows than they
// counted on.
//
// So the village is photographed at the start of every turn and again when
// the turn ends, and the difference is shown as a short ledger. It is also
// what feeds the little "+12" markers beside each store in the readout,
// which answer "how am I doing this turn?" without any clicking at all.

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

let turnSnapshot = null;
let turnNotes = [];
let turnReportLines = [];

function turnSnapshotState() {
  return {
    turn: turngame,
    timbermellow: timbermellow_count,
    wood,
    stone,
    humans,
    soldiers: human_army,
    trainees: typeof professionTraineeCount === "function" ? professionTraineeCount() : 0,
    barns: barn,
    houses: stonehouse,
    tiles: typeof territoryClaimedCount === "function" ? territoryClaimedCount() : 0,
  };
}

// Called at the start of play and at the end of every turn.
function turnSnapshotTake() {
  turnSnapshot = turnSnapshotState();
  turnNotes = [];
}

// How much a store has moved since the turn began. Used for the live
// markers in the resource readout.
function turnLiveDelta(field) {
  if (!turnSnapshot) return 0;
  const now = turnSnapshotState();
  return now[field] - turnSnapshot[field];
}

// game.js calls this as the turn resolves, for the things a difference in
// numbers cannot explain on its own — what was eaten, what spoiled, who
// starved.
function turnReportNote(text, kind) {
  if (!text) return;
  turnNotes.push({ text, kind: kind || "" });
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

const TURN_REPORT_STORES = [
  { field: "timbermellow", icon: "timbermellow", label: "timbermellow" },
  { field: "wood", icon: "wood", label: "wood" },
  { field: "stone", icon: "stone", label: "stone" },
];

function turnReportBuild() {
  if (!turnSnapshot) return [];
  const now = turnSnapshotState();
  const lines = [];

  for (const store of TURN_REPORT_STORES) {
    const delta = now[store.field] - turnSnapshot[store.field];
    if (delta === 0) continue;
    lines.push({
      icon: store.icon,
      text: `${delta > 0 ? "+" : ""}${delta} ${store.label}`,
      kind: delta > 0 ? "good" : "bad",
    });
  }

  const people = (now.humans + now.soldiers + now.trainees) - (turnSnapshot.humans + turnSnapshot.soldiers + turnSnapshot.trainees);
  if (people !== 0) {
    lines.push({
      icon: people > 0 ? "villager" : "hungry",
      text: `${people > 0 ? "+" : ""}${people} ${Math.abs(people) === 1 ? "person" : "people"}`,
      kind: people > 0 ? "good" : "bad",
    });
  }

  const tiles = now.tiles - turnSnapshot.tiles;
  if (tiles !== 0) {
    lines.push({ icon: "tiles", text: `${tiles > 0 ? "+" : ""}${tiles} hexes held`, kind: tiles > 0 ? "good" : "bad" });
  }

  const built = (now.barns - turnSnapshot.barns) + (now.houses - turnSnapshot.houses);
  if (built > 0) {
    lines.push({ icon: "barn", text: `${built} new building${built > 1 ? "s" : ""}`, kind: "good" });
  } else if (built < 0) {
    lines.push({ icon: "barn", text: `${-built} building${built < -1 ? "s" : ""} lost`, kind: "bad" });
  }

  for (const note of turnNotes) lines.push({ icon: note.kind === "bad" ? "warn" : "info", text: note.text, kind: note.kind });
  return lines;
}

// ---------------------------------------------------------------------------
// Showing it
// ---------------------------------------------------------------------------

function turnReportShow() {
  turnReportLines = turnReportBuild();
  const panel = document.getElementById("turnReport");
  if (!panel) return;

  const body = document.getElementById("turnReportBody");
  const head = document.getElementById("turnReportTurn");
  if (head) head.textContent = turnSnapshot ? turnSnapshot.turn : turngame;

  if (!turnReportLines.length) {
    panel.hidden = true;
    return;
  }
  if (body) {
    const icon = (name) => (typeof getIcon === "function" ? getIcon(name) : "");
    body.innerHTML = turnReportLines
      .map((line) => `<li class="rw-report__line rw-report__line--${line.kind || "info"}">
          <span class="rw-report__icon">${icon(line.icon)}</span><span>${line.text}</span>
        </li>`)
      .join("");
  }
  panel.hidden = false;

  // It is a note, not a dialog: it fades on its own, and any click puts it
  // away early.
  clearTimeout(panel._hideTimer);
  panel.classList.remove("is-leaving");
  panel._hideTimer = setTimeout(turnReportHide, 9000);
}

function turnReportHide() {
  const panel = document.getElementById("turnReport");
  if (!panel || panel.hidden) return;
  panel.classList.add("is-leaving");
  clearTimeout(panel._hideTimer);
  panel._hideTimer = setTimeout(() => {
    panel.hidden = true;
    panel.classList.remove("is-leaving");
  }, 400);
}
