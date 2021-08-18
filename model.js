'use strict';

const express = require('express');
const mongoose = require("mongoose");
const Joi = require("joi");
const bodyParser = require("body-parser");
const cors = require("cors");

// SET UP EXPRESS
const PORT = 8888;
const HOST = '0.0.0.0';
const app = express();
const basePath = "/api/";
const jsonParser = bodyParser.json();
app.use(cors({
    origin: '*'
}));


//SET UP MONGOOSE
mongoose.connect('mongodb://localhost/winnings')
    .then(() => console.log("connected to mongodb"))
    .catch(err => console.log("Connection to mongodb failed", err));


const playerSchema = new mongoose.Schema({
    name: String,
    rank: {type: Number, default: null},
    deuces: {type: Number, default: 0},
    isStillPlaying: {type: Boolean, default: true},
    winnings: {type: Map, of: Number, default: {}},
    entitledTo: Number,
    assignedTo: Number
});

const winningsSchema = new mongoose.Schema({
    rank: Number,
    winningsPercentage: Number

})

const gameSchema = new mongoose.Schema({
    isRunning: {type: Boolean, default: false},
    bet: {type: Number, default: 5},
    moneyDistributed: {type: Boolean, default: false},
    deuceEarnings: {type: Number, default: 1}
})

const Player = mongoose.model('Player', playerSchema);
const Winning = mongoose.model('Winning', winningsSchema);
const Game = mongoose.model("Game", gameSchema);

//JOI SCHEMAS
const postPlayer = Joi.object({
    name: Joi.string().required().max(15).truncate().pattern(/^\s*\w+(?:[^\w,]+\w+)*[^,\w]*$/)
});
const postBet = Joi.object({
    bet: Joi.number().integer().positive()
})
const postWinning = Joi.object({
    rank: Joi.number().integer().positive(),
    percentage: Joi.number().integer().greater(-1).multiple(100)
})
const postDeuce = Joi.object({
    amount: Joi.number().integer().positive()
})


//REST CALLS
app.get(basePath + "players", (req, res) => {
    Player.find()
        .then(players => res.json(players))
});




app.get(basePath + "players/:id", (req, res) => {
    Player.findById(req.params.id)
        .then(player => res.json(player))
        .catch(err => {
            console.log(err);
            return res.status(404).send("Player not found")
        })
});





async function addPlayer(playerName) {
    let theGame = await getGame();
    if (theGame.isRunning) {
        throw Error("Cannot add a player while the game is running")
    }
    const newPlayer = new Player({
        name: playerName
    });
    await newPlayer.save();
    const result  = await craftMasterObject();
    return result;
}
app.post(basePath + "players", jsonParser, (req, res) => {
    const {error, value} = postPlayer.validate(req.body);
    if (error) {
        return res.status(400).send(error.details[0].message)
    } else {
        addPlayer(value.name)
            .then(players => res.json(players))
            .catch(err => res.status(400).send(err.toString()))
    }
});




async function handleDelete(id) {
    const player = await Player.findById(id);
    if (!player) {
        throw Error("Player not found");
    }
    await Player.deleteOne({_id: id});
    const result  = await craftMasterObject();
    return result;
}
app.delete(basePath + "players/:id", (req, res) => {
    handleDelete(req.params.id)
        .then(players => res.json(players))
        .catch(err => {
            console.log("error:", err);
            res.status(400).send(err.toString())
        })
})




async function togglePlayingStatus(id) {
    let player = await Player.findById(id);
    if (!player) {
        throw Error("Player not found");
    }
    let theGame = await Game.find();
    theGame = theGame[0];
    if (!theGame.isRunning) {
        throw Error("Cannot toggle player if the game is not running")
    }
    player.isStillPlaying = !player.isStillPlaying;
    if (!player.isStillPlaying) {
        const players = await Player.find();
        player.rank = players.filter(player => player.isStillPlaying).length;
    } else {
        const players = await Player.find();
        for (let pl of players) {
            if (pl.rank && pl.rank < player.rank) {
                throw Error("You may only deeliminate the player that was eliminated the latest")
            }
        }
        player.rank = null;
    }
    await player.save()
    const result  = await craftMasterObject();
    return result;
}
app.get(basePath + "players/togglePlaying/:id", (req, res) => {
    togglePlayingStatus(req.params.id)
        .then(players => res.json(players))
        .catch(err => res.status(400).send(err.toString()))
});




async function addDeuce(id) {
    const game = await getGame();
    //check if the player exists
    let player = await Player.findById(id);
    if (!player) throw Error("Player not found");

    //check if the game is in progress
    const theGame = await getGame();
    if (!theGame.isRunning) throw Error("Cannot add deuce if the game is not running")

    //check if the player is still playing
    if (!player.isStillPlaying) throw Error("Cannot increment deuce count of inactive player")

    //increment the player's deuce count
    player.deuces++;

    //increment the other player's deuce owes
    const players = await Player.find()
    for (let pla of players) {
        if (pla.isStillPlaying && pla.id !== id) {
            player.winnings.set(pla.id, player.winnings.get(pla.id) + game.deuceEarnings)
        }
    }
    await player.save()


    const result  = await craftMasterObject();
    return result;
}
app.get(basePath + "players/deuce/:id", (req, res) => {
    addDeuce(req.params.id)
        .then(players => res.json(players))
        .catch(err => {
            console.log("err:", err);
            res.status(400).send(err.toString())
        })
})

async function getGame() {
    let theGame = await Game.find();
    while (theGame.length === 0) {
        console.log("creating game singleton");
        const newGame = new Game({
            isRunning: false,
            bet: null
        });
        await newGame.save();
        theGame = await Game.find();
    }
    return theGame[0];
}




async function startGame() {
    //check if the winnings total matches
    let winMatch = await checkWinningsTotal();
    if (!winMatch) throw Error("Winnings total does not match")

    //start the game
    let theGame = await getGame();
    theGame.isRunning = true;
    await theGame.save();

    //initialize the player's winnings maps
    let players = await Player.find();
    let myMap = {};
    for (let pla of players) {
        myMap[pla.id] = 0;
    }
    for (let pla of players) {
        pla.winnings = myMap;
        await pla.save();
    }

    const result  = await craftMasterObject();
    return result;
}
app.get(basePath + "game/start", (req, res) => {
    startGame()
        .then(game => res.json(game))
        .catch(err => {
            console.log("err:", err);
            res.status(400).send(err.toString())
        })
})




async function endGame() {
    let theGame = await getGame();
    theGame.isRunning = false;
    await theGame.save();

    const result  = await craftMasterObject();
    return result;
}
app.get(basePath + "game/end", (req, res) => {
    endGame()
        .then(game => res.json(game))
        .catch(err => {
            console.log("err:", err);
            res.status(400).send(err.toString())
        })
})


async function resetPlayers() {
    const players = await Player.find();
    for (let player of players) {
        player.set({
            deuces: 0,
            rank: null,
            isStillPlaying: true,
            deuceOwes: {}
        });
        await player.save();
    }
    let game = await getGame();
    game.moneyDistributed=false;
    await game.save();

    const result  = await craftMasterObject();
    return result;
}
app.get(basePath + "game/reset", (req, res) => {
    resetPlayers()
        .then(players => res.json(players))
        .catch(err => {
            console.log("err:", err);
            res.status(400).send(err.toString())
        })
})


app.get(basePath + "game/state", (req, res) => {
    getGame()
        .then(game => res.json(game))
})

async function setBet(bet) {
    let theGame = await getGame();
    if (theGame.isRunning) {
        throw Error("Cannot set bet while game is running")
    }
    theGame.bet = bet;
    await theGame.save();

    const result  = await craftMasterObject();
    return result;
}
app.post(basePath + "game/bet", jsonParser, (req, res) => {
    const {error, value} = postBet.validate(req.body);
    if (error) {
        return res.status(400).send(error.details[0].message)
    } else {
        setBet(value.bet)
            .then(game => res.json(game))
            .catch(err => res.status(400).send(err.toString()))
    }
})

async function createWinning(rank, percentage) {
    const theGame = await getGame();
    if (theGame.isRunning) throw Error("Cannot set winning while the game is running")
    const winnings = await Winning.find();
    for (let win of winnings) {
        if (win.rank === rank) {
            await Winning.deleteOne({_id: win.id});
        }
    }
    const newWinning = new Winning({
        rank: rank,
        winningsPercentage: percentage
    })
    await newWinning.save();

    const result  = await craftMasterObject();
    return result;
}
app.post(basePath + "game/winnings", jsonParser, (req, res) => {
    const {error, value} = postWinning.validate(req.body);
    if (error) {
        return res.status(400).send(error.details[0].message)
    } else {
        createWinning(value.rank, value.percentage)
            .then(winnings => res.json(winnings))
            .catch(err => res.status(400).send(err.toString()))
    }
})

app.get(basePath + "game/winnings", (req, res) => {
    Winning.find()
        .then(winnings => res.json(winnings))
        .catch(err => res.status(400).send(err.toString()))
})

async function deleteWinnings() {
    const theGame = await getGame();
    if (theGame.isRunning) throw Error("Cannot reset winnings while the game is running")
    let winnings = await Winning.find();
    for (let win of winnings) {
        await Winning.deleteOne({_id: win.id});
    }

    const result  = await craftMasterObject();
    return result;
}
app.get(basePath + "game/winnings/reset", (req, res) => {
    deleteWinnings()
        .then(winnings => res.json(winnings))
        .catch(err => res.status(400).send(err.toString()))
})

async function checkWinningsTotal() {
    const winnings = await Winning.find();
    const players = await Player.find();
    let total = 0;
    for (let win of winnings) {
        total += win.winningsPercentage;
    }
    total = total / 100;
    const result = total === players.length
    if (!result) {
        toast.error("Winnings do not match with number of players!")
    }
    return result
}

/**
 * Call this function to find the most ideal recipient of a debt.
 * The most ideal recipient is the one that in turn owes the most money to the donor, so the most debt is canceled out.
 * @param donor{Player} The Player that owes money
 * @returns {Promise<Player>} The Player that owes the most money to the donor
 */
async function findMostSuitableRecipient(donor){
    const players = await Player.find();
   let highscore = 0;
   let highestScoring = await players.find(player=>player.winnings.get("pot")>0&&player.entitledTo>player.assignedTo);
   for(let player of players){
       if(player.winnings.get("pot")>0&&player.entitledTo>player.assignedTo){
           if(player.winnings.get(donor.id)>=highscore){
               highestScoring=player;
               highscore=player.winnings.get(donor.id);
           }
       }
   }
   return highestScoring;
}
async function calculateEarnings() {
    const winnings = await Winning.find();
    let players = await Player.find();
    const game = await getGame();
    const master = await craftMasterObject();

    if (game.moneyDistributed) return master;

    //check if game is still running
    if (game.isRunning) throw Error("cannot calculate earnings while game is still running")

    //check if all players have been assigned a rank
    for (let pla of players) {
        if (!pla.rank) throw Error("All players need to have a rank assigned to calculate the earnings")
        else{
            pla.assignedTo=0;
            pla.entitledTo=winnings.find(win=>win.rank===pla.rank)?winnings.find(win=>win.rank===pla.rank).winningsPercentage-100:-100;
        }
    }

    //calculate the winnings per rank
    for (let pla of players) {
        const rank = pla.rank;
        for (let rk of winnings) {
            if (rk.rank === rank) {
                const factor = rk.winningsPercentage / 100;
                const win = game.bet * factor;
                pla.winnings.set("pot", win);

            }
        }
        if (!pla.winnings.get("pot")) pla.winnings.set("pot", 0)
        await pla.save();
    }
    players = await Player.find();


    //subtract the bet from each pot win
    for (let pla of players){
        pla.winnings.set("pot", pla.winnings.get("pot")-game.bet)
        await pla.save();
    }
    players = await Player.find();


    //distribute the pot entitlements from the other players
    for(let pla of players){//for every player in the list
        if(pla.winnings.get("pot")<0){ //find a player who owes money
            while(pla.entitledTo<pla.assignedTo){//while he has not been assigned all the debt he owes
                const recipient = await findMostSuitableRecipient(pla);//find any player who is entitled to more than he has
                recipient.winnings.set(pla.id, recipient.winnings.get(pla.id)+game.bet);//increase the amount the owing player pays the recipient by one bet
                recipient.assignedTo=recipient.assignedTo+100;//set the amount the recipient has been assigned
                await recipient.save()//save the recipient
                pla.assignedTo = pla.assignedTo-100;//set the amount the donor has been assigned
            }
            await pla.save();//save the donor
        }
    }
    players = await Player.find();

    //normalize the payments among the players
    for (let player of players) {
        for (let item of player.winnings) {
            if (item[0] !== player.id && item[0] !== "pot") {
                const otherPlayer = await Player.findById(item[0]);
                let thisPlayersCredit = item[1];
                let otherPlayersCredit = otherPlayer.winnings.get(player.id);
                const smallerNumber = thisPlayersCredit < otherPlayersCredit ? thisPlayersCredit : otherPlayersCredit;
                thisPlayersCredit -= smallerNumber;
                otherPlayersCredit -= smallerNumber;
                player.winnings.set(item[0], thisPlayersCredit);
                otherPlayer.winnings.set(player.id, otherPlayersCredit);
                await player.save();
                await otherPlayer.save();
            }

        }
    }


    game.moneyDistributed=true;
    await game.save();
    const result  = await craftMasterObject();
    return result;
}
app.get(basePath + "game/earnings", (req, res) => {
    calculateEarnings()
        .then(earnings => res.json(earnings))
        .catch(err => {
            console.log(err);
            res.status(400).send(err.toString());
        })
})

async function craftMasterObject(){
    const game = await getGame();
    const players = await Player.find();
    const winnings = await Winning.find();
    const result = {
        game: game,
        players: players,
        winnings: winnings
    };
    return result;
}
app.get(basePath + "game", (req,res)=>{
    craftMasterObject()
        .then(earnings => res.json(earnings))
        .catch(err => res.status(400).send(err.toString()))
})

async function setDeuceEarnings(amount){
    let game = await getGame();
    game.deuceEarnings = amount;
    await game.save();
    const result = await craftMasterObject();
    return result;
}
app.post(basePath + "game/deuceearnings", jsonParser, (req, res) => {
    const {error, value} = postDeuce.validate(req.body);
    if (error) {
        return res.status(400).send(error.details[0].message)
    } else {
        setDeuceEarnings(value.amount)
            .then(result => res.json(result))
            .catch(err => res.status(400).send(err.toString()))
    }
})

async function scrubDB(){
    try {
        await mongoose.connection.db.dropCollection("games");
        await mongoose.connection.db.dropCollection("players");
        await mongoose.connection.db.dropCollection("winnings");
    }catch (err){
        console.log(err);
    }
}
app.get(basePath+"db/scrub/9dsNRiVgu4QEc43MNq1SJAxvdg3dI", (req,res)=>{
    scrubDB()
        .then(earnings => res.json(earnings))
        .catch(err => res.status(400).send(err.toString()))
})

//START EXPRESS
app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
