// The village's stores. What is left *on the land* (timbermellows still on
// the trees, stone still in the hill) lives on the map tiles now — see
// js/territory.js — so the old timbermellow_total / wood_total pools are gone.

        let timbermellow_count = 0;

//human variables

        let humans = 2;

        let stonehouse = 1, stone = 0;

        let peoplecap = stonehouse * 3;

        let human_army = 0;

        let working_hours = humans * 4;

//wood variables barn 6 for testing was 0

        let wood = 0;

        let barn = 1;

        let storage_capacity = barn * 5;

//tech variables

        let stoneaxe_made = 0;

        let foodbasketmade = 0;

        // "till they learn to farm" — once made, grain on plains counts as food.
        let farming_made = 0;

        let farming_unlocked = false;

        // Reveals the whole map (the hexes are hidden "till they get the mapmaking tech").
        let mapmaking_made = 0;

        let mapmaking_unlocked = false;

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
        function foodPerHour() {
          let per = 1 + (foodbasketmade >= 1 ? 1 : 0) + professionGatherBonus("timbermellow");
          if (seasonchecker == 3) per = per * 2;          // the autumn harvest
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
          let gathered = territoryTake(territoryFoodTypes(), roadHaul(foodPerHour() * hours));
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
            const perHour = Math.max(1, foodPerHour());
            gatherFood(Math.max(1, Math.min(working_hours, Math.ceil(room / perHour))));
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
          const hungry = mouthsToFeed() - timbermellow_count;
          if (hungry > 0) warnings.push(`${hungry} will go unfed`);
          // Winter is two turns away at most when autumn is half over.
          if (seasonchecker === 4 && humans > peoplecap) {
            warnings.push(`${humans - peoplecap} have no roof in the frost`);
          }
          if (timbermellow_count > storage_capacity) {
            warnings.push(`${timbermellow_count - storage_capacity} timbermellows will spoil`);
          }
          return warnings;
        }

        
        function make_human() {
          if (working_hours <= 0) {
            updatelog("not enough work.");
          }
          if (timbermellow_count < 3) {
            updatelog("Not enough timbermellows to make a human! You need at least 3 timbermellows.");
          }

          if (working_hours > 0 && timbermellow_count >= 3) {
            timbermellow_count = timbermellow_count - 3;
            humans = humans + 1;
            working_hours = working_hours - 1;
            update();
            }
          }
        
        function human_5x() {
          if (working_hours < 5) {
            updatelog("not enough work.");
          } 
          if (timbermellow_count < 15) {
            updatelog("Not enough timbermellows to make 5 humans! You need at least 15 timbermellows.");
          }

          if (working_hours >= 5 && timbermellow_count >= 15) {
            let loop = 0;
            for (loop = 0; loop < 5; loop++) {
              timbermellow_count = timbermellow_count - 3;
              humans = humans + 1;
              working_hours = working_hours - 1;
              update();
            }
          }  
        }

        function apont_soldier() {
          if (humans < 2){
            updatelog("Not enough humans to make an army! You need at least 2 humans.");
          } else {
            humans = humans - 1;
            human_army = human_army + 1;
            update();
          }
        }

        function soldier_5x() {
          if (humans < 5){
            updatelog("Not enough humans to make 5 armies! You need at least 5 humans.");
          } else {
            let loop = 0;
            for (loop = 0; loop < 5; loop++) {
              humans = humans - 1;
              human_army = human_army + 1;
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
            storage_capacity = barn * 5;
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
            peoplecap = stonehouse * 3;
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
        const GARLOCK_RAID_INTERVAL = 6;

        // How angry they are ever allowed to get. Without a ceiling a village
        // that loses one raid loses every raid after it, which is a death
        // spiral, not "a peg" — see details.md.
        const GARLOCK_RAGE_CAP = 3;

        // The most damage a single raid can do, however badly it went.
        const GARLOCK_MAX_BITE = 6;

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
            garlock_strangth = 3 + garlock_rage * 2 +
                               Math.floor((humans + human_army) / 4) +
                               Math.floor(territoryClaimedCount() / 70);
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
            const lost = Math.min(human_army, Math.ceil(garlock_strangth / 4));
            human_army = human_army - lost;
            // A village that answers every raid keeps them small; one that
            // does not sees them grow. Never back to nothing, though.
            garlock_rage = Math.max(1, garlock_rage - 1);
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
          const foodLost = Math.min(timbermellow_count, Math.ceil(timbermellow_count / 2) + shortfall);
          const woodLost = Math.min(wood, shortfall * 3);

          human_army = human_army - soldiersLost;
          barn = barn - barnsLost;
          if (barn < 1) barn = 1;
          storage_capacity = barn * 5;
          timbermellow_count = timbermellow_count - foodLost;
          wood = wood - woodLost;

          let peopleLost = 0;
          let housesLost = 0;
          if (defence === 0 && shortfall >= GARLOCK_MAX_BITE) {
            // Nobody even tried to stop them. This is the sacking.
            peopleLost = Math.min(humans - 1, Math.floor(humans / 2));
            humans = humans - peopleLost;
            housesLost = Math.min(Math.max(0, stonehouse - 1), 1 + Math.floor(shortfall / 5));
            stonehouse = stonehouse - housesLost;
            if (stonehouse < 1) stonehouse = 1;
            peoplecap = stonehouse * 3;
          }

          const losses = [];
          if (foodLost) losses.push(`${foodLost} timbermellows`);
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

        function seasons_effect() {

          if(seasonchecker == 1) {
            working_hours = humans * 4;
          }

//summer
          if (seasonchecker == 2) {
            working_hours = humans * 4;
            updatelog("the day are longer in summer, each human gets 50% more time to work.");
            working_hours = working_hours + (humans * 2);
            update();
        }
//autumn
           if (seasonchecker == 3) {
            // the original code never reset work hours in autumn, so the
            // "season of harvest" was two turns with nothing to work with
            working_hours = humans * 4;
            let regrown = territoryRegrowAutumn();
            updatelog("It's autumn, the season of harvest! Your land has regrown " + regrown + " worth of timbermellows and wood, and you gather 100% more this season.", "good");
            turnReportNote(`the land regrew ${regrown}`, "good");
        }
//winter
          if (seasonchecker == 4) {

            updatelog("Winter has arrived! You cannot grow timbermellows this season.", "bad");
            if (peoplecap < humans) {
            humans = peoplecap;
            
           
            updatelog("Your population has exceeded your housing capacity. Some humans have died of exposure.");
           
            updatelog("the garlocks are eating the people who have died of exposure.");
            
            
            if (timbermellow_count < humans) {
              timbermellow_count = 0;
              humans = Math.floor(humans / 2);
              
              updatelog("half of your humans have starved to death due to lack of timbermellows.");

           
           }
          } 
          working_hours = humans * 2;      
        }
         update();
      }

        function techcheck() {
        // Ideas only start arriving once the village has room to think —
        // Act II, The Growing Years (js/ages.js).
          if (!ageAtLeast("growth")) return;

        //stone axe tech
          if (working_hours >= 25 && techlevel < 1) {

          
            updatelog("New technology unlocked: stone axe!");

           stoneaxebt.style.display = "block";
            techlevel = techlevel + 1;
                                  
           }

           //food basket tech
           if (working_hours >= 50 && techlevel < 2) {
              updatelog("New technology unlocked: food basket!");

                foodbasketbt.style.display = "block";
              techlevel = techlevel + 1;

            }

           //farming tech — the end of "spread out to find more food"
           if (working_hours >= 40 && farming_unlocked == false) {
              updatelog("New technology unlocked: farming!", "good");
              farmingbt.style.display = "block";
              farming_unlocked = true;
            }

           //mapmaking tech — reveals the whole map
           if (working_hours >= 60 && mapmaking_unlocked == false) {
              updatelog("New technology unlocked: mapmaking!", "good");
              mapmakingbt.style.display = "block";
              mapmaking_unlocked = true;
            }

            if (techHint && (stoneaxebt.style.display != "none" || foodbasketbt.style.display != "none" || farmingbt.style.display != "none" || mapmakingbt.style.display != "none")) {
              techHint.style.display = "none";
            }
          }

          
        // The work-hour price of a technology, after the scholars have
        // whittled it down (js/professions.js).
        function researchHours(base) {
          return Math.max(1, Math.round(base * professionResearchFactor()));
        }

        function stoneaxe() {
          if (wood < 20) {
            updatelog("Not enough wood to make a stone axe! You need at least 20 wood.");
          }

          if (stone < 30) {

            updatelog("Not enough stone to make a stone axe! You need at least 30 stone.");
          }  

            if (stone >= 30 && wood >= 20){

            wood = wood - 20;
            stone = stone - 30;
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
              updatelog(`No room in the barns — the garlocks took ${spoiled} timbermellows that would not fit.`, "bad");
              turnReportNote(`${spoiled} spoiled for want of barn space`, "bad");
            }

            //fammen check
            
            if (timbermellow_count < mouthsToFeed()) {
              
              let timbermellow_needed = mouthsToFeed();

              let timbermellow_deficit = timbermellow_needed - timbermellow_count;

              //this is to kill the army first 
              if (human_army > 0 ) {
             
                if (timbermellow_deficit >=human_army) {
                timbermellow_deficit = timbermellow_deficit - human_army;
                human_army = 0;
                updatelog("your entire army has starved to death due to lack of timbermellows.");
                 }
                }
              //this is to check if you now have enough timbermellows to feed humans
              if (timbermellow_deficit > 0) {
                timbermellow_count = 0;
              
              //2 human case
              if (humans == 2 || humans == 3) {
                humans =  humans - 1;
                updatelog("1 human starved to death due to lack of timbermellows.");
              //2 or greater case
              } else {
                humans = Math.ceil(humans / 2);
                updatelog("humans starved to death due to lack of timbermellows.");
              }
              let starvednumber = humanholder - humans;

              if (starvednumber > 1) {
              
            updatelog("" + starvednumber + " humans have died.");   
            }

            
            }    
          }
        
           //this removes timbermellows from the count 
           if (timbermellow_count >= mouthsToFeed()) {
           turnReportNote(`${mouthsToFeed()} eaten`, "");
           timbermellow_count = timbermellow_count - mouthsToFeed();
           }
            
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
          let tile = territorySeize(tile_id);
          let tile_name = (typeof TERRAIN_NAMES !== "undefined" && TERRAIN_NAMES[tile.terrainType]) || tile.terrainType;
          updatelog("Your soldiers seized " + tile_name + " from " + owner_name + ", losing " + SEIZE_SOLDIERS_LOST + " of their own.", "good");
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
            techlevel, techmade,
            seasonchecker, season, turngame,
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
          wood = saved.wood; barn = saved.barn; storage_capacity = saved.storage_capacity;
          stoneaxe_made = saved.stoneaxe_made; foodbasketmade = saved.foodbasketmade;
          farming_made = saved.farming_made; farming_unlocked = saved.farming_unlocked;
          mapmaking_made = saved.mapmaking_made; mapmaking_unlocked = saved.mapmaking_unlocked;
          techlevel = saved.techlevel; techmade = saved.techmade;
          seasonchecker = saved.seasonchecker; season = saved.season; turngame = saved.turngame;
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
          if (techHint && (techlevel >= 1 || farming_unlocked || mapmaking_unlocked)) techHint.style.display = "none";
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
   element.textContent = (delta > 0 ? "+" : "") + delta;
   element.className = "rw-delta rw-delta--" + (delta > 0 ? "up" : "down");
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
            text_timbermellow.textContent = timbermellow_count;

            text_wood.textContent = wood;

            text_human.textContent = humans;

            text_soldier.textContent = human_army;

            text_peoplecap.textContent = peoplecap;

            text_turn.textContent = turngame;

            text_workhours_basic.textContent = working_hours;

            text_workhours.textContent = working_hours;

            //barn update

            text_barn.textContent = barn;

            text_storage.textContent = storage_capacity;

            //stone update

            text_house.textContent = stonehouse;

            text_stone.textContent = stone;

            //end turn timbermellow needed update

            text_timbermellow_needed.textContent = mouthsToFeed();

            text_endturn_timbermellow_current.textContent = timbermellow_count;

            //current storage and people capacity update
            text_storage_current.textContent = timbermellow_count;

            text_peoplecap_current.textContent = humans;

            log_season.textContent = document.getElementById("season").innerText;

            //season colour on the top bar
            //(innerText comes back capitalised by the stylesheet, so lower-case it for the class name)
            let season_name = document.getElementById("season").innerText.toLowerCase();
            document.getElementById("season").className = "season season--" + season_name;

            //what is left on the land
            let food_on_land = territoryAvailable(territoryFoodTypes());
            let wood_on_land = territoryAvailable(["wood"]);
            let stone_on_land = territoryAvailable(["stone"]);

            text_land_food.textContent = food_on_land;

            text_land_wood.textContent = wood_on_land;

            text_land_stone.textContent = stone_on_land;

            text_tiles.textContent = territoryClaimedCount();

            //grey out what the village can't do right now
            btn_find_timbermellow.disabled = working_hours <= 0 || seasonchecker == 4 || food_on_land <= 0;
            btn_timbermellow_5x.disabled = working_hours < 5 || seasonchecker == 4 || food_on_land < 5;
            btn_wood.disabled = working_hours <= 0 || wood_on_land <= 0;
            btn_wood_5x.disabled = working_hours < 5 || wood_on_land <= 0;
            btn_stone.disabled = working_hours <= 0 || stone_on_land <= 0;
            btn_stone_5x.disabled = working_hours < 5 || stone_on_land <= 0;
            if (btn_timbermellow_all) btn_timbermellow_all.disabled = working_hours <= 0 || seasonchecker == 4 || food_on_land <= 0 || timbermellow_count >= storage_capacity;
            if (btn_wood_all) btn_wood_all.disabled = working_hours <= 0 || wood_on_land <= 0;
            if (btn_stone_all) btn_stone_all.disabled = working_hours <= 0 || stone_on_land <= 0;
            btn_human.disabled = working_hours <= 0 || timbermellow_count < 3;
            btn_human_5x.disabled = working_hours < 5 || timbermellow_count < 15;
            btn_soldier.disabled = humans < 2;
            btn_soldier_5x.disabled = humans < 5;
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