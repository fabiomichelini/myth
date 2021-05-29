
'use strict';


/************************************************************
 * check browser capabilities and media sources constraints
 ************************************************************/


function omCheckBrowserCapabilities() 
{
    navigator.getUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia || navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || undefined;
    window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
    window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;
    window.audioContext = window.AudioContext || window.webkitAudioContext || mozAudioContext;

    if (navigator.getUserMedia === undefined || 
        window.RTCPeerConnection === undefined || 
        window.RTCIceCandidate === undefined || 
        window.RTCSessionDescription === undefined ||
        window.audioContext === undefined) {

        return 'Fault requirements (getUserMedia, WebRTC, audioContext).';
    } 
    else 
    {
        return true;
    }
}
 
if (!omCheckBrowserCapabilities()) 
{
    document.querySelector('.main-panel').innerHTML = 'Inadequate browser capabilities. Please use an updated chromium/chrome/firefox navigator.';
    throw new Error();
}

const SUPPORTED_CONSTRAINTS = navigator.mediaDevices.getSupportedConstraints();

const DEFAULT_CONSTRAINTS = { 

    /* ignored if not in SUPPORTED_CONSTRAINTS */

    audio: {
        channelCount : { ideal: 2 },
        sampleSize : { ideal: 16 },
        sampleRate : { ideal: 44100 },
        autoGainControl : true,
        echoCancellation : true,
        noiseSuppression : true,
    },
    video: {
        width: { min: 320, ideal: 1200, max: 1920 },
        frameRate: { max: 30 },
    } 
};  


/************************************************************
 * main
 ************************************************************/


const STATISTICS_LENGTH = 5;
const PEER_CONNECTION_CONFIG = {

    'iceServers':
    [
        {
            urls: 'stun:stun.services.mozilla.com',
            // username: '',
            // credential: '',
        }, 
        {
            urls: 'stun:stun.l.google.com:19302',
            // username: '',
            // credential: '',
        },
    ],
};
 
const lll = utils.debugInConsole;

let roomId = document.querySelector('.roomId').value;
let roomName = document.querySelector('.roomName').value;
let roomMode = document.querySelector('.roomMode').value;
let roomLeaderId = document.querySelector('.roomLeaderId').value;
let roomView = 'alone';
let roomStatus = 'unlocked';
let localGuestId = document.querySelector('.localGuestId').value;
let localGuestName = document.querySelector('.localGuestName').value;
let speakerId;
let remoteGuests = {};
let sock;
let initialized = false;
let closing = false;
let localContainerEl = document.querySelector('.video-container-local');
let localVideoEl = localContainerEl.querySelector('.video-video');
let carouselEl = document.querySelector('.main-panel-carousel');
let frontEl = document.querySelector('.main-panel-front');
let gridEl = document.querySelector('.main-panel-grid'); 
let maxVideoRatio;
let minVideoRatio;
let averageVideoRatio;
let localConnection;
let localAudioStatus = true;
let localVideoStatus = true;
let devices = [];
let remainigStorage = AVAILABLE_STORAGE;
let roomViewBeforeSharing;
let localVideoStream;
let screenSharing = false;
let statsArray = [];


function getContainerId(el) 
{
    while (el && el.classList.contains('video-container') === false) el = el.parentNode;
    return el && el.classList[1].split('-')[2] || null;
}

function omGetDevices()
{
    devices = [];
    return navigator.mediaDevices.enumerateDevices().then(devs => devices = devs);
}

function omExposeDevices()
{
    let htmlAudioChoices = '';
    let htmlVideoChoices = '';

    omGetDevices()
    .then(() =>
    {
        devices.forEach(d => 
        {
            if (d.kind === 'audioinput')
            {
                htmlAudioChoices += '<li><input type=\'radio\' name=\'audioDevice\' value=\'' + d.deviceId + '\'> ' + (d.label || '---') + '</li>';
            } 
            else if (d.kind === 'videoinput') 
            {
                htmlVideoChoices += '<li><input type=\'radio\' name=\'videoDevice\' value=\'' + d.deviceId + '\'> ' + (d.label || '---') + '</li>';
            }
        });
        document.querySelector('.settings-video').innerHTML = htmlVideoChoices;
        document.querySelector('.settings-audio').innerHTML = htmlAudioChoices;
    });
}


/************************************************************
 * metronome
 ************************************************************/


const metronome = {
    
    TICK_LENGTH: 0.05, // in s
    MAX_BPM: 240,
    audioContext: new (window.AudioContext || window.webkitAudioContext || mozAudioContext)(),
    bpm: 60,
    beats: 4,
    count: 1,
    active: false,
    tick(soundName) {    

        let t = metronome.audioContext.createBufferSource();
        
        t.buffer = metronome[soundName];

        t.connect(metronome.audioContext.destination);    
        t.start(metronome.audioContext.currentTime);
        // t.stop(metronome.audioContext.currentTime + TICK_LENGTH);
    },
    play()
    {           

        if (metronome.count == 1) 
        {
            metronome.tick('sound1');
        } 
        else 
        {
            metronome.tick('sound2');
        }
        metronome.count = metronome.count + 1;
        if (metronome.count > metronome.beats) metronome.count = 1;
    },
    start() 
    {
        metronome.count = 1;        
        metronome.active = setInterval(metronome.play, 60000 / metronome.bpm);
    },
    stop() 
    {       
        clearInterval(metronome.active);
        metronome.active = false;
    },
    getSound(fileName, soundName) 
    {     
        fetch(fileName)
        .then((response) => 
        {
            return response.arrayBuffer();
        })
        .then((arrayBuffer) => 
        {
            return metronome.audioContext.decodeAudioData(arrayBuffer);
        })
        .then((audioBuffer) => 
        {
            metronome[soundName] = audioBuffer;
        });
    },
};

metronome.getSound('/served/audio/tick1.ogg', 'sound1');
metronome.getSound('/served/audio/tick2.ogg', 'sound2');


/************************************************************
 * messaging base
 ************************************************************/


/* connect to socket server */

sock = io.connect({     

    rejectUnauthorized: false, 
    reconnection: false, 
    secure: true, 
    query: {
        roomId: roomId, 
        roomName: roomName, 
        roomMode: roomMode, 
        guestId: localGuestId, 
        guestName: localGuestName, 
    }, 
    transports: ["polling", "websocket"],
});

/* in out listeners */

sock.on('connect', () =>
{
    lll('Connected socket id ' + sock.id + '.');
});

sock.on('disconnect', (reason) => 
{
    if (reason === 'io server disconnect') 
    {        
        lll('Disconnected socket by server.');
    } 
    else if (reason === 'io client disconnect') 
    {
        lll('Disconnected socket by client.');
    } 
    else
    {
        lll('Disconnected socket. ' + reason + '.');
    }
    location.href = closing && '/' || location.href;
});

sock.on('disconnecting', (reason) => 
{
    lll('Disconnecting socket because ' + reason + '.');
});

sock.on('guest-disconnect', (gId) => 
{    
    omRemoveGuest(gId);
});

sock.on('error', (msg) => 
{
    omShowMessage(localGuestId, msg); // TODO: where to expose or whether to re-throw
});

sock.on('response', (msg) => 
{
    omShowMessage(localGuestId, msg);
});

sock.on('room-closing', () => 
{    
    closing = true;
});


/************************************************************
 * web rtc
 ************************************************************/


function omInit()
{   
    omShowMessage(localGuestId, 'Choice device.', 500);

    navigator.mediaDevices.getUserMedia(DEFAULT_CONSTRAINTS)
    .then(localStream => 
    {
        /* set local stream */

        omShowMessage(localGuestId, 'Set ' + localStream.name + '.', 500);

        localVideoEl.oncanplay = () =>
        {
            omCalculateVideoRatios();
        };

        localVideoEl.srcObject = localStream;
        localVideoEl.autoplay = true;
        localVideoEl.muted = true;

        omCalculateVideoRatios();
        
        /* start offer */
            
        omShowMessage(localGuestId, 'Start WebRTC offer.', 500);
        
        for (let gId in remoteGuests) 
        {
            const pc = remoteGuests[gId].connection = omGetPeerConnection(gId);
        
            /* set and offer description */

            omShowMessage(localGuestId, 'Offering connection to ' + localGuestId + '.', 500);

            omSendDescription('offer', pc); 
        }
        initialized = true;
        omHideMessage(localGuestId);
    })
    .catch(err => 
    {
        omShowMessage(localGuestId, err.message);
    });
}

function omSendDescription(type, pc)
{
    const p = type === 'offer' && pc.createOffer() || pc.createAnswer();
    
    p.then((description) => 
    {
        return pc.setLocalDescription(description);
    })
    .then(() => 
    {
        sock.emit('webrtc-description', pc.remoteGuestId, pc.localDescription);
    })
    .catch(function(reason) 
    {
        omShowMessage(localGuestId, reason);
    });
}

function omSendIce(evt) 
{    
    if (evt.candidate !== null) 
    {
        sock.emit('webrtc-ice', (this.remoteGuestId || 'all'), evt.candidate);
    }
}

function omGetPeerConnection(remoteGuestId) 
{
    const pc = new RTCPeerConnection(PEER_CONNECTION_CONFIG);

    pc.remoteGuestId = remoteGuestId;
    pc.onicecandidate = omSendIce;
    pc.ontrack = omHandleRemoteTrack;
    pc.oniceconnectionstatechange = omHandleIceConnectionState;
    pc.onnegotiationneeded = () => omSendDescription('offer', pc);

    if (localVideoEl.srcObject) localVideoEl.srcObject.getTracks().forEach(track => pc.addTrack(track, localVideoEl.srcObject));

    return pc;
}

function omHandleRemoteTrack(evt) 
{
    const container = document.querySelector('.video-container-' + this.remoteGuestId);

    if (!container) return;
    
    const video = container.querySelector('.video-video');

    if (video.srcObject) return;

    video.oncanplay = () =>
    {
        omCalculateVideoRatios();
    };
    video.srcObject = evt.streams[0];
    
    omHideMessage(this.remoteGuestId);
}

function omHandleIceConnectionState(evt) 
{
    if (['new','checking','connected','completed'].includes(evt.target.iceConnectionState)) 
    {
        omShowMessage(evt.target.remoteGuestId, evt.target.iceConnectionState, 500);
    } 
    else if (['failed','disconnected','closed'].includes(evt.target.iceConnectionState)) 
    {
        omShowMessage(evt.target.remoteGuestId, evt.target.iceConnectionState + ' ice');
    }
}

function omDeployContainer(gId) 
{
    const el = document.querySelector(".video-container-template").cloneNode(true);

    el.classList.remove('video-container-template');
    el.classList.add('video-container');
    el.classList.add('video-container-' + gId);
    el.querySelector('.video-guestname-span').innerHTML = remoteGuests[gId].name;
    el.style.display = '';

    if (roomView === 'alone') 
    {
        carouselEl.appendChild(localContainerEl);
        frontEl.appendChild(el);
        speakerId = gId;
        roomView = 'speaker';
        
        omUpdateView(null, roomView);
    } 
    else if (roomView === 'speaker') 
    {        
        carouselEl.appendChild(el);
    } 
    else if (roomView === 'grid') 
    {
        gridEl.appendChild(el);
    }
    omCalculateVideoRatios();
}

function omGetDisplayedContainers()
{
    return Array.from(document.querySelectorAll('.video-container')).filter((el) => 
    {
        return el.style.display !== 'none';
    });
}

function omCalculateVideoRatios()
{
    const containerEls = omGetDisplayedContainers();
    let ratio;
    let el;

    minVideoRatio = null;
    maxVideoRatio = null;
    averageVideoRatio = 0;

    containerEls.forEach(containerEl => 
    {        
        el = containerEl.querySelector('.video-video');
        
        ratio = el && el.srcObject && (el.videoWidth / el.videoHeight) || 1;
        averageVideoRatio += ratio;

        if (minVideoRatio === null || ratio < minVideoRatio) minVideoRatio = ratio;
        if (maxVideoRatio === null || ratio > maxVideoRatio) maxVideoRatio = ratio;
    });
    averageVideoRatio = averageVideoRatio / containerEls.length;
}

function omGetBestContainerWidth()
{
    const totContainers = omGetDisplayedContainers().length;
    const mainPanel = document.querySelector('.main-panel');
    const H = mainPanel.offsetHeight;
    const W = mainPanel.offsetWidth;

    let width;
    let height;
    let rest;
    let rows;
    let n = 1; 
    
    while (n <= totContainers) 
    {
        rows = Math.ceil(totContainers / n);
        width = Math.floor(W / n);
        height = width / minVideoRatio;
        rest = H - rows * height;

        if (rest > 0) break;
        
        n = n + 1;
    }
    return [width, height];
}

function omSizeGridContainers() 
{
    const size = omGetBestContainerWidth();
    const width = size[0];
    const height = size[1];    

    omGetDisplayedContainers().forEach(el => 
    {
        el.style.width = (width - 2) + 'px';
        el.style.height = (height - 2) + 'px';
    });
}

function omToggleView() 
{
    omUpdateView(null, roomView === 'grid' && 'speaker' || 'grid');
}

function omUpdateView(evt, view) 
{
    let gId;
    let containerEl;

    view = view || roomView;
    speakerId = evt && getContainerId(evt.currentTarget) || speakerId;
    
    if (view === 'grid') 
    {
        if (omGetDisplayedContainers().length < 2) return false;

        /* append */ 

        gridEl.appendChild(localContainerEl);
        for (gId in remoteGuests) 
        {
            containerEl = document.querySelector('.video-container-' + gId);
            gridEl.appendChild(containerEl);
        }

        /* re-style all */

        omSizeGridContainers();

        gridEl.querySelectorAll('.video-container').forEach(el => 
        {
            el.classList.remove('video-container-carousel');
            el.classList.remove('video-container-front');
            el.classList.add('video-container-grid');

            el.querySelector('.video-video').classList.remove('video-video-carousel');
            el.querySelector('.video-video').classList.remove('video-video-front');
            el.querySelector('.video-video').classList.add('video-video-grid');
        });

        /* display only grid */

        frontEl.style.display = 'none';
        carouselEl.style.display = 'none';
        gridEl.style.display = '';

        /* icon */

        document.querySelector('.top-view-icon').src = '/served/icons/view-grid.png';
    }
    else if (view === 'speaker')
    {
        /* append */

        if (speakerId in remoteGuests) 
        {
            carouselEl.appendChild(localContainerEl);
            containerEl = document.querySelector('.video-container-' + speakerId);
            frontEl.appendChild(containerEl);
        } 
        else 
        {
            frontEl.appendChild(localContainerEl);            
        }
        for (gId in remoteGuests) 
        {
            if (gId === speakerId) continue;

            containerEl = document.querySelector('.video-container-' + gId);
            carouselEl.appendChild(containerEl);
        }
        /* re-style speaker */

        containerEl = frontEl.querySelector('.video-container');

        containerEl.style.width = '';
        containerEl.style.height = '';

        containerEl.classList.remove('video-container-carousel');
        containerEl.classList.remove('video-container-grid');
        containerEl.classList.add('video-container-front');

        containerEl.querySelector('.video-video').classList.remove('video-video-carousel');
        containerEl.querySelector('.video-video').classList.remove('video-video-grid');
        containerEl.querySelector('.video-video').classList.add('video-video-front');

        /* re-style others */

        carouselEl.querySelectorAll('.video-container').forEach(el => 
        {
            el.style.width = '';
            el.style.height = '';

            el.classList.remove('video-container-front');
            el.classList.remove('video-container-grid');
            el.classList.add('video-container-carousel');

            el.querySelector('.video-video').classList.remove('video-video-grid');
            el.querySelector('.video-video').classList.remove('video-video-front');
            el.querySelector('.video-video').classList.add('video-video-carousel');
        });

        /* display only front and carousel */

        gridEl.style.display = 'none';
        frontEl.style.display = '';
        carouselEl.style.display = '';

        /* icon */

        document.querySelector('.top-view-icon').src = '/served/icons/view-speaker.png';
    } 
    else if (view === 'alone') 
    {
        /* append */

        frontEl.appendChild(localContainerEl);

        localContainerEl.style.width = '';
        localContainerEl.style.height = '';

        localContainerEl.classList.remove('video-container-carousel');
        localContainerEl.classList.remove('video-container-grid');
        localContainerEl.classList.add('video-container-front');

        localContainerEl.querySelector('.video-video').classList.remove('video-video-grid');
        localContainerEl.querySelector('.video-video').classList.remove('video-video-front');
        localContainerEl.querySelector('.video-video').classList.add('video-video-carousel');

        /* display only front */

        gridEl.style.display = 'none';
        carouselEl.style.display = 'none';
        frontEl.style.display = '';

        /* icon */

        document.querySelector('.top-view-icon').src = '/served/icons/view-speaker.png';

    }
    roomView = view;

    return true;
}

function omRemoveGuest(gId) 
{
    if (gId in remoteGuests) 
    {
        remoteGuests[gId].connection && remoteGuests[gId].connection.close();
        delete(remoteGuests[gId]);
    }

    const el = document.querySelector('.video-container-' + gId);

    if (el) el.parentNode.removeChild(el);

    omCalculateVideoRatios();

    if (Object.keys(remoteGuests).length === 0) 
    {        
        omUpdateView(null, 'alone'); 
    }
}

function omQuit() 
{
    for (let gId in remoteGuests) remoteGuests[gId].connection && remoteGuests[gId].connection.close();

    sock.close();
    location.href = '/';
}

sock.on('info', (info) => 
{
    info.guests.forEach(g => 
    {        
        if (g.id in remoteGuests === false && g.id !== localGuestId) 
        {            
            remoteGuests[g.id] = g;
            omDeployContainer(g.id);
        };
    });

    if (initialized === false) omInit();
});

sock.on('webrtc-description', (from, to, description) => 
{    
    if (to !== localGuestId) return; // TODO: not usefule, server do the work

    if (description.type === 'offer') 
    {
        if (!remoteGuests[from].connection) remoteGuests[from].connection = omGetPeerConnection(from);

        const pc = remoteGuests[from].connection;        
        pc.setRemoteDescription(description).then(() => omSendDescription('answer', pc));        
    } 
    else if (description.type === 'answer') 
    {
        const pc = remoteGuests[from].connection;  
        pc.setRemoteDescription(description);

    } else {        

        lll('bad description request');
    }
});

sock.on('webrtc-ice', (from, to, ice) => 
{            
    if (to !== localGuestId) return;

    remoteGuests[from]['connection'].addIceCandidate(ice)
    .then(() => 
    {
        lll('added remote ice candidate');
    })
    .catch(err => 
    {
        lll('failure adding ice candidate: ' + e.name);
    });        
});


/************************************************************
 * chat and share
 ************************************************************/


function omSwitchLeftPanel() 
{
    const el = document.querySelector('.left-panel');

    if (el.style.display === 'none') 
    {
        el.style.display = 'block';
    } 
    else 
    {
        el.style.display = 'none';
    }    
}

function omSendChatMsgBroadcast()
{
    let msg;

    if (sock.connected) 
    {
        msg = document.querySelector(".chat-textarea").value;

        sock.emit("chat-msg", 'all', msg);
        document.querySelector(".chat-textarea").value = '';
    } 
    else 
    {
        lll('messaging disconnected');
    }
}

function omSendChatFileBroadcast() 
{
    let files = document.querySelector('.chat-uploads').files;
    let fileReader = new FileReader();
    let i;
    let tot = 0;
    
    /* check all uploads */
    i = files.length;
    if (i === 0 || i > MAX_UPLOAD_NUMBER) 
    {
        lll('Too much files to upload, limit is ' + MAX_UPLOAD_NUMBER);
        return false; // TODO: message
    }

    while (i) 
    {
        i = i - 1;
        if (files[i].size > MAX_UPLOAD_SIZE) 
        {
            lll('File too large, limit is ' + MAX_UPLOAD_SIZE);
            return false; // TODO: message
        }

        tot = tot + files[i].size;
    }

    if (tot > remainigStorage) 
    {
        lll('Exceeding storage limit, remaining storage is' + remainigStorage);
        return false; // TODO: message
    }

    /* upload asyc with fileReader or with Blob.arrayBuffer */

    i = files.length;
    while (i) 
    {
        i = i - 1;
        let f = files[i];

        if (f.arrayBuffer) 
        {
            f.arrayBuffer()
            .then(ab => sock.emit('chat-upload', 'all', f.name, f.size, f.type, ab));
            document.querySelector('.chat-uploads').value = ''; // TODO: release resources
        } 
        else 
        {
            fileReader.onloadend = ab => sock.emit('chat-upload', 'all', f.name, f.size, f.type, ab);
            fileReader.readAsBufferArray(f);
            document.querySelector('.chat-uploads').value = ''; // TODO: release resources
        }        
    }
}

function omSendChatMsgPersonal() 
{
    sock.emit("chat-msg", recipientId, document.querySelector(".chat-textarea").value);
    document.querySelector(".chat-textarea").value = "";
}

function omOpenFile(evt) 
{
    let w;

    if (evt.target.tagName === 'IMG') 
    {
        w = window.open(null, '_blank', 'toolbar=no, titlebar=no, scrollbars=no, menubar=no, status=no, resizable=no, top=100, left=200, width=' + screen.availWidth + ', height=' + screen.availHeight);
        w.document.write('<img src=\'' + evt.target.src + '\' style=\'width: 100%; max-width: 100%; max-height: 100vw;\'>');
    } 
    else if (evt.target.tagName === 'A' && evt.target.href.endswith('mp3')) 
    {
         // TODO

        let w = window.open(null, '_blank', 'toolbar=no, titlebar=no, scrollbars=no, menubar=no, status=no, resizable=no, top=100, left=200, width=' + screen.availWidth + ', height=' + screen.availHeight);
        w.document.write('<audio src="/media/..." style=""></audio>');    
    } 
    else if (evt.target.src) 
    {
        w = window.open(null, '_blank', 'toolbar=no, titlebar=no, scrollbars=no, menubar=no, status=no, resizable=no, top=100, left=200, width=' + screen.availWidth + ', height=' + screen.availHeight);
        w.document.write('<video src="/media/..." style="width: 100%; max-width: 100%; max-height: 100vw;"></video>');
    }
}

sock.on('chat-msg', (fromId, toId, msg) => 
{
    let leftPanel = document.querySelector('.chat');
    let classModifier = '';
    let from;

    if (fromId == localGuestId) 
    {
        classModifier = '-local';
        from = 'me';
    } 
    else 
    {
        from = remoteGuests[fromId].name;
    }
    
    if (toId == 'all') 
    {
        document.querySelector('.chat').innerHTML += 
        '<div class=\'chat-block\'><span class=\'chat' + classModifier  + '-guestname\'>' + from + '</span>' + 
        '<span class=\'chat' + classModifier  + '-separator\'>&gt;</span>' + 
        '<span class=\'chat' + classModifier  + '-msg\'>' + msg + '</span>' + 
        '</div>';
        leftPanel.scrollTop = leftPanel.scrollHeight;
    }
});

sock.on('chat-upload-url', (fromId, toId, url, name, type, rs) => 
{
    let leftPanel = document.querySelector('.chat');
    let classModifier = '';
    let from;

    remainigStorage = rs;

    if (fromId == localGuestId) 
    {
        classModifier = '-local';
        from = 'me';
    } 
    else 
    {
        from = remoteGuests[fromId].name;
    }    

    if (toId == 'all') 
    {
        let blockEl = document.createElement("DIV");
        blockEl.className = 'chat-block';

        let fromEl = document.createElement("SPAN");
        fromEl.className = 'chat' + classModifier  + '-guestname';
        fromEl.textContent = from;
        
        let sepEl = document.createElement("SPAN");
        sepEl.className = 'chat' + classModifier  + '-separator';
        sepEl.textContent = '>';

        let el;
        
        if (type.startsWith('image')) 
        {
            el = document.createElement("IMG");
            el.src = url;
            el.alt = name;
            el.className = 'chat' + classModifier  + '-image';
            el.onclick = (evt) => omOpenFile(evt);
        } 
        else 
        {
            el = document.createElement("a");
            el.href = '/download?fileurl=' + encodeURIComponent(url);
            el.textContent = name;
            el.className = 'chat' + classModifier  + '-file';
        }
        blockEl.appendChild(fromEl);
        blockEl.appendChild(sepEl);
        if (type.startsWith('image')) blockEl.appendChild(document.createElement("BR"));
        blockEl.appendChild(el);
        leftPanel.appendChild(blockEl);
        leftPanel.scrollTop = leftPanel.scrollHeight;
    }
});


/************************************************************
 * other
 ************************************************************/


function omLockUnlockRoom() 
{
    if (roomStatus === 'unlocked') 
    {
        roomStatus = 'locked';
        document.querySelector('.top-lock-unlock-btn').classList.add('pressed-btn');
    } 
    else 
    {
        roomStatus = 'unlocked';
        document.querySelector('.top-lock-unlock-btn').classList.remove('pressed-btn');
    }
    sock.emit('lock-unlock', roomStatus);
}

function omStartStopShareScreen() 
{
    if (screenSharing) 
    {
        const track = localVideoStream.getTracks().find(t => t.kind === 'video');

        for (let gId in remoteGuests)
        {
            const senders = remoteGuests[gId].connection.getSenders();
            const s = senders.find(s => s.track.kind === 'video');
    
            if (s)
            {
                s.replaceTrack(track).catch(err => 
                {
                        omShowMessage(localGuestId, 'Local video issue. ' + err)
                });
            }
            else
            {
                throw new error('No video to substitute for ' + gId + '.');
            };
        }         
        localVideoStream.removeEventListener('inactive', omStartStopShareScreen);
        localVideoEl.srcObject = localVideoStream;
        localVideoStream = null;

        document.querySelector('.top-start-stop-share-screen-btn').classList.remove('pressed-btn');

        screenSharing = false;   
    } 
    else 
    {
        navigator.mediaDevices.getDisplayMedia({

            video: {

                cursor: 'always',
            },
            audio: {

                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100,
            }
        })
        .then(stream => 
        {            
            const track = stream.getTracks().find(t => t.kind === 'video');

            for (let gId in remoteGuests)
            {
                const senders = remoteGuests[gId].connection.getSenders();
                const s = senders.find(s => s.track.kind === 'video');
        
                if (s)
                {                    
                    s.replaceTrack(track).catch(err => 
                    {
                        omShowMessage(localGuestId, 'Screen sharing issue. ' + err);
                        stream = null;// TODO: destroy stream ???
                    });
                }
                else
                {
                    throw new error('No video to substitute for ' + gId + '.');
                }
            }

            stream.addEventListener('inactive', omStartStopShareScreen);

            localVideoStream = localVideoEl.srcObject;
            localVideoEl.srcObject = stream;

            document.querySelector('.top-start-stop-share-screen-btn').classList.add('pressed-btn');
            roomViewBeforeSharing = roomView;
            screenSharing = true;
        })
        .catch(err => 
        {
            omShowMessage(localGuestId, 'Screen sharing issue. ' + err);
        });
    }
}
        
function omGuestNameUpdate()
{
    localGuestName = document.querySelector('.bottom-video-local-guestname-input').value;
    sock.emit('changed-guestname', localGuestName);

    utils.setCookie('guestName', guestName);
}   

function omSwitchRemoteAudio(evt) 
{
    let rId;
    let video;

    rId = getContainerId(evt.currentTarget);

    video = document.querySelector('.video-container-' + rId).querySelector('.video-video');
    video.muted = !video.muted;

    if (video.muted) 
    {
        evt.currentTarget.classList.remove('pressed-btn');
    } 
    else 
    {
        evt.currentTarget.classList.add('pressed-btn');
    }
}

function omSwitchLocalAudioVideo(kind) 
{
    let gId;
    let btn;
    let status;

    if (kind === 'video') 
    {
        btn = document.querySelector('.bottom-local-switch-video-btn');
        status = localVideoStatus = !localVideoStatus;
    }
    else 
    {
        btn = document.querySelector('.bottom-local-switch-audio-btn');
        status = localAudioStatus = !localAudioStatus;        
    }
    
    if (status) 
    {
        btn.classList.add('pressed-btn');
    }
    else 
    {
        btn.classList.remove('pressed-btn');
    }

    for (gId in remoteGuests) 
    {        
        remoteGuests[gId].connection.getSenders().forEach(s => 
        {
            if (s.track.kind === kind) s.track.enabled = status;                         
        })
    }
}      

function omShowMessage(gId, msg, ms)
{
    const containerEl = document.querySelector('.video-container-' + (gId === localGuestId && 'local' || gId));
    const statusEl = containerEl && containerEl.querySelector('.video-status') || null;

    if (!statusEl) return;

    statusEl.querySelector('.video-status-inner').innerHTML = msg;
    statusEl.style.display = 'block';   
    
    if (ms) setTimeout(() => { omHideMessage(gId) }, ms);
}

function omHideMessage(dummy)
{
    let containerEl;
    let statusEl;

    if (typeof dummy === 'object')
    {
        statusEl = dummy;
    }
    else
    {        
        containerEl = document.querySelector('.video-container-' + (dummy === localGuestId && 'local' || dummy));
        statusEl = containerEl && containerEl.querySelector('.video-status') || null;
    }

    if (!statusEl) return;

    statusEl.querySelector('.video-status-inner').innerHTML = '';
    statusEl.style.display = 'none';
}

function omSwitchLocalContainer() 
{
    const el = document.querySelector('.video-container-local');
    const remoteGuestsIds = Object.keys(remoteGuests);
    
    if (el.style.display === 'none')
    {
        el.style.display = 'flex';
        document.querySelector('.bottom-local-switch-container-btn').classList.add('pressed-btn');
        omUpdateView(null, null);
    }
    else if (remoteGuestsIds.length > 0)
    {
        el.style.display = 'none';
        document.querySelector('.bottom-local-switch-container-btn').classList.remove('pressed-btn');

        if (roomView === 'grid' && remoteGuestsIds.length === 1)
        {
            speakerId = remoteGuestsIds[0];
            omUpdateView(null, 'speaker');
        }
        else
        {
            omUpdateView(null, null);
        }
    }
}

function omGetStats(gId) 
{    
    return remoteGuests[gId].connection.getStats(null).then(stats => 
    {
        let statistics = {};
    
        stats.forEach(report => 
        {
            if (report.type === 'inbound-rtp') 
            {
                statistics.localIn = {};

                statistics.localIn.timestamp = report.timestamp;
                statistics.localIn.bytesReceived = report.bytesReceived;
                
                if (report.kind === 'video') 
                {
                    statistics.localIn.bitrateMean = report.bitrateMean;
                    statistics.localIn.framerateMean = report.framerateMean;
                }
            } 
            else if (report.type === 'outbound-rtp') 
            {
                statistics.localOut = {};
                
                statistics.localOut.timestamp = report.timestamp;
                statistics.localOut.bytesSent = report.bytesSent;
                
                if (report.kind === 'video') 
                {
                    statistics.localOut.bitrateMean = report.bitrateMean;
                    statistics.localOut.framerateMean = report.framerateMean;
                }
            } 
            else if (report.type === 'remote-inbound-rtp') 
            {
                statistics.remoteIn = {};
                
                statistics.remoteIn.timestamp = report.timestamp;
                statistics.remoteIn.bytesReceived = report.bytesReceived;
                statistics.remoteIn.roundTripTime = report.roundTripTime;                                
            } 
            else if (report.type === 'remote-outbound-rtp') 
            {
                statistics.remoteOut = {};
                
                statistics.remoteOut.timestamp = report.timestamp;
                statistics.remoteOut.bytesSent = report.bytesSent;
            }            
        });
        statsArray.push(statistics);
        if (statsArray.length > STATISTICS_LENGTH) statsArray.shift();
    });
}

function omShowStats(evt) 
{    
    const gId = getContainerId(evt.target);

    omGetStats(gId).then(() =>
    {
        const firstReport = statsArray[0];
        const lastReport = statsArray[statsArray.length - 1];

        let localSentMean = '-';
        let localReceivedMean = '-';
        let remoteSentMean = '-';
        let remoteReceivedMean = '-' 

        if (statsArray.length > 1)
        {
            localSentMean = ((lastReport.localOut.bytesSent - firstReport.localOut.bytesSent) / (lastReport.localOut.timestamp - firstReport.localOut.timestamp) / 1000 * 8).toFixed(3);
            localReceivedMean = ((lastReport.localIn.bytesReceived - firstReport.localIn.bytesReceived) / (lastReport.localIn.timestamp - firstReport.localIn.timestamp) / 1000 * 8).toFixed(3);
            remoteSentMean = ((lastReport.remoteOut.bytesSent - firstReport.remoteOut.bytesSent) / (lastReport.remoteOut.timestamp - firstReport.remoteOut.timestamp) / 1000 * 8).toFixed(3);
            remoteReceivedMean = ((lastReport.remoteIn.bytesReceived - firstReport.remoteIn.bytesReceived) / (lastReport.remoteIn.timestamp - firstReport.remoteIn.timestamp) / 1000 * 8).toFixed(3);
        }

        const html = `
        
            <ul class='stats'>
                <li>local out bitrate: ${localSentMean} Mbits/s (sent ${(lastReport.localOut.bytesSent / 1000000).toFixed(3)} Mb)</li>
                <li>local in bitrate: ${localReceivedMean} Mbits/s (sent ${(lastReport.localIn.bytesReceived / 1000000).toFixed(3)} Mb)</li>
                <li>remote out bitrate: ${remoteSentMean} Mbits/s (sent ${(lastReport.remoteOut.bytesSent / 1000000).toFixed(3)} Mb)</li>
                <li>remote in bitrate: ${remoteReceivedMean} Mbits/s (sent ${(lastReport.remoteIn.bytesReceived / 1000000).toFixed(3)} Mb)</li>
            </ul>
        `;        
        omShowMessage(gId, html);
    });
}

function omStartStopMetronome(bpm, beats) 
{
    if (metronome.active) 
    {
        document.querySelector('.top-start-stop-metronome-btn').classList.remove('pressed-btn');
        metronome.stop();
    } 
    else 
    {
        document.querySelector('.top-start-stop-metronome-btn').classList.add('pressed-btn');

        if (bpm) metronome.bpm = Math.min(bpm, metronome.MAX_BPM);
        if (beats) metronome.beats = beats;

        metronome.start();
    }
}

sock.on('changed-guestname', (from, newGuestName) => 
{    
    if (from === localGuestId) return;

    document.querySelector('.video-container-' + from).querySelector('.video-guestname-span').innerHTML = newGuestName;
    remoteGuests[from].name = newGuestName;
});

sock.on('knocking-door', guestName => 
{    
    if (roomLeaderId === localGuestId)
    {
        omShowMessage(roomLeaderId, 'Guest ' + guestName + ' is knoking door. Room is locked.');
    }
});