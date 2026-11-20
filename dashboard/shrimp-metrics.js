document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Header Date Logic ---
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    const currentDateEl = document.getElementById('currentDate');
    if (currentDateEl) {
        currentDateEl.innerText = `${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`;
    }

    const STORAGE_KEY = "smart_aquaguard_shrimp_metrics_v1";

    function getDefaultState() {
        return {
            daysRunning: 14,
            totalStocked: 50,
            alive: 48,
            dead: 2,
            chartLabels: ["Day 1", "Day 3", "Day 5", "Day 7", "Day 9", "Day 12", "Day 14"],
            aliveHistory: [50, 50, 49, 49, 48, 48, 48],
            deadHistory: [0, 0, 1, 1, 2, 2, 2],
            logs: [
                {
                    action: "dead",
                    count: 1,
                    note: "Routine morning check",
                    time: "Day 9 • 08:30 AM",
                    aliveAfter: 48,
                    deadAfter: 2,
                    stockedAfter: 50
                },
                {
                    action: "dead",
                    count: 1,
                    note: "Molting stress observed",
                    time: "Day 5 • 09:15 AM",
                    aliveAfter: 49,
                    deadAfter: 1,
                    stockedAfter: 50
                }
            ]
        };
    }

    function loadLocalState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.alive === "number") return parsed;
            }
        } catch (e) {
            console.warn("Could not read local shrimp metrics:", e);
        }
        return getDefaultState();
    }

    function saveLocalState(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn("Could not save local shrimp metrics:", e);
        }
    }

    let shrimpState = loadLocalState();

    // --- 2. Initialize Animated Shrimp Survival Bar Chart ---
    let survivalChart = null;
    const canvas = document.getElementById('survivalChart');

    if (canvas && typeof Chart !== 'undefined') {
        const ctx = canvas.getContext('2d');
        survivalChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: shrimpState.chartLabels,
                datasets: [
                    {
                        label: 'Alive',
                        data: shrimpState.aliveHistory,
                        backgroundColor: '#38b27c',
                        borderRadius: 6,
                        barPercentage: 0.55
                    },
                    {
                        label: 'Dead',
                        data: shrimpState.deadHistory,
                        backgroundColor: '#ff8a80',
                        borderRadius: 6,
                        barPercentage: 0.55
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 750,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMax: 60,
                        ticks: { stepSize: 15 }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // --- 3. UI Feedback Helper ---
    let feedbackTimeout = null;
    function showFeedback(message, isError = false) {
        const el = document.getElementById('logger-feedback');
        if (!el) return;
        el.innerText = message;
        el.className = `logger-feedback show ${isError ? 'feedback-err' : 'feedback-ok'}`;
        clearTimeout(feedbackTimeout);
        feedbackTimeout = setTimeout(() => {
            el.classList.remove('show');
        }, 3500);
    }

    // --- 4. Render Entire Shrimp Metrics View ---
    function renderShrimpMetrics(state) {
        shrimpState = state;
        saveLocalState(state);

        const totalStocked = Math.max(1, Number(state.totalStocked) || 50);
        const alive = Math.max(0, Number(state.alive) || 0);
        const dead = Math.max(0, Number(state.dead) || 0);
        const daysRunning = Math.max(1, Number(state.daysRunning) || 1);

        const mortalityPct = ((dead / totalStocked) * 100).toFixed(1);
        const survivalPct = ((alive / totalStocked) * 100).toFixed(1);

        // Top Metric Cards
        const totalEl = document.getElementById('val-total');
        const subStockedEl = document.getElementById('sub-stocked');
        const mortEl = document.getElementById('val-mortality');
        const subDeadEl = document.getElementById('sub-dead-count');
        const survEl = document.getElementById('val-survival');

        if (totalEl) totalEl.innerText = alive;
        if (subStockedEl) subStockedEl.innerText = `of ${totalStocked} total stocked`;
        if (mortEl) mortEl.innerText = `${mortalityPct}%`;
        if (subDeadEl) subDeadEl.innerText = `${dead} total dead recorded`;
        if (survEl) survEl.innerText = `${survivalPct}%`;

        // Experiment Summary
        const sumDaysEl = document.getElementById('sum-days');
        const sumInitEl = document.getElementById('sum-initial');
        const sumCurrEl = document.getElementById('sum-current');
        const sumSurvEl = document.getElementById('sum-survival');

        if (sumDaysEl) sumDaysEl.innerText = `${daysRunning} days`;
        if (sumInitEl) sumInitEl.innerText = `${totalStocked} shrimps`;
        if (sumCurrEl) sumCurrEl.innerText = `${alive} shrimps`;
        if (sumSurvEl) sumSurvEl.innerText = `${survivalPct}%`;

        // Survival Chart
        if (survivalChart) {
            survivalChart.data.labels = state.chartLabels || [];
            survivalChart.data.datasets[0].data = state.aliveHistory || [];
            survivalChart.data.datasets[1].data = state.deadHistory || [];
            survivalChart.options.scales.y.suggestedMax = Math.max(60, totalStocked + 10);
            survivalChart.update();
        }

        // Activity Log List
        const logList = document.getElementById('shrimp-log-list');
        if (logList) {
            const logs = Array.isArray(state.logs) ? state.logs : [];
            if (logs.length === 0) {
                logList.innerHTML = `
                    <div class="history-item">
                        <div class="history-left">
                            <div class="history-icon">🦐</div>
                            <div class="history-details">
                                <strong>No manual entries yet</strong>
                                <p>Use the Dead or Add Shrimp forms above to record changes</p>
                            </div>
                        </div>
                        <div class="history-right">
                            <span class="badge-success">Ready</span>
                        </div>
                    </div>
                `;
            } else {
                logList.innerHTML = logs.map(entry => {
                    const isDead = entry.action === 'dead';
                    const title = isDead
                        ? `Recorded ${entry.count} dead shrimp`
                        : `Added +${entry.count} new shrimp to aquarium`;
                    const icon = isDead ? '−' : '+';
                    const iconStyle = isDead ? 'background-color: #e53935;' : 'background-color: var(--primary);';
                    const badgeClass = isDead ? 'a-badge badge-resolved-yellow' : 'badge-success';
                    const badgeText = isDead ? `−${entry.count} Dead` : `+${entry.count} Added`;

                    return `
                        <div class="history-item">
                            <div class="history-left">
                                <div class="history-icon" style="${iconStyle}">${icon}</div>
                                <div class="history-details">
                                    <strong>${title}</strong>
                                    <p>${entry.time} • ${entry.note || 'Manual entry'} (Alive: ${entry.aliveAfter} / Stocked: ${entry.stockedAfter})</p>
                                </div>
                            </div>
                            <div class="history-right">
                                <span class="${badgeClass}">${badgeText}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    // --- 5. Apply Action Locally (Fallback if Flask isn't running) & Sync with Flask ---
    async function dispatchShrimpAction(payload) {
        // Try sending to Flask backend first
        try {
            const response = await fetch('/api/shrimp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (response.ok && result.shrimpMetrics) {
                renderShrimpMetrics(result.shrimpMetrics);
                return { ok: true };
            } else if (!response.ok) {
                return { ok: false, message: result.message || "Invalid input" };
            }
        } catch (err) {
            // Fallback to local state when viewing static HTML without Flask running
        }

        // Local fallback calculation
        const next = JSON.parse(JSON.stringify(shrimpState));
        const now = new Date();
        const timeLabel = `${months[now.getMonth()]} ${now.getDate()} • ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const chartLabel = `${months[now.getMonth()]} ${now.getDate()}`;

        if (payload.action === 'dead') {
            const cnt = Number(payload.count) || 0;
            if (cnt <= 0) return { ok: false, message: "Enter a valid number greater than 0." };
            if (cnt > next.alive) return { ok: false, message: `Only ${next.alive} alive shrimp left.` };

            next.alive -= cnt;
            next.dead += cnt;
            if (next.chartLabels[next.chartLabels.length - 1] === chartLabel) {
                next.aliveHistory[next.aliveHistory.length - 1] = next.alive;
                next.deadHistory[next.deadHistory.length - 1] = next.dead;
            } else {
                next.chartLabels.push(chartLabel);
                next.aliveHistory.push(next.alive);
                next.deadHistory.push(next.dead);
            }
            next.logs.unshift({
                action: 'dead',
                count: cnt,
                note: payload.note || 'Manual mortality log',
                time: timeLabel,
                aliveAfter: next.alive,
                deadAfter: next.dead,
                stockedAfter: next.totalStocked
            });
            renderShrimpMetrics(next);
            return { ok: true };
        }

        if (payload.action === 'add') {
            const cnt = Number(payload.count) || 0;
            if (cnt <= 0) return { ok: false, message: "Enter a valid number greater than 0." };

            next.alive += cnt;
            next.totalStocked += cnt;
            if (next.chartLabels[next.chartLabels.length - 1] === chartLabel) {
                next.aliveHistory[next.aliveHistory.length - 1] = next.alive;
                next.deadHistory[next.deadHistory.length - 1] = next.dead;
            } else {
                next.chartLabels.push(chartLabel);
                next.aliveHistory.push(next.alive);
                next.deadHistory.push(next.dead);
            }
            next.logs.unshift({
                action: 'add',
                count: cnt,
                note: payload.note || 'Added new shrimp stock',
                time: timeLabel,
                aliveAfter: next.alive,
                deadAfter: next.dead,
                stockedAfter: next.totalStocked
            });
            renderShrimpMetrics(next);
            return { ok: true };
        }

        if (payload.action === 'undo') {
            if (!next.logs || next.logs.length === 0) {
                return { ok: false, message: "Nothing to undo." };
            }
            const last = next.logs.shift();
            if (last.action === 'dead') {
                next.alive += last.count;
                next.dead = Math.max(0, next.dead - last.count);
            } else if (last.action === 'add') {
                next.alive = Math.max(0, next.alive - last.count);
                next.totalStocked = Math.max(next.alive + next.dead, next.totalStocked - last.count);
            }
            if (next.aliveHistory.length > 0) next.aliveHistory[next.aliveHistory.length - 1] = next.alive;
            if (next.deadHistory.length > 0) next.deadHistory[next.deadHistory.length - 1] = next.dead;
            renderShrimpMetrics(next);
            return { ok: true };
        }

        if (payload.action === 'reset') {
            const initStock = Math.max(1, Number(payload.initialStock) || 50);
            const daysRun = Math.max(1, Number(payload.daysRunning) || 1);
            const resetState = {
                daysRunning: daysRun,
                totalStocked: initStock,
                alive: initStock,
                dead: 0,
                chartLabels: [`Day ${daysRun}`],
                aliveHistory: [initStock],
                deadHistory: [0],
                logs: [{
                    action: 'add',
                    count: initStock,
                    note: `Baseline stock initialized (Day ${daysRun})`,
                    time: timeLabel,
                    aliveAfter: initStock,
                    deadAfter: 0,
                    stockedAfter: initStock
                }]
            };
            renderShrimpMetrics(resetState);
            return { ok: true };
        }

        return { ok: false, message: "Unknown action" };
    }

    // --- 6. Event Listeners for Buttons & Quick Chips ---
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const val = parseInt(btn.getAttribute('data-val'), 10) || 1;
            const inputEl = document.getElementById(targetId);
            if (inputEl) {
                inputEl.value = val;
            }
        });
    });

    document.getElementById('btn-submit-dead')?.addEventListener('click', async () => {
        const countInput = document.getElementById('input-dead-count');
        const noteInput = document.getElementById('input-dead-note');
        const count = parseInt(countInput?.value, 10) || 0;
        const note = noteInput?.value.trim() || "";

        const res = await dispatchShrimpAction({ action: 'dead', count, note });
        if (res.ok) {
            showFeedback(`Recorded ${count} dead shrimp.`);
            if (noteInput) noteInput.value = "";
        } else {
            showFeedback(res.message, true);
        }
    });

    document.getElementById('btn-submit-add')?.addEventListener('click', async () => {
        const countInput = document.getElementById('input-add-count');
        const noteInput = document.getElementById('input-add-note');
        const count = parseInt(countInput?.value, 10) || 0;
        const note = noteInput?.value.trim() || "";

        const res = await dispatchShrimpAction({ action: 'add', count, note });
        if (res.ok) {
            showFeedback(`Added +${count} new shrimp to tank.`);
            if (noteInput) noteInput.value = "";
        } else {
            showFeedback(res.message, true);
        }
    });

    document.getElementById('btn-undo-shrimp')?.addEventListener('click', async () => {
        const res = await dispatchShrimpAction({ action: 'undo' });
        if (res.ok) {
            showFeedback("Last shrimp log undone.");
        } else {
            showFeedback(res.message, true);
        }
    });

    document.getElementById('btn-reset-shrimp')?.addEventListener('click', async () => {
        const stockPrompt = prompt("Enter initial starting shrimp count:", String(shrimpState.totalStocked || 50));
        if (stockPrompt === null) return;
        const initialStock = parseInt(stockPrompt, 10);
        if (isNaN(initialStock) || initialStock <= 0) {
            showFeedback("Please enter a valid positive number.", true);
            return;
        }

        const dayPrompt = prompt("Enter current experiment day number:", String(shrimpState.daysRunning || 1));
        const daysRunning = parseInt(dayPrompt || "1", 10) || 1;

        const res = await dispatchShrimpAction({ action: 'reset', initialStock, daysRunning });
        if (res.ok) {
            showFeedback(`Baseline set to ${initialStock} shrimps (Day ${daysRunning}).`);
        }
    });

    // --- 7. Initial Render & Backend Sync ---
    renderShrimpMetrics(shrimpState);

    fetch('/api/shrimp')
        .then(res => res.ok ? res.json() : null)
        .then(serverMetrics => {
            if (serverMetrics && typeof serverMetrics.alive === 'number') {
                renderShrimpMetrics(serverMetrics);
            }
        })
        .catch(() => {
            // Running in static mode; localStorage state is already rendered
        });
});