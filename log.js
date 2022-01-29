"use strict";
const config = require("./log_config.json")

function trace(s) {
    if( config.traceOn ) {        
        output( "TRA: "+s)
    }
}

function info(s) {
    if( config.infoOn ) {        
        output( "INF: "+s)
    }
}

function error(s) {
    if( config.errorOn ) {        
        output( "ERR: "+s)
    }
}


function output(s) {
    console.log( s )
}


module.exports.trace = trace
module.exports.info = info
module.exports.error = error
module.exports.config = config

