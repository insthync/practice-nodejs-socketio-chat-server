var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function (req, res) {
    res.send('<h1>This is test chat server</h1>');
});

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
        return socket.rooms.indexOf(socket.id) >= 0;
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

    socket.on('login', function (loginData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' login ' + JSON.stringify(loginData));
        var userId = loginData.userId;
        var loginToken = loginData.loginToken;

        // If pass login condition
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

    socket.on('joinRoom', function (joinData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' joinRoom ' + JSON.stringify(joinData));
        var userId = socket.userId;
        var roomId = joinData.roomId;

        // If pass find room condition
        if (!checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }

        // Check if user is in the room or not, if not emit new participant
        if (isInRoom(roomId)) {
            // Failed, may emit failure message;
            emitFailMessage('User already in room');
            return;
        }

        socket.join(roomId);
        io.sockets.in(roomId).emit('joinRoom', {
            userId,
            roomId,
        });
    });

    socket.on('typingMessage', function (typingData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' typingMessage ' + JSON.stringify(typingData));
        var userId = socket.userId;
        var roomId = messageData.roomId;
        var isTyping = typingData.isTyping;

        // If pass find room condition
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

    socket.on('enterMessage', function (messageData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' enterMessage ' + JSON.stringify(messageData));
        var userId = socket.userId;
        var roomId = messageData.roomId;
        var message = messageData.message;
        var messageId = generateMessageId(roomId, userId);

        // If pass find room condition
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

    socket.on('deleteMessage', function (deleteData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' deleteMessage ' + JSON.stringify(deleteData));
        var userId = socket.userId;
        var roomId = deleteData.roomId;
        var messageId = deleteData.messageId;

        // If pass find room condition
        if (!checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }

        if (!deleteMessageFromDb(messageId)) {
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
    socket.on('startVideoChat', function (videoChatData) {
        if (isLogging)
            console.log('socket ' + socket.id + ' startVideoChat ' + JSON.stringify(videoChatData));
        var userId = socket.userId;
        var roomId = videoChatData.roomId;

    })
});