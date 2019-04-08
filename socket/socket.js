const { redis, pub, sub } = require('./redis')

const DEFAULT_TOLERANCE = 10
const ONE_DAY = 24 * 60 * 60
const ONE_HOUR = 60 * 60
const ONE_MINUTE = 60
const ONE_SECOND = 1
const UN_KNOWN = 'UN_KNOWN'
const SOCKET_PREFIX = 'SOCKET:'
const QUEUE_PREFIX = 'QUEUE:'
const ROOM_PREFIX = 'ROOM:'
const SOCKET_STATUS = {
    QUEUE: 'QUEUE',
    ROOM: 'ROOM',
    FREE: 'FREE',
    READY: 'READY',
    REQUEST_READY: 'REQUEST_READY'
}

function initSocketRedis(socketId) {
    try {
        redis.hmset(SOCKET_PREFIX + socketId, ['status', SOCKET_STATUS.FREE, 'room', 0, 'queue', 0])
        setExpireTime(SOCKET_PREFIX + socketId, ONE_DAY)
    } catch (error) {
        console.log("TCL: initSocketRedis -> error", error)
    }
}

function updateSocketRedis(socketId, field, value) {
    try {
        redis.hset(SOCKET_PREFIX + socketId, field, value)
    } catch (error) {
        console.log("TCL: updateSocketRedis -> error", error)

    }
}

async function isSocketInQueueRedis(socketId) {
    try {
        const queue = await redis.hget(SOCKET_PREFIX + socketId, 'queue')
        return queue != 0
    } catch (error) {
        console.log("TCL: isSocketInRedis -> error", error)
        return false
    }
}

function emitMessage(client, message) {
    client.emit('message', { message })
}

async function findEnemiesInQueueRedis(queue, max, min) {
    try {
        const result = await redis.zrevrangebyscore(queue, max, min)
        return result
    } catch (error) {
        console.log("Cant get socketId enemy from queue", error)
        return []
    }
}

function enoughEnemies(enemy, mode) {
    return enemy.length >= mode - 1
}

async function findIdEnemies(queue, rank, mode) {
    let tolerance = 0 // Sai so cho phep tim kiem rank
    let accumulateIds = []
    let enemyIds = []
    let time = 0

    while (time < 5) {
        let min = rank - tolerance
        let max = rank + tolerance
        const ids = await findEnemiesInQueueRedis(queue, max, min)
        accumulateIds = [...accumulateIds, ...ids]
        enemyIds = Array.from(new Set(accumulateIds))
        if (enoughEnemies(enemyIds, mode)) {
            break
        } else {
            time++
            tolerance += DEFAULT_TOLERANCE
            continue
        }
    }

    return enoughEnemies(enemyIds, mode) ? enemyIds : false
}

function deleteSocketRedis(socketId) {
    try {
        // redis.del(SOCKET_PREFIX + socketId)
        redis.expire(SOCKET_PREFIX + socketId, 10 * ONE_MINUTE)
    } catch (error) {
        console.log("TCL: deleteSocketRedis -> error", error)
    }
}

async function findSocketEnemies(queue, rank, mode, io) {
    const ids = await findIdEnemies(queue, rank, mode)
    if (!ids) return []

    const enemy = []
    for (let id of ids) {
        if (io.sockets.sockets[id] == undefined) {
            deleteSocketFromQueueRedis(queue, id)
            deleteSocketRedis(id)
        } else {
            enemy.push(io.sockets.sockets[id])
        }
    }

    return enoughEnemies(enemy, mode) ? enemy : []
}

function isSuccessResult(result) {
    const statusSuccess = [1, 'OK', '1']
    return statusSuccess.includes(result)
}

async function insertSocketToQueueRedis(queue, socketId, rank) {
    try {
        const insertQueue = await redis.zadd(queue, rank, socketId)
        return isSuccessResult(insertQueue) ? true : false
    } catch (error) {
        console.log("TCL: insertSocketIdToQueue -> error", error)
        return false
    }
}

function generateRoomName(queue, members) {
    let room = ROOM_PREFIX + queue
    for (let socket of members) {
        const socketId = socket.id
        if (socketId) {
            room += `<>${socketId}`
        } else {
            return false
        }
    }
    return room
}

function deleteSocketsFromQueueRedis(queue, members) {
    for (let member of members) {
        if (!member || !member.id) continue
        const socketId = member.id
        deleteSocketFromQueueRedis(queue, socketId)
    }
}

function joinRoomSocket(room, sockets) {
    for (let socket of sockets) {
        socket.join(room)
    }
}

function emitJoinRoom(room, io) {
    io.to(room).emit('joinRoom', { room })
}

function setExpireTime(key, second) {
    try {
        redis.expire(key, second)
    } catch (error) {
        console.log("TCL: setExpireTime -> error", error)
    }
}

async function joinRoomRedis(room, members) {
    try {
        const promises = []
        members.map(member => promises.push(redis.zadd(room, -1, member.id)))
        await Promise.all(promises)
        setExpireTime(room, ONE_HOUR)
    } catch (error) {
        console.log("TCL: joinRoomRedis -> error", error)
    }
}

async function enoughMemberReady(room, mode) {
    try {
        const members = await redis.zcount(room, 0, '+inf')
        return members == mode
    } catch (error) {
        console.log("TCL: enoughMemberReady -> error", error)
        return false
    }
}

function emitStartGame(room, io) {
    io.to(room).emit('start')
}

async function getSocketJoinedRoom(room) {
    try {
        const socket = await redis.zrevrangebyscore(room, 0, 0)
        return socket
    } catch (error) {
        return []
    }
}

function clearQueueRedis(socketId) {
    try {
        redis.hset(SOCKET_PREFIX + socketId, 'queue', 0)
    } catch (error) {
        console.log("TCL: clearQueueRedis -> error", error)
    }
}

async function findRoomAgain({ sockets, io, mode }) {
    for (let socketId of sockets) {
        const queue = await redis.hget(SOCKET_PREFIX + socketId, 'queue')
        clearQueueRedis(socketId)
        const rank = await redis.hget(SOCKET_PREFIX + socketId, 'rank')
        updateSocketRedis(socketId, 'room', 0)
        findRoom({ io, queue, socketId, rank, mode })
    }
}

async function getSocketWereNotJoin(room) {
    try {
        const socket = await redis.zrevrangebyscore(room, -1, -1)
        return socket
    } catch (error) {
        console.log("TCL: getSocketWereNotJoin -> error", error)
        return []
    }
}

function disjoinRoomSocketRedis(sockets) {
    for (let socket of sockets) {
        updateSocketRedis(socket, 'room', 0)
        updateSocketRedis(socket, 'queue', 0)
    }
}

async function deleteRoomRedis(room) {
    try {
        await redis.del(room)
    } catch (error) {
        console.log("TCL: deleteRoomRedis -> error", error)
    }
}

async function dissolveRoom(room, second) {
    try {
        redis.expire(room, second)
    } catch (error) {
        console.log("TCL: deleteRoomRedis -> error", error)
    }
}

function deleteRoomSocket(room, io) {
    try {
        io.of('/').in(room).clients((error, socketIds) => {
            if (error) return console.log("TCL: deleteRoomSocket -> error", error)
            socketIds.forEach(socketId => io.sockets.sockets[socketId].leave(room));
        });
    } catch (error) {
        console.log("TCL: deleteRoomSocket -> error", error)
    }
}

async function requestJoinRoom({ queue, members, io, mode }) {
    const room = generateRoomName(queue, members)
    deleteSocketsFromQueueRedis(queue, members)
    joinRoomSocket(room, members)
    emitJoinRoom(room, io)
    await joinRoomRedis(room, members)
    countdownToStart(room, io, mode)
}

async function countdownToStart(room, io, mode) {
    let second = 0
    const timer = setInterval(async () => {
        if (second != 15) {
            if (await enoughMemberReady(room, mode)) {
                clearInterval(timer)
                return emitStartGame(room, io)
            } else {
                io.to(room).emit('countdown', { time: 15 - second })
            }
            second++
        } else {
            const socketsJoined = await getSocketJoinedRoom(room)
            findRoomAgain({ sockets: socketsJoined, io, mode })
            const socketDidNotJoin = await getSocketWereNotJoin(room)
            disjoinRoomSocketRedis(socketDidNotJoin)
            deleteRoomRedis(room)
            deleteRoomSocket(room, io)
            clearInterval(timer)
            return
        }
    }, 1000);
}

async function getQueueSocketRedis(socketId) {
    try {
        const queue = redis.hget(SOCKET_PREFIX + socketId, 'queue')
        return queue ? queue : ''
    } catch (error) {
        console.log("TCL: getQueueSocketRedis -> error", error)
        return ''
    }
}

function deleteSocketFromQueueRedis(queue, socketId) {
    try {
        redis.zrem(queue, socketId)
    } catch (error) {
        console.log("TCL: deleteSocketFromQueueRedis -> error", error)
    }
}

async function isRoomWillClose(room) {
    try {
        const ttl = await redis.ttl(room)
        console.log("TCL: isRoomWillClose -> ttl", ttl)
        return ttl < 5 * ONE_SECOND
    } catch (error) {
        console.log("TCL: isRoomWillClose -> error", error)
        return true
    }
}

function calRankPoint(members, mode) {
    const rankedMember = []
    const isModeEven = mode % 2 == 0
    for (let index in members) {
        let startPoint = parseInt(mode / 2)
        let point = startPoint - index

        if (isModeEven && index >= startPoint) {
            startPoint -= 1
            point = startPoint - index
        }

        const member = members[index]
        const { userId, socketId, score } = member
        rankedMember.push({
            rank: +index + 1,
            point: point,
            userId,
            socketId,
            score
        })
    }
    return rankedMember
}

async function getUserIdFromSocket(socketId) {
    try {
        const userId = await redis.hget(SOCKET_PREFIX + socketId, 'userId')
        return userId ? userId : UN_KNOWN
    } catch (error) {
        return UN_KNOWN
    }
}

async function getRankMembers(room) {
    try {
        const socketsWithScore = await redis.zrangebyscore(room, 0, '+inf', 'withscores')
        if (!socketsWithScore) return []

        let members = []
        for (let index = 0; index < socketsWithScore.length; index += 2) {
            const socketId = socketsWithScore[index]
            const userId = await getUserIdFromSocket(socketId)
            const score = socketsWithScore[index + 1]
            const member = {
                socketId: socketId,
                userId,
                score
            }
            members.push(member)
        }
        return members.reverse()
    } catch (error) {
        console.log("TCL: getRankMembers -> error", error)
        return []
    }
}

function updateScoreMember(room, score, socketId) {
    try {
        redis.zadd(room, score, socketId)
    } catch (error) {
        console.log("TCL: updateScoreMember -> error", error)
    }
}

async function insertSocketToRoomRedis(room, socketId) {
    try {
        await redis.zadd(room, 0, socketId)
    } catch (error) {
        console.log("TCL: insertSocketToRoomRedis -> error", error)
    }
}

async function findRoom({ io, queue, socketId, rank, mode }) {
    try {
        const client = io.sockets.sockets[socketId]
        if (await isSocketInQueueRedis(socketId)) {
            return emitMessage(client, "You are already in queue. Please wait...!")
        }
        // If enough enemies return  [enemy] else return []
        const socketEnemies = await findSocketEnemies(queue, +rank, mode, io)
        // Insert if not enough enemies
        if (!socketEnemies.length) {
            const resultInsert = await insertSocketToQueueRedis(queue, socketId, +rank)
            updateSocketRedis(socketId, 'queue', queue)
            return emitMessage(client, resultInsert ? 'You are in queue!' : 'Please try again later!')
        }
        updateSocketRedis(socketId, 'queue', queue)
        // // Send request join room to all member
        const members = [...socketEnemies, client]
        requestJoinRoom({ queue, members, io, mode })
    } catch (error) {
        console.log("TCL: findRoom -> error", error)
    }
}

async function isRoomExist(room) {
    try {
        const count = await redis.zcard(room)
        return count != 0
    } catch (error) {
        console.log("TCL: checkRoomExist -> error", error)
        return false
    }
}

module.exports = function (io) {
    io.on('connection', client => {
        const socketId = client.id
        initSocketRedis(socketId)
        client.on('findRoom', async payload => {
            console.log("TCL: socketId", socketId)
            try {
                const { songId, level, mode, rank, userId } = payload
                const queue = QUEUE_PREFIX + `${songId}<>${level}<>${mode}`
                updateSocketRedis(socketId, 'userId', userId)
                updateSocketRedis(socketId, 'rank', rank)
                findRoom({ io, queue, socketId, rank, mode })
            } catch (error) {
                console.log("TCL: error", error)
            }
        })

        client.on('ready', async payload => {
            const { room } = payload
            if (await isRoomExist(room)) {
                await insertSocketToRoomRedis(room, socketId)
                updateSocketRedis(socketId, 'room', room)
            } else {
                emitMessage(client, 'This room is not exist!')
            }
        })

        client.on('race', async payload => {
            const { room, score } = payload
            if (await isRoomExist(room)) {
                updateScoreMember(room, score, socketId)
                io.to(room).emit('race', { score, socketId })
            }
        })

        client.on('complete', async payload => {
            const { room, mode } = payload
            if (!await isRoomWillClose(room)) {
                dissolveRoom(room, 5 * ONE_SECOND)
                setTimeout(async () => {
                    const members = await getRankMembers(room)
                    const rankedMembers = calRankPoint(members, mode)
                    io.to(room).emit('rank', rankedMembers)
                }, 2 * 1000);
                setTimeout(() => {
                    deleteRoomSocket(room, io)
                }, 5 * 1000)
            }
            return
        })

        client.on('disconnect', async () => {
            try {
                const socketId = client.id

                if (await isSocketInQueueRedis(socketId)) {
                    const queue = await getQueueSocketRedis(socketId)
                    deleteSocketFromQueueRedis(queue, socketId)
                }
                deleteSocketRedis(socketId)
            } catch (error) {
                console.log("TCL: disconnect -> error", error)
            }
        })
    });
}
