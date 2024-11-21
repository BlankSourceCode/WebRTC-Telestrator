const os = require("os");
const express = require("express");
const http = require("http");
const WebSocketServer = require("ws").Server;
const { program, InvalidArgumentError } = require("commander");
const { dataUriToBuffer } = require("data-uri-to-buffer");

const emptyImage = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Add the command line options
program
    .name("webrtc-telestator")
    .description("A remote telestrator app using WebRTC")
    .version("1.0.0", "-v, --version")
    .option("-p, --port <number>", "specify custom http port (default: 8888)", (value) => {
        const parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue)) {
            throw new InvalidArgumentError("Not a number.");
        }
        return parsedValue;
    })
    .option("-b, --bind <ip address>", "specify the ip address on which to bind the server (default: 0.0.0.0)", (value) => {
        return value;
    });

// Parse command line
program.parse(process.argv);
const opts = program.opts();
const port = opts.port || 8888;
const bind = opts.bind || undefined;

// Function to stream the canvas image out to obs
const mjpegStreams = [];
function sendMJpeg(msg) {
    if (mjpegStreams.length > 0) {
        for (const res of mjpegStreams) {
            const mjpegBytes = Buffer.from(dataUriToBuffer(msg).buffer);
            res.write("--myboundary\r\n");
            res.write("Content-Type: image/jpeg\r\n");
            res.write("Content-Length: " + mjpegBytes.length + "\r\n\r\n");
            res.write(mjpegBytes, "binary");
        }
    }
}

// Create the websocket signaling server
const wsList = [];
const wsMessages = [];
const wss = new WebSocketServer({ host: bind, port: (port + 1) });
wss.on("connection", function (ws) {
    wsList.push(ws);

    ws.on("close", function () {
        wsList.splice(wsList.indexOf(ws), 1);

        // On a disconnect, clear out the canvas
        // We have to do this twice because some browsers (OBS) seem to cache the frames
        sendMJpeg(emptyImage);
        sendMJpeg(emptyImage);
    });

    ws.on("message", function (message) {
        const msg = message.toString();

        if (msg[0] === "d") {
            // Update the mjpeg
            sendMJpeg(msg);
        } else if (msg[0] === "l") {
            // Log the message
            console.log(msg);
        } else if (msg[0] === "r") {
            // On a request for host info, just fire any cached messages
            while (wsMessages.length > 0) {
                const msg = wsMessages.pop();
                for (var i = 0; i < wsList.length; i++) {
                    wsList[i].send(msg);
                }
            }
        } else {
            if (wsList.length < 2) {
                // No client, so cache the messages
                wsMessages.push(msg);
            } else {
                // Broadcast messages
                for (var i = 0; i < wsList.length; i++) {
                    wsList[i].send(msg);
                }
            }
        }
    });
});

// Create the http server to serve the html files
app = express();
app.get("/img", (req, res) => {
    // Store the request for the mjpeg
    mjpegStreams.push(res);

    // Set appropriate headers for MJPEG content
    res.writeHead(200, {
        "Content-Type": "multipart/x-mixed-replace; boundary=--myboundary",
        "Cache-Control": "no-cache",
        "Connection": "close",
        "Pragma": "no-cache"
    });
});
app.use(express.static(__dirname + "/public"));

// Get the addresses needed by the user
let localAddress = "localhost";
let remoteAddress = os.hostname();

if (bind && bind !== "0.0.0.0") {
    localAddress = remoteAddress = bind;
}

app.listen(port, bind, () => {
    console.log(``);
    console.log(`-----------------------------`);
    console.log(`Welcome to WebRTC-Telestrator`);
    console.log(`-----------------------------`);
    console.log(`Http server is running on port ${port}`);
    console.log(`WebSocket server is running on port ${parseInt(port) + 1}`);
    console.log(``);
    console.log(`1. Add a BrowserSource to http://${localAddress}:${port}/obs.html`);
    console.log(`2. Open a local browser to http://${localAddress}:${port} and click "Host" to select a sharing window`);
    console.log(`3. Open a remote browser to http://${remoteAddress}:${port} and click "Join" to begin telestrating`);
    console.log(``);
    if (localAddress !== "localhost" && localAddress !== "127.0.0.1" && localAddress !== "0.0.0.0") {
        console.log(`Custom host binding set to ${localAddress}`);
        console.log(`To enable display sharing over http on the local browser: `);
        console.log(`Use --unsafely-treat-insecure-origin-as-secure="http://${localAddress}:${port}" (see github readme)`);
        console.log(``);
    }
});
