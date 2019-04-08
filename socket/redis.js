const Redis = require('ioredis')

const options = {
    port: 6379,          // Redis port
    host: '192.168.1.111',   // Redis host
    family: 4,           // 4 (IPv4) or 6 (IPv6)
    // password: '123456',
    db: 0
}

const redis = new Redis(options)
const pub = new Redis.Cluster(options)
const sub = new Redis.Cluster(options)

module.exports = {
    redis,
    pub,
    sub
}
