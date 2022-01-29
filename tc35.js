"use strict";

const config = require("./tc35_config.json")
const L = require("./log.js")
const serialPort = require("serialport");
let event = require("events");

//L.config.traceOn = false

let dataInEmitter = new event.EventEmitter()

let myPort = null
let initDoneFlag = false
let sbuf = ""

const list = () => {
    return new Promise((resolve,reject) => {
        serialPort.list()
        .then( function(ports){
            ports.forEach(port => L.trace(port.path))
            resolve()
        })
    })
}


async function init() {       
    L.trace("TC35 Init...")

    L.trace("Avail ports:")
    await list()
    L.trace("list end\n")

    L.info(`opening port ${config.port} at ${config.baud}`)
    myPort = new serialPort( config.port , config.baud )

    myPort.on('open', ()=>{L.trace("Serial port open")})
    myPort.on('data', datain)
    myPort.on('close', ()=>{L.trace("Serial port close")})
    myPort.on('error', ()=>{L.trace("Serial port error")})
    
    try {
        await sendCommand("AT+CMGF=1\r")
        await waitForOk()
                
        await sendCommand("AT+CPIN?\r")
        await waitForOk()
        if( ! sbuf.includes("+CPIN: READY") ) {
            await sendCommand("AT+CPIN=\""+config.pin+"\"\r")
            await waitForOk(5000)
            await sendCommand("AT+CPIN?\r")
            await waitForOk()
            if( ! sbuf.includes("+CPIN: READY") ) throw("PIN not ready after setPin")
        }    
        L.info("TC35 Initialisation ok!")
        initDoneFlag = true;
        
    }
    catch(err) {
        initDoneFlag = false;
        L.error("Error initializing TC35: "+err)
        throw( "Error initializing TC35: "+err )        
    }                  
}


async function reciveAllSMS() {
    return await reciveSMS(true)
}

async function reciveSMS(all=false) {
    if( ! initDoneFlag ) return false;
    L.trace("Checking for new SMS")
    let SMSList = []
    try {
        await sendCommand("AT+CMGL=\"ALL\"\r")
        await waitForOk(30000)

        let ss = sbuf
        let idx = ss.indexOf("\r\n+CMGL: ")
        while( idx != -1 ) {
            idx += 2; //Peger på +CMGL 
            ss = ss.substring(idx)
            let sms = parseSMS(ss)            
            if(sms !== null) SMSList.push(sms)
            idx = ss.indexOf("\r\n+CMGL: ")

            //delete SMS
            await sendCommand("AT+CMGD="+sms.id+"\r")
            await waitForOk(5000)
            L.trace("SMS "+sms.id+" deleted")

            if(all === false) {
                return sms
            }
        }
        L.trace("Recive ok")
        return SMSList
    }
    catch(err) {
        L.error(`Error reciving SMS: ${err}`)
        return null
    }
}


function parseSMS(ss) {
    let sms = makeSMSObj()
    //let sms = { "number" : "", "id"     : null, "time"   : null, "text"   : null, "direction" : "" }

    let index = 0

    if( ! ss.startsWith("+CMGL: ") ) {
        L.error("Illegal start of SMS in parseSMS")
        return null
    }

    let s
    getBlock(":")
    s = getBlock(",")
    sms.id = parseInt(s)
    if( isNaN( sms.id ) ) return null
    sms.id = ""+sms.id

   
    s = getBlock(",")
    s = getBlock(",")
    if( s === null ) return null
    sms.number = s.substring(1, s.length-1 )

    s = getBlock(",")
    s = getBlock("\r")
    let pi = s.indexOf("+")
    if( pi === -1 ) {
        pi = s.length
    }
    sms.time = s.substring(1,pi)

    s = getBlock("\n")
    
    let text = ss.substring(index);
    let textend = text.indexOf("\r\n")
    if( textend !== -1 ) {
        sms.text = text.substring(0,textend)
    }

    let ttext = sms.text
    sms.text = ""
    for(let i =0;i<ttext.length;i++) {
        switch(ttext.charCodeAt(i)) {
            case 0x1d: sms.text += 'æ'; break;
            case 0x0c: sms.text += 'ø'; break;
            case 0x0f: sms.text += 'å'; break;
            case 0x1c: sms.text += 'Æ'; break;
            case 0x0b: sms.text += 'Ø'; break;
            case 0x0e: sms.text += 'Å'; break;
            default: sms.text += ttext.charAt(i);
        }
    }


    sms.direction = "in"

    return sms

    function getBlock(delim) {
        let rs = ""
        while(1) {
            if( index === ss.length ) return null
            if( ss.charAt(index) === delim ) {
                if( index < (ss.length-1) ) index++ 
                return rs
            }
            rs += ss.charAt(index)
            index ++
        }
    }


}


async function sendSMS(reciver,text) {
    L.trace(`Sending sms to ${reciver}: ${text}` )
    
    try {

        let ttext = text
        text = ""
        for(let i =0;i<ttext.length;i++) {
            switch(ttext.charAt(i)) {
                case 'æ': text += String.fromCharCode(0x1d); break;
                case 'ø': text += String.fromCharCode(0x0c); break;
                case 'å': text += String.fromCharCode(0x0f); break;
                case 'Æ': text += String.fromCharCode(0x1c); break;
                case 'Ø': text += String.fromCharCode(0x0b); break;
                case 'Å': text += String.fromCharCode(0x0e); break;
                default: text += ttext.charAt(i);
            }
        }

        await sendCommand("AT+CSMP=17,167,0,0\r")
        await waitForOk()

        if( text.length > 160) text = text.substr(0,160)        

        await sendCommand("AT+CMGS=\"" + reciver + "\"\r")
        await waitForPrompt(1000,"> ")            
        
        await sendCommand(text)

        let endBuf = String.fromCharCode(0x1a) + "\r"        
        await sendCommand(endBuf)
        await waitForOk(10000)

        let pos = sbuf.indexOf("\r\n+CMGS: ")+"\r\n+CMGS: ".length
        let ss = sbuf.substr(pos)
        let yy =""
        for(let i=0;i<ss.length;i++) {  
            if(ss.charAt(i) < "0" ) break;  
            if(ss.charAt(i) > '9' ) break;  
            yy+=ss.charAt(i); 
        }
        let smsID = parseInt(yy)

        L.info("SMS Send ok. ID: "+smsID+" text: " + text)
        return smsID
    }
    catch(err) {
        L.error(`Error sendingh SMS: ${err}`)
    }
}   



function datain( d ) {
    d = "" + d
    sbuf += d
    print(sbuf)
    dataInEmitter.emit("data")
    return

    function print(ss) {
        let os = `Serial port data (${ss.length}): ${ss}  ( `
    
        for(let p=0; p<ss.length; p++) {
            os += ss.charCodeAt(p)    
            os +=  " "
        }
        os += ")"
    }
}



function waitForPrompt(waitms = 1000,prompt) {
    return new Promise((resolve,reject) => {   //Skal vi egentligt ikke tjekke for OK og ERROR her, hvis data er kommet inden vi setter event listener op
        let t = setTimeout( ()=>{
            reject("Timeout")
        } , waitms )

        dataInEmitter.on("data",()=>{        
            if( sbuf.includes(prompt) ) {
                dataInEmitter.removeAllListeners()
                clearTimeout(t)
                resolve()
            }
            if( sbuf.includes("ERROR") ) {
                dataInEmitter.removeAllListeners()
                clearTimeout(t)
                reject("Error waiting for: "+prompt)
            }
        })
    })
}



function waitForOk(waitms = 1000) {
    return new Promise((resolve,reject) => {   //Skal vi egentligt ikke tjekke for OK og ERROR her, hvis data er kommet inden vi setter event listener op
        let t = setTimeout( ()=>{
            reject("Timeout")
        } , waitms )

        dataInEmitter.on("data",()=>{        
            if( sbuf.includes("\r\nOK\r\n") ) {
                dataInEmitter.removeAllListeners()
                clearTimeout(t)
                resolve()
            }
            if( sbuf.includes("ERROR") ) {
                dataInEmitter.removeAllListeners()
                clearTimeout(t)
                reject("Error")
            }
        })
    })
}


function sendCommand(odat) {        
    sbuf = ""    
    myPort.write(odat)     
}


function makeSMSObj() {
    return {
        "number"    : "",
        "id"        : null,
        "time"      : null,
        "text"      : null,
        "direction" : ""
    }    
}


module.exports.makeSMSObj = makeSMSObj
module.exports.init = init
module.exports.sendSMS = sendSMS
module.exports.reciveSMS = reciveSMS
module.exports.reciveAllSMS = reciveAllSMS

