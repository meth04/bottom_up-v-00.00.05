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

        //tracking variables
//timbermellow needed
        const text_timbermellow_needed = document.getElementById("timbermellow_needed");

//barn storage current
        const text_storage_current = document.getElementById("text_storage_current");

//people capacity current
        const text_peoplecap_current = document.getElementById("text_peoplecap_current");

        const timbermellowhumantracker = document.getElementById("timbermellowhumantracker");

//update log variables
        const timename = document.getElementById("time_name");

        const logentries = document.getElementById("logentries");

        const log_season = document.getElementById("log_season");


        // update() is called by main.js once the map has loaded.

//gathering functions
//
// Everything gathered comes off the tiles the village holds (js/territory.js).
// territoryTake() returns how much the land actually gave up, which can be
// less than asked for when the last tile is nearly empty.

//land id's for start {land1 mountins, land2plains, land5 forest, land6 timbermellow forest, land7 river, land13 mountins, land14 plains}



        function find_timbermellow() {
          let timbermellow_gathered = 0;
          let food_on_land = territoryAvailable(territoryFoodTypes());
          if (working_hours <= 0) {
            updatelog("No work hours left! End your turn to reset work hours.");
          }
          if (seasonchecker == 4)  {
            updatelog("It's winter! You cannot grow timbermellows this season.");
          }
          if (food_on_land <= 0) {
            updatelog("There are no timbermellows left on your land. Explore a neighbouring tile to find more.", "bad");
          }

          if (seasonchecker != 4 && working_hours > 0 && food_on_land > 0) {
            timbermellow_gathered++;
            if (foodbasketmade >= 1)
                timbermellow_gathered++;
            working_hours = working_hours - 1;
            if (seasonchecker == 3) {
              timbermellow_gathered++;
              if (foodbasketmade >= 1)
                timbermellow_gathered++;
            }
          }

          timbermellow_count = timbermellow_count + territoryTake(territoryFoodTypes(), timbermellow_gathered);
          update();
        }

        function timbermellow_5x() {
          let food_on_land = territoryAvailable(territoryFoodTypes());
          if (working_hours < 5) {
            updatelog("not enough work.");
          }
          if (seasonchecker == 4)  {
            updatelog("It's winter! You cannot grow timbermellows this season.");
          }
          if (food_on_land <= 0) {
            updatelog("There are no timbermellows left on your land. Explore a neighbouring tile to find more.", "bad");
          }

          if (seasonchecker != 4 && working_hours >= 5 && food_on_land >= 5) {
            let timbermellow_gathered = 0;
            for (let loop = 0; loop < 5; loop++) {
              timbermellow_gathered++;
              if (foodbasketmade >= 1) {
                timbermellow_gathered++;
              }
              working_hours = working_hours - 1;
              if (seasonchecker == 3) {
                timbermellow_gathered++;
                if (foodbasketmade >= 1)
                  timbermellow_gathered++;
              }
            }
            timbermellow_count = timbermellow_count + territoryTake(territoryFoodTypes(), timbermellow_gathered);
          }
          update();
        }

        function get_wood() {
          let wood_gathered = 0;
          let wood_on_land = territoryAvailable(["wood"]);
          if (working_hours <= 0) {
            updatelog("No work hours left! End your turn to reset work hours.");
          }
          if (wood_on_land <= 0) {
            updatelog("There is no wood left on your land. Explore a forest for more.", "bad");
          }
          if (working_hours > 0 && wood_on_land > 0) {
            wood_gathered++;
            working_hours = working_hours - 1;
            if (stoneaxe_made >= 1) {
              wood_gathered++;
            }
          }
          wood = wood + territoryTake(["wood"], wood_gathered);
          update();
        }

        function wood_5x() {
          let wood_gathered = 0;
          let wood_on_land = territoryAvailable(["wood"]);
          if (working_hours < 5) {
            updatelog("not enough work.");
          }
          if (wood_on_land <= 0) {
            updatelog("There is no wood left on your land. Explore a forest for more.", "bad");
          }
          if (wood_on_land > 0 && working_hours >= 5) {
            for (let loop = 0; loop < 5; loop++) {
              wood_gathered++;
              working_hours = working_hours - 1;
              if (stoneaxe_made >= 1)
                wood_gathered++;
            }
            wood = wood + territoryTake(["wood"], wood_gathered);
          }
          update();
        }

        // Stone is finite: "each tile will have a set amount lets say 250 and
        // then when the player runs out they will need to start a quarry."
        // The quarry isn't built yet — see ask.txt, question 4.
        function get_stone() {
          let stone_on_land = territoryAvailable(["stone"]);
          if (working_hours <= 0) {
            updatelog("not enough work.");
          }
          if (stone_on_land <= 0) {
            updatelog("There is no loose stone left on your land. Explore the mountains for more — one day you will need a quarry.", "bad");
          }
          if (working_hours > 0 && stone_on_land > 0) {
            stone = stone + territoryTake(["stone"], 1);
            working_hours = working_hours - 1;
          }
          update();
        }

        function stone_5x() {
          let stone_on_land = territoryAvailable(["stone"]);
          if (working_hours < 5) {
            updatelog("not enough work.");
          }
          if (stone_on_land <= 0) {
            updatelog("There is no loose stone left on your land. Explore the mountains for more — one day you will need a quarry.", "bad");
          }
          if (working_hours >= 5 && stone_on_land > 0) {
            stone = stone + territoryTake(["stone"], 5);
            working_hours = working_hours - 5;
          }
          update();
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

               function garlock_raids_tracker() {
          if (garlock_attacked_turn <= turngame + 1 ) {
            if (garlocks_attacking == false){
              
          if (timbermellow_count >=25){
            
            updatelog("the garlocks are seen scouting your village for food" + (typeof garlockDirectionText === "function" ? garlockDirectionText() : "") + ".", "bad");
            garlock_rage = garlock_rage + 1;
            garlock_strangth = 4 * garlock_rage;
            garlock_defense = 2 * garlock_rage;
            garlock_incomingattack_turn = turngame + 1;
            garlocks_attacking = true;
          }
         }
        }
     }


        function garlock_attack() {
          if (garlocks_attacking == true){
            
          if (turngame == garlock_incomingattack_turn) {
            garlock_attacked_turn = turngame;
            updatelog("the garlocks are attacking your village! with a strength of " + garlock_strangth + " and a defense of " + garlock_defense + "");
            //if you have no army
            if (human_army == 0) {
              let humans_holder = humans;
              let barn_holder = barn;
              let stonehouse_holder = stonehouse;
              let timbermellow_holder = timbermellow_count;
                
                humans = Math.floor(humans / 2);
                timbermellow_count = 0;
                barn = 0;
                storage_capacity = barn * 5;
                stonehouse = 1; 
                peoplecap = stonehouse * 3;
                let stonehouse_loss = stonehouse_holder - stonehouse;
                let humans_loss = humans_holder - humans; 
                let barn_loss = barn_holder - barn; 
                let timbermellow_loss = timbermellow_holder - timbermellow_count;
                updatelog("your village has been destroyed by the garlocks! your humans have been killed and all your timbermellows have been stolen. you have lost " + humans_loss + " humans, " + timbermellow_loss + " timbermellows, " + barn_loss + " barns, and " + stonehouse_loss + " stonehouses.");
                update();
                garlocks_attacking = false;
              }

           

                //if you dont have enough army

              if (human_army > 0 && human_army < garlock_defense + garlock_strangth) {
                garlock_defense = garlock_defense - human_army;
                
                if (garlock_defense > 0) {
                  let humans_holder = humans;
                  let barn_holder = barn;
                  let stonehouse_holder = stonehouse;
                  let timbermellow_holder = timbermellow_count;

                  humans = humans - garlock_strangth;
                  timbermellow_count = 0;
                  human_army = 0;
                  barn = barn - garlock_strangth * 2;


                  if (barn < 0) {
                    barn = 0;
                  }
                  storage_capacity = barn * 5;
                  stonehouse = stonehouse - garlock_strangth * 2;

                  if (stonehouse < 1) {
                    stonehouse = 1;
                  }

                  update();
                  let stonehouse_loss = stonehouse_holder - stonehouse;
                  let humans_loss = humans_holder - humans;
                  let barn_loss = barn_holder - barn;
                  let timbermellow_loss = timbermellow_holder - timbermellow_count;
                  
                  updatelog("your army has been defeated by the garlocks! your village has been raided and you have lost " + humans_loss + " humans, " + timbermellow_loss + " timbermellows, " + barn_loss + " barns, and " + stonehouse_loss + " stonehouses.");
                  
                  update();

                }
                
                if (garlock_defense <= 0) {
                  let barn_holder = barn;
                  let stonehouse_holder = stonehouse;
                  let timbermellow_holder = timbermellow_count;
                  let army_holder = human_army;
                  
                  human_army = human_army - garlock_strangth;
                    if (human_army < 0) {
                    human_army = 0;
                  } 

                  barn = barn - garlock_strangth;
                    if (barn < 0) {
                    barn = 0;
                  }
                  storage_capacity = barn * 5;
                  
                  timbermellow_count = timbermellow_count - (garlock_strangth * 2);
                  if (timbermellow_count < 0) {
                    timbermellow_count = 0;
                  }

                  stonehouse = stonehouse - garlock_strangth;
                  if (stonehouse < 1) {
                    stonehouse = 1;
                  }

                  let stonehouse_loss = stonehouse_holder - stonehouse;
                  let barn_loss = barn_holder - barn;
                  let timbermellow_loss = timbermellow_holder - timbermellow_count;
                  let army_loss = army_holder - human_army;
                  
                  updatelog("your army just managed to defeat the garlocks." + army_loss + " of your men died in the fight! your village has suffered some damage"  + timbermellow_loss + " timbermellows, " + barn_loss + " barns, and " + stonehouse_loss + " stonehouses.");

                  
                  update();

                }
                garlocks_attacking = false;
              }
               //if you have enough army
            if (human_army >= garlock_defense + garlock_strangth && garlocks_attacking == true) {
              let armyholder = human_army;
              human_army = human_army - garlock_defense;
              let army_loss = armyholder - human_army;
             
              updatelog("your army has successfully defended against the garlock attack!" + " you have lost " + army_loss + " soldiers in the battle.");
              update();
              garlocks_attacking = false;
                }

             
          }else {
            
            updatelog("the garlocks gathering there strength for the next attack.");
            update();
        }
          }
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
          }
          update();
        }

        function foodbasket(){
          if(wood < 50){

            updatelog("Not enough wood to make a food basket! You need at least 50 wood.");
          }
          if(working_hours < 16){
        
            updatelog("Not enough work hours to make a food basket! You need at least 16 workhours.");
          }
         if (working_hours >= 16 && wood >= 50) {
          wood = wood - 50;
          working_hours = working_hours - 16;
          foodbasketmade = foodbasketmade +1;
          techmade = techmade + 1;
          foodbasketbt.style.display = "none";
          updatelog("You have made a foodbasket!", "good");
         }
         update();
        }

        function farming() {
          if (wood < 30) {
            updatelog("Not enough wood to learn farming! You need at least 30 wood.");
          }
          if (working_hours < 12) {
            updatelog("Not enough work hours to learn farming! You need at least 12 work hours.");
          }
          if (wood >= 30 && working_hours >= 12) {
            wood = wood - 30;
            working_hours = working_hours - 12;
            farming_made = farming_made + 1;
            techmade = techmade + 1;
            farmingbt.style.display = "none";
            updatelog("Your village has learned to farm! Grain on your plains now counts as food.", "good");
          }
          update();
        }

        function mapmaking() {
          if (wood < 20) {
            updatelog("Not enough wood to make maps! You need at least 20 wood.");
          }
          if (working_hours < 10) {
            updatelog("Not enough work hours to make maps! You need at least 10 work hours.");
          }
          if (wood >= 20 && working_hours >= 10) {
            wood = wood - 20;
            working_hours = working_hours - 10;
            mapmaking_made = mapmaking_made + 1;
            techmade = techmade + 1;
            mapmakingbt.style.display = "none";
            territoryRevealMap();
            updatelog("Your mapmakers have charted the whole land.", "good");
          }
          update();
        }

         function end_turn() {
// the log keeps its history now; each turn just gets a heading (see updatelog)

            season = season + 1;

            turngame = turngame + 1;

            let humanholder = humans + human_army;

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

             garlock_attack();

             garlock_raids_tracker();

            

            //storage check
            if (storage_capacity < timbermellow_count) {
              timbermellow_count = storage_capacity;
              updatelog("not enough storage! excess timbermellows have been eaten by garlocks.");
            }

            //fammen check
            
            if (timbermellow_count < humans + human_army) {
              
              let timbermellow_needed = humans + human_army;

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
           if (timbermellow_count >= humans + human_army) {
           timbermellow_count = timbermellow_count - (humans + human_army);
           }
            
            seasons_effect();

            techcheck();

            update();

            //the other villages take their turn, and the game is saved (see main.js)
            if (typeof afterTurnEnded === "function") afterTurnEnded();
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

            text_timbermellow_needed.textContent = humans + human_army;

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
            btn_human.disabled = working_hours <= 0 || timbermellow_count < 3;
            btn_human_5x.disabled = working_hours < 5 || timbermellow_count < 15;
            btn_soldier.disabled = humans < 2;
            btn_soldier_5x.disabled = humans < 5;
            btn_barn.disabled = working_hours <= 0 || wood < 4;
            btn_house.disabled = working_hours <= 0 || stone < 2;

            //the tile panel shows the same numbers, keep it in step
            if (typeof refreshTilePanel === "function") refreshTilePanel();

            //the map's weather follows the season
            if (typeof refreshMapEffects === "function") refreshMapEffects();

            //the colonist bar, the alerts and the tooltips (js/ui.js)
            if (typeof uiRefresh === "function") uiRefresh();
        }