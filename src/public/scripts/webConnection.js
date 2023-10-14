class WebConnection extends EventTarget {
    /** @type {RTCPeerConnection} */
    #pc;
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
        this.#pc = new rtc(webRTCConfig, webRTCConnection);

        // Host will select a window to share
        if (this.#isHost) {
            this.#stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: "window",
                },
                audio: false,
            });

            for (const track of this.#stream.getTracks()) {
                this.#pc.addTrack(track, this.#stream);
            }
        }

        // Forward any ice candidates to the server
        this.#pc.onicecandidate = (e) => {
            if (!e || !e.candidate) {
                return;
            }

            const candidate = e.candidate;
            this.#sendToWebSocket("candidate", candidate);
        }

        // Add tracks to the local video element
        this.#pc.ontrack = (e) => {
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

        // Offer the connection as a host
        // A client joining will just recieve the offer via the cache in the server
        // TODO: Support multiple clients
        if (this.#isHost) {
            const sdpConstraints = {
                offerToReceiveAudio: false,
                offerToReceiveVideo: true
            };
            const sdp = await this.#pc.createOffer(sdpConstraints);
            await this.#pc.setLocalDescription(sdp);
            this.#sendToWebSocket("offer", sdp);
        }
    }

    async onOffer(from, offer) {
        await this.#pc.setRemoteDescription(new RTCSessionDescription(offer));
        const sdp = await this.#pc.createAnswer();
        await this.#pc.setLocalDescription(sdp);
        this.#sendToWebSocket("answer", sdp);
    }

    async onIceCandidate(from, candidate) {
        await this.#pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    async onAnswer(from, answer) {
        await this.#pc.setRemoteDescription(new RTCSessionDescription(answer));
    }

    #createDataChannelForCanvas() {
        // Only the host uses the datachannel right now
        if (this.#isHost) {
            // Listen for data sent from the client
            this.#pc.ondatachannel = (e) => {
                e.channel.onmessage = (e) => {
                    // Display any canvas data on the host screen
                    this.display(e);
                }
            };
        }

        // Create and open the channel
        this.#dataChannel = this.#pc.createDataChannel("datachannel", { reliable: true });

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