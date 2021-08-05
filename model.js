'use strict';

const express = require('express');
const mongoose = require("mongoose");
const Joi = require("joi");
const bodyParser = require("body-parser");
const cors = require("cors");

// SET UP EXPRESS
const PORT = process.env.PORT || 8888;
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
    isStillPlaying: {type: Boolean, default: true}
});

const winningsSchema = new mongoose.Schema({
    rank: Number,
    winningsPercentage: Number,
    winningsAmount: {type: Number, default: null},
    player: {type: String, default: null}

})

const gameSchema = new mongoose.Schema({
    isRunning: {type: Boolean, default: false},
    bet: {type: Number, default: 5}
})

const Player = mongoose.model('Player', playerSchema);
const Winning = mongoose.model('Winning', winningsSchema);
const Game = mongoose.model("Game", gameSchema);

//Joi schemas
const postPlayer = Joi.object({
    name: Joi.string().required().alphanum().max(15).truncate()
});
const postBet = Joi.object({
    bet: Joi.number().integer().positive()
})
const postWinning = Joi.object({
    rank: Joi.number().integer().positive(),
    percentage: Joi.number().integer().greater(-1)
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
    let theGame = await Game.find();
    theGame = theGame[0];
    if (theGame.isRunning) {
        throw Error("Cannot add a player while the game is running")
    }
    const newPlayer = new Player({
        name: playerName
    });
    await newPlayer.save();
    const players = await Player.find();
    return players;
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
    const players = await Player.find();
    return players;
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
    const players = await Player.find();
    return players;
}

app.get(basePath + "players/togglePlaying/:id", (req, res) => {
    togglePlayingStatus(req.params.id)
        .then(players => res.json(players))
        .catch(err => res.status(400).send(err.toString()))
});

async function addDeuce(id) {
    let player = await Player.findById(id);
    if (!player) {
        throw Error("Player not found");
    }
    let theGame = await Game.find();
    theGame = theGame[0];
    if (!theGame.isRunning) {
        throw Error("Cannot add deuce if the game is not running")
    }
    if (player.isStillPlaying) {
        player.deuces++;
    } else throw Error("Cannot increment deuce count of inactive player")
    await player.save()
    const players = await Player.find();
    return players;
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
    let theGame = await getGame();
    theGame.isRunning = true;
    await theGame.save();
    theGame = await getGame();
    return theGame;
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
    theGame = await getGame();
    return theGame;
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
    let players = await Player.find();
    for (let player of players) {
        player.set({
            deuces: 0,
            rank: null,
            isStillPlaying: true
        });
        await player.save();
    }
    const updatedPlayers = await Player.find();
    return updatedPlayers;
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
    Game.find()
        .then(game => {
            let theGame = game[0];
            res.json(theGame);
        })
})

async function setBet(bet) {
    let theGame = await getGame();
    if (theGame.isRunning) {
        throw Error("Cannot set bet while game is running")
    }
    theGame.bet = bet;
    await theGame.save();
    theGame = await getGame();
    return theGame;
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
    const newWinnings = Winning.find();
    return newWinnings;
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

app.get(basePath + "game/winnings", (req,res)=>{
    Winning.find()
        .then(winnings=>res.json(winnings))
        .catch(err=> res.status(400).send(err.toString()))
})

//START EXPRESS
app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
