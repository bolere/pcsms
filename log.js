"use strict";
//const config = require("./log_config.json")


let traceOnFlag = true
let infoOnFlag = true
let errorOnFlag =true


module.exports.trace = (s)=>{
    if( traceOnFlag ) {        
        output( "TRA: "+s)
    }
}

module.exports.traceOn = ()=>{
    traceOnFlag = true
}

module.exports.traceOff = ()=>{
    traceOnFlag = false
}


module.exports.info = (s)=>{
    if( infoOnFlag ) {        
        output( "INF: "+s)
    }
}

module.exports.infoOn = ()=>{
    infoOnFlag = true
}

module.exports.infoOff = ()=>{
    infoOnFlag = false
}


module.exports.error = (s)=>{
    if( errorOnFlag ) {        
        output( "ERR: "+s)
    }
}

module.exports.errorOn = ()=>{
    errorOnFlag = true
}

module.exports.errorOff = ()=>{
    errorOnFlag = false
}


function output(s) {
    console.log( s )
}


