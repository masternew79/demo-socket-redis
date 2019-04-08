const Redis = require('ioredis')

const nodes = [
    {
        port: 7001,
        host: '192.168.1.111'
    },
    {
        port: 7002,
        host: '192.168.1.111'
    },
    {
        port: 7003,
        host: '192.168.1.111'
    },
    {
        port: 7004,
        host: '192.168.1.111'
    },
    {
        port: 7005,
        host: '192.168.1.111'
    },
    {
        port: 7006,
        host: '192.168.1.111'
    },
    {
        port: 7007,
        host: '192.168.1.111'
    },
    {
        port: 7008,
        host: '192.168.1.111'
    },
    {
        port: 7009,
        host: '192.168.1.111'
    }
]

const options = {
    redisOptions: {
        password: '123456'
    }
}

const redis = new Redis.Cluster(nodes, options)
const pub = new Redis.Cluster(nodes, options)
const sub = new Redis.Cluster(nodes, options)

module.exports = {
    redis,
    pub,
    sub
}
