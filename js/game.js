// The village's stores. What is left *on the land* (timbermellows still on
// the trees, stone still in the hill) lives on the map tiles now — see
// js/territory.js — so the old timbermellow_total / wood_total pools are gone.

        let timbermellow_count = 0;

//human variables

        let humans = 2;

// Sếp's notes, item 2: the village never falls below two people. One villager
// left is not a difficulty setting, it is a soft lock — no soldier, no
// trainee, no way back — and the player's only move is to start again.
        const MIN_VILLAGERS = 2;

// Sếp's notes, item 2: "It will be a hard limit on normal. But a soft one on
// hard. So depending on what the player picks when they start it would be one
// or the other." Chosen on the title screen, remembered per village.
        let difficulty = "normal";

// Sếp's notes, item 4: "we will need a floor for peoplecap of maybe 6 or
// something to keep the player from gaining or losing too much the first
// winter". Roofs never count for fewer than six, so the founding village
// cannot freeze to death in a winter it had no way to prepare for.
        const MIN_PEOPLE_CAP = 6;

        function peopleCapFor(houses) {
          return Math.max(MIN_PEOPLE_CAP, houses * 3);
        }

        let stonehouse = 1, stone = 0;

        let peoplecap = peopleCapFor(stonehouse);

        let human_army = 0;

        let working_hours = humans * 4;

// Sếp's notes, item 7: the barn holds CALORIES now. One "timbermellow" is
// 1000 of them, and timbermellow is still the only word the player ever
// sees — the calorie layer stays under the floor until the famine teaches
// it (Sếp: "They will have to feel it out as they play").
//
// CALORIES_PER_TIMBERMELLOW itself is declared in js/territory.js: classic
// scripts share one lexical scope, so a second `const` here would be a
// SyntaxError rather than a shadow.

// One living ration a head a turn is what keeps a village alive. What the
// VILLAGERS eat past that buys the village work hours (see seasons_effect) —
// soldiers and trainees eat but never work, which is the rule the game has
// always played by.
        const MIN_CALORIES = CALORIES_PER_TIMBERMELLOW;

// The most one person can usefully eat. Ten turns in a row without losing a
// villager widens the plate by a quarter ration, up to 2500 cal. It is a
// calorie cap, not an hour cap: the same plate is 10 hours in spring and 15
// in summer (Sếp chose the calorie cap knowingly).
        const FEAST_CAP_BASE = 1000;
        const FEAST_CAP_STEP = 250;
        const FEAST_CAP_MAX = 2500;
        const FEAST_STREAK_TURNS = 10;
        const FEAST_CAP_TIERS = (FEAST_CAP_MAX - FEAST_CAP_BASE) / FEAST_CAP_STEP;

// The day the village was handed before anyone spent it (seasons_effect).
// techcheck() runs after jobsRunAuto() has already eaten into working_hours,
// so the tech gates need the size of the day, not what is left of it.
        let hoursCapacity = humans * 4;

//wood variables barn 6 for testing was 0
// T1 portal tuning: one barn holds 8 (was 5) so casuals spoil less and
// build fewer barns per run. BARN_CAPACITY is the single source of truth;
// a barn's room is always barns * BARN_CAPACITY timbermellows — counted in
// calories underneath, so the number on screen is the same 8 it always was.
        const BARN_CAPACITY = 8;

        function barnCapacity(barns) {
          return barns * BARN_CAPACITY * CALORIES_PER_TIMBERMELLOW;
        }

        let wood = 0;

        let barn = 1;

        let storage_capacity = barnCapacity(barn);

//tech variables

        let stoneaxe_made = 0;

        let foodbasketmade = 0;

        // "till they learn to farm" — once made, grain on plains counts as food.
        let farming_made = 0;

        let farming_unlocked = false;

        // Reveals the whole map (the hexes are hidden "till they get the mapmaking tech").
        let mapmaking_made = 0;

        let mapmaking_unlocked = false;

        // Sếp's notes, item 3: "hide all 5X buttons they are for when you get
        // some tech." A tech of its own, not a reward for any old research —
        // so it gets a flag, not the sequential techlevel counter (stone axe
        // and food basket own that one, and a third bump would lock the food
        // basket out for good).
        let bulk_unlocked = false;

        let bulkmade = 0;

        let techlevel = 0;

        let techmade = 0;

//season variables

        let seasonchecker = 1;

        let season = 1;

        let turngame = 1;

       
//garlock raid variables ("orcs" were a placeholder name — ask.txt, question 12)

          let garlocks_attacking = false;

          let garlock_incomingattack_turn = 0;

          let garlock_attacked_turn = 0;

          let garlock_rage = 0;

          let garlock_strangth = 0;

          let garlock_defense = 0;
        
        //humans

        const text_workhours = document.getElementById("text_workhours");

        const text_human = document.getElementById("text_human");

        const text_soldier = document.getElementById("text_soldier");
        //turn variables

        const text_turn = document.getElementById("text_turn");

        //timbermellow variables

        const text_timbermellow = document.getElementById("text_timbermellow");

        const timbermellow_tracker = document.getElementById("timbermellowtracker");    

        

        //wood variables

        const text_wood = document.getElementById("text_wood");

        const text_barn = document.getElementById("text_barn");

        const text_storage = document.getElementById("text_storage");

        const tree_wood_total = document.getElementById("tree_wood_total")

        const tree_count = document.getElementById("treecount")

        //stone variables

        const text_house = document.getElementById("text_house");

        const text_peoplecap = document.getElementById("text_peoplecap");

        const text_stone = document.getElementById("text_stone");

        //technology variables

        const techcontainer = document.getElementById("techcontainer");

        const techbutton = document.getElementById("techbutton");

        const stoneaxebt = document.getElementById("stoneaxebt");

        const foodbasketbt = document.getElementById("foodbasketbt");

        const farmingbt = document.getElementById("farmingbt");

        const mapmakingbt = document.getElementById("mapmakingbt");

        const bulkbt = document.getElementById("bulkbt");

        const techHint = document.getElementById("techHint");

        //what is left on the land (filled in from the map tiles)

        const text_land_food = document.getElementById("text_land_food");

        const text_land_wood = document.getElementById("text_land_wood");

        const text_land_stone = document.getElementById("text_land_stone");

        const text_tiles = document.getElementById("text_tiles");

        //action buttons, so update() can grey out what the village can't afford

        const btn_find_timbermellow = document.getElementById("btn_find_timbermellow");

        const btn_timbermellow_5x = document.getElementById("btn_timbermellow_5x");

        const btn_wood = document.getElementById("btn_wood");

        const btn_wood_5x = document.getElementById("btn_wood_5x");

        const btn_stone = document.getElementById("btn_stone");

        const btn_stone_5x = document.getElementById("btn_stone_5x");

        const btn_human = document.getElementById("btn_human");

        const btn_human_5x = document.getElementById("btn_human_5x");

        const btn_soldier = document.getElementById("btn_soldier");

        const btn_soldier_5x = document.getElementById("btn_soldier_5x");

        const btn_barn = document.getElementById("btn_barn");

        const btn_house = document.getElementById("btn_house");

        const btn_timbermellow_all = document.getElementById("btn_timbermellow_all");

        const btn_wood_all = document.getElementById("btn_wood_all");

        const btn_stone_all = document.getElementById("btn_stone_all");

        const delta_food = document.getElementById("delta_food");

        const delta_wood = document.getElementById("delta_wood");

        const delta_stone = document.getElementById("delta_stone");

        const btn_school = document.getElementById("btn_school");

        const btn_armycamp = document.getElementById("btn_armycamp");

        // Everyone who eats when the turn ends: workers, soldiers, and the
        // people currently off the rota learning a trade.
        function mouthsToFeed() {
          return humans + human_army + professionTraineeCount();
        }

        // Sếp's notes, item 7: the barn counts calories, the screen counts
        // timbermellows. Every number that leaves this file for a human eye
        // goes through here — and the remainder under a whole one is
        // deliberately dropped rather than shown (no decimals, or the
        // calorie layer is on display).
        function timbermellowsShown(calories) {
          return Math.floor(Math.max(0, calories) / CALORIES_PER_TIMBERMELLOW);
        }

        // The whole rations one head needs to live a turn.
        function foodNeededCalories() {
          return mouthsToFeed() * MIN_CALORIES;
        }

        // How many calories a head can usefully eat, given the well-fed run.
        // Ten turns without a villager dying widens it by a quarter ration.
        function feastCap() {
          const tiers = Math.min(FEAST_CAP_TIERS, Math.floor(barnFeastStreak / FEAST_STREAK_TURNS));
          return FEAST_CAP_BASE + FEAST_CAP_STEP * tiers;
        }

        // What one work hour costs, in calories, this season. Derived from
        // the season's old hours-per-villager figure so that a village on
        // minimum rations works exactly as many hours as it always did —
        // only a village that eats past that buys extra hours.
        function calPerHour() {
          const per = typeof jobHoursPerVillager === "function" ? jobHoursPerVillager() : 4;
          return CALORIES_PER_TIMBERMELLOW / Math.max(1, per);
        }

        // Sếp's notes, item 2: nobody dies below the floor. Every death of a
        // VILLAGER — winter, hunger, a sacking — comes through here, so there
        // is exactly one place to be wrong. Returns how many actually died,
        // which is what the log lines should say.
        //
        // `noFloor` lifts the floor for this one call. Only the garlock sack
        // on Hard passes it (Sếp: "a hard limit on normal … a soft one on
        // hard"); hunger and exposure never do.
        //
        // This is also the one place the well-fed streak breaks: Sếp decided
        // only a villager dying counts. Soldiers falling in battle and
        // villagers lost seizing land do NOT come through here, and that is
        // deliberate — do not "fix" it by adding them.
        function killVillagers(count, noFloor) {
          const floor = noFloor ? 0 : MIN_VILLAGERS;
          const wanted = Math.max(0, Math.floor(count) || 0);
          const allowed = Math.max(0, humans - floor);
          const died = Math.min(wanted, allowed);
          humans = humans - died;
          if (died > 0) barnFeastStreak = 0;
          return died;
        }

        // Sếp's notes, item 2/7: ten turns in a row without losing a villager
        // widens what each one can eat — and a person who eats more works
        // longer hours. Broken only by a villager dying (see killVillagers).
        let barnFeastStreak = 0;

        // Sếp's notes, item 4: "hide stone and houses … Rn stone houses only do
        // anything when winter comes so it should appear after the first winter
        // happens". Set at the end of the winter the village lived through, so
        // houses and the stone that builds them arrive with the frost, not with
        // the first stone the player happens to pick up.
        let survivedFirstWinter = false;

        function winterSurvived() {
          survivedFirstWinter = true;
        }

        // Sếp's notes, item 2: how the village loses on Normal. Three turns
        // in a row with not enough food in the barns and the settlement is
        // finished — see end_turn() and afterTurnEnded() (js/main.js).
        let hungerStreak = 0;

        //tracking variables
//timbermellow needed
        const text_timbermellow_needed = document.getElementById("timbermellow_needed");

//barn storage current
        const text_storage_current = document.getElementById("text_storage_current");

//people capacity current
        const text_peoplecap_current = document.getElementById("text_peoplecap_current");

        const timbermellowhumantracker = document.getElementById("timbermellowhumantracker");

//update log variables
        // These three were reached through the browser's "an id becomes a
        // global" behaviour, which is real but easy to trip over — they are
        // named properly here instead.
        const time_name = document.getElementById("time_name");

        const text_workhours_basic = document.getElementById("text_workhours_basic");

        const text_endturn_timbermellow_current = document.getElementById("text_endturn_timbermellow_current");

        const logentries = document.getElementById("logentries");

        const log_season = document.getElementById("log_season");


        // update() is called by main.js once the map has loaded.

//gathering functions
//
// Everything gathered comes off the tiles the village holds (js/territory.js).
// territoryTake() returns how much the land actually gave up, which can be
// less than asked for when the last tile is nearly empty.

//land id's for start {land1 mountins, land2plains, land5 forest, land6 timbermellow forest, land7 river, land13 mountins, land14 plains}



        // How much one hour of work brings back, once the season, the tools
        // and the trained specialists (js/professions.js) have had their say.
        // Autumn doubles the base harvest only, so baskets + 3 farmers cap
        // at 6/h instead of 10/h.
        function foodPerHour() {
          let per = (seasonchecker == 3 ? 2 : 1) + (foodbasketmade >= 1 ? 1 : 0) + professionGatherBonus("timbermellow");
          return per;
        }

        function woodPerHour() {
          return 1 + (stoneaxe_made >= 1 ? 1 : 0) + professionGatherBonus("wood");
        }

        function stonePerHour() {
          return 1 + professionGatherBonus("stone");
        }

        // Roads: fields joined to the hall by road haul more home in the
        // same hours (js/territory.js, territoryRoadMultiplier). Never
        // rounds a real hour's work down to nothing.
        function roadHaul(amount) {
          const factor = typeof territoryRoadMultiplier === "function" ? territoryRoadMultiplier() : 1;
          return Math.max(1, Math.round(amount * factor));
        }

        // One gathering job, run for `hours` hours. Everything comes off the
        // tiles the village holds, oldest claim first (js/territory.js).
        //
        // Item 7: the land and the barn are both counted in calories, while
        // foodPerHour() still speaks the old language of timbermellows per
        // hour — so the harvest is converted here, at the one place it is
        // lifted off the tile. The player never sees the difference.
        function gatherFood(hours) {
          let food_on_land = territoryAvailable(territoryFoodTypes());
          if (seasonchecker == 4) {
            updatelog("It's winter! You cannot grow timbermellows this season.");
            update();
            return;
          }
          if (working_hours < hours) {
            updatelog(hours > 1 ? "not enough work." : "No work hours left! End your turn to reset work hours.");
            update();
            return;
          }
          if (food_on_land <= 0) {
            updatelog("There are no timbermellows left on your land. Explore a neighbouring tile to find more.", "bad");
            update();
            return;
          }

          working_hours = working_hours - hours;
          let gathered = territoryTake(territoryFoodTypes(), roadHaul(foodPerHour() * hours) * CALORIES_PER_TIMBERMELLOW);
          timbermellow_count = timbermellow_count + gathered;
          ageCountFood(gathered);
          update();
        }

        function gatherWood(hours) {
          let wood_on_land = territoryAvailable(["wood"]);
          if (working_hours < hours) {
            updatelog(hours > 1 ? "not enough work." : "No work hours left! End your turn to reset work hours.");
            update();
            return;
          }
          if (wood_on_land <= 0) {
            updatelog("There is no wood left on your land. Explore a forest for more.", "bad");
            update();
            return;
          }
          working_hours = working_hours - hours;
          wood = wood + territoryTake(["wood"], roadHaul(woodPerHour() * hours));
          update();
        }

        // Stone is finite: "each tile will have a set amount lets say 250 and
        // then when the player runs out they will need to start a quarry."
        // The quarry isn't built yet — see ask.txt, question 4.
        function gatherStone(hours) {
          let stone_on_land = territoryAvailable(["stone"]);
          if (working_hours < hours) {
            updatelog("not enough work.");
            update();
            return;
          }
          if (stone_on_land <= 0) {
            updatelog("There is no loose stone left on your land. Explore the mountains for more — one day you will need a quarry.", "bad");
            update();
            return;
          }
          working_hours = working_hours - hours;
          stone = stone + territoryTake(["stone"], roadHaul(stonePerHour() * hours));
          update();
        }

        function find_timbermellow() { gatherFood(1); }
        function timbermellow_5x()   { gatherFood(5); }
        function get_wood()          { gatherWood(1); }
        function wood_5x()           { gatherWood(5); }
        function get_stone()         { gatherStone(1); }
        function stone_5x()          { gatherStone(5); }

        // "Spend the rest of the day on this." Before standing orders are
        // unlocked, a village of twelve is forty hours of clicking a turn —
        // this is the same thing in one press, and it stops short of the
        // barn's capacity so nothing is gathered only to spoil.
        function gatherAllHours(job) {
          if (working_hours <= 0) { updatelog("No work hours left! End your turn to reset work hours."); update(); return; }
          if (job === "timbermellow") {
            const room = storage_capacity - timbermellow_count;
            if (room <= 0) { updatelog("The barns are already full — build another before gathering more.", "bad"); update(); return; }
            // The room is calories and an hour brings back timbermellows, so
            // the hours that fit in the barn are room / (perHour × 1000).
            const perHourCalories = Math.max(1, foodPerHour()) * CALORIES_PER_TIMBERMELLOW;
            gatherFood(Math.max(1, Math.min(working_hours, Math.ceil(room / perHourCalories))));
          } else if (job === "wood") {
            gatherWood(working_hours);
          } else {
            gatherStone(working_hours);
          }
        }

        function timbermellow_all() { gatherAllHours("timbermellow"); }
        function wood_all()         { gatherAllHours("wood"); }
        function stone_all()        { gatherAllHours("stone"); }

        // Who will go hungry if the turn ends now, and who will freeze.
        // Used by the End Turn button to ask before it happens rather than
        // to apologise afterwards.
        function endTurnWarnings() {
          const warnings = [];
          // Item 7: the barn is calories, the question is rations.
          const hungry = mouthsToFeed() - Math.floor(timbermellow_count / MIN_CALORIES);
          if (hungry > 0) warnings.push(`${hungry} will go unfed`);
          // Winter is two turns away at most when autumn is half over.
          if (seasonchecker === 4 && humans > peoplecap) {
            warnings.push(`${humans - peoplecap} have no roof in the frost`);
          }
          if (timbermellow_count > storage_capacity) {
            const spoiled = timbermellowsShown(timbermellow_count - storage_capacity);
            if (spoiled > 0) warnings.push(`${spoiled} timbermellows will spoil`);
          }
          return warnings;
        }

        
        // Item 7: raising a villager costs three timbermellows, which is
        // 3000 calories in the barn. The player is told the same three they
        // have always been told.
        const HUMAN_FOOD_COST = 3 * CALORIES_PER_TIMBERMELLOW;

        function make_human() {
          if (working_hours <= 0) {
            updatelog("not enough work.");
          }
          if (timbermellow_count < HUMAN_FOOD_COST) {
            updatelog("Not enough timbermellows to make a human! You need at least 3 timbermellows.");
          }

          if (working_hours > 0 && timbermellow_count >= HUMAN_FOOD_COST) {
            timbermellow_count = timbermellow_count - HUMAN_FOOD_COST;
            humans = humans + 1;
            working_hours = working_hours - 1;
            update();
            }
          }

        function human_5x() {
          if (working_hours < 5) {
            updatelog("not enough work.");
          }
          if (timbermellow_count < HUMAN_FOOD_COST * 5) {
            updatelog("Not enough timbermellows to make 5 humans! You need at least 15 timbermellows.");
          }

          if (working_hours >= 5 && timbermellow_count >= HUMAN_FOOD_COST * 5) {
            let loop = 0;
            for (loop = 0; loop < 5; loop++) {
              timbermellow_count = timbermellow_count - HUMAN_FOOD_COST;
              humans = humans + 1;
              working_hours = working_hours - 1;
              update();
            }
          }
        }

        function apont_soldier() {
          // Item 2: a soldier takes a villager off the rota for good, and the
          // village never drops below two people.
          if (humans <= MIN_VILLAGERS){
            updatelog(`Not enough humans to make an army! You need at least ${MIN_VILLAGERS + 1} humans.`);
          } else if (working_hours < 1) {
            updatelog("Training a soldier takes 1 work hour.");
          } else {
            humans = humans - 1;
            human_army = human_army + 1;
            working_hours = working_hours - 1;
            update();
          }
        }

        function soldier_5x() {
          // Item 2: five soldiers would leave fewer than two villagers behind
          // for any village that cannot spare them.
          if (humans < MIN_VILLAGERS + 5){
            updatelog(`Not enough humans to make 5 armies! You need at least ${MIN_VILLAGERS + 5} humans.`);
          } else if (working_hours < 5) {
            updatelog("Training 5 soldiers takes 5 work hours.");
          } else {
            let loop = 0;
            for (loop = 0; loop < 5; loop++) {
              humans = humans - 1;
              human_army = human_army + 1;
              working_hours = working_hours - 1;
              update();
            }
          }  
        }

        // Sends an expedition to the tile selected on the map. Exploring a
        // tile claims it — "Any explored tile would be claimed" (ask.txt,
        // question 22) — and whatever is on it joins what the village can
        // gather. The requirements and costs live in js/territory.js.
        function explore() {
          let tile_id = territorySelectedTileId();
          let blocker = territoryExploreBlocker(tile_id);
          if (blocker) {
            updatelog(blocker);
            update();
            return;
          }
          let tile = territoryExplore(tile_id);
          let tile_name = (typeof TERRAIN_NAMES !== "undefined" && TERRAIN_NAMES[tile.terrainType]) || tile.terrainType;
          updatelog("Your expedition claims new land — " + tile_name + ": " + territoryDescribeResources(tile) + ".", "good");
          update();
        }

            
        function make_barn() {
          if (working_hours <= 0) {
            updatelog("not enough work.");
        }
            if (wood < 4) {
            updatelog("Not enough wood to build a barn! You need at least 4 wood.");
          }
            if (wood >= 4 && working_hours > 0) {
            wood = wood - 4;
            barn = barn + 1;
            storage_capacity = barnCapacity(barn);
            working_hours = working_hours - 1;
            update();
            }
        }


         function make_house() {
          if (working_hours <= 0) {  
            updatelog("not enough work.");
          }
          if (stone < 2){  
            updatelog("not enough stone.");
           }
          if (stone >= 2 && working_hours > 0) {
            stone = stone - 2;
            stonehouse = stonehouse + 1;
            peoplecap = peopleCapFor(stonehouse);
            working_hours = working_hours - 1;
            update();
          }
        }

// ---------------------------------------------------------------------------
// The garlock raids (Act III)
//
// details.md: "This is when the garlocks are gonna begin there raids. Coming
// every now and again to break there barns and steal there wood and food.
// This is to beat the players growth down a peg before they find out that
// timbermellow will run out."
//
// So a raid is a setback, not an ending: it takes barns, wood and food, and
// it gets worse every time it is not answered with soldiers. The village is
// only ever sacked outright if it has stood undefended through several.
// ---------------------------------------------------------------------------

        // Turns between raids once they have begun.
        // T1: 6 -> 8 so casuals breathe between knocks.
        const GARLOCK_RAID_INTERVAL = 8;

        // How angry they are ever allowed to get. Without a ceiling a village
        // that loses one raid loses every raid after it, which is a death
        // spiral, not "a peg" — see details.md.
        const GARLOCK_RAGE_CAP = 3;

        // The most damage a single raid can do, however badly it went.
        // T1: 6 -> 4, a setback that never wipes a casual run.
        const GARLOCK_MAX_BITE = 4;

        // The turn the next raiding party sets out. 0 means none is coming.
        let garlock_next_raid_turn = 0;

        function garlockScheduleNextRaid() {
          garlock_next_raid_turn = turngame + GARLOCK_RAID_INTERVAL;
        }

        // What stands between the garlocks and the barns. A standing guard of
        // three or four handles an ordinary raid; captains and camps help.
        function garlockVillageDefence() {
          // A long connected road network is worth a little too: patrols
          // move faster and word travels (js/territory.js).
          const roads = typeof territoryRoadDefence === "function" ? territoryRoadDefence() : 0;
          return human_army * 3 + professionDefenceBonus() + roads;
        }

        function garlockDirectionSuffix() {
          return typeof garlockDirectionText === "function" ? garlockDirectionText() : "";
        }

        // Called once per turn from end_turn().
        function garlockTurn() {
          // Nothing happens before the raids begin (js/ages.js, Act III).
          if (!ageAtLeast("raids")) {
            garlocks_attacking = false;
            return;
          }
          if (!garlock_next_raid_turn) garlockScheduleNextRaid();

          // A turn before they arrive, the scouts are seen.
          if (!garlocks_attacking && turngame >= garlock_next_raid_turn - 1) {
            garlock_rage = Math.min(GARLOCK_RAGE_CAP, garlock_rage + 1);
            // T-fix: land share capped — growing is the core loop, it must
            // not auto-scale the punishment without limit.
            garlock_strangth = 3 + garlock_rage * 2 +
                               Math.floor((humans + human_army) / 4) +
                               Math.min(4, Math.floor(territoryClaimedCount() / 70));
            garlock_defense = garlockVillageDefence();
            garlock_incomingattack_turn = garlock_next_raid_turn;
            garlocks_attacking = true;
            updatelog("Garlock scouts are watching the village" + garlockDirectionSuffix() + ". They will come next turn.", "bad");
            return;
          }

          if (garlocks_attacking && turngame >= garlock_incomingattack_turn) {
            garlockResolveRaid();
          }
        }

        function garlockResolveRaid() {
          garlock_attacked_turn = turngame;
          garlocks_attacking = false;
          garlockScheduleNextRaid();

          const defence = garlockVillageDefence();
          garlock_defense = defence;

          if (typeof triggerRaidAlarm === "function") {
            triggerRaidAlarm((garlockDirectionSuffix() || " from the dark").replace(/^ from the /, ""));
          }

          // The map shows the warband marching (main.js), whichever way it goes.
          if (typeof onGarlockRaid === "function") onGarlockRaid(defence >= garlock_strangth);

          if (defence >= garlock_strangth) {
            // T-fix: an overwhelming shield line holds clean. A close win
            // still costs blood. Calm all the way back to 0 when answered.
            const lost = defence >= garlock_strangth * 1.5 ? 0 : Math.min(human_army, Math.ceil(garlock_strangth / 4));
            human_army = human_army - lost;
            // A village that answers every raid keeps them small.
            garlock_rage = Math.max(0, garlock_rage - 1);
            updatelog(
              "The garlocks broke on your shield line and went back into the trees" +
              (lost ? `, taking ${lost} of your soldiers with them.` : " without taking a soul."),
              "good"
            );
            update();
            return;
          }

          // They got through. How badly depends on how short you were.
          // How far short the village fell — but a raid is a setback, not an
          // ending, so there is a ceiling on what one can take.
          const shortfall = Math.min(GARLOCK_MAX_BITE, garlock_strangth - defence);
          garlock_rage = Math.min(GARLOCK_RAGE_CAP, garlock_rage + 1);   // success breeds appetite
          const soldiersLost = Math.min(human_army, Math.ceil(shortfall / 2));
          const barnsLost = Math.min(Math.max(0, barn - 1), 1 + Math.floor(shortfall / 3));
          // Item 7: the barn holds calories, and `shortfall` is still spoken
          // in the old head-count tongue — convert it, or a raid that used to
          // carry off three timbermellows carries off three calories.
          const foodLost = Math.min(timbermellow_count, Math.ceil(timbermellow_count / 2) + shortfall * CALORIES_PER_TIMBERMELLOW);
          const woodLost = Math.min(wood, shortfall * 3);

          human_army = human_army - soldiersLost;
          barn = barn - barnsLost;
          if (barn < 1) barn = 1;
          storage_capacity = barnCapacity(barn);
          timbermellow_count = timbermellow_count - foodLost;
          wood = wood - woodLost;

          let peopleLost = 0;
          let housesLost = 0;
          // T-fix: sacking needs real anger, not just one empty guard post.
          // A first undefended raid loots; a repeated one sacks.
          if (defence === 0 && shortfall >= GARLOCK_MAX_BITE && garlock_rage >= 2) {
            // Nobody even tried to stop them, twice in a row. This is the sacking.
            // Item 2: on Normal even a sacking stops at the two-villager floor
            // — killVillagers enforces it. On Hard the floor is lifted, and an
            // empty village is the defeat (js/main.js, afterTurnEnded).
            peopleLost = killVillagers(2, difficulty === "hard");
            housesLost = Math.min(Math.max(0, stonehouse - 1), 1 + Math.floor(shortfall / 5));
            stonehouse = stonehouse - housesLost;
            if (stonehouse < 1) stonehouse = 1;
            peoplecap = peopleCapFor(stonehouse);
          }

          const losses = [];
          if (foodLost) losses.push(`${timbermellowsShown(foodLost)} timbermellows`);
          if (woodLost) losses.push(`${woodLost} wood`);
          if (barnsLost) losses.push(`${barnsLost} barn${barnsLost > 1 ? "s" : ""}`);
          if (soldiersLost) losses.push(`${soldiersLost} soldier${soldiersLost > 1 ? "s" : ""}`);
          if (housesLost) losses.push(`${housesLost} house${housesLost > 1 ? "s" : ""}`);
          if (peopleLost) losses.push(`${peopleLost} villager${peopleLost > 1 ? "s" : ""}`);

          updatelog(
            (peopleLost
              ? "The village was sacked — nobody stood in their way. You lost "
              : "Garlock raiders broke the barns and carried off what they could. You lost ") +
            (losses.length ? losses.join(", ") : "nothing they could find") + ".",
            "bad"
          );
          update();
        }

        // The turn's work, once the season has had its say.
        //
        // Item 7: this no longer *decides* the hours — end_turn() has already
        // split the barn's calories, and the hours are what the VILLAGERS'
        // share of them bought (see the eating block there). Soldiers and
        // trainees ate their ration and go on eating it; they do no work.
        // `hoursCapacity` is the size of that day, kept for techcheck().
        function seasons_effect() {

          if(seasonchecker == 1) {
            hoursCapacity = working_hours;
          }

//summer
          if (seasonchecker == 2) {
            // The 50% longer day is now the calorie price, not a bonus bolted
            // on: a summer hour costs less, so the same ration buys six hours
            // where spring buys four (see calPerHour).
            hoursCapacity = working_hours;
            updatelog("the day are longer in summer, each human gets 50% more time to work.");
            update();
        }
//autumn
           if (seasonchecker == 3) {
            // the original code never reset work hours in autumn, so the
            // "season of harvest" was two turns with nothing to work with
            hoursCapacity = working_hours;
            let regrown = territoryRegrowAutumn();
            updatelog("It's autumn, the season of harvest! Your land has regrown " + timbermellowsShown(regrown) + " worth of timbermellows and wood, and you gather 100% more this season.", "good");
            turnReportNote(`the land regrew ${timbermellowsShown(regrown)}`, "good");
        }
//winter
           if (seasonchecker == 4) {
             // Frost: an hour costs half a ration where spring charged a
             // quarter, so the same plate buys half the day it did in
             // summer — two hours on bare rations, five on a full one. The
             // price of the hour moves; the size of the plate does not.
             updatelog("Winter has arrived! You cannot grow timbermellows this season.", "bad");
             hoursCapacity = working_hours;
             if (peoplecap < humans) {
             // T1: exposure takes at most two per winter turn, never the
             // whole overflow at once. Still scary, never a run-ender.
             // Item 2: and never below the two-villager floor.
             const exposed = humans - peoplecap;
             const froze = killVillagers(Math.min(exposed, 2));


             updatelog(`${froze} died of exposure — build houses before winter.`);

             updatelog("the garlocks are eating the people who have died of exposure.");
           }
         }
         update();
      }

        function techcheck() {
        // Ideas only start arriving once the village has room to think —
        // Act II, The Growing Years (js/ages.js).
          if (!ageAtLeast("growth")) return;

        // T-fix: unlocks measure capacity (people × season hours), not the
        // leftover hours at click time. Spending all hours no longer locks
        // techs out.
        //
        // Item 7: `hoursCapacity` is the size of the day seasons_effect()
        // just handed out — a village that ate well really does have more
        // hours in hand, and the gate should see them. techcheck() runs
        // after jobsRunAuto() has spent the day, so working_hours is the
        // wrong number here.
        const capacityNow = hoursCapacity;

        //stone axe tech
          if (capacityNow >= 25 && techlevel < 1) {

          
            updatelog("New technology unlocked: stone axe!");

           stoneaxebt.style.display = "block";
            techlevel = techlevel + 1;
                                  
           }

            //food basket tech
            if (capacityNow >= 50 && techlevel < 2) {
              updatelog("New technology unlocked: food basket!");

                foodbasketbt.style.display = "block";
              techlevel = techlevel + 1;

            }

            //farming tech — the end of "spread out to find more food"
            if (capacityNow >= 40 && farming_unlocked == false) {
              updatelog("New technology unlocked: farming!", "good");
              farmingbt.style.display = "block";
              farming_unlocked = true;
            }

            //mapmaking tech — reveals the whole map
            if (capacityNow >= 60 && mapmaking_unlocked == false) {
              updatelog("New technology unlocked: mapmaking!", "good");
              mapmakingbt.style.display = "block";
              mapmaking_unlocked = true;
            }

            // The work gang — Sếp's item 3. Its own flag, deliberately NOT
            // techlevel: techlevel is the sequential counter stone axe and
            // food basket share, and a third step here would push it past the
            // basket's `techlevel < 2` for good.
            if (capacityNow >= 35 && bulk_unlocked == false) {
              updatelog("New technology unlocked: the work gang!", "good");
              bulkbt.style.display = "block";
              bulk_unlocked = true;
            }

            if (techHint && (stoneaxebt.style.display != "none" || foodbasketbt.style.display != "none" || farmingbt.style.display != "none" || mapmakingbt.style.display != "none" || bulkbt.style.display != "none")) {
              techHint.style.display = "none";
            }
          }

          
        // The work-hour price of a technology, after the scholars have
        // whittled it down (js/professions.js).
        function researchHours(base) {
          return Math.max(1, Math.round(base * professionResearchFactor()));
        }

        function stoneaxe() {
          const axeHours = researchHours(8);
          if (wood < 20) {
            updatelog("Not enough wood to make a stone axe! You need at least 20 wood.");
          }

          if (stone < 30) {

            updatelog("Not enough stone to make a stone axe! You need at least 30 stone.");
          }  

          if (working_hours < axeHours) {
            updatelog("Not enough work hours to make a stone axe! You need at least " + axeHours + " work hours.");
          }

            if (stone >= 30 && wood >= 20 && working_hours >= axeHours){

            wood = wood - 20;
            stone = stone - 30;
            working_hours = working_hours - axeHours;
            stoneaxe_made = stoneaxe_made + 1;
            techmade = techmade + 1;
            updatelog("You have made a stone axe! you can chop more wood now", "good");
            stoneaxebt.style.display = "none";
            if (typeof showMilestonePopup === "function") {
              showMilestonePopup("The Stone Axe", "Heftier blades bite deep into ancient trunks. Woodcutting yields double from now on!", "stoneaxe");
            }
          }
          update();
        }

        function foodbasket(){
          if(wood < 50){

            updatelog("Not enough wood to make a food basket! You need at least 50 wood.");
          }
          if(working_hours < researchHours(16)){
        
            updatelog("Not enough work hours to make a food basket! You need at least " + researchHours(16) + " workhours.");
          }
         if (working_hours >= researchHours(16) && wood >= 50) {
          wood = wood - 50;
          working_hours = working_hours - researchHours(16);
          foodbasketmade = foodbasketmade +1;
          techmade = techmade + 1;
          foodbasketbt.style.display = "none";
          updatelog("You have made a foodbasket!", "good");
          if (typeof showMilestonePopup === "function") {
            showMilestonePopup("Woven Baskets", "Sturdy woven willow baskets allow gatherers to carry twice as many timbermellows each hour.", "foodbasket");
          }
         }
         update();
        }

        function farming() {
          if (wood < 30) {
            updatelog("Not enough wood to learn farming! You need at least 30 wood.");
          }
          if (working_hours < researchHours(12)) {
            updatelog("Not enough work hours to learn farming! You need at least " + researchHours(12) + " work hours.");
          }
          if (wood >= 30 && working_hours >= researchHours(12)) {
            wood = wood - 30;
            working_hours = working_hours - researchHours(12);
            farming_made = farming_made + 1;
            techmade = techmade + 1;
            farmingbt.style.display = "none";
            updatelog("Your village has learned to farm! Grain on your plains now counts as food.", "good");
            if (typeof showMilestonePopup === "function") {
              showMilestonePopup("The Age of Agriculture", "No longer chained to wild groves! Settlers clear fields and cultivate golden grain as food across plains and terraced hills.", "farming");
            }
          }
          update();
        }

        function mapmaking() {
          if (wood < 20) {
            updatelog("Not enough wood to make maps! You need at least 20 wood.");
          }
          if (working_hours < researchHours(10)) {
            updatelog("Not enough work hours to make maps! You need at least " + researchHours(10) + " work hours.");
          }
          if (wood >= 20 && working_hours >= researchHours(10)) {
            wood = wood - 20;
            working_hours = working_hours - researchHours(10);
            mapmaking_made = mapmaking_made + 1;
            techmade = techmade + 1;
            mapmakingbt.style.display = "none";
            territoryRevealMap();
            updatelog("Your mapmakers have charted the whole land.", "good");
            if (typeof showMilestonePopup === "function") {
              showMilestonePopup("The Grand Cartography", "Nautical calipers and ink render the entire world visible. The blank frontiers vanish beneath drawn terrain and settlements.", "mapmaking");
            }
          }
          update();
        }

        function bulk() {
          if (wood < 25) {
            updatelog("Not enough wood to organise the work gangs! You need at least 25 wood.");
          }
          if (working_hours < researchHours(10)) {
            updatelog("Not enough work hours to organise the work gangs! You need at least " + researchHours(10) + " work hours.");
          }
          if (wood >= 25 && working_hours >= researchHours(10)) {
            wood = wood - 25;
            working_hours = working_hours - researchHours(10);
            bulkmade = bulkmade + 1;
            techmade = techmade + 1;
            bulkbt.style.display = "none";
            updatelog("The headman sets the day's work by the board, not by the shout. ×5 and ALL are yours.", "good");
            if (typeof showMilestonePopup === "function") {
              showMilestonePopup("A Day's Work at Once", "The village stops working hour by hour. Five hours in one press, or every hour left — and the headman keeps the tally.", "tech");
            }
          }
          update();
        }

         function end_turn() {
// the log keeps its history now; each turn just gets a heading (see updatelog)

            season = season + 1;

            turngame = turngame + 1;

            // Trainees are off the work rota but still at the table.
            let humanholder = humans + human_army + professionTraineeCount();

            if (season < 3 ) {
              //1-2 spring
              document.getElementById("season").innerText = "spring";
              seasonchecker = 1;
            } else if (season <5) {
              //3-4 summmer
              document.getElementById("season").innerText = "summer";
              seasonchecker = 2;
            } else if (season <7) {
              //5-6 autumn
              document.getElementById("season").innerText = "autumn";
              seasonchecker = 3;
            } else if (season <8) {
              //7-8 winter
              document.getElementById("season").innerText = "winter";
              seasonchecker = 4;
            } else if (season == 9) {
              seasonchecker = 1;
              season = 1;
              document.getElementById("season").innerText = "spring";
              // Item 4: the village has now lived through a winter. Houses —
              // and the stone that builds them — are worth explaining from
              // here on, and not one turn sooner.
              if (!survivedFirstWinter) winterSurvived();
            }

            time_name.textContent = turngame;

            updatelog("Turn " + turngame + " — " + document.getElementById("season").innerText, "turn");

             garlockTurn();

            // Anyone still at school comes a turn closer to qualifying.
            professionAdvanceTraining();


            //storage check
            if (storage_capacity < timbermellow_count) {
              const spoiled = timbermellow_count - storage_capacity;
              timbermellow_count = storage_capacity;
              updatelog(`No room in the barns — the garlocks took ${timbermellowsShown(spoiled)} timbermellows that would not fit.`, "bad");
              turnReportNote(`${timbermellowsShown(spoiled)} spoiled for want of barn space`, "bad");
            }

            //fammen check
            //
            // Item 7: the barn counts calories, so the question is no longer
            // "is there one timbermellow a head" but "is there a bare ration
            // a head". Sếp's order at the end of the turn is: pay every mouth
            // its 1000 calories first, then split what is left.

            if (timbermellow_count < foodNeededCalories()) {

              // Sếp's notes, item 2: three turns in a row short of food is a
              // defeat on any difficulty. Counted here, acted on in
              // afterTurnEnded() (js/main.js).
              hungerStreak = hungerStreak + 1;
              if (hungerStreak >= 3) {
                updatelog("Three turns now with empty barns. The village cannot go on like this.", "bad");
              }

              // How many whole rations the barn is short. The barn may hold
              // 2500 calories, which is not two rations but two and a half —
              // the half ration still feeds somebody, so round up before
              // deciding who it was that went without.
              let timbermellow_deficit = Math.ceil((foodNeededCalories() - timbermellow_count) / MIN_CALORIES);

              //this is to kill the army first
              // T-fix: soldiers starve proportionally, not all-or-nothing.
              // A shortfall of 2 rations eats 2 soldiers, not 0 and not the
              // whole guard — and never more soldiers than rations missing.
              if (human_army > 0 && timbermellow_deficit > 0) {
                const soldiersStarved = Math.min(human_army, timbermellow_deficit);
                if (soldiersStarved > 0) {
                  human_army = human_army - soldiersStarved;
                  timbermellow_deficit = timbermellow_deficit - soldiersStarved;
                  updatelog(`${soldiersStarved} soldier${soldiersStarved === 1 ? "" : "s"} starved for want of food.`);
                }
              }
              //this is to check if you now have enough timbermellows to feed humans
              if (timbermellow_deficit > 0) {
                timbermellow_count = 0;

              // T1 casual: hunger is a setback, not a wipe. Small villages
              // lose one soul; larger ones lose at most two per turn, never
              // half the village at once.
              // Item 2: and never the last two — one villager is a soft lock.
              if (humans <= 3) {
                const died = killVillagers(1);
                if (died > 0) updatelog("1 human starved to death due to lack of timbermellows.");
                else updatelog("The village is down to its last two — there is nobody left to lose. Feed them.", "bad");
              //2 or greater case
              } else {
                const starved = killVillagers(Math.min(2, humans - 1));
                updatelog(`${starved} humans starved to death due to lack of timbermellows.`);
              }
              let starvednumber = humanholder - humans;

              if (starvednumber > 1) {

            updatelog("" + starvednumber + " humans have died.");
            }


            }
          }

           //this removes timbermellows from the count — and, item 7, hands
           // the villagers whatever they ate past their bare ration, which is
           // what buys the turn's work hours.
           let villagerCalories = 0;
           if (timbermellow_count >= foodNeededCalories()) {
           hungerStreak = 0;

           // Every mouth — villager, soldier, trainee — eats its bare ration.
           const rations = foodNeededCalories();
           timbermellow_count = timbermellow_count - rations;
           villagerCalories = humans * MIN_CALORIES;

           // What is left is shared out among the VILLAGERS alone, up to the
           // plate each one can manage. Soldiers and trainees ate their
           // ration and that is all they get: they do not work, so feeding
           // them more would be buying hours from nobody (see seasons_effect).
           const cap = feastCap();
           const extraPerVillager = Math.max(0, cap - MIN_CALORIES);
           const extraRoom = extraPerVillager * humans;
           const extra = Math.min(extraRoom, Math.max(0, timbermellow_count));
           timbermellow_count = timbermellow_count - extra;
           villagerCalories = villagerCalories + extra;

           // A turn that ends with every villager fed to the brim — and no
           // villager lost since the last one — counts toward a wider plate.
           if (humans > 0 && extra >= extraRoom) {
             barnFeastStreak = barnFeastStreak + 1;
           } else {
             barnFeastStreak = 0;
           }

           turnReportNote(`${timbermellowsShown(rations + extra)} eaten`, "");
           }

           // Item 7: the hours the village works are what its VILLAGERS'
           // calories bought, at this season's price. `villagerCalories` is
           // zero when the barn came up short, and the winter branch of
           // seasons_effect() will floor the day at a bare two hours a head.
           working_hours = Math.max(0, Math.floor(villagerCalories / calPerHour()));
            seasons_effect();

            // The land comes back a little every growing turn (js/territory.js).
            if (typeof territoryRegrowTurn === "function") {
              const regrownNow = territoryRegrowTurn();
              if (regrownNow > 0) turnReportNote(`the land regrew ${regrownNow}`, "good");
            }

            // Villagers on standing orders work without being told
            // (js/professions.js) — this is the end of clicking for every hour.
            jobsRunAuto();

            techcheck();

            update();

            //the other villages take their turn, and the game is saved (see main.js)
            if (typeof afterTurnEnded === "function") afterTurnEnded();

            // What just happened, in six lines (js/turnReport.js), and then
            // a fresh photograph for the turn that is starting.
            if (typeof turnReportShow === "function") turnReportShow();
            if (typeof turnSnapshotTake === "function") turnSnapshotTake();
          }

// ---------------------------------------------------------------------------
// Seizing land from another village (see js/territory.js for the costs)
// ---------------------------------------------------------------------------

        function seize() {
          let tile_id = territorySelectedTileId();
          let blocker = territorySeizeBlocker(tile_id);
          if (blocker) {
            updatelog(blocker);
            update();
            return;
          }
          let owner_name = territoryOwnerName(tile_id);
          const armyBefore = human_army;
          let tile = territorySeize(tile_id);
          let tile_name = (typeof TERRAIN_NAMES !== "undefined" && TERRAIN_NAMES[tile.terrainType]) || tile.terrainType;
          const lostNow = armyBefore - human_army;
          updatelog("Your soldiers seized " + tile_name + " from " + owner_name + (lostNow > 0 ? ", losing " + lostNow + " of their own." : " without losing a soul."), "good");
          update();
        }

// ---------------------------------------------------------------------------
// Saving: everything above that changes during play, in one object
// ---------------------------------------------------------------------------

        function gameGetState() {
          return {
            timbermellow_count, humans, stonehouse, stone, peoplecap, human_army, working_hours,
            wood, barn, storage_capacity,
            stoneaxe_made, foodbasketmade, farming_made, farming_unlocked, mapmaking_made, mapmaking_unlocked,
            bulk_unlocked, bulkmade,
            techlevel, techmade,
            seasonchecker, season, turngame,
            survivedFirstWinter,
            difficulty, hungerStreak, barnFeastStreak,
            garlocks_attacking, garlock_incomingattack_turn, garlock_attacked_turn, garlock_rage, garlock_strangth, garlock_defense,
            garlock_next_raid_turn,
            ages: ageGetState(),
            professions: professionsGetState(),
          };
        }

        function gameSetState(saved) {
          if (!saved) return;
          timbermellow_count = saved.timbermellow_count; humans = saved.humans; stonehouse = saved.stonehouse;
          stone = saved.stone; peoplecap = saved.peoplecap; human_army = saved.human_army; working_hours = saved.working_hours;
          wood = saved.wood; barn = saved.barn;
          // T1 migration: older saves stored 5 per barn; recompute at 8.
          // Item 7: and a barn's room is calories, whatever the save held.
          storage_capacity = barnCapacity(barn);
          stoneaxe_made = saved.stoneaxe_made; foodbasketmade = saved.foodbasketmade;
          farming_made = saved.farming_made; farming_unlocked = saved.farming_unlocked;
          mapmaking_made = saved.mapmaking_made; mapmaking_unlocked = saved.mapmaking_unlocked;
          bulk_unlocked = saved.bulk_unlocked !== undefined ? !!saved.bulk_unlocked : false;
          bulkmade = saved.bulkmade || 0;
          techlevel = saved.techlevel; techmade = saved.techmade;
          seasonchecker = saved.seasonchecker; season = saved.season; turngame = saved.turngame;
          // Item 4: an old save has no flag. A village past its first spring
          // has plainly already lived a winter, so infer it from the turn.
          survivedFirstWinter = saved.survivedFirstWinter !== undefined
            ? !!saved.survivedFirstWinter
            : (saved.turngame || 1) >= 9;
          // Item 2: a save from before difficulty existed was played on
          // Normal, and knows nothing of the streaks.
          difficulty = saved.difficulty === "hard" ? "hard" : "normal";
          hungerStreak = saved.hungerStreak || 0;
          barnFeastStreak = saved.barnFeastStreak || 0;
          garlocks_attacking = saved.garlocks_attacking; garlock_incomingattack_turn = saved.garlock_incomingattack_turn;
          garlock_attacked_turn = saved.garlock_attacked_turn; garlock_rage = saved.garlock_rage;
          garlock_strangth = saved.garlock_strangth; garlock_defense = saved.garlock_defense;
          garlock_next_raid_turn = saved.garlock_next_raid_turn || 0;
          professionsSetState(saved.professions);
          ageSetState(saved.ages);

          //put the screen back the way it was
          let season_names = { 1: "spring", 2: "summer", 3: "autumn", 4: "winter" };
          document.getElementById("season").innerText = season_names[seasonchecker] || "spring";
          time_name.textContent = turngame;
          stoneaxebt.style.display = (techlevel >= 1 && stoneaxe_made == 0) ? "block" : "none";
          foodbasketbt.style.display = (techlevel >= 2 && foodbasketmade == 0) ? "block" : "none";
          farmingbt.style.display = (farming_unlocked && farming_made == 0) ? "block" : "none";
          mapmakingbt.style.display = (mapmaking_unlocked && mapmaking_made == 0) ? "block" : "none";
          bulkbt.style.display = (bulk_unlocked && bulkmade == 0) ? "block" : "none";
          if (techHint && (techlevel >= 1 || farming_unlocked || mapmaking_unlocked || bulk_unlocked)) techHint.style.display = "none";
        }

 // Adds a line to the log. `kind` is optional: "good", "bad" or "turn" —
 // it only changes the colour (see css/style.css .logentry--*).
 // The little "+12" beside a store: how much it has moved this turn. It
 // answers "am I ahead or behind today?" without any clicking.
 function showDelta(element, field) {
   if (!element || typeof turnLiveDelta !== "function") return;
   const delta = turnLiveDelta(field);
   if (!delta) {
     element.textContent = "";
     element.className = "rw-delta";
     return;
   }
   // Item 7: a delta is measured in calories like everything else, but the
   // store beside it is printed in timbermellows. Round toward zero so a
   // small gain never shows as "+1" next to a store that did not move.
   const shown = delta > 0
     ? Math.floor(delta / CALORIES_PER_TIMBERMELLOW)
     : Math.ceil(delta / CALORIES_PER_TIMBERMELLOW);
   if (!shown) {
     element.textContent = "";
     element.className = "rw-delta";
     return;
   }
   element.textContent = (shown > 0 ? "+" : "") + shown;
   element.className = "rw-delta rw-delta--" + (shown > 0 ? "up" : "down");
 }

 function updatelog(info, kind) {
        const newlog = document.createElement("div");
        newlog.className = "logentry" + (kind ? " logentry--" + kind : "");
        newlog.textContent = info;
        logentries.prepend(newlog);

        //main.js shows the newest lines as pop-ups over the map
        if (typeof onLogEntry === "function") onLogEntry(info, kind);

        // keep the log from growing forever
        while (logentries.childElementCount > 80) {
          logentries.lastElementChild.remove();
        }
      }

         function update() {
            // Item 7: the stores count calories underneath, timbermellows on
            // the screen. Every line below that shows food goes through
            // timbermellowsShown() — never print the raw value.
            text_timbermellow.textContent = timbermellowsShown(timbermellow_count);

            text_wood.textContent = wood;

            text_human.textContent = humans;

            text_soldier.textContent = human_army;

            text_peoplecap.textContent = peoplecap;

            text_turn.textContent = turngame;

            text_workhours_basic.textContent = working_hours;

            text_workhours.textContent = working_hours;

            //barn update

            text_barn.textContent = barn;

            text_storage.textContent = timbermellowsShown(storage_capacity);

            //stone update

            text_house.textContent = stonehouse;

            text_stone.textContent = stone;

            //end turn timbermellow needed update

            text_timbermellow_needed.textContent = mouthsToFeed();

            text_endturn_timbermellow_current.textContent = timbermellowsShown(timbermellow_count);

            //current storage and people capacity update
            text_storage_current.textContent = timbermellowsShown(timbermellow_count);

            text_peoplecap_current.textContent = humans;

            log_season.textContent = document.getElementById("season").innerText;

            //season colour on the top bar
            //(innerText comes back capitalised by the stylesheet, so lower-case it for the class name)
            let season_name = document.getElementById("season").innerText.toLowerCase();
            document.getElementById("season").className = "season season--" + season_name;

            //what is left on the land (calories under the name timbermellow)
            let food_on_land = territoryAvailable(territoryFoodTypes());
            let wood_on_land = territoryAvailable(["wood"]);
            let stone_on_land = territoryAvailable(["stone"]);

            text_land_food.textContent = timbermellowsShown(food_on_land);

            text_land_wood.textContent = wood_on_land;

            text_land_stone.textContent = stone_on_land;

            text_tiles.textContent = territoryClaimedCount();

            //grey out what the village can't do right now
            // Item 7: the `_5x` gates below are hours, not food — five hours
            // of a day is five hours whatever a timbermellow costs.
            btn_find_timbermellow.disabled = working_hours <= 0 || seasonchecker == 4 || food_on_land <= 0;
            btn_timbermellow_5x.disabled = working_hours < 5 || seasonchecker == 4 || food_on_land < 5 * CALORIES_PER_TIMBERMELLOW;
            btn_wood.disabled = working_hours <= 0 || wood_on_land <= 0;
            btn_wood_5x.disabled = working_hours < 5 || wood_on_land <= 0;
            btn_stone.disabled = working_hours <= 0 || stone_on_land <= 0;
            btn_stone_5x.disabled = working_hours < 5 || stone_on_land <= 0;
            if (btn_timbermellow_all) btn_timbermellow_all.disabled = working_hours <= 0 || seasonchecker == 4 || food_on_land <= 0 || timbermellow_count >= storage_capacity;
            if (btn_wood_all) btn_wood_all.disabled = working_hours <= 0 || wood_on_land <= 0;
            if (btn_stone_all) btn_stone_all.disabled = working_hours <= 0 || stone_on_land <= 0;
            btn_human.disabled = working_hours <= 0 || timbermellow_count < HUMAN_FOOD_COST;
            btn_human_5x.disabled = working_hours < 5 || timbermellow_count < HUMAN_FOOD_COST * 5;
            btn_soldier.disabled = humans < MIN_VILLAGERS + 1 || working_hours < 1;
            btn_soldier_5x.disabled = humans < MIN_VILLAGERS + 5 || working_hours < 5;
            btn_barn.disabled = working_hours <= 0 || wood < 4;
            btn_house.disabled = working_hours <= 0 || stone < 2;
            if (btn_school) btn_school.disabled = working_hours < SCHOOL_WORK_HOURS || wood < SCHOOL_WOOD_COST || stone < SCHOOL_STONE_COST;
            if (btn_armycamp) btn_armycamp.disabled = working_hours < ARMYCAMP_WORK_HOURS || wood < ARMYCAMP_WOOD_COST || stone < ARMYCAMP_STONE_COST;

            //the tile panel shows the same numbers, keep it in step
            if (typeof refreshTilePanel === "function") refreshTilePanel();

            //the map's weather follows the season
            if (typeof refreshMapEffects === "function") refreshMapEffects();

            //how each store has moved since the turn began (js/turnReport.js)
            showDelta(delta_food, "timbermellow");
            showDelta(delta_wood, "wood");
            showDelta(delta_stone, "stone");

            //which act we are in, and which controls have been earned (js/ages.js)
            if (typeof ageRefresh === "function") ageRefresh();

            //the colonist bar, the alerts and the tooltips (js/ui.js)
            if (typeof uiRefresh === "function") uiRefresh();

            //the objective checklist (js/objectives.js)
            if (typeof objectivesRefresh === "function") objectivesRefresh();
        }