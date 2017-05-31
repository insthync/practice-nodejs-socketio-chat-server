var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function (req, res) {
    res.send('<h1>This is test chat server</h1>');
});

http.listen(3210, function () {
    console.log('listening on *:3210');
});

var loggedInSockets = {};
var messageIds = [];
io.on('connection', function (socket) {
    // `validateSocket` is optional parameter
    // If `validateSocket` have been defined it's going to use to find that it's already login or not
    console.log('new connection ' + socket.id);

    function checkLogin(userId, validateSocket) {
        return loggedInSockets[userId] && loggedInSockets[userId].length > 0 &&
            (!validateSocket || loggedInSockets[userId].indexOf(validateSocket) !== -1);
    }

    function emitFailMessage(message, code) {
        console.log('emit fail ' + message);
        socket.emit('fail', {
            code,
            message,
        });
    }

    socket.on('disconnect', function () {
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
            userId
        });
    });

    socket.on('joinRoom', function (joinData) {
        console.log('socket ' + socket.id + ' joinRoom ' + JSON.stringify(joinData));
        var userId = socket.userId;
        var roomId = joinData.roomId;

        // If pass find room condition
        if (!userId || !checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }

        // Check if user is in the room or not, if not emit new participant

        socket.join(roomId);
        io.sockets.in(roomId).emit('joinRoom', {
            userId,
            roomId,
        });
    });

    socket.on('enterMessage', function (messageData) {
        console.log('socket ' + socket.id + ' enterMessage ' + JSON.stringify(messageData));
        var userId = socket.userId;
        var roomId = messageData.roomId;
        var message = messageData.message;
        var messageId = Date.now() + userId + roomId;

        if (messageIds.indexOf(messageId) !== -1) {
            return;
        }
        messageIds.push(messageId);

        // If pass find room condition
        if (!userId || !checkLogin(userId, socket)) {
            // Failed, may emit failure message;
            emitFailMessage('User not login');
            return;
        }

        io.sockets.in(roomId).emit('enterMessage', {
            messageId,
            userId,
            roomId,
            message
        });
    });

    socket.on('deleteMessage', function (deleteData) {
        console.log('socket ' + socket.id + ' deleteMessage ' + JSON.stringify(deleteData));
        var userId = socket.userId;
        var roomId = deleteData.roomId;
        var messageId = deleteData.messageId;

        var lastIdLength = userId + roomId;
        var idIndex = messageIds.indexOf(messageId);
        if (messageId.substr(messageId.length - lastIdLength) === lastIdLength &&
            idIndex === -1) {
            // Failed, may emit failure message;
            emitFailMessage('Message not found');
            return;
        }

        io.sockets.in(roomId).emit('deleteMessage', {
            messageId,
        });
    });
});