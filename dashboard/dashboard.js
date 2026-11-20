document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Dynamic Date Logic ---
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fullMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const fullDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    const today = new Date();
    const shortDate = `${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`;
    const longDate = `${fullDays[today.getDay()]}, ${fullMonths[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

    const currentDateElement = document.getElementById('currentDate');
    const fullDateElement = document.getElementById('fullDate');

    if (currentDateElement) currentDateElement.innerText = shortDate;
    if (fullDateElement) fullDateElement.innerText = longDate;

    // --- 2. Overview Data Updater ---
    window.updateOverviewData = function(data) {
        // Update Parameters Row (pH and Temp)
        const paramValues = document.querySelectorAll('.parameters-row .param-value');
        const paramStatuses = document.querySelectorAll('.parameters-row .param-status');

        if (paramValues.length >= 2) {
            paramValues[0].innerHTML = `${Number(data.ph).toFixed(2)}`;
            paramValues[1].innerHTML = `${Number(data.temp).toFixed(1)}<span>°C</span>`;
        }

        const phOk = data.ph >= 7.5 && data.ph <= 8.5;
        const tempOk = data.temp >= 28.0 && data.temp <= 32.0;

        if (paramStatuses.length >= 2) {
            paramStatuses[0].innerText = phOk ? "Normal" : "Out of Range";
            paramStatuses[1].innerText = tempOk ? "Normal" : "Out of Range";
        }

        // Update Hero System Status Badge
        const heroBadge = document.querySelector('.system-normal-badge');
        if (heroBadge) {
            const allNormal = phOk && tempOk;
            heroBadge.innerHTML = `<span class="dot white-dot"></span> ${allNormal ? 'All Systems Optimal' : 'Parameter Adjustment Active'}`;
        }

        // Update Experiment Day from shrimpMetrics if available
        const dayNumberEl = document.querySelector('.hero-right .day-number');
        if (dayNumberEl && data.shrimpMetrics && data.shrimpMetrics.daysRunning) {
            dayNumberEl.innerText = data.shrimpMetrics.daysRunning;
        }

        // Update Biofloc Reservoir Card
        const tankFill = document.querySelector('.biofloc-card .tank-fill');
        const tankText = document.querySelector('.biofloc-card .tank-text');
        const tankSubtext = document.querySelector('.biofloc-card .tank-subtext');

        if (tankFill && tankText && tankSubtext) {
            tankFill.style.height = `${data.bioflocLevel}%`;
            tankText.innerText = `${data.bioflocLevel}%`;
            tankSubtext.innerHTML = `<strong>${data.bioflocTransfers} total transfers</strong><br>Last: ${data.lastTransferTime || '--'}`;
        }

        // Update System Status List (ESP32, 3x Camera count, WiFi)
        if (data.devices) {
            const sysItems = document.querySelectorAll('.system-list .sys-status');
            const onlineCamCount = [data.devices.cam1, data.devices.cam2, data.devices.cam3].filter(Boolean).length;

            if (sysItems[0]) {
                const espOnline = Boolean(data.devices.esp32);
                sysItems[0].innerHTML = `<span class="dot" style="background-color: ${espOnline ? '#2e7d32' : '#d32f2f'};"></span> ${espOnline ? 'Online' : 'Offline'}`;
            }

            if (sysItems[1]) {
                const anyCamOnline = onlineCamCount > 0;
                const camText = anyCamOnline ? `Online (${onlineCamCount}/3)` : 'Offline (0/3)';
                sysItems[1].innerHTML = `<span class="dot" style="background-color: ${anyCamOnline ? '#2e7d32' : '#d32f2f'};"></span> ${camText}`;
            }

            if (sysItems[2]) {
                const wifiOnline = Boolean(data.devices.wifi);
                sysItems[2].innerHTML = `<span class="dot" style="background-color: ${wifiOnline ? '#2e7d32' : '#d32f2f'};"></span> ${wifiOnline ? 'Online' : 'Offline'}`;
            }
        }

        // Update Latest 2 Alert Preview Boxes inside System & Alerts Card
        const alertBoxes = document.querySelectorAll('.detail-card .alert-box');
        if (alertBoxes.length > 0 && Array.isArray(data.alerts) && data.alerts.length > 0) {
            alertBoxes.forEach((box, idx) => {
                if (data.alerts[idx]) {
                    box.innerText = data.alerts[idx].message;
                    box.className = data.alerts[idx].type === 'warning'
                        ? 'alert-box warning-alert'
                        : 'alert-box info-alert';
                }
            });
        }

        // Update YOLOv8 Banner (shows active camera if waste detected)
        const yoloStatusText = document.querySelector('.yolo-banner .yolo-text p strong');
        if (yoloStatusText && data.detection) {
            if (data.detection.type === 'waste') {
                const camMap = { cam1: 'Cam 1', cam2: 'Cam 2', cam3: 'Cam 3' };
                const camTag = camMap[data.detection.activeCamera] ? ` (${camMap[data.detection.activeCamera]})` : '';
                yoloStatusText.innerText = `Waste Detected${camTag}`;
            } else {
                yoloStatusText.innerText = 'Clear';
            }
        }
    };

    // --- 3. Live Backend Polling ---
    async function fetchOverviewData() {
        try {
            const response = await fetch('/api/dashboard');
            if (!response.ok) return;
            const data = await response.json();
            window.updateOverviewData(data);
        } catch (err) {
            console.error("Failed to fetch dashboard state:", err);
        }
    }

    fetchOverviewData();
    setInterval(fetchOverviewData, 2500);
});