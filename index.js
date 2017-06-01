var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.use(express.static(__dirname + '/contents'));
app.get('/', function (req, res) { res.sendFile(__dirname + '/contents/index.html'); });

http.listen(3210, function () {
    console.log('listening on *:3210');
});

var isLogging = true;
var loggedInSockets = {};
var messageIds = [];
io.on('connection', function (socket) {
    // `validateSocket` is optional parameter
    // If `validateSocket` have been defined it's going to use to find that it's already login or not
    if (isLogging)
        console.log('new connection ' + socket.id);

    function checkLogin(userId, validateSocket) {
        return userId && loggedInSockets[userId] && loggedInSockets[userId].length > 0 &&
            (!validateSocket || loggedInSockets[userId].indexOf(validateSocket) !== -1);
    }

    function emitFailMessage(message, code) {
        if (isLogging)
            console.log('emit fail ' + message);
        socket.emit('fail', {
            code,
            message,
        });
    }

    function isInRoom(roomId) {
        return socket.rooms && roomId in socket.rooms;
    }

    function getSocket(socketId) {
        return io.sockets.connected[socketId];
    }

    function generateMessageId(roomId, userId) {
        return Date.now() + userId + roomId;
    }

    function saveMessageToDb(messageId, roomId, userId, message) {
        if (messageIds.indexOf(messageId) !== -1) {
            return false;
        }
        messageIds.push(messageId);
        // TODO: Will implement to store to database later
        return true;
    }

    function deleteMessageFromDb(messageId, roomId, userId) {
        var lastIdString = userId + roomId;
        var idIndex = messageIds.indexOf(messageId);
        console.log(messageId.substr(messageId.length - lastIdString.length) + " " + lastIdString);
        if (idIndex === -1 || messageId.substr(messageId.length - lastIdString.length) !== lastIdString) {
            return false;
        }
        messageIds.splice(idIndex);
        // TODO: Will implement to remove from database later
        return true;
    }

    socket.on('disconnect', function () {
        if (isLogging)
            console.log('socket ' + socket.id + ' disconnect');
        var userId = socket.userId;
        if (userId) {
            var socketArray = loggedInSockets[userId];
            var socketIndex = socketArray.indexOf(socket);
            socketArray.splice(socketIndex);
            if (socketArray.length === 0) {
                delete loggedInSockets[userId];
            }
        }
    });

    socket.on('login', function (requestData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' login ' + JSON.stringify(requestData));
        var userId = requestData.userId;
        var loginToken = requestData.loginToken;

        if (checkLogin(userId, socket)) {
            // Failed, may emit failure message
            emitFailMessage('User already login');
            return;
        }
        socket.userId = userId;
        socket.loginToken = loginToken;

        if (!loggedInSockets[userId])
            loggedInSockets[userId] = [];
        loggedInSockets[userId].push(socket);

        // Success, I've no idea about response data so I response all socket data
        socket.emit('login', {
            userId,
        });
    });

    socket.on('joinRoom', function (requestData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' joinRoom ' + JSON.stringify(requestData));
        var userId = socket.userId;
        var roomId = requestData.roomId;

        if (!checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }

        if (isInRoom(roomId)) {
            // Failed, may emit failure message;
            emitFailMessage('User already in room');
            return;
        }

        // If user is not in the room, emit new participant
        socket.join(roomId);
        io.sockets.in(roomId).emit('joinRoom', {
            userId,
            roomId,
        });
    });

    socket.on('typingMessage', function (requestData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' typingMessage ' + JSON.stringify(requestData));
        var userId = socket.userId;
        var roomId = requestData.roomId;
        var isTyping = requestData.isTyping;

        if (!checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }

        if (!isInRoom(roomId)) {
            // Failed, may emit failure message;
            emitFailMessage('User not in room');
            return;
        }

        io.sockets.in(roomId).emit('enterMessage', {
            userId,
            roomId,
            isTyping,
        });
    });

    socket.on('enterMessage', function (requestData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' enterMessage ' + JSON.stringify(requestData));
        var userId = socket.userId;
        var roomId = requestData.roomId;
        var message = requestData.message;
        var messageId = generateMessageId(roomId, userId);

        if (!checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }

        if (!saveMessageToDb(messageId, roomId, userId, message)) {
            // Failed, may emit failure message;
            emitFailMessage('Enter message fail');
            return;
        }
        
        if (!isInRoom(roomId)) {
            // Failed, may emit failure message;
            emitFailMessage('User not in room');
            return;
        }

        io.sockets.in(roomId).emit('enterMessage', {
            messageId,
            userId,
            roomId,
            message,
        });
    });

    socket.on('deleteMessage', function (requestData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' deleteMessage ' + JSON.stringify(requestData));
        var userId = socket.userId;
        var roomId = requestData.roomId;
        var messageId = requestData.messageId;

        if (!checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }

        if (!deleteMessageFromDb(messageId, roomId, userId)) {
            // Failed, may emit failure message;
            emitFailMessage('Message not found');
            return;
        }
        
        if (!isInRoom(roomId)) {
            // Failed, may emit failure message;
            emitFailMessage('User not in room');
            return;
        }

        io.sockets.in(roomId).emit('deleteMessage', {
            messageId,
        });
    });

    // WebRTC methods
    socket.on('startVideoChat', function (requestData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' startVideoChat ' + JSON.stringify(requestData));
        var userId = socket.userId;
        var roomId = requestData.roomId;

        if (!checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }
        
        if (!isInRoom(roomId)) {
            // Failed, may emit failure message;
            emitFailMessage('User not in room');
            return;
        }

        // Tell joining user information to joined users
        var socketsInRoom = io.sockets.adapter.rooms[roomId];
        if (socketsInRoom && socketsInRoom.length > 0) {
            var socketIds = Object.keys(socketsInRoom.sockets);
            for (var i = 0; i < socketIds.length; ++i) {
                var socketId = socketIds[i];
                if (socketId !== socket.id) {
                    // Create offers to another clients to let them to send data
                    socket.emit('startVideoChat', {
                        socketId,
                        createOffer: true,
                    });
                    // Send to another clients, that current user start video chat
                    io.to(socketId).emit('startVideoChat', {
                        socketId: socket.id,
                        createOffer: false,
                    });
                }
            }
        }
    });

    socket.on('stopVideoChat', function (requestData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' stopVideoChat ' + JSON.stringify(requestData));
        var userId = socket.userId;
        var roomId = requestData.roomId;

        if (!checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }
        
        if (!isInRoom(roomId)) {
            // Failed, may emit failure message;
            emitFailMessage('User not in room');
            return;
        }

        // Tell joining user information to joined users
        io.sockets.in(roomId).emit('stopVideoChat', {
            socketId: socket.id,
            userId: userId,
        });
    });

    socket.on('relayICECandidate', function (requestData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' relayICECandidate ' + JSON.stringify(requestData));
        let socketId = requestData.socketId;
        let iceCandidate = requestData.iceCandidate;

        io.to(socketId).emit('relayICECandidate', {
            socketId: socket.id,
            iceCandidate,
        });
    });

    socket.on('relaySessionDescription', function (requestData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' relaySessionDescription ' + JSON.stringify(requestData));
        let socketId = requestData.socketId;
        let sessionDescription = requestData.sessionDescription;

        io.to(socketId).emit('relaySessionDescription', {
            socketId: socket.id,
            sessionDescription,
        });
    });
});