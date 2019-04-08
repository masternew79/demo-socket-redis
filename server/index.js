const path = require('path')
const app = require('express')()
const port = 3000
const ip = require('os').networkInterfaces()['Ethernet 2'][1].address

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'ejs')

app.get('/', function (req, res) {
    res.render('index')
})

const server = require('http').createServer(app);


server.listen(port, () => {
    console.log(`server listen port http://${ip}:${port}`);
});


module.exports = server
