const {log} = require("./mosh/logger");
const EventEmitter = require("events");


const emitter = new EventEmitter();

emitter.on("myEvent", (msg)=>{
    console.log("listener called" , msg?" with custom message: "+ msg:"");
})
emitter.emit("myEvent", "Hello event");
emitter.emit("myEvent")

console.log();
