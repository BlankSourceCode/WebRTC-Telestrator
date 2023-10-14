const webRTCConfig = { "iceServers": [] };
const webRTCConnection = {};

/**
 * The websocket connection to the server
 * @type {WebSocket}
 */
let webSocket = null;

/**
 * The drawing controls
 * @type {DrawingControls}
 */
let drawingControls = null;

/**
 * The WebConnection
 * @type {WebConnection}
 */
let connection = null;

function sendToWebSocket({id, action, data}) {
    const json = {
        id,
        action,
        data
    };
    webSocket.send(JSON.stringify(json));
}

function initialize() {
    drawingControls = new DrawingControls();

    const debug = false;
    if (debug) {
        webSocket = new WebSocket(`ws://${location.hostname}:${parseInt(location.port) + 1}`);
        drawingControls.enable(null, webSocket);
    }

    const connectionDiv = document.getElementById("connection");
    const hostButton = document.getElementById("hostButton");
    const joinButton = document.getElementById("joinButton");

    hostButton.addEventListener("click", () => {
        connectionDiv.classList.add("hide");
        connect(true)
    });

    joinButton.addEventListener("click", () => {
        connectionDiv.classList.add("hide");
        connect(false)
    });
}

/**
 * Connect to the server
 * @param {bool} asHost 
 */
function connect(asHost) {
    webSocket = new WebSocket(`ws://${location.hostname}:${parseInt(location.port) + 1}`);

    // Create the peer connection and listen for the connected event
    connection = new WebConnection();
    connection.addEventListener("connected", (e) => {
        drawingControls.enable(e.detail, webSocket);
    });
    connection.addEventListener("signal", (e) => {
        sendToWebSocket(e.detail);
    });
    connection.addEventListener("display", (e) => {
        drawingControls.drawToCanvas(JSON.parse(e.detail));
    });
    connection.addEventListener("log", (e) => {
        webSocket.send(`log: id:${connection.id} ${e.detail}`);
    });

    // Forward websocket signalling messages to the connection
    webSocket.onopen = (e) => {
        connection.create(asHost);
        if (!asHost) {
            // Request any host info
            webSocket.send("request");
        }
    };
    webSocket.onclose = (e) => {
    };
    webSocket.onerror = (e) => {
    };
    webSocket.onmessage = (e) => {
        var json = JSON.parse(e.data);
        switch (json.action) {
            case "offer":
                if (json.id !== connection.id) {
                    connection.onOffer(json.id, json.data);
                }
                break;

            case "candidate":
                if (json.id !== connection.id) {
                    connection.onIceCandidate(json.id, json.data);
                }
                break;

            case "answer":
                if (json.id !== connection.id) {
                    connection.onAnswer(json.id, json.data);
                }
                break;

            case "desc":
                if (json.id !== connection.id) {
                    connection.onDesc(json.id, json.data);
                }
                break;
        }
    };
}

window.onerror = (e) => {
    if (webSocket) {
        webSocket.send("log: " + e);
    }
}

window.addEventListener("DOMContentLoaded", () => initialize());