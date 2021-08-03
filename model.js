'use strict';

const express = require('express');
const mongoose = require("mongoose");
const Joi = require("joi");
const bodyParser = require("body-parser");

// SET UP EXPRESS
const PORT = process.env.PORT || 8888;
const HOST = '0.0.0.0';
const app = express();
const basePath = "/api/";
console.log("HELLO")
const jsonParser = bodyParser.json();
console.log("world");

//SET UP MONGOOSE
mongoose.connect('mongodb://localhost/winnings')
    .then(()=>console.log("connected to mongodb"))
    .catch(err=>console.log("Connection to mongodb failed", err));


const playerSchema = new mongoose.Schema({
    name: String,
    rank: {type: Number, default:null},
    deuces: {type:Number, default:0},
    isStillPlaying: {type:Boolean, default:true}
});

const winningsSchema = new mongoose.Schema({
    rank: Number,
    winnings: Number
})

const Player = mongoose.model('Player', playerSchema);
const Winning = mongoose.model('Winning', winningsSchema);
/*
const defaultPlayer = new Player({
    name: "some other Player Name"
});

defaultPlayer.save()
    .then(res=>console.log("result of save operation: ", res))
*/

//Joi schemas
const postPlayer = Joi.object({
    name: Joi.string().required().alphanum().max(15).truncate()
});

//REST CALLS
app.get(basePath + "players", (req, res) => {
    Player.find()
        .then(players=>res.json(players))
});

app.get(basePath+"players/:id", (req, res) =>{
    Player.findById(req.params.id)
        .then(player=>res.json(player))
        .catch(err=> {
            console.log(err);
            return res.status(404).send("Player not found")
        })
    });

app.post(basePath+"players",jsonParser, (req, res)=>{
    const {error, value} = postPlayer.validate(req.body);
    if(error){
        return res.status(400).send(error.details[0].message)
    } else {
        const newPlayer = new Player({
            name: value.name
        });
        newPlayer.save()
            .then(result=>res.json(result))
    }
});


async function togglePlayingStatus(id){
    let player = await Player.findById(id);
    if(!player){
        throw Error("Player not found")
    }

}
app.get(basePath+"players/togglePlaying/:id", (req, res) =>{
    togglePlayingStatus(req.params.id)
        .then(players=>res.json(players))
        .catch(err=>res.status(400).send(err))
});

//START EXPRESS
app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
