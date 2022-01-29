"use strict";

const tc35 = require("./tc35.js")
const L = require("./log.js")

const blockList = require("./blockList.json")
const config = require("./config.json")
const codes = require("./codes.json")
let Datastore = require("nedb")  
let SMSbox = new Datastore({ filename: "./Data/SMSbox.db", autoload: true });

let express = require("express")
let app = express()

let firewall = require("./firewall.json")

L.traceOff()


//Log all reuqests
app.use((req,res,cont)=>{    
    L.trace(req.method+" request from: "+req.socket.remoteAddress+" for \""+req.originalUrl+"\"")
    cont()
 })

 //Firewall
app.use((req,res,cont)=>{
    if( firewall.enabled) {
        let ip = req.socket.remoteAddress
        if( ! firewall.allowedIps.find( (fi)=>{
            if( fi === ip) return true
            return false
        }) ) {
            L.error("FIREWALL BLOCK ADDRESS: "+ip)
            req.socket.end()
            return;
        }
    }
    cont()
})



/*  SEND TEXT AS ROOT */
app.get('/', function(req,res){
    res.end("PCSSMS")
 })

app.get('/help',(req,res)=>{
    let r = ""
    r+= "commands:"
    r+= "\r\nsend/code/number/text"    
    r+= "\r\nreceive/code[/max_num]"    
    r+= "\r\nreceivehtml/code[/max_num]"
    res.end(r)
})


app.get('/receive/:code/:num', (req,res)=>{
    if(! testCode(req.params.code) ) {
        L.info("Wrong code")
        res.status(500).end("Wrong code")
        return
    }
    recieve_sms(req,res,req.params.num,res_json)
})

app.get('/receive/:code', (req,res)=>{
    if(! testCode(req.params.code) ) {
        L.info("Wrong code")
        res.status(500).end("Wrong code")
        return
    }
    recieve_sms(req,res,10,res_json)
})

app.get('/receivehtml/:code', (req,res)=>{
    if(! testCode(req.params.code) ) {
        L.info("Wrong code")
        res.status(500).end("Wrong code")
        return
    }
    recieve_sms(req,res,10,res_html)
})

app.get('/receivehtml/:code/:num', (req,res)=>{
    if(! testCode(req.params.code) ) {
        L.info("Wrong code")
        res.status(500).end("Wrong code")
        return
    }
    recieve_sms(req,res,req.params.num,res_html)
})



app.get('/send/:code/:reciver/:text', async (req,res)=>{    
    let code = req.params.code
    let reciver = req.params.reciver
    let text = req.params.text
    L.trace(`code: ${code} reciver: ${reciver} text: ${text}`)

    if(! testCode(code )) {
        L.info("Wrong code")
        res.status(500).end("Wrong code")
        return
    }

    //Test number
    if(! reciver.match( /^[2-9][0-9]{7}\b/) ) {
        if( ! reciver.match(/^45[2-9][0-9]{7}\b/) ) {
            if( ! reciver.match(/^\+45[2-9][0-9]{7}\b/) ) {
                L.info("Illegal reciever")
                res.status(500).end("Illegal reciever")
                return
            }
        }
    }
    
    //Truncate text    
    text = text.substr(0,160)
    let clean_text =""
    for(let i=0;i<text.length;i++) {
        if( ! testchar(text.charAt(i))) {
            clean_text += "."
        } else {
            clean_text += text.charAt(i)
        }
    }

    
    let resid = await tc35.sendSMS(reciver,clean_text)

    let smsObj = tc35.makeSMSObj()
    smsObj.number = reciver    
    let d = new Date()
    let y = ("" + d.getFullYear()).substr(2,2)
    smsObj.time = `${y}/${to2(d.getMonth()+1)}/${to2(d.getDate())},${to2(d.getHours())}:${to2(d.getMinutes())}:${to2(d.getSeconds())}`
    smsObj.text = clean_text
    smsObj.direction = "out"
    smsObj.id = ""+resid
    SMSbox.insert(smsObj)      

    res.end("OK")

    function to2(c) {
        c = ""+c    
        if( c.length === 1 ) c = "0"+c
        return c
    }

    function testchar( c) {
      if( c.match( /[a-zA-Z]/ ) ) return true
      if( c.match( /[0-9]/ ) ) return true
      if( c.match( /[æøåÆØÅ!"#¤%&/()=?\-\+\*,.;:\r\n \\]/) ) return true
       return false
    }
})

function testCode(code) {     
     if( ! codes.find( c=>{
        if( c.code === code) return true
        else return false
    } ) ) {        
        return false
    }
    return true
}




app.listen(config.listenPort,config.listenIP)

L.info(`Ready, listening for port ${config.listenPort} on IP ${config.listenIP}`)
//L.config.traceOn = true;

//get_sms()

start_inbox()

async function start_inbox() {
    await tc35.init()    
    getnStore()
    
    async function getnStore() {
        let SMSList = await tc35.reciveAllSMS()         
        SMSList.forEach(s=>{
            if(! blockList.numbers.find((n)=>{return n === s.number})) {
                SMSbox.insert( s )
                L.info(`New SMS: ${s.number} - ${s.time} - ${s.text}`  )
            }
            else L.trace(`SMS from ${s.number} included in blocklist`)
        })
        setTimeout(getnStore, config.receivePollTimer)
    }
}


function recieve_sms( req,res, num=10, outputfunction ) {
    SMSbox.find({}).sort( {time:-1} ).limit(num).exec( (err,docs)=>{
        if(err) {
            L.error("get_sms query error: "+ err)
            res.code(500).end("get_sms query error")        
        } else {
            outputfunction(req,res,docs)
        }
    })
}


function res_json(req,res,docs) {
    res.set({ 'content-type': 'application/json; charset=utf-8' })
    res.json(docs)
}

function res_html(req,res,docs) {

    let h = "<table><tr><th>Time</th><th>Number</th><th>Dir</th><th>Id</th><th>Text</th><tr>"
    docs.forEach(d=>{
        h += `<tr><td>${d.time}</td><td>${d.number}</td><td>${d.direction}</td><td>${d.id}</td><td>${d.text}</td><tr>`
    })
    h+="</table>"
    res.set({ 'content-type': 'text/html; charset=utf-8' })
    res.end(h)
}

