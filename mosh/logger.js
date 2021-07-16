let url = "https://mylogger.io/log";

/**
 *sends a message to the logger server
 * @param {String}message the message you want to log
 */
function log (message){
    //send HTTP request
    console.log("Sending message >"+ message+ "< to", url);
}

module.exports.log = log;
