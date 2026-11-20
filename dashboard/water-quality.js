document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Header Date Logic ---
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    const currentDateEl = document.getElementById('currentDate');
    if (currentDateEl) {
        currentDateEl.innerText = `${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`;
    }

    // --- 2. Chart State & Initialization ---
    const chartData = {
        ph: {
            name: "pH Level",
            labels: ["Init"],
            data: [7.9],
            min: 7.5,
            max: 8.5
        },
        temp: {
            name: "Temperature",
            labels: ["Init"],
            data: [29.4],
            min: 28.0,
            max: 32.0
        }
    };

    let currentParam = 'ph';
    let waterChart = null;

    const canvas = document.getElementById('waterChart');
    if (canvas && typeof Chart !== 'undefined') {
        const ctx = canvas.getContext('2d');
        waterChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.ph.labels,
                datasets: [{
                    label: chartData.ph.name,
                    data: chartData.ph.data,
                    borderColor: '#1b4332',
                    backgroundColor: 'rgba(27, 67, 50, 0.12)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointBackgroundColor: '#1b4332',
                    tension: 0.35,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: {
                        min: 6.5,
                        max: 9.0
                    }
                }
            }
        });
    }

    function updateChartDisplay() {
        if (!waterChart) return;
        const activeSet = chartData[currentParam];
        waterChart.data.labels = activeSet.labels;
        waterChart.data.datasets[0].label = currentParam === 'ph' ? 'pH Level' : 'Temperature (°C)';
        waterChart.data.datasets[0].data = activeSet.data;

        if (currentParam === 'ph') {
            waterChart.options.scales.y.min = 6.5;
            waterChart.options.scales.y.max = 9.0;
        } else {
            waterChart.options.scales.y.min = 24.0;
            waterChart.options.scales.y.max = 35.0;
        }
        waterChart.update();
    }

    // --- 3. Parameter Toggle Buttons ---
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentParam = btn.getAttribute('data-dataset') || 'ph';
            updateChartDisplay();
        });
    });

    // --- 4. Live Polling from Flask Backend ---
    async function fetchWaterQuality() {
        try {
            const response = await fetch('/api/dashboard');
            if (!response.ok) return;
            const data = await response.json();

            const paramValues = document.querySelectorAll('.parameters-row .param-value');
            const paramStatuses = document.querySelectorAll('.parameters-row .param-status');

            const phNum = Number(data.ph);
            const tempNum = Number(data.temp);

            if (paramValues.length >= 2) {
                if (!Number.isNaN(phNum)) paramValues[0].innerHTML = `${phNum.toFixed(2)}`;
                if (!Number.isNaN(tempNum)) paramValues[1].innerHTML = `${tempNum.toFixed(1)}<span>°C</span>`;
            }

            if (paramStatuses.length >= 2) {
                const phOk = phNum >= 7.5 && phNum <= 8.5;
                const tempOk = tempNum >= 28.0 && tempNum <= 32.0;
                paramStatuses[0].innerText = phOk ? "Normal (7.5 – 8.5)" : "Out of Range";
                paramStatuses[1].innerText = tempOk ? "Normal (28 – 32 °C)" : "Out of Range";
            }

            // Fallback to local clock if data.lastEsp32Ping is missing
            const lastUpdatedEl = document.querySelector('.last-updated');
            if (lastUpdatedEl) {
                const nowClock = new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                lastUpdatedEl.innerText = `Last updated: ${data.lastEsp32Ping || nowClock}`;
            }

            if (
                data.telemetryHistory &&
                Array.isArray(data.telemetryHistory.labels) &&
                data.telemetryHistory.labels.length > 0
            ) {
                chartData.ph.labels = data.telemetryHistory.labels;
                chartData.ph.data = Array.isArray(data.telemetryHistory.ph) ? data.telemetryHistory.ph : chartData.ph.data;
                chartData.temp.labels = data.telemetryHistory.labels;
                chartData.temp.data = Array.isArray(data.telemetryHistory.temp) ? data.telemetryHistory.temp : chartData.temp.data;
                updateChartDisplay();
            }
        } catch (err) {
            console.error("Failed to fetch water quality data:", err);
        }
    }

    fetchWaterQuality();
    setInterval(fetchWaterQuality, 2500);
});