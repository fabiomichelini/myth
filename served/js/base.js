//////////
// base //
//////////



// messages


function switchSideMenu() {

    var sideMenu = document.querySelector(".side-menu");

    if (sideMenu.style.display == "block") {

        sideMenu.style.display = "none";

    } else {

        sideMenu.style.display = "block";
    }
}

function lockGui() {
    
    var wrapperEl = document.querySelector('.wrapper');
    
    // activate wrapper
    wrapperEl.style.opacity = '0.5';
    wrapperEl.style.zIndex = '100';
    
    // window._pendingOnkeydownFunc = window.onkeydown;
    // window.onkeydown = undefined;
}

function mphUnlockGui() {
    
    var wrapperEl = document.querySelector('.wrapper');
    
    // activate wrapper
    wrapperEl.style.opacity = '0.0';
    wrapperEl.style.zIndex = '-100';

    // window.onkeydown = window._pendingOnkeydownFunc || undefined;
    // window._pendingOnkeydownFunc = undefined;
}

function simpleDisplay(selector) {
    
    var el = document.querySelector(selector);
    el.style.display = el.style.display == 'block' && 'none' || 'block';
}

function show(selector, kwargs) {
    
    var el = document.querySelector(selector);
        
    // check modal
    if (kwargs && 'modal' in kwargs && kwargs['modal'] == false) {   
        el.dataset.modal = 'false';        
    } else {      
        lockGui();
        el.dataset.modal = 'true';        
    };

    // check dimensions
    if (kwargs && 'width' in kwargs) {
        el.style.width = kwargs['width'];
    };
    if (kwargs && 'height' in kwargs) {
        el.style.height = kwargs['height'];
    };
    
    el.style.display = 'block';
    
    // limit dimension
    if (el.clientHeight > (window.innerHeight * 0.80)) el.style.height = "80vh";
    if (el.clientWidth > (window.innerWidth * 0.80)) el.style.width = "80vw";
    
    // check position
    if (kwargs && 'top' in kwargs) {
        el.style.top = kwargs['top'];
    } else {
        el.style.top = (window.innerHeight - el.clientHeight) / 2 + 'px';
    }
    if (kwargs && 'left' in kwargs) {
        el.style.left = kwargs['left'];
    } else {
        el.style.left = (window.innerWidth - el.clientWidth) / 2 + 'px';
    }
}

function hide(id) {
    
    var el = document.querySelector(selector);
    
    if (el.dataset.modal == 'true') unlockGui();
    
    el.removeAttribute("data-modal");
    el.style.display = 'none';
}

function showMessage(msg, kwargs) {
    
    document.getElementById('message').getElementsByClassName('text')[0].innerHTML = msg;
    if (kwargs) kwargs['showCloseButton'] = true;
    else kwargs = {'showCloseButton':true};
    
    mphShowDiv('message', kwargs);
}

function showConfirmMessage(text, onYesFunc, onNoFunc) {

    window._pendingConfirmYesFunc = onYesFunc;
    window._pendingConfirmNoFunc = onNoFunc;
    
    document.getElementById('confirm').getElementsByClassName('text')[0].innerHTML = text;
    
    mphShowDiv('confirm');
}

function showAlertMessage(text, func) {

    window._pendingAlertFunc = func;
    
    document.getElementById('alert').getElementsByClassName('text')[0].innerHTML = text;
    
    mphShowDiv('alert');
}

function confirmMessageReturn(response) {

    if (response) window._pendingConfirmYesFunc && window._pendingConfirmYesFunc();
    else          window._pendingConfirmNoFunc && window._pendingConfirmNoFunc();
    
    window._pendingConfirmYesFunc = undefined;
    window._pendingConfirmNoFunc = undefined;    
}

function alertMessageReturn() {

    window._pendingAlertFunc && window._pendingAlertFunc();
    
    window._pendingAlertFunc = undefined;    
}

function switchall(elName, value) {
    
    var opts = document.querySelectorAll(elName + " option");
    for(var i=0;i<opts.length;i++){        
        opts[i].selected=value;
    }
}

CHARS = "abcdefghjkilmnopqrstuvwyzABCDEFGHJKILMNOPQRSTUVWYZ0123456789"

function makeRandomKey(length) {

    var key = "";
    length = length || 40;
    
    for(i=0;i<length;i++) {
        
        key += CHARS[Math.floor(Math.random() * CHARS.length)];
        
    };
    return key;
}

var minuteMS = 60 * 1000;
var hourMS = 60 * minuteMS;
var dayMS = 24 * hourMS;
var minActivityDuration = 15 * minuteMS; // 15 minutes in ms
var minDeltaMS = 5 * minuteMS; // 5 minutes in ms


function getCookie(cname) {

    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    var c;
    var i;

    for(i = 0; i <ca.length; i++) {

        c = ca[i];

        while (c.charAt(0) == ' ')
            c = c.substring(1);

        if (c.indexOf(name) == 0) 
            return c.substring(name.length, c.length);      
    }
    return "";
}

function setCookie(cname, cvalue) {

    document.cookie = cname + "=" + cvalue + ";path=/";
}

function wait(ms) {

   var start = new Date().getTime();
   var end = start;
   while(end < start + ms) {
     end = new Date().getTime();
  };
}

function getNow() {

    return new Date().getTime() / 1000;
}

function zeroPad(n) {
    n = n.toString();
    while (n.length < 2) n = "0" + n;
    return n;                
}

function ms2hm(ms) {

    var hours = ms / dayMS * 24;
    return zeroPad(parseInt(hours)) + ":" + zeroPad(Math.round((hours - parseInt(hours)) * 60));
}

function hm2ms(hm) {

    var hmArray = hm.split(':');
    return parseInt(hmArray[0]) * hourMS + parseInt(hmArray[1]) * minuteMS;
}

function mphFindIndex(element, array, key) {

	for (i=0; i<array.length; i++) {
		
		if (array[i][key] == element[key]) {
			
			return i;
			
		};
	};					
	return -1;

}
               
function checkBrowser() {
    
    var ua = navigator.userAgent;
    var iChrome = ua.search('Chrome');
    var iFirefox = ua.search('Firefox');
    
    // chrome
    if (iChrome > 0) {
        
        var version = parseInt(ua.slice(iChrome+7,iChrome+9));
        
        if (version<31) {
            alert("Your browser is Chrome, version "+version+": version > 30 is required, otherwise features are not granted !!!");
        } else {
            // right browser and version
        }
    
    // firefox    
    } else if (iFirefox > 0) {
        
        var version = parseInt(ua.slice(iFirefox+8,iFirefox+10));
        
        if (version<31) {
            alert("Your browser is Firefox, version "+version+": version > 30 is required, otherwise features are not granted !!!");
        } else {
            // right browser and version
        }
    
    } else {
        
        alert("You need browser Chrome version > 30 or browser Firefox version > 30, otherwise features are not granted !!!");
    }
}
            
function explodeimplode(evt) {
    
    if (evt.target.nextElementSibling.style.display == 'none') {
        
        evt.target.nextElementSibling.style.display = 'block';
        evt.target.src = "/served/icons/implode.gif";
        evt.target.alt = '-';
    
    } else {
    
        evt.target.nextElementSibling.style.display = 'none';
        evt.target.src = "/served/icons/explode.gif";
        evt.target.alt = '+';        
    };
    return false;
}

function title(s) {
    return s.split(' ')
   .map(w => w[0].toUpperCase() + w.substr(1).toLowerCase())
   .join(' ');
}

function querySelectorAncestor(selector, el) {

    var ancestors = document.querySelectorAll(selector);
    var ancestor = null;
    var i;

    for(i=0; i<ancestors.length; i++) {
        
        if (ancestors[i].contains(el)) {
            ancestor = ancestors[i];
            break;
        }
    }
    return ancestor;
}

function getAncestorByClassName(selector, el) {

    var result = el.parentNode;

    while (true) {

        if (result == undefined) break;

        if (result.classList && result.classList.contains(selector)) {
                      
            break;
        }
        result = result.parentNode;
    }
    return result;
}

// debug


function debugInWindow() {
    
    if (!window.debuggerWindow) {
    
        window.debuggerWindow = window.open("/served_from_httpserver/html/debugger.html", "Debugger", "status=no, titlebar=no, menubar=no, toolbar=no, resizable=yes, bottom=30, right=50, width=400, height=200");
    };
    
    if (!window.debuggerWindow) return;
        
    for (i=0;i<arguments.length;i++) {
    
        var br = window.document.createElement('br');
        var text = window.document.createTextNode(arguments[i]);
        
        var log = window.debuggerWindow.document.getElementById('log');
        
        if (!log) return;
        
        log.appendChild(br);
        log.appendChild(text);
    }
}

function debugInConsole() {

    for (var i=0; i<arguments.length; i++) {
    
        console.log(arguments[i]);
    }
}

lll = debugInConsole;
