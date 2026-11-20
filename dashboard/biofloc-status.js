document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Header Date Logic ---
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    const currentDateEl = document.getElementById('currentDate');
    if (currentDateEl) {
        currentDateEl.innerText = `${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`;
    }

    // --- 2. Update Biofloc Tank Level Dynamically ---
    window.updateBioflocLevel = function(percentage) {
        const safePercent = Math.max(0, Math.min(100, percentage));

        const tankFill = document.getElementById('bf-tank-fill');
        const tankText = document.getElementById('bf-tank-text');
        if (tankFill && tankText) {
            tankFill.style.height = safePercent + '%';
            tankText.innerText = safePercent + '%';
        }

        const progFill = document.getElementById('progress-bar-fill');
        const progText = document.getElementById('progress-text');
        if (progFill && progText) {
            progFill.style.width = safePercent + '%';
            progText.innerText = safePercent + '% full';
        }

        let barColor = 'var(--primary)';
        if (safePercent >= 90) {
            barColor = '#d32f2f';
        } else if (safePercent >= 70) {
            barColor = '#f57c00';
        }

        if (tankFill) tankFill.style.backgroundColor = barColor;
        if (progFill) progFill.style.backgroundColor = barColor;
    };

    // --- 3. Manual Single Transfer Event Logger (Preserved Helper) ---
    window.addTransferLog = function(confidenceScore) {
        const historyList = document.getElementById('transfer-history-list');
        if (!historyList) return;

        const now = new Date();
        const dateStr = `${months[now.getMonth()]} ${now.getDate()}`;
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const lastEl = document.getElementById('val-last-transfer');
        if (lastEl) lastEl.innerText = timeStr;

        const totalEl = document.getElementById('val-transfers');
        if (totalEl) {
            const currentTotal = parseInt(totalEl.innerText, 10) || 0;
            totalEl.innerText = currentTotal + 1;
        }

        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-left">
                <div class="history-icon">⇆</div>
                <div class="history-details">
                    <strong>Pump triggered — waste transferred to biofloc</strong>
                    <p>${dateStr} at ${timeStr} • Confidence: ${confidenceScore}%</p>
                </div>
            </div>
            <div class="history-right">
                <span class="badge-success">Transferred</span>
            </div>
        `;

        historyList.insertBefore(item, historyList.firstChild);
    };

    // --- 4. Render Full Transfer History from Flask State ---
    function syncTransferHistory(historyListData, totalTransfers, lastTransferTime) {
        const lastEl = document.getElementById('val-last-transfer');
        const totalEl = document.getElementById('val-transfers');
        const historyList = document.getElementById('transfer-history-list');

        if (lastEl) lastEl.innerText = lastTransferTime || '--';
        if (totalEl) totalEl.innerText = totalTransfers ?? 0;

        if (!historyList || !Array.isArray(historyListData) || historyListData.length === 0) return;

        historyList.innerHTML = historyListData.map(entry => `
            <div class="history-item">
                <div class="history-left">
                    <div class="history-icon">⇆</div>
                    <div class="history-details">
                        <strong>Pump triggered — waste transferred to biofloc</strong>
                        <p>${entry.date} at ${entry.time} • Confidence: ${entry.confidence}%</p>
                    </div>
                </div>
                <div class="history-right">
                    <span class="badge-success">Transferred</span>
                </div>
            </div>
        `).join('');
    }

    // --- 5. Live Polling from Flask Backend ---
    async function fetchBioflocStatus() {
        try {
            const response = await fetch('/api/dashboard');
            if (!response.ok) return;
            const data = await response.json();
            window.updateBioflocLevel(data.bioflocLevel);
            syncTransferHistory(data.transferHistory, data.bioflocTransfers, data.lastTransferTime);
        } catch (err) {
            console.error("Failed to fetch biofloc status:", err);
        }
    }

    fetchBioflocStatus();
    setInterval(fetchBioflocStatus, 2500);
});