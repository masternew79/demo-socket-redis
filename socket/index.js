const server = require('http').createServer();
const io = require('socket.io')(server);
const ip = require('os').networkInterfaces()['Ethernet 2'][1].address
const port = 3333

server.listen(port, () => {
    console.log(`Socket listen port http://${ip}:${port}`);
});

require('./socket')(io)
