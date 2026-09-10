//timbermellow total = 10 testing

        let timbermellow_count = 0;

        let timbermellow = 0;

        let timbermellow_total = 100;

//human variables

        let humans = 2;

        let stonehouse = 1, stone = 0;

        let peoplecap = stonehouse * 3;

        let human_army = 0;

        let working_hours = humans * 4;

//wood variables barn 6 for testing was 0

        let timbermellow_tree = 25;

        let wood_total = 100;

        let wood = 0;

        let barn = 1;

        let storage_capacity = barn * 5;

//tech variables

        let stoneaxe_made = 0;

        let foodbasketmade = 0;

        let techlevel = 0;

        let techmade = 0;

//season variables

        let seasonchecker = 1;

        let season = 1;

        let turngame = 1;

       
//orc raid variables

          let orcs_attacking = false;

          let orc_incomingattack_turn = 0;

          let orc_attacked_turn = 0;

          let orc_rage = 0;

          let orc_strangth = 0;

          let orc_defense = 0;
        
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


        window.onload = update();

//timbermellow function

//land id's for start {land1 mountins, land2plains, land5 forest, land6 timbermellow forest, land7 river, land13 mountins, land14 plains}



        function find_timbermellow() {
          let timbermellow_gathered = 0;
          if (working_hours <= 0) {
           
            updatelog("No work hours left! End your turn to reset work hours.");
          } 
          if (seasonchecker == 4)  {
         
            updatelog("It's winter! You cannot grow timbermellows this season.");
            }
          if(timbermellow_total <= 0){
           
            updatelog("The forest has no more timbermellows left to gather.");
          }

          if (seasonchecker != 4 && working_hours > 0 && timbermellow_total > 0) {
            timbermellow_gathered++;
             
            if (foodbasketmade == 1)
                timbermellow_gathered++;
                
            
            working_hours = working_hours - 1;
            if (seasonchecker == 3) {
              timbermellow_gathered++;
              
              if (foodbasketmade == 1)
                timbermellow_gathered++;
              
            }  
        }
        ;

        timbermellow_count = timbermellow_count + timbermellow_forrest_tracker(timbermellow_gathered);
        update();
       }

       function timbermellow_forrest_tracker (timbermellow_gathered) {
        let timbermellow_holder = timbermellow_gathered;
        let timbermellow_available = timbermellow_total;
        timbermellow_total = timbermellow_total - timbermellow_gathered;

        if (timbermellow_total <= 0) {
          timbermellow_total = 0;
          if (timbermellow_available <= 0) {
            timbermellow_available = 0;
          }
          return timbermellow_available;
        } else {
          if (timbermellow_total > 0) {
          return timbermellow_holder;
        }
        }
      }
       
      

        function timbermellow_5x() {
          if (working_hours < 5) {
            updatelog("not enough work.");  
          } 

          if (seasonchecker == 4)  {
            updatelog("It's winter! You cannot grow timbermellows this season.");
          }  

          if (timbermellow_total <= 0){
           
            updatelog("The forest has no more timbermellows left to gather.");
          }


          if (seasonchecker != 4 && working_hours >= 5 && timbermellow_total >= 5) {
            let loop = 0;
            let timbermellow_gathered = 0;
            for (loop = 0; loop < 5; loop++) {
              timbermellow_gathered++;
              if (foodbasketmade == 1){
              timbermellow_gathered++;
              }
              working_hours = working_hours - 1;
              if (seasonchecker == 3) {
                timbermellow_gathered++;
                if (foodbasketmade == 1)
                  timbermellow_gathered++;
              }
            }
           timbermellow_count = timbermellow_count + timbermellow_forrest_tracker(timbermellow_gathered);
          }
           
          update();
        }

        function get_wood() {
          let wood_gathered = 0;
          if (working_hours <= 0) {
            updatelog("No work hours left! End your turn to reset work hours.");
          } 
          if (wood_total <= 0){
            updatelog("The forest has no more wood left to gather.");
          }
            if(working_hours > 0 && wood_total > 0) {
            wood_gathered++;
            working_hours = working_hours - 1;
            if (stoneaxe_made == true) {
              wood_gathered++;          
         }  
        }
        wood = wood + forrest_wood_tracker(wood_gathered);
        update();
      }

       function forrest_wood_tracker (wood_gathered) {
         let wood_holder = wood_gathered;
         let wood_available = wood_total;
         wood_total = wood_total - wood_gathered;

         if (wood_total <= 0) {
          
           wood_total = 0;
           if (wood_available <= 0) {
             wood_available = 0;
           }
           timbermellow_tree = timbermellow_tree - 1;
           wood_total = 10;
           
            updatelog("You have chopped down a timbermellow tree!");
           return wood_available;
         } else {
           if (wood_total > 0) {
           return wood_holder;
         }
         }
        }

         function wood_5x() {
          let wood_gathered = 0;
          if (working_hours < 5) {
            updatelog("not enough work.");
          }
          if (wood_total <= 0){
            
            updatelog("The forest has no more wood left to gather. you will need to chop another timmbermellow tree.");
          }
            if (wood_total > 0 && working_hours >= 5) {
            for (loop = 0; loop < 5; loop++) {
              wood_gathered++;
              working_hours = working_hours - 1;
              if (stoneaxe_made == true)
                wood_gathered++;
              
            }
          
          wood = wood + forrest_wood_tracker(wood_gathered);
          update();  
        }
    }

    
        function get_stone() {
          if (working_hours <= 0) {
            updatelog("not enough work.");
          } else{
            stone = stone + 1;
            working_hours = working_hours - 1;
                    update();
          }  
        }

         function stone_5x() {
          if (working_hours <= 5) {
           
            updatelog("not enough work.");
          } else{
            let loop = 0;
            for (loop = 0; loop < 5; loop++) {
              stone = stone + 1;
              working_hours = working_hours - 1;
              update();
            }
          }  
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

        function explore() {
          if (humans > 3 && human_army > 2 && timbermellow > 10){
            
          }
          if (humans < 3){
            updatelog("not enough humans to go explore need 3")
          }
          if (human_army < 2){
            updatelog("not enough soldiers to go explore need 2")
          }
          if (timbermellow < 10){
            updatelog("not enough timbermellows to go explore need 10")
          }

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

               function orc_raids_tracker() {
          if (orc_attacked_turn <= turngame + 1 ) {
            if (orcs_attacking == false){
              
          if (timbermellow_count >=25){
            
            updatelog("the orcs are seen scouting your village for food");
            orc_rage = orc_rage + 1;
            orc_strangth = 4 * orc_rage;
            orc_defense = 2 * orc_rage;
            orc_incomingattack_turn = turngame + 1;
            orcs_attacking = true;
          }
         }
        }
     }


        function orc_attack() {
          if (orcs_attacking == true){
            
          if (turngame == orc_incomingattack_turn) {
            orc_attacked_turn = turngame;
            updatelog("the orcs are attacking your village! with a strength of " + orc_strangth + " and a defense of " + orc_defense + "");
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
                updatelog("your village has been destroyed by the orcs! your humans have been killed and all your timbermellows have been stolen. you have lost " + humans_loss + " humans, " + timbermellow_loss + " timbermellows, " + barn_loss + " barns, and " + stonehouse_loss + " stonehouses.");
                update();
                orcs_attacking = false;
              }

           

                //if you dont have enough army

              if (human_army > 0 && human_army < orc_defense + orc_strangth) {
                orc_defense = orc_defense - human_army;
                
                if (orc_defense > 0) {
                  let humans_holder = humans;
                  let barn_holder = barn;
                  let stonehouse_holder = stonehouse;
                  let timbermellow_holder = timbermellow_count;

                  humans = humans - orc_strangth;
                  timbermellow_count = 0;
                  human_army = 0;
                  barn = barn - orc_strangth * 2;


                  if (barn < 0) {
                    barn = 0;
                  }
                  storage_capacity = barn * 5;
                  stonehouse = stonehouse - orc_strangth * 2;

                  if (stonehouse < 1) {
                    stonehouse = 1;
                  }

                  update();
                  let stonehouse_loss = stonehouse_holder - stonehouse;
                  let humans_loss = humans_holder - humans;
                  let barn_loss = barn_holder - barn;
                  let timbermellow_loss = timbermellow_holder - timbermellow_count;
                  
                  updatelog("your army has been defeated by the orcs! your village has been raided and you have lost " + humans_loss + " humans, " + timbermellow_loss + " timbermellows, " + barn_loss + " barns, and " + stonehouse_loss + " stonehouses.");
                  
                  update();

                }
                
                if (orc_defense <= 0) {
                  let barn_holder = barn;
                  let stonehouse_holder = stonehouse;
                  let timbermellow_holder = timbermellow_count;
                  let army_holder = human_army;
                  
                  human_army = human_army - orc_strangth;
                    if (human_army < 0) {
                    human_army = 0;
                  } 

                  barn = barn - orc_strangth;
                    if (barn < 0) {
                    barn = 0;
                  }
                  storage_capacity = barn * 5;
                  
                  timbermellow_count = timbermellow_count - (orc_strangth * 2);
                  if (timbermellow_count < 0) {
                    timbermellow_count = 0;
                  }

                  stonehouse = stonehouse - orc_strangth;
                  if (stonehouse < 1) {
                    stonehouse = 1;
                  }

                  let stonehouse_loss = stonehouse_holder - stonehouse;
                  let barn_loss = barn_holder - barn;
                  let timbermellow_loss = timbermellow_holder - timbermellow_count;
                  let army_loss = army_holder - human_army;
                  
                  updatelog("your army just managed to defeat the orcs." + army_loss + " of your men died in the fight! your village has suffered some damage"  + timbermellow_loss + " timbermellows, " + barn_loss + " barns, and " + stonehouse_loss + " stonehouses.");

                  
                  update();

                }
                orcs_attacking = false;
              }
               //if you have enough army
            if (human_army >= orc_defense + orc_strangth && orcs_attacking == true) {
              let armyholder = human_army;
              human_army = human_army - orc_defense;
              let army_loss = armyholder - human_army;
             
              updatelog("your army has successfully defended against the orc attack!" + " you have lost " + army_loss + " soldiers in the battle.");
              update();
              orcs_attacking = false;
                }

             
          }else {
            
            updatelog("the orcs gathering there strength for the next attack.");
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
            timbermellow_total = timbermellow_total + timbermellow_tree * 4;
            
            updatelog("it's autumn the season of harvest! you grow 100% more timbermellows.");
        }
//winter
          if (seasonchecker == 4) {
            
            alert("Winter has arrived! You cannot grow timbermellows this season.");
            if (peoplecap < humans) {
            humans = peoplecap;
            
           
            updatelog("Your population has exceeded your housing capacity. Some humans have died of exposure.");
           
            updatelog("the orcs are eating the people who have died of exposure.");
            
            
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
            updatelog("You have made a stone axe! you can chop more wood now");
            stoneaxebt.style.display = "none";
            updatelog();

            
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
          updatelog("You have made a foodbasket!");
         }
        }

         function end_turn() {
//this clears the log every turn

            let loglength = logentries.childElementCount;
         
          for (let i = 0; i < loglength; i++) {
            if ( document.getElementById("newlog"))
            document.getElementById("newlog").remove();
          }
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

             orc_attack();

             orc_raids_tracker();

            

            //storage check
            if (storage_capacity < timbermellow_count) {
              timbermellow_count = storage_capacity;
              updatelog("not enough storage! excess timbermellows have been eaten by orcs.");
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
          }

 function updatelog(info) {
       
        const newlog = document.createElement("div");
        newlog.innerHTML = `
          <div id=newlog> 
            <p>${info}</p>
          </div>
        `;
        logentries.prepend(newlog);

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

            
            //placeholder for wood total and tree count
            //tree_wood_total.textContent = wood_total;

            //tree_count.textContent = timbermellow_tree;

           


        }