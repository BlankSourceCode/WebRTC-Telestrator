class DrawingControls {
    /** @type {RTCDataChannel} */
    #dataChannel
    /** @type {WebSocket} */
    #webSocket;
    /** @type {HTMLCanvasElement} */
    #canvas;
    /** @type {CanvasRenderingContext2D} */
    #context;
    /** @type {DOMRect} */
    #canvasRect;
    /** @type {{x: number, y:number}} */
    #scale;
    /** @type {PointerEvent} */
    #firstPointer;
    /** @type {ImageData[]} */
    #undoStack = [];
    #undoIndex = -1;
    #lineColor = "black";
    #lineWidth = 1;
    #isDrawing = false;
    #hasCanvasChanged = false;
    #offset = 20;
    #inset = 1;
    #frameTimeout = null;

    /**
     * Create an instance of the drawing controls
     * @param {boolean} isDebugMode 
     */
    constructor(isDebugMode) {
        // Create the canvas context
        this.#canvas = document.getElementById("canvas");
        this.#context = this.#canvas.getContext("2d", { willReadFrequently: true });

        // Listen to pointer events for drawing
        this.#canvas.addEventListener("pointerdown", (e) => this.#onStart(e));
        this.#canvas.addEventListener("pointermove", (e) => this.#onMove(e));
        this.#canvas.addEventListener("pointerup", (e) => this.#onStop(e));
        this.#canvas.addEventListener("pointerout", (e) => this.#onStop(e));

        // Load settings
        const loadedOffset = localStorage.getItem("offset");
        if (typeof loadedOffset === "string") {
            this.#offset = parseInt(loadedOffset);
        }
        const offsetControl = document.getElementById("offset");
        offsetControl.addEventListener("change", (e) => this.#onOffsetChange(e));
        offsetControl.value = this.#offset;

        const loadedInset = localStorage.getItem("inset");
        if (typeof loadedInset === "string") {
            this.#inset = parseInt(loadedInset);
        }
        const insetControl = document.getElementById("inset");
        insetControl.addEventListener("change", (e) => this.#onInsetChange(e));
        insetControl.value = this.#inset;

        const lineWidth = localStorage.getItem("lineWidth");
        if (typeof lineWidth === "string") {
            this.#lineWidth = parseInt(lineWidth);
        }
        const lineWidthControl = document.getElementById("lineWidth");
        lineWidthControl.addEventListener("change", (e) => this.#onLineWidthChange(e));
        lineWidthControl.value = this.#lineWidth;

        const lineColor = localStorage.getItem("lineColor");
        if (typeof lineColor === "string") {
            this.#lineColor = lineColor;
            this.#onLineColorChange(this.#lineColor);
        }

        document.querySelectorAll(".colorOption").forEach((element) => {
            element.addEventListener("click", (e) => this.#onLineColorChange(e.target.style.background));
        });
        document.getElementById("colorPicker").addEventListener("change", (e) => this.#onLineColorChange(e.target.value));

        // Listen to drawing action events
        document.getElementById("fullscreen").addEventListener("click", (e) => this.#onToggleFullScreen(e));
        document.getElementById("toggleTools").addEventListener("click", (e) => this.#onToggleTools(e));
        document.getElementById("undo").addEventListener("click", (e) => this.#onUndo(e));
        document.getElementById("clear").addEventListener("click", (e) => this.#onClear(e));

        if (isDebugMode) {
            this.enable(null, null);
        }
    }

    /**
     * Create a new instance of the DrawingControls
     * @param {RTCDataChannel} dataChannel
     * @param {WebSocket} webSocket 
     */
    enable(dataChannel, webSocket) {
        this.#dataChannel = dataChannel;
        this.#webSocket = webSocket;

        const video = document.getElementById("video");
        video.classList.remove("hide");
        document.getElementById("connection").classList.add("hide");
        document.getElementById("drawing").classList.remove("hide");

        video.addEventListener("resize", (e) => this.#onResize(video));
        window.addEventListener("resize", (e) => this.#onResize(video));

        if (!dataChannel || !webSocket) {
            video.src = "v.mp4";
        }
    }

    /**
     * Draw to the canvas using json payload
     * @param {any} e 
     */
    drawToCanvas(e) {
        switch (e.action) {
            case "resize":
                this.#canvas.width = e.width;
                this.#canvas.height = e.height;
                this.#canvasRect = this.#canvas.getBoundingClientRect();
                break;

            case "start":
                this.#context.beginPath();
                this.#context.moveTo(e.x, e.y);
                break;

            case "move":
                this.#context.lineTo(e.x, e.y);
                this.#context.strokeStyle = e.lineStyle;
                this.#context.lineWidth = e.lineWidth * 5 + 1;
                this.#context.lineCap = "round";
                this.#context.lineJoin = "round";
                this.#context.stroke();
                break;

            case "stop":
                this.#context.stroke();
                this.#context.closePath();
                break;
        }
    }

    #sendData(payload, useDoubleBuffer) {
        // Update the data flag after the canvas has rendered one frame
        if (!this.#frameTimeout && this.#webSocket) {
            this.#frameTimeout = setTimeout(() => {
                const data = this.#canvas.toDataURL("image/png");
                this.#webSocket.send(data);

                if (useDoubleBuffer) {
                    this.#webSocket.send(data);
                }

                this.#frameTimeout = null;
            }, 10);
        }

        if (this.#dataChannel && payload) {
            this.#dataChannel.send(JSON.stringify(payload));
        }
    }

    #onStart(e) {
        if (this.#firstPointer) {
            e.preventDefault();
            return false;
        }

        this.#firstPointer = e;
        const x = this.#getX(e);
        const y = this.#getY(e);

        this.#isDrawing = true;
        this.#context.beginPath();
        this.#context.moveTo(x, y);

        this.#sendData({
            action: "start",
            x,
            y
        });

        e.preventDefault();
        return false;
    }

    #onMove(e) {
        if (this.#firstPointer && e.pointerId !== this.#firstPointer.pointerId) {
            return false;
        }

        if (this.#isDrawing) {
            const x = this.#getX(e);
            const y = this.#getY(e);
            this.#context.lineTo(x, y);
            this.#context.strokeStyle = this.#lineColor;
            this.#context.lineWidth = this.#lineWidth * 5 + 1;
            this.#context.lineCap = "round";
            this.#context.lineJoin = "round";
            this.#context.stroke();

            this.#sendData({
                action: "move",
                x,
                y,
                strokeStyle: this.#lineColor,
                lineWidth: this.#lineWidth
            });
        }

        e.preventDefault();
        return false;
    }

    #onStop(e) {
        if (this.#firstPointer && e.pointerId !== this.#firstPointer.pointerId) {
            return false;
        }

        this.#firstPointer = null;
        if (this.#isDrawing) {
            this.#context.stroke();
            this.#context.closePath();
            this.#isDrawing = false;

            this.#undoStack.push(this.#context.getImageData(0, 0, this.#canvas.width, this.#canvas.height));
            this.#undoIndex++;

            this.#sendData({
                action: "stop"
            }, true);
        }

        e.preventDefault();
        return false;
    }

    #onUndo(e) {
        if (this.#undoIndex <= 0) {
            this.#onClear(e);
        } else {
            this.#undoIndex--;
            this.#undoStack.pop();
            if (e.type !== "mouseout") {
                this.#context.putImageData(this.#undoStack[this.#undoIndex], 0, 0);
            }
        }

        this.#sendData(null, true);

        e.preventDefault();
        return false;
    }

    #onClear(e) {
        this.#context.fillStyle = "transparent";

        this.#context.clearRect(0, 0, canvas.width * 1 / this.#scale.x, canvas.height * 1 / this.#scale.y);
        this.#context.fillRect(0, 0, canvas.width * 1 / this.#scale.x, canvas.height * 1 / this.#scale.y);
        this.#undoStack = [];
        this.#undoIndex = -1;

        this.#sendData(null, true);

        e.preventDefault();
        return false;
    }

    #onToggleFullScreen(e) {
        const button = document.getElementById("fullscreen");
        if (!document.fullscreenElement) {
            document.body.requestFullscreen();
            button.innerHTML = "&#8690;";
        } else {
            document.exitFullscreen();
            button.innerHTML = "&#8689;";
        }
    }

    #onToggleTools(e) {
        const button = document.getElementById("toggleTools");
        if (!button.classList.contains("flip")) {
            const tools = document.querySelectorAll("#tools > *");
            tools.forEach((element) => {
                if (element.id !== "toggleTools") {
                    element.classList.add("hide");
                }
            });
            button.classList.add("flip");
        } else {
            const tools = document.querySelectorAll("#tools > *");
            tools.forEach((element) => {
                if (element.id !== "toggleTools") {
                    element.classList.remove("hide");
                }
            });
            button.classList.remove("flip");
        }
    }

    #onOffsetChange(e) {
        this.#offset = parseInt(e.target.value);
        this.#onResize(document.getElementById("video"));
        this.#canvas.classList.add("cover");

        clearTimeout(this.offsetBackgroundTimer);
        this.offsetBackgroundTimer = setTimeout(() => {
            this.#canvas.classList.remove("cover");
        }, 750);

        localStorage.setItem("offset", this.#offset);
    }

    #onInsetChange(e) {
        this.#inset = parseInt(e.target.value);
        this.#onResize(document.getElementById("video"));
        this.#canvas.classList.add("cover");

        clearTimeout(this.offsetBackgroundTimer);
        this.offsetBackgroundTimer = setTimeout(() => {
            this.#canvas.classList.remove("cover");
        }, 750);

        localStorage.setItem("inset", this.#inset);
    }

    #onLineWidthChange(e) {
        this.#lineWidth = parseInt(e.target.value);
        localStorage.setItem("lineWidth", this.#lineWidth);
    }

    #onLineColorChange(color) {
        this.#lineColor = color;
        localStorage.setItem("lineColor", this.#lineColor);

        let found = false;
        const tools = document.querySelectorAll("#tools > .colorOption");
        tools.forEach((element) => {
            element.classList.remove("selected");
            if (element.style.backgroundColor === color) {
                element.classList.add("selected");
                found = true;
            }
        });

        const picker = document.getElementById("colorPicker");
        if (!found) {
            picker.classList.add("selected");
            picker.value = this.#lineColor;
        } else {
            picker.classList.remove("selected");
        }
    }

    #onResize(video) {
        const size = this.#getVideoDimensions(video);
        this.#scale = { x: size.width / video.videoWidth, y: size.height / video.videoHeight };

        const offset = this.#offset * this.#scale.y;
        const inset = this.#inset * this.#scale.x;

        this.#canvas.width = size.width - inset * 2;
        this.#canvas.height = size.height - (offset + this.#inset * this.#scale.y);
        this.#canvas.style.left = `${inset}px`;
        this.#canvas.style.top = `${offset / 2}px`;
        this.#canvasRect = this.#canvas.getBoundingClientRect();

        this.#context.scale(this.#scale.x, this.#scale.y);

        this.#sendData(JSON.stringify({
            action: "resize",
            width: size.width,
            height: size.height,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
        }));
    }

    #getVideoDimensions(video) {
        const videoRatio = video.videoWidth / video.videoHeight;
        let width = video.offsetWidth
        let height = video.offsetHeight;
        const elementRatio = width / height;

        if (elementRatio > videoRatio) {
            width = height * videoRatio;
        } else {
            height = width / videoRatio;
        }

        return { width, height };
    }

    #getX(e) {
        let x = e.pageX - this.#canvasRect.left;
        return x / this.#scale.x;
    }

    #getY(e) {
        let y = e.clientY - this.#canvasRect.top;
        return y / this.#scale.y;
    }
}