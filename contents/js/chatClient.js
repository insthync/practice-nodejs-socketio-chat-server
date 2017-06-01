function startChat() {
    var currentUserId = '';
    var currentRoomId = '';
    var rtcPeers = {};
    var rtcPeerMedias = {};
    var socket = io.connect('http://localhost:3210');

    // WEBRTC relates functions
    function setupLocalMedia(callback) {
        // Ask user for permission to use the computers microphone and/or camera, 
        // attach it to an <audio> or <video> tag if they give us access. 
        console.log("Requesting access to local audio / video inputs");
        navigator.getUserMedia({
            audio: {
                mandatory: {
                    echoCancellation: true,
                    googAutoGainControl: true,
                }
            }, video: true
        },
            function (stream) { // user accepted access to a/v
                console.log("Access granted to audio/video");
                var mediaPlayer = $("<video>");
                mediaPlayer.attr("autoplay", "autoplay");
                mediaPlayer.attr("muted", "true"); // always mute ourselves by default
                $('#videos').append(mediaPlayer);
                if (callback) callback(null, stream);
            },
            function (err) { // user denied access to a/v
                console.log("Access denied for audio/video");
                if (callback) callback(err, null);
            }
        );
    }

    function createRTCPeer(socketId) {
        var peerConnection = new RTCPeerConnection(
            { iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }] },
            { optional: [{ DtlsSrtpKeyAgreement: true }] } /* this will no longer be needed by chrome
                                                            * eventually (supposedly), but is necessary 
                                                            * for now to get firefox to talk to chrome */
        );

        rtcPeers[socketId] = {};
        rtcPeers[socketId].connection = peerConnection;

        peerConnection.onicecandidate = function (event) {
            if (event.candidate) {
                socket.emit('relayICECandidate', {
                    socketId,
                    iceCandidate: {
                        'sdpMLineIndex': event.candidate.sdpMLineIndex,
                        'candidate': event.candidate.candidate
                    }
                });
            }
        }

        // Add stream from another
        peerConnection.onaddstream = function (event) {
            var mediaPlayer = $("<video>");
            mediaPlayer.attr("autoplay", "autoplay");
            mediaPlayer.attr("muted", "true");
            $('#videos').append(mediaPlayer);
            rtcPeerMedias[socketId] = mediaPlayer;
        }

        return rtcPeers[socketId];
    }

    $('form').submit(function () {
        var userId = currentUserId;
        var roomId = currentRoomId;
        var message = $('#m').val();
        socket.emit('enterMessage', {
            userId,
            roomId,
            message,
        });
        $('#m').val('');
        return false;
    });
    $('#startVideoChatBtn').on('click', function () {
        socket.emit('startVideoChat', {
            roomId: currentRoomId,
        });
    });
    socket.on('connect', function () {
        // Login
        socket.emit('login', {
            userId: 'test' + Date.now(),
            loginToken: 'test',
        });
    });
    socket.on('login', function (result) {
        currentUserId = result.userId;
        socket.emit('joinRoom', {
            currentUserId,
            roomId: 'testRoom',
        });
    });
    socket.on('joinRoom', function (result) {
        var userId = result.userId;
        var roomId = result.roomId;
        if (userId === currentUserId) {
            currentRoomId = roomId;
            $('#messages').append($('<li>').text('You are joined room: ' + roomId));
        } else {
            $('#messages').append($('<li>').text(userId + ' is joined room: ' + roomId));
        }
    });
    socket.on('enterMessage', function (result) {
        var messageId = result.messageId;
        var userId = result.userId;
        var roomId = result.roomId;
        var message = result.message;
        if (userId === currentUserId) {
            $('#messages').append($('<li id="' + messageId + '">').text('You: ' + message));
        } else {
            $('#messages').append($('<li id="' + messageId + '">').text(userId + ': ' + message));
        }
        $('li#' + messageId).on('click', function () {
            socket.emit('deleteMessage', {
                roomId,
                messageId,
            });
        });
    });
    socket.on('deleteMessage', function (result) {
        var messageId = result.messageId;
        $('li#' + messageId).remove();
    });
    socket.on('startVideoChat', function (result) {
        var socketId = result.socketId;
        var userId = result.userId;
        var isAuthorized = userId === currentUserId;

        var peer = createRTCPeer(socketId, isAuthorized);
        var peerConnection = peer.connection;
        /* Only one side of the peer connection should create the
         * offer, the signaling server picks one to be the offerer. 
         * The other user will get a 'sessionDescription' event and will
         * create an offer, then send back an answer 'sessionDescription' to us
         */
        if (isAuthorized) {
            setupLocalMedia(function (err, stream) {
                if (!err) {
                    peerConnection.addStream(stream);
                }
            });
            peerConnection.createOffer(
                function (sessionDescription) {
                    peerConnection.setLocalDescription(sessionDescription,
                        function () {
                            socket.emit('relaySessionDescription', {
                                socketId,
                                sessionDescription,
                            });
                        },
                        function () {
                            alert("Offer setLocalDescription failed!");
                        }
                    );
                },
                function (error) {
                    console.log("createOffer error: ", error);
                }
            );
        }
    });
    /** 
     * Peers exchange session descriptions which contains information
     * about their audio / video settings and that sort of stuff. First
     * the 'offerer' sends a description to the 'answerer' (with type
     * "offer"), then the answerer sends one back (with type "answer").  
     */
    socket.on('relaySessionDescription', function (result) {
        var socketId = result.socketId;
        var peerConnection = rtcPeers[socketId].connection;
        var remoteSessionDescription = result.sessionDescription;

        var desc = new RTCSessionDescription(remoteSessionDescription);
        var stuff = peerConnection.setRemoteDescription(desc,
            function () {
                if (remoteSessionDescription.type === "offer") {
                    peerConnection.createAnswer(
                        function (sessionDescription) {
                            peerConnection.setLocalDescription(sessionDescription,
                                function () {
                                    socket.emit('relaySessionDescription', {
                                        socketId,
                                        sessionDescription,
                                    });
                                },
                                function () {
                                    alert("Answer setLocalDescription failed!");
                                }
                            );
                        },
                        function (error) {
                            console.log("createAnswer error: ", error);
                        }
                    );
                }
            },
            function (error) {
                console.log("setRemoteDescription error: ", error);
            }
        );
    });
    /**
     * The offerer will send a number of ICE Candidate blobs to the answerer so they 
     * can begin trying to find the best path to one another on the net.
     */
    socket.on('relayICECandidate', function (result) {
        var socketId = result.socketId;
        var iceCandidate = result.iceCandidate;
        var peerConnection = rtcPeers[peer_id].connection;
        peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
    });
}