class WebConnection extends EventTarget {
    /** @type {RTCPeerConnection} */
    #local;
    /** @type {RTCDataChannel} */
    #dataChannel;
    /** @type {MediaStream} */
    #stream;
    #id = "";
    #isHost = false;

    constructor() {
        super();
        this.#id = Date.now() + Math.random();
    }

    get id() {
        return this.#id;
    }

    /**
     * Create the WebRTC connection between the host and client peers
     * @param { boolean } asHost True if this is the hosting peer
     */
    async create(asHost) {
        this.#isHost = asHost;

        const rtc = RTCPeerConnection ?? webkitRTCPeerConnection;
        this.#local = new rtc(webRTCConfig, webRTCConnection);

        // Host will select a window to share
        if (this.#isHost) {
            this.#stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: "window",
                },
                audio: false,
            });

            for (const track of this.#stream.getTracks()) {
                this.#local.addTrack(track, this.#stream);
            }
        }

        // Forward any ice candidates to the server
        this.#local.onicecandidate = (e) => {
            if (!e || !e.candidate) {
                return;
            }

            const candidate = e.candidate;
            this.#sendToWebSocket("candidate", candidate);
        }

        // Add tracks to the local video element
        this.#local.ontrack = (e) => {
            this.#log("track!");
            this.#stream = new MediaStream();
            this.#stream.addTrack(e.track);

            const video = document.getElementById("video");
            video.autoplay = true;
            video.srcObject = this.#stream;
            video.classList.remove("hide");

            this.dispatchEvent(new CustomEvent("connected", { detail: this.#dataChannel }));
        };

        // Create a datachannel for mirroring the canvas
        // Note: We don't actually do this anymore
        // this.#createDataChannelForCanvas();

        // Offer the connection
        const sdpConstraints = {
            offerToReceiveAudio: false,
            offerToReceiveVideo: true
        };
        const sdp = await this.#local.createOffer(sdpConstraints);
        await this.#local.setLocalDescription(sdp);
        this.#sendToWebSocket("offer", sdp);
    }

    async onOffer(from, offer) {
        this.#log("onOffer");
        await this.#local.setRemoteDescription(new RTCSessionDescription(offer));
        const sdp = await this.#local.createAnswer();
        await this.#local.setLocalDescription(sdp);
        this.#sendToWebSocket("answer", sdp);
    }

    async onIceCandidate(from, candidate) {
        this.#log("onIceCandidate");
        await this.#local.addIceCandidate(new RTCIceCandidate(candidate));
    }

    async onAnswer(from, answer) {
        this.#log("onAnswer");
        await this.#local.setRemoteDescription(new RTCSessionDescription(answer));
    }

    #createDataChannelForCanvas() {
        // Only the host uses the datachannel right now
        if (this.#isHost) {
            // Listen for data sent from the client
            this.#local.ondatachannel = (e) => {
                e.channel.onmessage = (e) => {
                    // Display any canvas data on the host screen
                    this.display(e);
                }
            };
        }

        // Create and open the channel
        this.#dataChannel = this.#local.createDataChannel("datachannel", { reliable: true });

        // Only the host actually listens for the datachannel
        if (this.#isHost) {
            this.#dataChannel.onopen = (e) => {
                drawingControls.enable();
            };
        }
    }

    #sendToWebSocket(action, data) {
        this.dispatchEvent(new CustomEvent("signal", { detail: { id: this.#id, action, data } }));
    }

    #display(e) {
        this.dispatchEvent(new CustomEvent("display", { detail: e.data }));
    }

    #log(data) {
        this.dispatchEvent(new CustomEvent("log", { detail: data }));
    }
}