document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Header Date Logic ---
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    const currentDateEl = document.getElementById('currentDate');
    if (currentDateEl) {
        currentDateEl.innerText = `${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`;
    }

    const CAMERA_IDS = ["cam1", "cam2", "cam3"];
    const CAMERA_NAMES = {
        cam1: "Cam 1",
        cam2: "Cam 2",
        cam3: "Cam 3"
    };

    // --- 2. Start All 3 Live Camera Streams ---
    window.startLiveStreams = function() {
        CAMERA_IDS.forEach((cid) => {
            const imgEl = document.getElementById(`esp32-stream-${cid}`);
            if (imgEl) {
                imgEl.src = `/video_feed/${cid}`;
                imgEl.style.display = 'block';
            }
        });
    };

    // Backward-compatible single stream starter
    window.startLiveStream = function(streamUrl, camId = "cam1") {
        const imgEl = document.getElementById(`esp32-stream-${camId}`);
        if (imgEl) {
            imgEl.src = streamUrl;
            imgEl.style.display = 'block';
        }
    };

    // --- 3. Helper Function to Update Top Overall Status Banner ---
    function updateStatusBanner(status, activeCamLabel = "") {
        const banner = document.getElementById('current-status-banner');
        if (!banner) return;

        if (status === 'waste') {
            const camNote = activeCamLabel ? ` on ${activeCamLabel}` : "";
            banner.className = 'status-banner banner-red';
            banner.innerHTML = `
                <div class="banner-left">
                    <span class="banner-icon">⚠️</span>
                    <div>
                        <strong>Feed Waste Detected${camNote}</strong>
                        <p>YOLOv8 identified uneaten pellets — triggering biofloc suction cycle</p>
                    </div>
                </div>
                <span class="badge-danger">Action Triggered</span>
            `;
        } else {
            banner.className = 'status-banner banner-green';
            banner.innerHTML = `
                <div class="banner-left">
                    <span class="banner-icon">✅</span>
                    <div>
                        <strong>Water Surface Clear</strong>
                        <p>No uneaten feed waste detected across Cam 1, Cam 2, and Cam 3</p>
                    </div>
                </div>
                <span class="badge-success">Normal</span>
            `;
        }
    }

    // --- 4. Update Per-Camera Corner Badge ---
    function updateCameraBadge(camId, camState) {
        const badge = document.getElementById(`badge-${camId}`);
        if (!badge || !camState) return;

        if (!camState.online) {
            badge.className = 'fd-cam-state state-offline';
            badge.innerText = 'Offline';
        } else if (camState.type === 'waste') {
            badge.className = 'fd-cam-state state-waste';
            badge.innerText = `Waste (${camState.confidence}%)`;
        } else {
            badge.className = 'fd-cam-state';
            badge.innerText = 'Clear';
        }
    }

    // --- 5. Add a New Detection Event Dynamically ---
    window.addDetectionEvent = function(type, confidence, actionText, camLabel = "") {
        const eventsList = document.getElementById('events-list');
        if (!eventsList) return;

        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const eventItem = document.createElement('div');
        const prefix = camLabel ? `[${camLabel}] ` : "";

        if (type === 'waste') {
            eventItem.className = 'fd-event-item event-red';
            eventItem.innerHTML = `
                <div class="event-icon">❗</div>
                <div class="event-details">
                    <div class="event-top">
                        <strong>${prefix}Feed Waste Detected</strong> <span>Confidence: ${confidence}%</span>
                    </div>
                    <p class="event-action">${actionText}</p>
                    <span class="event-time">${currentTime}</span>
                </div>
            `;
        } else {
            eventItem.className = 'fd-event-item event-green';
            eventItem.innerHTML = `
                <div class="event-icon">✅</div>
                <div class="event-details">
                    <div class="event-top">
                        <strong>${prefix}No Waste Detected</strong> <span>Confidence: ${confidence}%</span>
                    </div>
                    <p class="event-action">${actionText}</p>
                    <span class="event-time">${currentTime}</span>
                </div>
            `;
        }

        eventsList.insertBefore(eventItem, eventsList.firstChild);
        while (eventsList.children.length > 25) {
            eventsList.removeChild(eventsList.lastChild);
        }
    };

    // --- 6. Connect All 3 Streams & Poll YOLOv8 Inference State ---
    window.startLiveStreams();

    const lastCamSignatures = {
        cam1: "",
        cam2: "",
        cam3: ""
    };

    async function fetchDetectionStatus() {
        try {
            const response = await fetch('/api/status');
            if (!response.ok) return;
            const data = await response.json();

            const activeLabel = data.activeCamera && CAMERA_NAMES[data.activeCamera]
                ? CAMERA_NAMES[data.activeCamera]
                : "";
            updateStatusBanner(data.type, activeLabel);

            if (data.cameras) {
                CAMERA_IDS.forEach((cid) => {
                    const camState = data.cameras[cid];
                    if (!camState) return;

                    updateCameraBadge(cid, camState);

                    // Log new detection events only when camera is online and state/action changes
                    if (camState.online) {
                        const sig = `${camState.type}-${camState.action}`;
                        if (sig !== lastCamSignatures[cid]) {
                            lastCamSignatures[cid] = sig;
                            window.addDetectionEvent(
                                camState.type,
                                camState.confidence,
                                camState.action,
                                CAMERA_NAMES[cid]
                            );
                        }
                    }
                });
            }
        } catch (err) {
            console.error("Failed to fetch YOLOv8 detection status:", err);
        }
    }

    fetchDetectionStatus();
    setInterval(fetchDetectionStatus, 2000);
});