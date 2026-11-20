document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Header Date Logic ---
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    const currentDateEl = document.getElementById('currentDate');
    if (currentDateEl) {
        currentDateEl.innerText = `${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`;
    }

    // --- 2. Global Helper to Add a Single Alert Dynamically ---
    window.addSystemAlert = function(alertType, message, status) {
        const alertList = document.getElementById('alert-list');
        if (!alertList) return;

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const item = document.createElement('div');
        let icon, textClass, badgeClass;

        if (alertType === 'warning') {
            item.className = 'alert-item alert-warning';
            icon = '⚠️';
            textClass = 'text-yellow';
            badgeClass = 'badge-resolved-yellow';
        } else if (alertType === 'success') {
            item.className = 'alert-item alert-success';
            icon = '✅';
            textClass = 'text-green';
            badgeClass = status === 'Active' ? 'badge-active-green' : 'badge-resolved-green';
        } else {
            item.className = 'alert-item alert-info';
            icon = 'ⓘ';
            textClass = '';
            badgeClass = 'badge-resolved-gray';
        }

        item.innerHTML = `
            <div class="alert-left">
                <div class="alert-icon-circle ${textClass}">${icon}</div>
                <div class="alert-text">
                    <strong class="${textClass}">${message}</strong>
                    <span>${timeStr}</span>
                </div>
            </div>
            <div class="alert-right">
                <span class="a-badge ${badgeClass}">${status}</span>
            </div>
        `;

        alertList.insertBefore(item, alertList.firstChild);
    };

    // --- 3. Render Alerts & Device Health (ESP32, 3x ESP32-CAM, WiFi) ---
    function renderAlertsAndDevices(data) {
        if (data.devices) {
            const statusEls = document.querySelectorAll('.device-grid .sys-status');
            const onlineCamCount = [data.devices.cam1, data.devices.cam2, data.devices.cam3].filter(Boolean).length;

            if (statusEls[0]) {
                const espOnline = Boolean(data.devices.esp32);
                statusEls[0].innerHTML = `<span class="dot" style="background-color: ${espOnline ? '#2e7d32' : '#d32f2f'};"></span> ${espOnline ? 'Online' : 'Offline'}`;
            }

            if (statusEls[1]) {
                const anyCamOnline = onlineCamCount > 0;
                const camStatusLabel = anyCamOnline
                    ? `Online (${onlineCamCount}/3 Cams)`
                    : 'Offline (0/3 Cams)';
                statusEls[1].innerHTML = `<span class="dot" style="background-color: ${anyCamOnline ? '#2e7d32' : '#d32f2f'};"></span> ${camStatusLabel}`;
            }

            if (statusEls[2]) {
                const wifiOnline = Boolean(data.devices.wifi);
                statusEls[2].innerHTML = `<span class="dot" style="background-color: ${wifiOnline ? '#2e7d32' : '#d32f2f'};"></span> ${wifiOnline ? 'Online' : 'Offline'}`;
            }
        }

        const pingEl = document.querySelector('.last-ping');
        if (pingEl && data.lastEsp32Ping) {
            pingEl.innerText = `Last ping: ${data.lastEsp32Ping}`;
        }

        const alertList = document.getElementById('alert-list');
        if (!alertList || !Array.isArray(data.alerts)) return;

        const activeCount = data.alerts.filter(a => a.status === 'Active').length;
        const warningBadge = document.querySelector('.warning-badge');
        if (warningBadge) {
            warningBadge.innerText = `⚠️ ${activeCount} Active`;
        }

        alertList.innerHTML = data.alerts.map(alert => {
            let itemClass = 'alert-item alert-info';
            let icon = 'ⓘ';
            let textClass = '';
            let badgeClass = 'badge-resolved-gray';

            if (alert.type === 'warning') {
                itemClass = 'alert-item alert-warning';
                icon = '⚠️';
                textClass = 'text-yellow';
                badgeClass = 'badge-resolved-yellow';
            } else if (alert.type === 'success') {
                itemClass = 'alert-item alert-success';
                icon = '✅';
                textClass = 'text-green';
                badgeClass = alert.status === 'Active' ? 'badge-active-green' : 'badge-resolved-green';
            }

            return `
                <div class="${itemClass}">
                    <div class="alert-left">
                        <div class="alert-icon-circle ${textClass}">${icon}</div>
                        <div class="alert-text">
                            <strong class="${textClass}">${alert.message}</strong>
                            <span>${alert.time}</span>
                        </div>
                    </div>
                    <div class="alert-right">
                        <span class="a-badge ${badgeClass}">${alert.status}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- 4. Live Polling from Flask Backend ---
    async function fetchAlerts() {
        try {
            const response = await fetch('/api/dashboard');
            if (!response.ok) return;
            const data = await response.json();
            renderAlertsAndDevices(data);
        } catch (err) {
            console.error("Failed to fetch alerts:", err);
        }
    }

    fetchAlerts();
    setInterval(fetchAlerts, 2500);
});