#!/usr/bin/env node

'use strict';


const utils = {
 
    /* various */

    _CHARS: 'abcdefghjkilmnopqrstuvwyz0123456789',

    generateToken(length)
    {
        let key = '';

        length = length || 10;
        
        while (length--) key += this._CHARS[Math.floor(Math.random() * this._CHARS.length)]; 
        
        return key;
    },

    getDigest(s)
    {
        // TODO
        return s;
    },

    zeroPad(n)
    {
        n = n.toString();
        while (n.length < 2) n = "0" + n;
        return n;                
    },

    parseCookie(c)
    {
        return c.split(';').reduce((res, c) =>
        {
            const [key, val] = c.trim().split('=').map(decodeURIComponent);
            try
            {
                return Object.assign(res, { [key]: JSON.parse(val) });
            }
            catch (e)
            {
                return Object.assign(res, { [key]: val });
            }
        }, {});
    },

    getCookie(cname) 
    {
        var name = cname + '=';
        var decodedCookie = decodeURIComponent(document.cookie);
        var ca = decodedCookie.split(';');
        var c;
        var i;

        for(i = 0; i <ca.length; i++) 
        {
            c = ca[i];

            while (c.charAt(0) == ' ') c = c.substring(1);

            if (c.indexOf(name) == 0) return c.substring(name.length, c.length);      
        }
        return '';
    },

    setCookie(cname, cvalue) 
    {
        document.cookie = cname + '=' + cvalue + ';path=/';
    },

    wait(ms)
    {
        let start = new Date().getTime();
        let end = start;
        
        while(end < start + ms) end = new Date().getTime();
    },

    ms2hm(ms) 
    {
        const hours = ms / dayMS * 24;
        return zeroPad(parseInt(hours)) + ':' + zeroPad(Math.round((hours - parseInt(hours)) * 60));
    },

    hm2ms(hm) 
    {
        const hmArray = hm.split(':');
        return parseInt(hmArray[0]) * hourMS + parseInt(hmArray[1]) * minuteMS;
    },

    /* debug */

    debugInWindow() 
    {        
        if (!window.debuggerWindow)
        {  
            window.debuggerWindow = window.open("/served_from_httpserver/html/debugger.html", "Debugger", "status=no, titlebar=no, menubar=no, toolbar=no, resizable=yes, bottom=30, right=50, width=400, height=200");
        };
        
        if (!window.debuggerWindow) return;
            
        for (let i=0; i<arguments.length; i++) 
        {  
            let br = window.document.createElement('br');
            let text = window.document.createTextNode(arguments[i]);      
            let log = window.debuggerWindow.document.getElementById('log');
            
            if (!log) return;
            
            log.appendChild(br);
            log.appendChild(text);
        }
    },

    debugInConsole() 
    {

        for (let i=0; i<arguments.length; i++) 
        {  
            console.log(arguments[i]);
        }
    },

    /* D.O.M. manipulation */

    querySelectorAncestor(selector, el) 
    {
        let ancestors = document.querySelectorAll(selector);
        let ancestor = null;

        for(let i=0; i<ancestors.length; i++) {
            
            if (ancestors[i].contains(el)) {
                ancestor = ancestors[i];
                break;
            }
        }
        return ancestor;
    },
                
    checkBrowser() 
    {        
        const ua = navigator.userAgent;
        const iChrome = ua.search('Chrome');
        const iFirefox = ua.search('Firefox');
        
        // chrome
        if (iChrome > 0) 
        {            
            const version = parseInt(ua.slice(iChrome+7,iChrome+9));
            
            if (version<31) 
            {
                alert("Your browser is Chrome, version "+version+": version > 30 is required, otherwise features are not granted !!!");
            } 
            else 
            {
                // right browser and version
            }
        
        // firefox    
        } 
        else if (iFirefox > 0) 
        {            
            const version = parseInt(ua.slice(iFirefox+8,iFirefox+10));
            
            if (version<31) 
            {
                alert("Your browser is Firefox, version "+version+": version > 30 is required, otherwise features are not granted !!!");
            } 
            else 
            {
                // right browser and version
            }        
        } 
        else 
        {            
            alert("You need browser Chrome version > 30 or browser Firefox version > 30, otherwise features are not granted !!!");
        }
    },
            
    explodeimplode(evt) 
    {    
        if (evt.target.nextElementSibling.style.display === 'none') 
        {            
            evt.target.nextElementSibling.style.display = 'block';
            evt.target.src = "/served/icons/implode.gif";
            evt.target.alt = '-';        
        } 
        else 
        {        
            evt.target.nextElementSibling.style.display = 'none';
            evt.target.src = "/served/icons/explode.gif";
            evt.target.alt = '+';        
        };
        return false;
    },

    lockGui() 
    {        
        const wrapperEl = document.querySelector('.wrapper');
        
        wrapperEl.style.opacity = '0.5';
        wrapperEl.style.zIndex = '100';
    },

    mphUnlockGui() 
    {        
        const wrapperEl = document.querySelector('.wrapper');
        
        wrapperEl.style.opacity = '0.0';
        wrapperEl.style.zIndex = '-100';
    },

    simpleDisplay(selector) 
    {        
        const el = document.querySelector(selector);
        el.style.display = el.style.display == 'block' && 'none' || 'block';
    },

    show(selector, kwargs) 
    {        
        const el = document.querySelector(selector);
            
        // check modal
        if (kwargs && 'modal' in kwargs && kwargs['modal'] === false) 
        {   
            el.dataset.modal = 'false';        
        } 
        else 
        {      
            lockGui();
            el.dataset.modal = 'true';        
        };

        // check dimensions
        if (kwargs && 'width' in kwargs) 
        {
            el.style.width = kwargs['width'];
        };
        if (kwargs && 'height' in kwargs) 
        {
            el.style.height = kwargs['height'];
        };
        
        el.style.display = 'block';
        
        // limit dimension
        if (el.clientHeight > (window.innerHeight * 0.80)) el.style.height = "80vh";
        if (el.clientWidth > (window.innerWidth * 0.80)) el.style.width = "80vw";
        
        // check position
        if (kwargs && 'top' in kwargs) 
        {
            el.style.top = kwargs['top'];
        } 
        else 
        {
            el.style.top = (window.innerHeight - el.clientHeight) / 2 + 'px';
        }
        if (kwargs && 'left' in kwargs) 
        {
            el.style.left = kwargs['left'];
        } 
        else 
        {
            el.style.left = (window.innerWidth - el.clientWidth) / 2 + 'px';
        }
    },

    hide(id) 
    {        
        const el = document.querySelector(selector);
        
        if (el.dataset.modal === 'true') unlockGui();
        
        el.removeAttribute('data-modal');
        el.style.display = 'none';
    },

    showHide(selector, mode)
    {
        const el = document.querySelector(selector);

        if (el) 
        {
            if ([undefined, 'none'].includes(el.style.display)) 
            {
                el.style.display = mode || 'block';
            } 
            else 
            {
                el.style.display = 'none';
            }
        }
    },

    showMessage(msg, kwargs) 
    {        
        document.getElementById('message').getElementsByClassName('text')[0].innerHTML = msg;
        if (kwargs) kwargs['showCloseButton'] = true;
        else kwargs = {'showCloseButton':true};
        
        mphShowDiv('message', kwargs);
    },

    showConfirmMessage(text, onYesFunc, onNoFunc) 
    {
        window._pendingConfirmYesFunc = onYesFunc;
        window._pendingConfirmNoFunc = onNoFunc;
        
        document.getElementById('confirm').getElementsByClassName('text')[0].innerHTML = text;
        
        mphShowDiv('confirm');
    },

    showAlertMessage(text, func) 
    {
        window._pendingAlertFunc = func;
        
        document.getElementById('alert').getElementsByClassName('text')[0].innerHTML = text;
        
        mphShowDiv('alert');
    },

    confirmMessageReturn(response) 
    {
        if (response) 
        {
            window._pendingConfirmYesFunc && window._pendingConfirmYesFunc();
        }
        else
        {
            window._pendingConfirmNoFunc && window._pendingConfirmNoFunc();
        }        
        window._pendingConfirmYesFunc = undefined;
        window._pendingConfirmNoFunc = undefined;    
    },

    alertMessageReturn() 
    {
        window._pendingAlertFunc && window._pendingAlertFunc();        
        window._pendingAlertFunc = undefined;    
    },

    /* field validators */

    validateEmail(email) 
    {
        return true;
    },

    validatePhone(phone) 
    {
        return true;
    },

    validatePassword(password) 
    {
        return true;
    },

    validateName(name) 
    {
        return true;
    },

    validateUsername(username) 
    {
        return true;
    },

    cleanFilename(filename) 
    {
        return filename;
    }
}

try 
{
    module.exports = utils;
}
catch (err) 
{

}