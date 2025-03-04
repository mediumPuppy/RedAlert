(()=>{"use strict";const t=32,e=128;var i;!function(t){t[t.NORTH=0]="NORTH",t[t.NORTHEAST=45]="NORTHEAST",t[t.EAST=90]="EAST",t[t.SOUTHEAST=135]="SOUTHEAST",t[t.SOUTH=180]="SOUTH",t[t.SOUTHWEST=225]="SOUTHWEST",t[t.WEST=270]="WEST",t[t.NORTHWEST=315]="NORTHWEST"}(i||(i={}));const a={GRASS:65280,WATER:255,ORE:16776960,TANK:16711680,INFANTRY:255,HARVESTER:16711935,BASE:8421504,BARRACKS:9127187,EXPLOSION:16753920},s={TANK:{health:100,damage:20,range:3,speed:100,turnSpeed:90},INFANTRY:{health:50,damage:10,range:2,speed:80,turnSpeed:180},HARVESTER:{health:75,speed:60,capacity:100,turnSpeed:60}},n={GRASS:1,WATER:0,ORE:.7},o=io("http://localhost:3000");class r extends Phaser.Scene{constructor(){super("MainMenu"),this.soundOn=!0,console.log("MainMenu constructor called")}preload(){console.log("MainMenu preload started"),this.load.audio("bgm","assets/bgm.mp3")}create(){console.log("MainMenu create started"),this.cameras.main.setBackgroundColor("#222222");const t=this.cameras.main.width/2,e=this.cameras.main.height/2;this.add.text(t,e-100,"Red Alert 25",{fontSize:"48px",color:"#ffffff",fontFamily:'"Press Start 2P", cursive',backgroundColor:"#ff0000",padding:{x:20,y:10}}).setOrigin(.5);const i=this.add.text(t,e,"Play Multiplayer",{fontSize:"32px",color:"#ffffff",backgroundColor:"#006400",padding:{x:20,y:10},fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5).setInteractive({useHandCursor:!0});i.on("pointerover",(()=>i.setStyle({backgroundColor:"#008000"}))),i.on("pointerout",(()=>i.setStyle({backgroundColor:"#006400"}))),i.on("pointerdown",(()=>{console.log("Joining matchmaking"),o.emit("joinMatchmaking"),i.setVisible(!1),this.findingGameText=this.add.text(t,e,"Finding Players...",{fontSize:"24px",color:"#ffffff",backgroundColor:"#000066",padding:{x:20,y:10},fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5)}));const a=this.add.text(t,e+100,"Sound: On",{fontSize:"32px",color:"#ffffff",backgroundColor:"#000066",padding:{x:20,y:10},fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5).setInteractive({useHandCursor:!0});this.add.text(10,10,"Debug: MainMenu Active",{fontSize:"16px",color:"#ffffff"}),this.soundOn=!0,this.bgm=this.sound.add("bgm",{loop:!0}),a.on("pointerdown",(()=>{this.soundOn=!this.soundOn,a.setText("Sound: "+(this.soundOn?"On":"Off")),this.bgm&&(this.soundOn?this.bgm.play():this.bgm.stop())})),o.on("matchmakingStarted",(()=>console.log("Matchmaking started"))),o.on("matchmakingUpdate",(({message:t})=>{console.log(`Matchmaking update: ${t}`),this.findingGameText&&this.findingGameText.setText(`Finding Game...\n${t}`)})),o.on("gameCreated",(({gameId:t,players:e})=>{console.log(`Game created: ${t} with ${e.length} players`),this.scene.start("GameScene",{gameId:t,players:e})}))}}class l extends Phaser.Scene{constructor(){super("GameScene"),this.map=[],this.units=[],this.selectedUnit=null,this.resources=1e3,this.minimapCanvas=null,this.minimapContext=null,this.minimapContainer=null,this.resourceDisplay=null,this.controlPanel=null,this.buildButton=null,this.attackButton=null,this.harvestButton=null,this.currentMode="normal",this.gameId=null,this.inLobby=!0,this.pendingGameCreated=null,this.pendingLobbyUpdate=null,this.pendingGameStart=null,this.initialized=!1,this.mode=null,this.lastStateUpdate=0,this.STATE_UPDATE_DEBOUNCE=250,this.lastSynced=0}init(t){t&&(this.gameId=t.gameId||null,t.players&&(this.pendingGameCreated={gameId:t.gameId,players:t.players}))}preload(){this.load.image("grass","assets/grass.png"),this.load.image("ore","assets/ore.png"),this.load.image("tank","assets/tank.png")}create(){console.log("GameScene create started",{mode:this.mode}),this.inLobby=!0,this.initialized=!0,this.cameras.main.setBackgroundColor("#222222");const t=this.cameras.main.width/2,e=this.cameras.main.height/2,i=this.add.text(t,e-50,"Waiting for Players...",{fontSize:"24px",color:"#ffffff",fontFamily:'"Press Start 2P", cursive',backgroundColor:"#000066",padding:{x:20,y:10}}).setOrigin(.5),a=this.add.text(t,e,this.gameId?`Game ID: ${this.gameId}`:"Connecting...",{fontSize:"16px",color:"#ffffff",fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5);o.on("gameCreated",(({gameId:t,players:e})=>{console.log(`Received gameCreated for ${t} with ${e.length} players`),this.gameId=t,this.initialized?(this.showLobbyUI(e),a.setText(`Game ID: ${t}`),i.destroy()):this.pendingGameCreated={gameId:t,players:e}})),o.on("lobbyUpdate",(t=>{console.log("Received lobbyUpdate event",t),this.initialized&&this.inLobby?this.showLobbyUI(t.players):this.pendingLobbyUpdate=t})),o.on("gameStart",(t=>{console.log("Received gameStart event",t),this.initialized?(this.inLobby=!1,this.startGame(t),i.destroy()):this.pendingGameStart=t})),o.on("unitMoved",(t=>{if(!this.inLobby&&this.initialized){if(t.timestamp&&t.timestamp<=this.lastSynced)return void console.log(`Skipping outdated unitMoved for ${t.id} (timestamp ${t.timestamp} <= lastSynced ${this.lastSynced})`);document.hidden||(console.log(`Unit moved: ${t.id} to (${t.x}, ${t.y})`),this.handleRemoteUnitMovement(t))}})),o.on("gameState",(t=>{if(console.log("Received gameState event",t),this.initialized){this.gameId=t.gameId;const e=Date.now();e-this.lastStateUpdate>=this.STATE_UPDATE_DEBOUNCE&&(this.handleGameState(t,document.hidden),this.lastStateUpdate=e,this.lastSynced=e),this.inLobby||this.updateGameIdText(t.gameId)}else this.pendingGameStart=t})),o.on("gameError",(({message:t})=>{console.log(`Game error: ${t}`),this.scene.start("MainMenu")})),o.on("disconnect",(()=>{console.log("Disconnected from server"),this.inLobby?this.scene.start("MainMenu"):(this.add.text(t,e,"Disconnected from Server",{fontSize:"24px",color:"#ffffff",fontFamily:'"Press Start 2P", cursive',backgroundColor:"#ff0000",padding:{x:20,y:10}}).setOrigin(.5),this.time.delayedCall(2e3,(()=>this.scene.start("MainMenu"))))})),document.addEventListener("visibilitychange",(()=>{document.hidden||!this.gameId||this.inLobby||(console.log(`Tab refocused, requesting game state for ${this.gameId}`),this.tweens.killAll(),o.emit("requestGameState",this.gameId))})),this.pendingGameCreated&&(console.log("Processing pending gameCreated",this.pendingGameCreated),this.gameId=this.pendingGameCreated.gameId,this.showLobbyUI(this.pendingGameCreated.players),a.setText(`Game ID: ${this.gameId}`),i.destroy(),this.pendingGameCreated=null),this.pendingLobbyUpdate&&(console.log("Processing pending lobbyUpdate",this.pendingLobbyUpdate),this.showLobbyUI(this.pendingLobbyUpdate.players),this.pendingLobbyUpdate=null),this.pendingGameStart&&(console.log("Processing pending gameStart",this.pendingGameStart),this.inLobby=!1,this.startGame(this.pendingGameStart),i.destroy(),this.pendingGameStart=null)}showLobbyUI(t){if(!this.inLobby)return;this.children.removeAll();const e=this.cameras.main?this.cameras.main.width/2:320,i=this.cameras.main?this.cameras.main.height/2:320;this.add.text(e,50,"Red Alert 25 - Game Lobby",{fontSize:"24px",color:"#ffffff",fontFamily:'"Press Start 2P", cursive',backgroundColor:"#ff0000",padding:{x:20,y:10}}).setOrigin(.5),this.add.text(e,100,`Game ID: ${this.gameId}`,{fontSize:"16px",color:"#ffffff",fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5),this.add.text(e,130,`Players: ${t.length}/6`,{fontSize:"16px",color:"#ffffff",fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5),this.add.text(e,150,"Players:",{fontSize:"20px",color:"#ffffff",fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5),t.forEach(((t,i)=>{const a=t.id===o.id;this.add.text(e,190+30*i,`${a?"→ ":""}${t.id.substring(0,6)} - ${t.team||"No Team"} ${t.ready?"(Ready)":""}`,{fontSize:"16px",color:a?"#ffff00":"#ffffff",fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5)}));const a=this.add.text(e-100,i+100,"Join Allies",{fontSize:"16px",color:"#ffffff",backgroundColor:"#0000ff",padding:{x:10,y:5},fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5).setInteractive({useHandCursor:!0}),s=this.add.text(e+100,i+100,"Join Soviets",{fontSize:"16px",color:"#ffffff",backgroundColor:"#ff0000",padding:{x:10,y:5},fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5).setInteractive({useHandCursor:!0}),n=this.add.text(e,i+150,"Ready",{fontSize:"20px",color:"#ffffff",backgroundColor:"#006400",padding:{x:20,y:10},fontFamily:'"Press Start 2P", cursive'}).setOrigin(.5).setInteractive({useHandCursor:!0});a.on("pointerdown",(()=>{this.gameId&&o.emit("setTeam",{gameId:this.gameId,team:"ALLIES"})})),s.on("pointerdown",(()=>{this.gameId&&o.emit("setTeam",{gameId:this.gameId,team:"SOVIETS"})})),n.on("pointerdown",(()=>{this.gameId&&(o.emit("setReady",this.gameId),n.setStyle({backgroundColor:"#004400"}),n.setText("Waiting..."),n.disableInteractive())}))}startGame(t){this.children.removeAll(),this.createMap(),this.handleGameState(t),this.setupHtmlMinimap(),this.updateMinimap(),this.resourceDisplay=document.getElementById("resource-display"),this.resourceDisplay?this.updateResourceDisplay():this.resourceText=this.add.text(10,10,`Resources: ${this.resources}`,{fontSize:"20px",color:"#ffffff"}).setDepth(1),this.setupControlPanel(),this.cameras.main.setBounds(0,0,4096,4096),this.cameras.main.setViewport(0,0,640,640),this.cameras.main.scrollX=1728,this.cameras.main.scrollY=1728,this.setupInput()}handleRemoteUnitMovement(i){if(document.hidden)return void console.log(`Tab is hidden, skipping animation for unit ${i.id}`);const a=this.units.find((t=>t.getData("id")===i.id));if(a){const s=a.getData("unitType"),n=a.getData("gridX"),o=a.getData("gridY");if(i.duration<=0)return void console.log(`Skipping instant movement for unit ${i.id} (duration: ${i.duration})`);const r=a.getData("originalColor")||a.fillColor;n>=0&&n<e&&o>=0&&o<e&&this.map[n][o].setData("occupied",!1);const l=i.x*t+16,d=i.y*t+16;this.tweens.killTweensOf(a),"INFANTRY"!==s&&i.turnDuration>0?this.tweens.add({targets:a,angle:i.facing,duration:i.turnDuration,ease:"Linear",onComplete:()=>{a.setData("facing",i.facing),a.setFillStyle(r),this.tweens.add({targets:a,x:l,y:d,duration:i.duration,ease:"Linear",onStart:()=>{a.setFillStyle(r),a.setVisible(!0)},onComplete:()=>{a.setData("gridX",i.x),a.setData("gridY",i.y),a.setFillStyle(r),a.setVisible(!0),i.x>=0&&i.x<e&&i.y>=0&&i.y<e&&this.map[i.x][i.y].setData("occupied",!0)}})}}):this.tweens.add({targets:a,x:l,y:d,angle:i.facing,duration:i.duration,ease:"Linear",onStart:()=>{a.setAngle(i.facing),a.setData("facing",i.facing),a.setFillStyle(r),a.setVisible(!0)},onComplete:()=>{a.setData("gridX",i.x),a.setData("gridY",i.y),a.setFillStyle(r),a.setVisible(!0),i.x>=0&&i.x<e&&i.y>=0&&i.y<e&&this.map[i.x][i.y].setData("occupied",!0)}})}}isValidMove(t,i){if(t<0||i<0||t>=e||i>=e)return!1;const a=this.map[t][i];return"WATER"!==a.getData("type")&&!(!0===a.getData("occupied"))}createUnit(e,n,o){const r=this.add.rectangle(n*t+16,o*t+16,25.6,25.6,a[e]),l=`${e}_${Date.now()}_${Math.floor(1e3*Math.random())}`;r.setStrokeStyle(1,0),r.setInteractive(),r.setData("type","UNIT"),r.setData("unitType",e),r.setData("id",l),r.setData("originalColor",a[e]),r.setData("facing",i.NORTH),r.setAngle(i.NORTH),r.setData("gridX",n),r.setData("gridY",o);const d=s[e];return r.setData("health",d.health),r.setData("damage",d.damage||0),r.setData("range",d.range||1),r.setData("speed",d.speed),"HARVESTER"===e&&r.setData("capacity",d.capacity||100),this.map[n][o].setData("occupied",!0),this.units.push(r),console.log(`Client: Created unit ${e} with ID ${l} and color ${a[e].toString(16)}`),r}createBuilding(e,i,s){const n=this.add.rectangle(i*t+16,s*t+16,38.4,38.4,a[e]);return n.setStrokeStyle(1,0),n.setInteractive(),n.setData("type","BUILDING"),n.setData("buildingType",e),n.setData("id","building_"+Date.now().toString()),n.setData("health",200),this.map[i][s].setData("occupied",!0),n}moveUnit(i,a,r){const l=i.getData("unitType"),d=i.getData("gridX"),h=i.getData("gridY"),c=this.map[a][r].getData("type"),m=n[c],g=s[l].speed,u=s[l].turnSpeed||180,p=i.getData("originalColor")||i.fillColor;let f=Phaser.Math.Distance.Between(d,h,a,r)*t/(g*m)*1e3;const y=250;f<y&&(f=y);const S=this.calculateFacing(d,h,a,r),b=i.getData("facing"),v=Phaser.Math.Angle.ShortestBetween(b,S);let D=Math.abs(v)/u*1e3;D>0&&D<y&&(D=y),d>=0&&d<e&&h>=0&&h<e&&this.map[d][h].setData("occupied",!1),a>=0&&a<e&&r>=0&&r<e&&(this.units.some((t=>t!==i&&t.getData("gridX")===a&&t.getData("gridY")===r))||this.map[a][r].setData("occupied",!0));const x={id:i.getData("id"),x:a,y:r,facing:S,duration:f,turnDuration:D};o.emit("moveUnit",x),this.time.delayedCall(100,(()=>{"INFANTRY"!==l&&Math.abs(v)>5?this.tweens.add({targets:i,angle:S,duration:D,ease:"Linear",onComplete:()=>{i.setData("facing",S),i.setFillStyle(p),this.performMove(i,a,r,f)}}):(i.setAngle(S),i.setData("facing",S),i.setFillStyle(p),this.performMove(i,a,r,f))}))}performMove(e,i,a,s){const n=i*t+16,o=a*t+16,r=e.getData("originalColor")||e.fillColor;console.log(`performMove: Unit ${e.getData("id")} original color: ${r.toString(16)}`),e.setFillStyle(r),this.tweens.add({targets:e,x:n,y:o,duration:s,ease:"Linear",onStart:()=>{e.setFillStyle(r),console.log(`performMove onStart: Unit ${e.getData("id")} color: ${r.toString(16)}`)},onComplete:()=>{e.setData("gridX",i),e.setData("gridY",a),e.setFillStyle(r),e.setVisible(!0),console.log(`Client performMove complete: Unit ${e.getData("id")} at (${i},${a}) color: ${r.toString(16)}`)}})}calculateFacing(t,e,a,s){const n=Phaser.Math.Angle.Between(t,e,a,s),o=(Phaser.Math.RadToDeg(n)+360)%360;return o>=337.5||o<22.5?i.EAST:o>=22.5&&o<67.5?i.SOUTHEAST:o>=67.5&&o<112.5?i.SOUTH:o>=112.5&&o<157.5?i.SOUTHWEST:o>=157.5&&o<202.5?i.WEST:o>=202.5&&o<247.5?i.NORTHWEST:o>=247.5&&o<292.5?i.NORTH:i.NORTHEAST}handleResize(){console.log("GameScene handleResize called")}update(){if(this.units&&(this.units=this.units.filter((t=>{const e=t.getData("health");return t.active&&void 0!==e&&e>0}))),!this.cameras||!this.cameras.main)return;const t=this.input.activePointer,e=this.cameras.main;(t.isDown||t.active)&&(t.x<50&&e.scrollX>0?e.scrollX-=5:t.x>590&&e.scrollX<3456&&(e.scrollX+=5),t.y<50&&e.scrollY>0?e.scrollY-=5:t.y>590&&e.scrollY<3456&&(e.scrollY+=5)),this.updateMinimap()}setupHtmlMinimap(){this.minimapContainer=document.getElementById("minimap-container"),this.minimapCanvas=document.getElementById("minimap-canvas"),this.minimapContainer&&this.minimapCanvas&&(this.minimapContainer.style.display="block",this.minimapContext=this.minimapCanvas.getContext("2d"),this.minimapCanvas.width=192,this.minimapCanvas.height=192,this.minimapCanvas.addEventListener("click",(t=>{const e=this.minimapCanvas.getBoundingClientRect(),i=t.clientX-e.left,a=t.clientY-e.top,s=4096*(i/this.minimapCanvas.width)-320,n=4096*(a/this.minimapCanvas.height)-320;this.cameras.main.scrollX=Math.max(0,Math.min(3456,s)),this.cameras.main.scrollY=Math.max(0,Math.min(3456,n))})))}cleanupMinimap(){this.minimapContainer&&(this.minimapContainer.style.display="none"),this.resourceDisplay&&(this.resourceDisplay.textContent=""),this.minimapCanvas&&this.minimapCanvas.removeEventListener("click",(()=>{}))}updateMinimap(){if(!this.minimapContext||!this.minimapCanvas)return;if(!this.map||0===this.map.length)return;const i=this.minimapContext,s=1.5;i.clearRect(0,0,this.minimapCanvas.width,this.minimapCanvas.height),i.fillStyle="#333333",i.fillRect(0,0,192,192);for(let t=0;t<e;t++)for(let n=0;n<e;n++)if(this.map[t]&&this.map[t][n]){const e=this.map[t][n].getData("type");i.fillStyle="#"+a[e].toString(16).padStart(6,"0"),i.globalAlpha=.7,i.fillRect(t*s,n*s,s,s)}if(i.globalAlpha=1,this.units&&this.units.forEach((t=>{const e=t.getData("unitType"),n=t.getData("gridX"),o=t.getData("gridY");i.fillStyle="#"+a[e].toString(16).padStart(6,"0");i.fillRect(n*s-.5625,o*s-.5625,2.25,2.25)})),this.cameras&&this.cameras.main){const e=this.cameras.main,a=e.scrollX/t*s,n=e.scrollY/t*s,o=30,r=30;i.strokeStyle="#ffffff",i.lineWidth=2,i.strokeRect(a,n,o,r)}}updateResourceDisplay(){this.resourceDisplay?this.resourceDisplay.textContent=`Resources: ${this.resources}`:this.resourceText&&this.resourceText.setText(`Resources: ${this.resources}`)}harvest(t,e){this.resources+=50,this.updateResourceDisplay();const i=e.fillColor;e.setFillStyle(16777215),this.time.delayedCall(200,(()=>e.setFillStyle(i)))}setupControlPanel(){this.controlPanel=document.getElementById("control-panel"),this.buildButton=document.getElementById("build-button"),this.attackButton=document.getElementById("attack-button"),this.harvestButton=document.getElementById("harvest-button"),this.controlPanel&&(this.controlPanel.style.display="flex"),this.buildButton&&this.buildButton.addEventListener("click",(()=>this.setMode("build"))),this.attackButton&&this.attackButton.addEventListener("click",(()=>this.setMode("attack"))),this.harvestButton&&this.harvestButton.addEventListener("click",(()=>this.setMode("harvest"))),this.updateControlButtons()}updateControlButtons(){if(!this.selectedUnit)return this.buildButton&&this.buildButton.setAttribute("disabled","true"),this.attackButton&&this.attackButton.setAttribute("disabled","true"),void(this.harvestButton&&this.harvestButton.setAttribute("disabled","true"));const t=this.selectedUnit.getData("unitType");this.buildButton&&("INFANTRY"===t?this.buildButton.removeAttribute("disabled"):this.buildButton.setAttribute("disabled","true")),this.attackButton&&("TANK"===t||"INFANTRY"===t?this.attackButton.removeAttribute("disabled"):this.attackButton.setAttribute("disabled","true")),this.harvestButton&&("HARVESTER"===t?this.harvestButton.removeAttribute("disabled"):this.harvestButton.setAttribute("disabled","true"))}setMode(t){this.currentMode=t,this.buildButton&&(this.buildButton.style.backgroundColor="build"===t?"var(--ore-yellow)":"var(--allied-blue)",this.buildButton.style.color="build"===t?"var(--black)":"var(--white)"),this.attackButton&&(this.attackButton.style.backgroundColor="attack"===t?"var(--ore-yellow)":"var(--allied-blue)",this.attackButton.style.color="attack"===t?"var(--black)":"var(--white)"),this.harvestButton&&(this.harvestButton.style.backgroundColor="harvest"===t?"var(--ore-yellow)":"var(--allied-blue)",this.harvestButton.style.color="harvest"===t?"var(--black)":"var(--white)")}attackLocation(t,i,a){if(i<0||a<0||i>=e||a>=e)return;const s=this.units.find((e=>e.getData("gridX")===i&&e.getData("gridY")===a&&e!==t));if(s){const e=t.getData("gridX"),n=t.getData("gridY"),o=t.getData("range")||1;if(Phaser.Math.Distance.Between(e,n,i,a)>o){const r=Phaser.Math.Angle.Between(e,n,i,a),l=Math.round(i-Math.cos(r)*o),d=Math.round(a-Math.sin(r)*o);this.isValidMove(l,d)&&(this.moveUnit(t,l,d),this.time.delayedCall(1e3,(()=>{this.performAttack(t,s)})))}else this.performAttack(t,s)}}performAttack(t,e){const i=t.getData("damage")||10,a=e.getData("health")||0,s=Math.max(0,a-i);e.setData("health",s);const n=e.fillColor;e.setFillStyle(16711680),this.time.delayedCall(200,(()=>{if(s<=0){const t=this.units.indexOf(e);-1!==t&&this.units.splice(t,1),e.destroy()}else e.setFillStyle(n)}))}harvestLocation(t,i,a){if(i<0||a<0||i>=e||a>=e)return;const s=this.map[i][a];if("ORE"===s.getData("type")){const e=t.getData("gridX"),n=t.getData("gridY");if(Phaser.Math.Distance.Between(e,n,i,a)>1){const o=[{x:i+1,y:a},{x:i-1,y:a},{x:i,y:a+1},{x:i,y:a-1}].filter((t=>this.isValidMove(t.x,t.y)));if(o.length>0){const i=o.reduce(((t,i)=>Phaser.Math.Distance.Between(e,n,t.x,t.y)<Phaser.Math.Distance.Between(e,n,i.x,i.y)?t:i));this.moveUnit(t,i.x,i.y),this.time.delayedCall(1e3,(()=>{this.harvest(t,s)}))}}else this.harvest(t,s)}}buildStructure(t,e){!this.isValidMove(t,e)||this.resources<500||(this.resources-=500,this.updateResourceDisplay(),this.createBuilding("BARRACKS",t,e))}cleanupUI(){this.minimapContainer&&(this.minimapContainer.style.display="none"),this.resourceDisplay&&(this.resourceDisplay.textContent=""),this.controlPanel&&(this.controlPanel.style.display="none"),this.minimapCanvas&&this.minimapCanvas.removeEventListener("click",(()=>{})),this.buildButton&&this.buildButton.removeEventListener("click",(()=>{})),this.attackButton&&this.attackButton.removeEventListener("click",(()=>{})),this.harvestButton&&this.harvestButton.removeEventListener("click",(()=>{}))}createMap(){for(let i=0;i<e;i++){this.map[i]=[];for(let s=0;s<e;s++){const e=Math.random()<.1?"WATER":Math.random()<.15?"ORE":"GRASS",n=this.add.rectangle(i*t+16,s*t+16,t,t,a[e]);n.setStrokeStyle(1,0),n.setData("type",e),this.map[i][s]=n}}}setupInput(){this.events.on("shutdown",this.cleanupUI,this),this.input.on("gameobjectdown",((t,e)=>{"UNIT"===e.getData("type")&&e.getData("owner")===o.id&&(this.selectedUnit&&this.selectedUnit.setStrokeStyle(1,0),this.selectedUnit=e,e.setStrokeStyle(2,16776960),this.updateControlButtons())})),this.input.on("pointerdown",(e=>{if(this.selectedUnit){const i=Math.floor((e.x+this.cameras.main.scrollX)/t),a=Math.floor((e.y+this.cameras.main.scrollY)/t);"normal"===this.currentMode&&this.isValidMove(i,a)?this.moveUnit(this.selectedUnit,i,a):"attack"===this.currentMode?this.attackLocation(this.selectedUnit,i,a):"harvest"===this.currentMode&&"HARVESTER"===this.selectedUnit.getData("unitType")?this.harvestLocation(this.selectedUnit,i,a):"build"===this.currentMode&&this.buildStructure(i,a),this.setMode("normal")}}))}handleGameState(i,s=!1){if(this.gameId=i.gameId,this.inLobby)return void this.showLobbyUI(i.players);this.map&&0!==this.map.length||(console.log("Map not initialized yet, creating map first"),this.createMap());const n=Date.now(),r=new Set;Object.entries(i.units).forEach((([i,l])=>{let d=this.units.find((t=>t.getData("id")===i));const h=!d;d||(console.log(`Creating new unit ${l.type} with ID ${i}`),d=this.createUnit(l.type,l.x,l.y),d.setData("id",i),d.setData("owner",l.owner),l.owner===o.id&&d.setData("selectable",!0));const c=d.getData("gridX"),m=d.getData("gridY");c>=0&&c<e&&m>=0&&m<e&&this.map[c][m].setData("occupied",!1);const g=l.x*t+16,u=l.y*t+16,p=d.getData("originalColor")||a[l.type];if(this.tweens.killTweensOf(d),s)d.setPosition(g,u),d.setAngle(l.facing),d.setData("gridX",l.x),d.setData("gridY",l.y),d.setData("facing",l.facing),d.setFillStyle(p),l.x>=0&&l.x<e&&l.y>=0&&l.y<e&&this.map[l.x][l.y].setData("occupied",!0);else if(l.lastMove&&(h||c!==l.x||m!==l.y)){const i=l.lastMove,a=n-i.timestamp,s=i.duration+i.turnDuration;if(a<s){const n=i.x*t+16,o=i.y*t+16;d.setPosition(n,o),d.setAngle(i.facing);const r=Math.max(0,s-a);this.tweens.add({targets:d,x:g,y:u,angle:l.facing,duration:r,ease:"Linear",onComplete:()=>{d.setData("gridX",l.x),d.setData("gridY",l.y),d.setData("facing",l.facing),l.x>=0&&l.x<e&&l.y>=0&&l.y<e&&this.map[l.x][l.y].setData("occupied",!0)}})}else d.setPosition(g,u),d.setAngle(l.facing),d.setData("gridX",l.x),d.setData("gridY",l.y),d.setData("facing",l.facing),l.x>=0&&l.x<e&&l.y>=0&&l.y<e&&this.map[l.x][l.y].setData("occupied",!0)}r.add(i)})),this.units=this.units.filter((t=>{const i=t.getData("id");if(!r.has(i)){const i=t.getData("gridX"),a=t.getData("gridY");return i>=0&&i<e&&a>=0&&a<e&&this.map[i][a].setData("occupied",!1),t.destroy(),!1}return!0})),this.minimapContext&&this.minimapCanvas&&this.updateMinimap()}updateGameIdText(t){this.gameId&&(this.gameId=t,this.updateGameIdText(t))}}const d={type:Phaser.AUTO,width:640,height:640,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,parent:"game-container",expandParent:!0},backgroundColor:"#333333",scene:[r,l],physics:{default:"arcade",arcade:{debug:!0}}};console.log("Creating Phaser game instance");const h=document.getElementById("game-container");h&&(h.style.display="block");const c=new Phaser.Game(d);new URLSearchParams(window.location.search).get("mode"),c.scene.start("MainMenu"),window.addEventListener("resize",(()=>{c.scale.resize(window.innerWidth,window.innerHeight);const t=c.scene.getScene("GameScene");t&&t.scene.isActive()&&t.handleResize()}))})();