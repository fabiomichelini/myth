## Myth
Simple video conference tool based on WebRTC.  
Multi users, speaker/grid view, chat, file/image sharing, screen sharing, leader mode.
  
### deployment
Based on ```linux```, ```nodejs```, ```socket.io``` and node libraries.
Just clone folder and generate/customize ssl certs (see meetserver.js at line 36).
Serve on port 5000 for example with ```pm2 start meetserver.js```.

### screenshot

Speaker view (on desktop)

<img src="/served/images/screenshot2.png" width="500" />

Grid view (on mobile)

<img src="/served/images/screenshot3.png" width="300" />

### demo

On ```https://www.corsoservices.net:5000/```, try with demo credentials (user: guest, password: guest).