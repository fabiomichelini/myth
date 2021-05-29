#!/usr/bin/env node

'use strict';

 
const https = require('https');
const socket = require('socket.io');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const fileuploadMiddleware = require('express-fileupload');
const cookiesMiddleware = require('cookie-parser');
const nunjucks = require('nunjucks');
const utils = require('./served/js/utils');
const settings = require('./served/js/settings');

const lll = utils.debugInConsole;

let remainigStorage = settings.AVAILABLE_STORAGE;


/**********************************
* deploy http and ws servers
**********************************/


let key;
let cert;
let domain;
let port;
let requestCert;
let rejectUnauthorized;


if (process.env.NODE_ENV === 'development')
{
    domain = 'localhost';
    port = 5000;
    key  = fs.readFileSync(path.join(__dirname, '/private/sslcert/key.pem'), 'utf8'); // generate your own key for development
    cert = fs.readFileSync(path.join(__dirname, '/private/sslcert/cert.pem'), 'utf8'); // generate your own key for development
    requestCert = false;
    rejectUnauthorized = false;
} 
else 
{
    domain = 'localhost';
    port = 5000;
    key  = fs.readFileSync('/etc/letsencrypt/live/www.corsoservices.net/privkey.pem', 'utf8');
    cert = fs.readFileSync('/etc/letsencrypt/live/www.corsoservices.net/cert.pem', 'utf8');
    requestCert = false;
    rejectUnauthorized = false;
}

let app = express();

let httpsServer = https.createServer({

    key: key,
    cert: cert,
    requestCert: requestCert,
    rejectUnauthorized: rejectUnauthorized

}, app);

let socketServer = socket(httpsServer);


/**********************************
* sessions and users
**********************************/


const SESSION_ANONYMOUS = false;
const ROLLING_SESSION = true;
const SESSION_MAX_AGE = 60 * 60 * 1000; // 1h
const LOGIN_RETRY_PAUSE = 5000; // 5s

let users = JSON.parse(fs.readFileSync('users.json'));
let rooms = JSON.parse(fs.readFileSync('rooms.json'));
let sessions = {};
let guests = {};

function sessionMiddleware(req, res, next) 
{    
    let sid;
    let session;
    
    sid = req.cookies && req.cookies.sid || null;
    
    if (!sid || sid in sessions === false) 
    {        
        if (SESSION_ANONYMOUS) 
        {            
            sid = utils.generateToken();
            
            session = {
                id: sid,            
                user: undefined,
                started: Date.now(),
            }
            sessions[sid] = session;
            
            res.cookie('sid', sid, { secure: true, httpOnly: true, expires: undefined });
        }
        else if (sid) 
        {            
            res.clearCookie('sid');
        }
    } 
    else 
    {        
        session = sessions[sid];

        if (session.user && ROLLING_SESSION) 
        {
            res.cookie('sid', sid, { secure: true, httpOnly: true, maxAge: SESSION_MAX_AGE });
        }
    }
    req.session = session;

    next();
}


/**********************************
* templates rendering
**********************************/


nunjucks.configure('templates', { autoescape: true });


/**********************************
* translation
**********************************/


function translator(text) 
{
    // TODO
    return text;
}
const _ = translator;


/**********************************
* before middlewares stack
**********************************/


app.use('/favicon.ico', express.static(path.join(__dirname, '/served/favicon.ico')));
app.use('/robots.txt', express.static(path.join(__dirname + '/served/robots.txt')));
app.use('/sitemap.xml', express.static(path.join(__dirname + '/served/sitemap.xml')));
app.use('/served', express.static(path.join(__dirname + '/served')));
app.use('/media', express.static(path.join(__dirname + '/media')));
app.use(express.urlencoded({extended: true}));
app.use(fileuploadMiddleware({
    limits : { fileSize: settings.MAX_UPLOAD_SIZE },
    abortOnLimit : true,
    useTempFiles : true,
    safeFileNames : true,
    tempFileDir : '/tmp/',
}));
app.use(cookiesMiddleware());
app.use(sessionMiddleware);
app.use((err, req, res, next) => 
{
    lll(err)
    res.status(500).send('Server error. ${err}');

    next();
});
app.use((req, res, next) => 
{
    res.context = {};

    res.context._ = _;
    res.context.user = req.session && req.session.user || null;

    next();
});
  
  
/**********************************
* http ctrls
**********************************/


const PERMIT_ANONYMOUS_GUEST = true;
const PERMIT_ANONYMOUS_OPENER = false;
const MAX_ROOMS = 100;


app.get('/', (req, res, next) => 
{
    res.context.title = 'Home';
    res.context.rooms = req.session && req.session.user && [] || [];

    res.send(nunjucks.render('index.html', res.context));
});

app.all('/login', (req, res, next) => 
{
    let status = 200;
    let errors = null;

    if (req.session && req.session.user) 
    {
        res.context.title = 'Message';        
        res.context.msg = 'You are already logged in.';
        res.context.next = '/';

        res.status(403).send(nunjucks.render('message.html', res.context));
        return;
    }

    if (req.method === 'POST') 
    {
        if (req.body.username && req.body.password) 
        {            
            let user = users.find(u => { return u.username == req.body.username });
                                
            if (user) 
            {                
                if (user.status === 'ACTIVE') 
                {
                    if (user.password === utils.getDigest(req.body.password)) 
                    {
                        status = null;

                        if (!SESSION_ANONYMOUS) 
                        {
                            let sid = utils.generateToken();                    
                            let session = {
                                id: sid,
                                started: Date.now(),
                            }
                            sessions[sid] = session;
                            req.session = session;
                        }

                        req.session.logged = Date.now();
                        req.session.user = user;

                        res.cookie('sid', req.session.id, { secure: true, httpOnly: true, maxAge: SESSION_MAX_AGE });     
                        res.redirect(req.query.next && decodeURIComponent(req.query.next) || '/');    

                        return;
                    } 
                    else 
                    {                        
                        let dummy;

                        dummy = user.status;
                        user.status = 'LOCKED';
                        utils.wait(LOGIN_RETRY_PAUSE); // TODO: promisify
                        user.status = dummy;

                        status = 403;
                        errors = 'Username or password not valid, retry.';
                    }
                } 
                else if (['PENDING','SUSPENDED'].includes(user.status)) 
                {
                    res.context.msg = 'Your account is in ' + user.status + ' status. Please contact site administrator.';
                    res.context.next = '/';

                    res.status(403).send(nunjucks.render('message.html', res.context));
                    return;
                } 
                else 
                {
                    res.context.msg = 'Your account is in ' + user.status + ' status. Please contact site administrator.';
                    res.context.next = '/';
                    
                    res.status(403).send(nunjucks.render('message.html', res.context));
                    return;
                }
            } 
            else 
            {
                utils.wait(LOGIN_RETRY_PAUSE); // TODO: promisify

                status = 403;
                errors = 'Username or password not valid, retry.';
            }     
        }
    }
    res.context.title = 'Login';
    res.context.errors = errors;
    
    res.status(status).send(nunjucks.render('login.html', res.context));
});

app.get('/logout', (req, res, next) => 
{
    if (req.session && req.session.logged) 
    {
        if (SESSION_ANONYMOUS) 
        {
            req.session.logged = false;
            req.session.user = undefined;
            res.cookie('sid', req.session.id, { secure: true, httpOnly: true, expires: undefined });
        }
        else 
        {
            delete sessions[req.session.id];
            delete req.session;
            res.clearCookie('sid');
        }
    }
    res.redirect('/');    
});

app.get('/download', (req, res, next) => 
{
    let fileurl = decodeURIComponent(req.query.fileurl);

    res.type('application/octet-stream');
    res.download(__dirname + fileurl);
});

app.get('/room', (req, res, next) => 
{
    res.redirect('/room/' + utils.generateToken());    
    return;
});

app.all('/room/:roomId', (req, res, next) => 
{
    let user = req.session && req.session.user || null;
    let room = rooms[req.params.roomId] || null;

    if (!PERMIT_ANONYMOUS_GUEST && !user || !PERMIT_ANONYMOUS_OPENER && !room && !user)
    {
        const next = `/room/${req.params.roomId}`;
        res.redirect(302, `/login?next=${encodeURIComponent(next)}`);
        return;
    }
    
    /* redirect if new guest paste shared room invite/url  */

    if (req.method === 'GET') 
    {        
        res.context.title = 'Setup';
        res.context.rooms = user && user.rooms.map(rId => { return rooms[rId] }) || [];
        res.context.roomId = req.params.roomId;
        res.context.room = room;
        res.context.roomName = room && room.name || 'room-' + req.params.roomId;
        res.context.roomMode = room && room.mode || 'democratic';
        res.context.guestId = user && user.id || utils.generateToken();
        res.context.guestName = user && user.firstname + ' ' + user.surname || 
                                req.cookies && req.cookies.guestName || 
                                '';

        res.send(nunjucks.render('setup.html', res.context));        
    }
    else if (req.method === 'POST') 
    {
        if (room && room.status === 'locked')
        {
            res.redirect(303, `/room/${req.params.roomId}`);
            return;
        }

        if (user && user.rooms.includes(req.body.roomRadioOpt)) 
        {
            if (req.body.roomRadioOpt === req.params.roomId) 
            {
                res.context.roomId = req.body.roomRadioOpt;
                res.context.roomName = rooms[req.body.roomRadioOpt].name;
                res.context.roomMode = rooms[req.body.roomRadioOpt].mode;            
            } 
            else 
            {
                res.redirect(307, `/room/${req.body.roomRadioOpt}`);                
                return;
            }            
        } 
        else 
        {
            res.context.roomId = req.params.roomId;
            res.context.roomName = req.body.roomName;
            res.context.roomMode = req.body.roomMode;
        }
        res.context.guestId = user && user.id || req.body.guestId;
        res.context.guestName = user && (user.firstname + ' ' + user.surname) || req.body.guestName;
        res.context.roomLeaderId = room && room.leaderId || res.context.guestId;

        res.send(nunjucks.render('room.html', res.context));
    }
});

app.all('/waiting/:roomId', (req, res, next) => 
{    
    res.redirect(307, `/room/${req.params.roomId}`);
});


/**********************************
* ws ctrls
**********************************/


socketServer.of('waiting').on('connection', (sock) => 
{
    const roomId = sock.handshake.query.roomId || null;
    const room = roomId && rooms[roomId] || null;
    const guestName = sock.handshake.query.guestName || null;
    
    if (room && guestName)
    {
        socketServer.to(room.id).emit('knocking-door', guestName);lll(2);
    }
    else
    {
        sock.disconnect(true);
        return;
    }    
});

socketServer.on('connection', (sock) => {
    
    const cookies = sock.request.headers.cookie && utils.parseCookie(sock.request.headers.cookie);
    const sid = cookies && cookies.sid || null;
    const session = sid && sessions[sid] || null;
    const user = session && session.user || null;
    const roomId = sock.handshake.query.roomId || null;

    const roomName = sock.handshake.query.roomName || null;
    const roomMode = sock.handshake.query.roomMode || null;
    const guestId = sock.handshake.query.guestId || null;
    const guestName = sock.handshake.query.guestName || null;
    
    let room = roomId && rooms[roomId] || null;
    let guest = {};

    /* check */
    
    if (!roomId || !roomName || !roomMode || !guestId || !guestName) 
    {
        sock.emit('error', 'Fault guest and/or room data.');
        sock.disconnect(true);
        return;
    }
    if (guestId in guests)  
    {
        sock.emit('error', 'Guest already present in some room.');
        sock.disconnect(true);
        return;
    }
    if (user && user.id !== guestId) 
    {
        sock.emit('error', 'Guest and user not matching.');
        sock.disconnect(true);
        return;
    }
    if (room && room.private && room.registered.includes(guestId) === false) 
    {
        sock.emit('error', 'Guest not registered in this private room.');
        sock.disconnect(true);
        return;
    }
    if (!room && Object.keys(rooms).length === MAX_ROOMS) 
    {
        sock.emit('error', 'Rooms limits achived.');
        sock.disconnect(true);
        return;
    }

    /* define guest */

    guest = {

        id: guestId,
        name: user && (user.firstname + ' ' + user.surname) || guestName,
        socket: sock,   
    };
    guests[guest.id] = guest;
    
    /* define room if not exists */

    if (!room) 
    {
        rooms[roomId] = room = {

            id: roomId,
            name: roomName,
            mode: roomMode,
            leaderId: roomMode === 'leaded' && guest.id || null,
            type: 'volatile',
            guests: [],
            private: false,
            registered: [],
            status: 'unlocked',
        };
        try 
        {
            fs.mkdirSync(path.join(__dirname, '/media/', room.id));

        } catch (err) 
        {
            if (err.code === 'EEXIST') 
            {

            }
            lll(err);
        }
    }

    sock.join(room.id);
    room.guests.push(guest.id);

    /* define generic info function */

    function info() 
    {
        let info = {};

        info.guests = [];
        room.guests.forEach(gId => 
        {
            info.guests.push({
                id: gId,
                name: guests[gId].name,
            })
        });
        info.room = {
            id: room.id,
            name: room.name,
            mode: room.mode,
            private: room.private,
            leaderId: room.leaderId,
        }
        socketServer.to(room.id).emit('info', info);

        lll('sharing info from ' + guest.id);
    }

    /* listeners */

    sock.on('info', () => 
    {        
        info();
    });
    
    sock.on('webrtc-description', (to, description) => 
    {
        sock.to(guests[to].socket.id).emit('webrtc-description', guest.id, to, description);

        lll('description (' + description['type'] + ') sended from ' + guest.id + ' to ' + to);
    });

    sock.on('webrtc-ice', (to, ice) => 
    {
        sock.to(guests[to].socket.id).emit('webrtc-ice', guest.id, to, ice);
        
        lll('ice candidate sended from ' + guest.id + ' to ' +to);
    });

    sock.on('chat-msg', (to, msg) => 
    {
        if (to === 'all') 
        {
            socketServer.to(room.id).emit('chat-msg', guest.id, to, msg);
        }
        else 
        {
            sock.to(guests[to].socket.id).emit('chat-msg', guest.id, to, msg);
        }
        lll('chat message sended from ' + guest.id + ' to ' + to);
    });

    sock.on('chat-upload', (to, name, size, type, ab) => 
    {        
        if (size > settings.MAX_UPLOAD_SIZE || size > remainigStorage) 
        {
            lll('chat upload ' + name + ' exceeding size');
            return;
        }
        let secureFilename = `${utils.generateToken()}.${name}`;
        let absolutePath = path.join(__dirname, '/media/', room.id, secureFilename);
        let url = path.join('/media/', room.id, secureFilename);

        fs.writeFileSync(absolutePath, ab);

        remainigStorage = remainigStorage - size;

        if (to === 'all') 
        {
            socketServer.to(room.id).emit('chat-upload-url', guest.id, to, url, name, type, remainigStorage);
        }
        else 
        {
            sock.to(guests[to].socket.id).emit('chat-upload-url', guest.id, to, url, name, type, remainigStorage);
        }
        lll('chat upload url sended from ' + guest.id + ' to ' + to);
    });

    sock.on('changed-guestname', (newGuestName) => 
    {
        guest.name = newGuestName;

        // update cookie
        
        sock.to(room.id).emit('changed-guestname', guest.id, newGuestName);
        
        lll('changed name by ' + guest.id + ' in ' + newGuestName);
    });

    sock.on('start-stop-metronome', (to, bpm, beats) => 
    {
        if (to === 'all') {

            sock.to(room.id).emit('start-stop-metronome', guest.id, bpm, beats);
        }
        else {

            sock.to(guests[to].socket.id).emit('start-stop-metronome', guest.id, bpm, beats);
        }        
        lll('started/stopped metronome');
    });

    sock.on('lock-unlock', (roomStatus) => 
    {
        if (room.mode === 'leaded' && guest.id === room.leaderId) room.status = roomStatus;

        if (roomStatus === 'unlocked')
        {
            socketServer.of('waiting').emit('room-unlocked', room.id); // TODO: ...to waiting
        }
    });

    sock.on('disconnecting', (reason) => 
    {
        lll('Guest ' + sock.id + ' disconnecting.');
    });

    sock.on('disconnect', (reason) => 
    {        
        /* exit all guests if leader or just exit guest */

        if (room.mode === 'leaded' && guest.id === room.leaderId) 
        {
            sock.to(room.id).emit('room-closing');

            room.guests.forEach(gId => 
            {
                if (gId !== guest.id) guests[gId].socket.disconnect(true);
                delete guests[gId];
            });
            room.guests = [];

        } 
        else 
        {
            sock.to(room.id).emit('guest-disconnect', guest.id);
            room.guests.splice(room.guests.indexOf(guest.id), 1);
            delete guests[guest.id];
        }
        guest = null;

        if (room.guests.length === 0 && room.type !== 'persistent') 
        {
            try 
            {
                cp.execSync(`rm -rf ${__dirname}/media/${room.id}`);

            } 
            catch (err) 
            {
                if (err.code === 'ENOENT') 
                {

                }
                lll(err);
            }
            delete rooms[room.id];
            room = null;
        }        
        lll('Guest ' + sock.id + ' disconnect.');
    });
    
    /* info new guest */

    info();
});


/**********************************
* start server
**********************************/


httpsServer.listen(port, () => lll('server running on port ' + port));


