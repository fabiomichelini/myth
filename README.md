## Myth
Simple video conference tool based on WebRTC.  
Multi users, speaker/grid view, chat, file/image sharing, screen sharing, leader mode.
  
### deployment
Based on ```Linux``` and ```Node```.
Just clone folder and generate/customize ssl certs (see meetserver.js at line 36).
Serve on port 5000 for example with ```pm2 start meetserver.js```.

### screenshot

Entrance

<img src="/served/images/screenshot1.png" width="500" />

Speaker view

<img src="/served/images/screenshot2.png" width="500" />

Grid view

<img src="/served/images/screenshot3.png" width="300" />