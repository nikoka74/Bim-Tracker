// ============================================================
// Global Toast Notification
// ============================================================
function showNotification(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white; padding: 10px 16px; margin-top: 8px; border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 12px; z-index: 99999;
        font-family: inherit; direction: rtl;
    `;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
}

// ============================================================
// Firebase Config
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyDdX6iplyIuYevuh6Ceyd7SMRZWmZy8pqY",
    authDomain: "bim-operations.firebaseapp.com",
    databaseURL: "https://bim-operations-default-rtdb.firebaseio.com",
    projectId: "bim-operations",
    storageBucket: "bim-operations.firebasestorage.app",
    messagingSenderId: "601649835431",
    appId: "1:601649835431:web:da5fd50f5f6dfb330d5a82"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();

// ============================================================
// Global Variables
// ============================================================
let currentSection = 'lfd';
let headerClickCount = 0;
let mapInstance = null;
let liveMarkers = {};
let currentFilter = 'all';
let statsChartInstance = null;
let teamCoordinates = null;
let currentSelectedTeam = null;

const ADMIN_PIN = "Razwan";

const TEAM_PINS = {};
for (let i = 1; i <= 150; i++) {
    TEAM_PINS[`team_${i}`] = String(1000 + i);
}

// ============================================================
// Device Info
// ============================================================
function getDeviceInfo() {
    const ua = navigator.userAgent;
    let device = "Desktop / PC";
    if (/android/i.test(ua)) device = "Android Mobile";
    else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) device = "iOS / iPhone";
    else if (/tablet/i.test(ua)) device = "Tablet";

    let browser = "Web Browser";
    if (ua.indexOf("Chrome") > -1) browser = "Google Chrome";
    else if (ua.indexOf("Safari") > -1) browser = "Safari";
    else if (ua.indexOf("Firefox") > -1) browser = "Firefox";
    else if (ua.indexOf("Edge") > -1) browser = "MS Edge";

    return `${device} (${browser})`;
}

// ============================================================
// Audit Log
// ============================================================
function logActivity(actionType, description) {
    const deviceInfo = getDeviceInfo();
    const logData = {
        action: actionType,
        desc: description,
        device: deviceInfo,
        timestamp: Date.now(),
        dateFormatted: new Date().toLocaleString()
    };
    db.ref('auditLogs').push(logData);
}

// ============================================================
// Populate Team Dropdowns
// ============================================================
function populateTeamDropdowns() {
    const adminSelect = document.getElementById('privateMsgTeam');
    const kmlSelect = document.getElementById('kmlTargetTeam');
    const mainSelect = document.getElementById('teamSelect');

    if (adminSelect) adminSelect.innerHTML = '<option value="">-- تیم --</option>';
    if (kmlSelect) kmlSelect.innerHTML = '<option value="">-- هەڵبژاردنی تیم --</option>';
    if (mainSelect) mainSelect.innerHTML = '<option value="">-- تیم هەڵبژێرە --</option><option value="custom">✍️ نووسینی ناوی تیم بەدەست...</option>';

    for (let i = 1; i <= 150; i++) {
        const teamKey = `team_${i}`;
        const teamName = `Team ${i}`;

        if (mainSelect) {
            const opt = document.createElement('option');
            opt.value = teamKey;
            opt.textContent = teamName;
            mainSelect.appendChild(opt);
        }
        if (adminSelect) {
            const opt = document.createElement('option');
            opt.value = teamKey;
            opt.textContent = teamName;
            adminSelect.appendChild(opt);
        }
        if (kmlSelect) {
            const opt = document.createElement('option');
            opt.value = teamKey;
            opt.textContent = teamName;
            kmlSelect.appendChild(opt);
        }
    }
}

// ============================================================
// Load Team Data (including GPS)
// ============================================================
function loadTeamData() {
    const select = document.getElementById('teamSelect');
    if (!select) return;

    if (select.value === 'custom') {
        const customName = prompt("تکایە ناوی تیمەکەت بنووسە:");
        if (customName && customName.trim()) {
            const customKey = customName.toLowerCase().replace(/\s+/g, '_');
            let exists = Array.from(select.options).some(opt => opt.value === customKey);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = customKey;
                opt.textContent = customName.trim();
                select.appendChild(opt);
            }
            select.value = customKey;
            logActivity("Custom Team", "تیمی نوێی دەستکرد زیادکرا: " + customName);
        } else {
            select.value = "";
        }
    }

    currentSelectedTeam = select.value;

    // GPS Watch
    if (navigator.geolocation && select.value) {
        const teamKey = select.value;
        const teamName = select.options[select.selectedIndex].text;

        navigator.geolocation.watchPosition((position) => {
            teamCoordinates = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            db.ref(`liveLocations/${teamKey}`).set({
                teamName: teamName,
                lat: teamCoordinates.lat,
                lng: teamCoordinates.lng,
                timestamp: Date.now()
            });

        }, (error) => {
            console.log('GPS Error:', error.message);
        }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 });
    }

    // Check for private messages and team file
    if (select.value) {
        checkPrivateMessage(select.value);
        checkTeamFile(select.value);
    }
}

// ============================================================
// Admin Panel Trigger (3 clicks)
// ============================================================
function handleHeaderClick() {
    headerClickCount++;
    if (headerClickCount >= 3) {
        document.getElementById('customModalOverlay').style.display = 'flex';
        document.getElementById('modalTitle').innerText = "پشتڕاستکردنەوەی ئەدمین";
        document.getElementById('modalDesc').innerText = "تکایە پین کۆدی بەڕێوەبەر (Admin) بنووسە:";
        
        document.getElementById('modalConfirmBtn').onclick = () => {
            const pin = document.getElementById('customModalInput').value;
            if (pin === ADMIN_PIN) { 
                const adminPanel = document.getElementById('adminPanel');
                adminPanel.classList.toggle('active');
                showNotification('بەشی ئەدمین بە سەرکەوتوویی کرایەوە');
                closeCustomModal(true);
                logActivity("Admin Login", "ئەدمین (Razwan) چووە ژوورەوە بۆ پانێڵ");
                loadAdminData();
            } else {
                showNotification('کۆدی ئەدمین هەڵەیە!', 'error');
                logActivity("Failed Login", "هەوڵی شکستخواردوو بۆ چوونەژوورەوەی ئەدمین");
            }
        };
        headerClickCount = 0;
    }
}

// ============================================================
// Prompt PIN and Save
// ============================================================
function promptPinAndSave() {
    const selectedTeam = document.getElementById('teamSelect')?.value;
    if (!selectedTeam) {
        return showNotification('تکایە سەرەتا تیمەکەت هەڵبژێرە!', 'error');
    }

    const teamLabel = document.getElementById('teamSelect').options[document.getElementById('teamSelect').selectedIndex].text;

    document.getElementById('customModalOverlay').style.display = 'flex';
    document.getElementById('modalTitle').innerText = "پشتڕاستکردنەوەی تیم";
    document.getElementById('modalDesc').innerText = `تکایە پین کۆدی تایبەت بە ${teamLabel} بنووسە:`;

    document.getElementById('modalConfirmBtn').onclick = () => {
        const inputPin = document.getElementById('customModalInput').value;
        const correctPin = TEAM_PINS[selectedTeam];

        if ((correctPin && inputPin === correctPin) || inputPin === ADMIN_PIN || !correctPin) {
            closeCustomModal(true);
            saveReportToDatabase(selectedTeam, teamLabel);
        } else {
            showNotification('پین کۆدی ئەم تیمە هەڵەیە!', 'error');
            logActivity("Team Pin Error", `هەڵە لە پین کۆدی ${teamLabel}`);
        }
    };
}

// ============================================================
// Save Report to Database
// ============================================================
function saveReportToDatabase(teamKey, teamName) {
    const isOffday = document.getElementById('c_offday')?.checked || false;
    const notes = document.getElementById('c_notes')?.value || '';
    
    let totalPoints = 0;
    const inputs = document.querySelectorAll('#casesGridContainer input');
    inputs.forEach(inp => {
        totalPoints += Number(inp.value) || 0;
    });

    const todayDate = new Date().toISOString().split('T')[0];

    db.ref(`reports/${todayDate}/${teamKey}`).set({
        teamName: teamName,
        total: totalPoints,
        offday: isOffday,
        notes: notes,
        coords: teamCoordinates || { lat: 36.19, lng: 44.01 },
        timestamp: Date.now()
    }).then(() => {
        showNotification(`ڕاپۆرتی ${teamName} بە سەرکەوتوویی نێردرا.`);
        logActivity("Report Submitted", `ڕاپۆرت نێردرا لەلایەن ${teamName} - کۆی خاڵ: ${totalPoints}`);
        document.getElementById('c_notes').value = '';
        inputs.forEach(inp => inp.value = '');
        if(document.getElementById('c_offday')) document.getElementById('c_offday').checked = false;
        loadAdminData();
    }).catch(err => {
        showNotification('هەڵە لە ناردنی داتا: ' + err.message, 'error');
    });
}

// ============================================================
// Close Custom Modal
// ============================================================
function closeCustomModal(clear) {
    document.getElementById('customModalOverlay').style.display = 'none';
    if(clear) document.getElementById('customModalInput').value = '';
}

// ============================================================
// Load Admin Data, Leaderboard & Analytics
// ============================================================
function loadAdminData() {
    const dateSelector = document.getElementById('adminDateSelector');
    let targetDate = dateSelector ? dateSelector.value : null;
    if (!targetDate) {
        targetDate = new Date().toISOString().split('T')[0];
    }

    db.ref(`reports/${targetDate}`).on('value', (snapshot) => {
        const container = document.getElementById('leaderboardContainer');
        if(!container) return;
        container.innerHTML = '';
        const data = snapshot.val() || {};
        
        let grandTotal = 0;
        let sortedTeams = Object.keys(data).map(k => ({ key: k, ...data[k] }));
        sortedTeams.sort((a, b) => b.total - a.total);

        let chartLabels = [];
        let chartValues = [];

        // Apply filter
        let filteredTeams = sortedTeams;
        if (currentFilter === 'achieved') {
            filteredTeams = sortedTeams.filter(item => item.total >= 7);
        } else if (currentFilter === 'missed') {
            filteredTeams = sortedTeams.filter(item => item.total < 7 && item.total > 0);
        } else if (currentFilter === 'offday') {
            filteredTeams = sortedTeams.filter(item => item.offday === true);
        }

        filteredTeams.forEach((item, index) => {
            grandTotal += item.total || 0;
            if(index < 7) {
                chartLabels.push(item.teamName);
                chartValues.push(item.total);
            }

            const div = document.createElement('div');
            div.className = 'leaderboard-item';
            div.style.cssText = "background:rgba(11,15,25,0.8); padding:8px 12px; border-radius:8px; margin-bottom:6px; border:1px solid rgba(255,255,255,0.05); font-size:11px;";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span><strong>#${index+1}</strong> ${item.teamName}</span>
                    <span style="font-weight:bold; color:#34d399;">${item.total} خاڵ</span>
                </div>
                ${item.notes ? `<div style="color:#f87171; margin-top:2px;">تێبینی: ${item.notes}</div>` : ''}
                ${item.offday ? `<div style="color:#fbbf24; margin-top:2px;">🔆 پشوو</div>` : ''}
            `;
            container.appendChild(div);
        });

        const totalBadge = document.getElementById('adminSectionTotal');
        if(totalBadge) totalBadge.innerText = `Total: ${grandTotal}`;
        
        const grandCounter = document.getElementById('grandTotalPoints');
        if(grandCounter) grandCounter.innerText = grandTotal;

        updateStatsChart(chartLabels, chartValues);
    });

    // Load audit logs
    loadAuditLogsIntoAdmin();
}

// ============================================================
// Load Audit Logs
// ============================================================
function loadAuditLogsIntoAdmin() {
    db.ref('auditLogs').limitToLast(100).on('value', (snapshot) => {
        let logContainer = document.getElementById('auditLogsContainer');
        if (!logContainer) {
            const adminPanel = document.getElementById('adminPanel');
            if (adminPanel) {
                let section = document.createElement('div');
                section.id = 'auditLogsSection';
                section.style.cssText = "margin-top:15px; padding:12px; background:rgba(0,0,0,0.4); border-radius:10px; border:1px solid rgba(56,189,248,0.2); max-height:250px; overflow-y:auto;";
                section.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <h4 style="color:#38bdf8; font-size:13px; margin:0;">📋 مێژووی لۆگی چالاکییە گشتییەکان (Audit Logs)</h4>
                        <span style="font-size:10px; color:#94a3b8; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">Device & Action History</span>
                    </div>
                    <div id="auditLogsContainer"></div>
                `;
                adminPanel.appendChild(section);
                logContainer = document.getElementById('auditLogsContainer');
            } else {
                return;
            }
        }

        logContainer.innerHTML = '';
        const logs = snapshot.val() || {};
        
        Object.keys(logs).reverse().forEach(key => {
            const item = logs[key];
            const div = document.createElement('div');
            div.style.cssText = "font-size:11px; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.03); border-radius:6px; border:1px solid rgba(255,255,255,0.05); color:#e2e8f0;";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; color:#94a3b8; font-size:10px; margin-bottom:3px;">
                    <span>🕒 ${item.dateFormatted || 'N/A'}</span>
                    <span style="color:#38bdf8; font-weight:bold;">📱 ${item.device || 'Unknown Device'}</span>
                </div>
                <div><strong style="color:#facc15;">[${item.action}]:</strong> ${item.desc}</div>
            `;
            logContainer.appendChild(div);
        });
    });
}

// ============================================================
// Update Stats Chart
// ============================================================
function updateStatsChart(labels, dataValues) {
    const canvas = document.getElementById('statsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (statsChartInstance) {
        statsChartInstance.destroy();
    }

    statsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['هیچ داتایەک نییە'],
            datasets: [{
                label: 'خاڵی تیمەکان ئەمڕۆ',
                data: dataValues.length ? dataValues : [0],
                backgroundColor: '#38bdf8',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#f8fafc', font: { size: 10 } } },
                x: { ticks: { color: '#f8fafc', font: { size: 10 } } }
            }
        }
    });
}

// ============================================================
// Section Switching
// ============================================================
function switchSection(sec) {
    currentSection = sec;
    document.getElementById('tabLFD')?.classList.remove('active');
    document.getElementById('tabMoveIn')?.classList.remove('active');
    document.getElementById('tabChat')?.classList.remove('active');
    
    document.getElementById('operationsMainWrapper').style.display = 'block';
    document.getElementById('chatSectionContainer').classList.remove('active');

    if (sec === 'lfd') {
        document.getElementById('tabLFD')?.classList.add('active');
    } else if (sec === 'movein') {
        document.getElementById('tabMoveIn')?.classList.add('active');
    } else if (sec === 'chat') {
        document.getElementById('tabChat')?.classList.add('active');
        document.getElementById('operationsMainWrapper').style.display = 'none';
        document.getElementById('chatSectionContainer').classList.add('active');
        loadChatMessages();
    }
    renderCasesGrid();
}

// ============================================================
// Render Cases Grid
// ============================================================
function renderCasesGrid() {
    const container = document.getElementById('casesGridContainer');
    if (!container) return;

    if (currentSection === 'lfd') {
        container.innerHTML = `
            <div class="case-item">Paid <input type="number" id="c_paid" min="0" placeholder="0"></div>
            <div class="case-item">Disconnected <input type="number" id="c_disc" min="0" placeholder="0"></div>
            <div class="case-item">Reconnected <input type="number" id="c_reconn" min="0" placeholder="0"></div>
            <div class="case-item">Distribution <input type="number" id="c_dist" min="0" placeholder="0"></div>
            <div class="case-item">Special <input type="number" id="c_special" min="0" placeholder="0"></div>
            <div class="case-item">Tampered <input type="number" id="c_tampered" min="0" placeholder="0"></div>
        `;
    } else {
        container.innerHTML = `
            <div class="case-item">Inst. Meter <input type="number" id="c_inst_meter" min="0" placeholder="0"></div>
            <div class="case-item">Inst. Encl <input type="number" id="c_inst_encl" min="0" placeholder="0"></div>
            <div class="case-item">3P Encl <input type="number" id="c_inst_3p" min="0" placeholder="0"></div>
            <div class="case-item">BIM Team <input type="number" id="c_bim_team" min="0" placeholder="0"></div>
        `;
    }

    // Load draft from localStorage
    loadDraftStateLocally();
}

// ============================================================
// Broadcast & Live Push
// ============================================================
db.ref('broadcastMessage').on('value', (snapshot) => {
    const data = snapshot.val();
    const ticker = document.getElementById('broadcastTicker');
    const content = document.getElementById('broadcastTextContent');

    if (data && data.text) {
        if(content) content.innerText = data.text;
        if(ticker) ticker.style.display = 'flex';
    } else {
        if(ticker) ticker.style.display = 'none';
    }
});

function saveBroadcastMessage() {
    const msg = document.getElementById('adminBroadcastInput').value;
    if(!msg.trim()) return showNotification('تکایە پەیام بنووسە', 'error');
    db.ref('broadcastMessage').set({ text: msg, timestamp: Date.now() }).then(() => {
        showNotification('پەیامی گشتی بڵاوکرایەوە');
        logActivity("Broadcast", "ئەدمین پەیامی گشتی بڵاوکردەوە: " + msg);
        document.getElementById('adminBroadcastInput').value = '';
    });
}

// ============================================================
// Private Message
// ============================================================
function sendPrivateTeamMessage() {
    const team = document.getElementById('privateMsgTeam').value;
    const msg = document.getElementById('privateMsgInput').value;
    if(!team || !msg.trim()) return showNotification('تکایە تیم و دەقی پەیامەکە دیاری بکە', 'error');
    db.ref(`privateMessages/${team}`).set({ text: msg, timestamp: Date.now() }).then(() => {
        showNotification('پەیامی تایبەت نێردرا');
        logActivity("Private Msg", `پەیامی تایبەت نێردرا بۆ ${team}`);
        document.getElementById('privateMsgInput').value = '';
    });
}

// Check private messages for current team
function checkPrivateMessage(teamKey) {
    db.ref(`privateMessages/${teamKey}`).on('value', (snapshot) => {
        const data = snapshot.val();
        const box = document.getElementById('teamPrivateMsgBox');
        const text = document.getElementById('teamPrivateMsgText');
        if (data && data.text) {
            box.style.display = 'block';
            text.innerText = data.text;
        } else {
            box.style.display = 'none';
        }
    });
}

// ============================================================
// 🗺️ Live Map Real-time Tracking
// ============================================================
function openLiveMapModal() {
    document.getElementById('liveMapModalOverlay').style.display = 'flex';
    
    if (!mapInstance) {
        mapInstance = L.map('mapContainer').setView([36.19, 44.01], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(mapInstance);
    } else {
        setTimeout(() => { mapInstance.invalidateSize(); }, 200);
    }

    db.ref('liveLocations').on('value', (snapshot) => {
        const locations = snapshot.val() || {};

        Object.keys(locations).forEach(teamKey => {
            const loc = locations[teamKey];
            if (loc && loc.lat && loc.lng) {
                if (liveMarkers[teamKey]) {
                    liveMarkers[teamKey].setLatLng([loc.lat, loc.lng]);
                    liveMarkers[teamKey].bindPopup(`<b>🟢 ${loc.teamName} (لایڤ)</b><br>دوایین نوێکردنەوە: ${new Date(loc.timestamp).toLocaleTimeString()}`);
                } else {
                    const marker = L.marker([loc.lat, loc.lng]).addTo(mapInstance)
                        .bindPopup(`<b>🟢 ${loc.teamName} (لایڤ)</b><br>دوایین نوێکردنەوە: ${new Date(loc.timestamp).toLocaleTimeString()}`);
                    liveMarkers[teamKey] = marker;
                }
            }
        });
    });
}

// ============================================================
// Filter
// ============================================================
function setFilter(filterType) {
    currentFilter = filterType;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`f_${filterType}`)?.classList.add('active');
    loadAdminData(); // Reload with filter
}

// ============================================================
// Chat System
// ============================================================
function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    const msg = input.value.trim();
    if (!msg) return;

    db.ref('chats').push({
        sender: 'کارمەند',
        text: msg,
        timestamp: Date.now()
    }).then(() => {
        input.value = '';
    });
}

function loadChatMessages() {
    db.ref('chats').limitToLast(30).on('value', (snapshot) => {
        const area = document.getElementById('chatMessagesArea');
        if (!area) return;
        area.innerHTML = '';
        const data = snapshot.val() || {};
        Object.keys(data).forEach(key => {
            const item = data[key];
            const div = document.createElement('div');
            div.className = 'chat-msg-bubble';
            div.innerHTML = `<strong>${item.sender}</strong>: <div>${item.text}</div>`;
            area.appendChild(div);
        });
        area.scrollTop = area.scrollHeight;
    });
}

// ============================================================
// Init Chart (Trend)
// ============================================================
function initChart() {
    const canvas = document.getElementById('trendChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['شەممە', 'یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە'],
            datasets: [{
                label: 'کۆی گشتی خاڵەکان',
                data: [12, 19, 15, 25, 22, 30],
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// ============================================================
// Manual Refresh
// ============================================================
function manualRefreshData() {
    loadAdminData();
    showNotification('داتاکان نوێکرانەوە');
}

// ============================================================
// Admin Date Change
// ============================================================
function onAdminDateChange() {
    loadAdminData();
    showNotification('داتاکانی بەرواری هەڵبژێردراو بارکران');
}

// ============================================================
// Admin Export Excel (Daily, Monthly, Range)
// ============================================================
function adminExportExcel(type) {
    let targetDate = new Date().toISOString().split('T')[0];
    const dateSelector = document.getElementById('adminDateSelector');
    if (dateSelector && dateSelector.value) {
        targetDate = dateSelector.value;
    }

    let path = `reports/${targetDate}`;
    if (type === 'monthly') {
        const month = targetDate.substring(0, 7);
        path = `reports_monthly/${month}`;
    }

    db.ref(path).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            return showNotification('هیچ داتایەک نەدۆزرایەوە بۆ ئەم مەودایە', 'error');
        }

        const rows = [];
        rows.push(['تیم', 'کۆی خاڵ', 'پشوو', 'تێبینی', 'کات']);
        Object.keys(data).forEach(key => {
            const item = data[key];
            rows.push([
                item.teamName || key,
                item.total || 0,
                item.offday ? 'بەڵێ' : 'نەخێر',
                item.notes || '',
                new Date(item.timestamp || Date.now()).toLocaleString()
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        const fileName = `report_${type}_${targetDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showNotification(`فایلی ${fileName} بە سەرکەوتوویی داگیرا`);
        logActivity("Export Excel", `${type} export بۆ ${targetDate}`);
    });
}

// ============================================================
// Export Range Excel
// ============================================================
function exportRangeExcel() {
    const start = document.getElementById('rangeStart').value;
    const end = document.getElementById('rangeEnd').value;
    if (!start || !end) {
        return showNotification('تکایە هەر دوو بەروارەکان دیاری بکە', 'error');
    }
    if (start > end) {
        return showNotification('بەرواری دەستپێک دەبێت پێش کۆتایی بێت', 'error');
    }

    const rows = [];
    rows.push(['بەروار', 'تیم', 'کۆی خاڵ', 'پشوو', 'تێبینی']);

    let current = new Date(start);
    const endDate = new Date(end);
    let promises = [];

    while (current <= endDate) {
        const dateStr = current.toISOString().split('T')[0];
        promises.push(
            db.ref(`reports/${dateStr}`).once('value').then(snapshot => {
                const data = snapshot.val();
                if (data) {
                    Object.keys(data).forEach(key => {
                        const item = data[key];
                        rows.push([
                            dateStr,
                            item.teamName || key,
                            item.total || 0,
                            item.offday ? 'بەڵێ' : 'نەخێر',
                            item.notes || ''
                        ]);
                    });
                }
            })
        );
        current.setDate(current.getDate() + 1);
    }

    Promise.all(promises).then(() => {
        if (rows.length === 1) {
            return showNotification('هیچ داتایەک لەم مەودایەدا نەدۆزرایەوە', 'error');
        }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Range Report');
        const fileName = `report_range_${start}_to_${end}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showNotification(`فایلی ${fileName} داگیرا`);
        logActivity("Export Range", `ڕاپۆرتی مەودا لە ${start} تا ${end}`);
        document.getElementById('rangeExportModalOverlay').style.display = 'none';
    });
}

// ============================================================
// Copy Yesterday Data to Current
// ============================================================
function copyYesterdayDataToCurrent() {
    const selectedTeam = document.getElementById('teamSelect')?.value;
    if (!selectedTeam) {
        return showNotification('تکایە تیمەکەت هەڵبژێرە!', 'error');
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    db.ref(`reports/${yesterdayStr}/${selectedTeam}`).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            return showNotification('هیچ داتایەک بۆ دوێنێ نەدۆزرایەوە', 'error');
        }

        // Remove offday flag so they can work today
        delete data.offday;
        data.notes = (data.notes || '') + ' (هێنراوە لە دوێنێ)';

        db.ref(`reports/${todayStr}/${selectedTeam}`).set(data).then(() => {
            showNotification('داتاکانی دوێنێ بۆ ئەمڕۆ کۆپی کران');
            logActivity("Copy Yesterday", `کۆپی دوێنێ بۆ ${selectedTeam}`);
            loadAdminData();
            loadTeamData();
        });
    });
}

// ============================================================
// Open Team History Modal
// ============================================================
function openTeamHistoryModal() {
    const selectedTeam = document.getElementById('teamSelect')?.value;
    if (!selectedTeam) {
        return showNotification('تکایە تیمەکەت هەڵبژێرە!', 'error');
    }

    const modal = document.getElementById('historyModalOverlay');
    const list = document.getElementById('historyContentList');
    list.innerHTML = 'باردەکە...';

    const today = new Date();
    let promises = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        promises.push(
            db.ref(`reports/${dateStr}/${selectedTeam}`).once('value').then(snapshot => {
                return { date: dateStr, data: snapshot.val() };
            })
        );
    }

    Promise.all(promises).then(results => {
        list.innerHTML = '';
        results.forEach(item => {
            const div = document.createElement('div');
            div.style.cssText = "padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);";
            if (item.data) {
                div.innerHTML = `
                    <span style="color:#38bdf8;">${item.date}</span>
                    <span style="float:left;">خاڵ: <strong style="color:#34d399;">${item.data.total || 0}</strong>
                    ${item.data.offday ? ' 🔆 پشوو' : ''}</span>
                    ${item.data.notes ? `<div style="font-size:10px; color:#f87171;">${item.data.notes}</div>` : ''}
                `;
            } else {
                div.innerHTML = `<span style="color:#64748b;">${item.date}</span> <span style="float:left; color:#64748b;">هیچ ڕاپۆرتێک نییە</span>`;
            }
            list.appendChild(div);
        });
        modal.style.display = 'flex';
    });
}

// ============================================================
// Save Draft State Locally
// ============================================================
function saveDraftStateLocally() {
    const selectedTeam = document.getElementById('teamSelect')?.value;
    if (!selectedTeam) return;

    const inputs = document.querySelectorAll('#casesGridContainer input');
    const data = {};
    inputs.forEach(inp => {
        data[inp.id] = inp.value;
    });
    data.offday = document.getElementById('c_offday')?.checked || false;
    data.notes = document.getElementById('c_notes')?.value || '';

    localStorage.setItem(`draft_${selectedTeam}`, JSON.stringify(data));
}

function loadDraftStateLocally() {
    const selectedTeam = document.getElementById('teamSelect')?.value;
    if (!selectedTeam) return;

    const saved = localStorage.getItem(`draft_${selectedTeam}`);
    if (!saved) return;

    try {
        const data = JSON.parse(saved);
        Object.keys(data).forEach(key => {
            if (key === 'offday') {
                const chk = document.getElementById('c_offday');
                if (chk) chk.checked = data[key];
            } else if (key === 'notes') {
                const txt = document.getElementById('c_notes');
                if (txt) txt.value = data[key];
            } else {
                const inp = document.getElementById(key);
                if (inp) inp.value = data[key];
            }
        });
    } catch (e) {}
}

// ============================================================
// Share to WhatsApp
// ============================================================
function shareToWhatsApp() {
    const date = new Date().toISOString().split('T')[0];
    db.ref(`reports/${date}`).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            return showNotification('هیچ داتایەک بۆ ئەمڕۆ نییە', 'error');
        }

        let msg = `📊 *ڕاپۆرتی گشتی ئەمڕۆ (${date})*\n\n`;
        let sorted = Object.keys(data).map(k => ({ key: k, ...data[k] }));
        sorted.sort((a, b) => b.total - a.total);

        sorted.forEach((item, i) => {
            msg += `${i+1}. ${item.teamName}: ${item.total} خاڵ`;
            if (item.offday) msg += ' 🔆 پشوو';
            if (item.notes) msg += ` (${item.notes})`;
            msg += '\n';
        });

        const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
        logActivity("WhatsApp Share", "ڕاپۆرتی گشتی بۆ واتساپ نێردرا");
    });
}

function shareMyTeamToWhatsApp() {
    const selectedTeam = document.getElementById('teamSelect')?.value;
    if (!selectedTeam) {
        return showNotification('تکایە تیمەکەت هەڵبژێرە!', 'error');
    }

    const date = new Date().toISOString().split('T')[0];
    db.ref(`reports/${date}/${selectedTeam}`).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            return showNotification('هیچ ڕاپۆرتێک بۆ تیمەکەت نییە', 'error');
        }

        let msg = `📊 *ڕاپۆرتی تیمی ${data.teamName || selectedTeam}* (${date})\n`;
        msg += `خاڵ: ${data.total || 0}\n`;
        if (data.offday) msg += '🔆 پشوو\n';
        if (data.notes) msg += `تێبینی: ${data.notes}\n`;

        const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
        logActivity("WhatsApp Share", `ڕاپۆرتی تیمی ${selectedTeam} بۆ واتساپ نێردرا`);
    });
}

// ============================================================
// Export as Image (html2canvas)
// ============================================================
function exportAsImage() {
    const element = document.getElementById('reportArea');
    if (!element) return showNotification('شوێنی ڕاپۆرت نەدۆزرایەوە', 'error');

    html2canvas(element, {
        backgroundColor: '#090d16',
        scale: 2,
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `report_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showNotification('وێنەی ڕاپۆرت داگیرا');
        logActivity("Export Image", "ڕاپۆرت وەک وێنە داگیرا");
    }).catch(err => {
        showNotification('هەڵە لە دروستکردنی وێنە: ' + err.message, 'error');
    });
}

// ============================================================
// Open Audit Log Modal
// ============================================================
function openAuditLogModal() {
    const modal = document.getElementById('auditLogModalOverlay');
    const container = document.getElementById('auditLogContainer');
    container.innerHTML = 'باردەکە...';
    modal.style.display = 'flex';

    db.ref('auditLogs').limitToLast(50).once('value', (snapshot) => {
        container.innerHTML = '';
        const logs = snapshot.val() || {};
        Object.keys(logs).reverse().forEach(key => {
            const item = logs[key];
            const div = document.createElement('div');
            div.style.cssText = "padding:6px 8px; background:rgba(255,255,255,0.03); border-radius:6px; border:1px solid rgba(255,255,255,0.05);";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#94a3b8;">
                    <span>${item.dateFormatted || 'N/A'}</span>
                    <span>${item.device || 'Unknown'}</span>
                </div>
                <div style="font-size:11px;"><strong style="color:#facc15;">${item.action}:</strong> ${item.desc}</div>
            `;
            container.appendChild(div);
        });
    });
}

// ============================================================
// Admin Clear Data
// ============================================================
function adminClearData() {
    const date = document.getElementById('adminDateSelector')?.value || new Date().toISOString().split('T')[0];
    if (!confirm(`ئایا دڵنیای دەتەوێت هەموو داتاکانی ڕۆژی ${date} بسڕیتەوە؟`)) return;

    db.ref(`reports/${date}`).remove().then(() => {
        showNotification(`داتاکانی ڕۆژی ${date} سڕینەوە`);
        logActivity("Clear Data", `داتاکانی ڕۆژی ${date} سڕینەوە لەلایەن ئەدمین`);
        loadAdminData();
    }).catch(err => {
        showNotification('هەڵە لە سڕینەوە: ' + err.message, 'error');
    });
}

// ============================================================
// Convert CSV to KML
// ============================================================
function convertExcelToKml() {
    const fileInput = document.getElementById('csvFileForKml');
    const file = fileInput.files[0];
    if (!file) return showNotification('تکایە فایلێکی CSV هەڵبژێرە', 'error');

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const csv = e.target.result;
            const lines = csv.split('\n').filter(line => line.trim());
            if (lines.length < 2) {
                return showNotification('فایلەکە ڕیزبەندی پێویستی تیا نییە', 'error');
            }

            const headers = lines[0].split(',').map(h => h.trim());
            const latIdx = headers.findIndex(h => /lat/i.test(h));
            const lngIdx = headers.findIndex(h => /lng|lon/i.test(h));
            const nameIdx = headers.findIndex(h => /name|title/i.test(h));

            if (latIdx === -1 || lngIdx === -1) {
                return showNotification('فایلەکە دەبێت کۆڵەکەی "lat" و "lng"ی تیا بێت', 'error');
            }

            let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
            kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
            kml += '<Document>\n';

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim());
                const lat = parseFloat(cols[latIdx]);
                const lng = parseFloat(cols[lngIdx]);
                const name = nameIdx !== -1 ? cols[nameIdx] || `Point ${i}` : `Point ${i}`;

                if (!isNaN(lat) && !isNaN(lng)) {
                    kml += `<Placemark>\n`;
                    kml += `<name>${name}</name>\n`;
                    kml += `<Point><coordinates>${lng},${lat},0</coordinates></Point>\n`;
                    kml += `</Placemark>\n`;
                }
            }

            kml += '</Document>\n</kml>';

            const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `converted_${file.name.replace('.csv', '.kml')}`;
            link.click();
            URL.revokeObjectURL(link.href);
            showNotification('فایلی KML بە سەرکەوتوویی دروستکرا');
            logActivity("CSV to KML", "گۆڕینی CSV بۆ KML");
        } catch (err) {
            showNotification('هەڵە لە گۆڕینی فایل: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================================
// Upload File for Specific Team
// ============================================================
function uploadFileForSpecificTeam() {
    const team = document.getElementById('kmlTargetTeam').value;
    const fileInput = document.getElementById('teamFileUploader');
    const file = fileInput.files[0];

    if (!team) return showNotification('تکایە تیمێک هەڵبژێرە', 'error');
    if (!file) return showNotification('تکایە فایلێک هەڵبژێرە', 'error');

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        // Store file in Firebase under team files
        db.ref(`teamFiles/${team}`).set({
            fileName: file.name,
            fileType: file.type,
            content: content,
            uploadedAt: Date.now()
        }).then(() => {
            showNotification(`فایلی ${file.name} بۆ تیمی ${team} نێردرا`);
            logActivity("Upload File", `فایل ${file.name} بۆ تیمی ${team} نێردرا`);
            fileInput.value = '';
        }).catch(err => {
            showNotification('هەڵە لە ناردن: ' + err.message, 'error');
        });
    };
    reader.readAsDataURL(file);
}

// ============================================================
// Check Team File
// ============================================================
function checkTeamFile(teamKey) {
    db.ref(`teamFiles/${teamKey}`).on('value', (snapshot) => {
        const data = snapshot.val();
        const box = document.getElementById('teamFileDownloadBox');
        if (data && data.fileName) {
            box.style.display = 'block';
            document.getElementById('lblTeamFileTitle').innerText = `📁 فایلی تایبەت بە تیمەکەت: ${data.fileName}`;
        } else {
            box.style.display = 'none';
        }
    });
}

// ============================================================
// Prompt PIN and Download Team File
// ============================================================
function promptPinAndDownloadTeamFile() {
    const selectedTeam = document.getElementById('teamSelect')?.value;
    if (!selectedTeam) return showNotification('تکایە تیمەکەت هەڵبژێرە', 'error');

    const teamLabel = document.getElementById('teamSelect').options[document.getElementById('teamSelect').selectedIndex].text;

    document.getElementById('customModalOverlay').style.display = 'flex';
    document.getElementById('modalTitle').innerText = "پشتڕاستکردنەوەی تیم";
    document.getElementById('modalDesc').innerText = `تکایە پین کۆدی تیمەکەت بنووسە بۆ داگرتنی فایل:`;

    document.getElementById('modalConfirmBtn').onclick = () => {
        const inputPin = document.getElementById('customModalInput').value;
        const correctPin = TEAM_PINS[selectedTeam];

        if ((correctPin && inputPin === correctPin) || inputPin === ADMIN_PIN) {
            closeCustomModal(true);
            downloadTeamFile(selectedTeam);
        } else {
            showNotification('پین کۆد هەڵەیە!', 'error');
        }
    };
}

function downloadTeamFile(teamKey) {
    db.ref(`teamFiles/${teamKey}`).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data || !data.content) {
            return showNotification('هیچ فایلێک بۆ ئەم تیمە نییە', 'error');
        }

        const link = document.createElement('a');
        link.href = data.content;
        link.download = data.fileName || 'file';
        link.click();
        showNotification(`فایل ${data.fileName} داگیرا`);
        logActivity("Download File", `فایلی ${data.fileName} داگیرا لەلایەن ${teamKey}`);
    });
}

// ============================================================
// Feedback System
// ============================================================
function openFeedbackModal() {
    document.getElementById('feedbackModalOverlay').style.display = 'flex';
    document.getElementById('feedbackText').value = '';
    document.getElementById('feedbackAuthor').value = '';
}

function submitFeedbackFinal() {
    const author = document.getElementById('feedbackAuthor').value || 'نەناسراو';
    const text = document.getElementById('feedbackText').value.trim();
    if (!text) return showNotification('تکایە پێشنیارەکەت بنووسە', 'error');

    db.ref('feedbacks').push({
        author: author,
        text: text,
        timestamp: Date.now()
    }).then(() => {
        showNotification('پێشنیارەکەت بە سەرکەوتوویی نێردرا');
        logActivity("Feedback", `پێشنیار لەلایەن ${author}`);
        document.getElementById('feedbackModalOverlay').style.display = 'none';
    }).catch(err => {
        showNotification('هەڵە لە ناردن: ' + err.message, 'error');
    });
}

function openAdminFeedbackModal() {
    const modal = document.getElementById('adminFeedbackModalOverlay');
    const list = document.getElementById('adminFeedbackListContent');
    list.innerHTML = 'باردەکە...';
    modal.style.display = 'flex';

    db.ref('feedbacks').limitToLast(30).once('value', (snapshot) => {
        list.innerHTML = '';
        const data = snapshot.val() || {};
        let count = 0;
        Object.keys(data).reverse().forEach(key => {
            const item = data[key];
            count++;
            const div = document.createElement('div');
            div.style.cssText = "padding:8px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid rgba(255,255,255,0.05);";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#94a3b8;">
                    <span>${item.author || 'نەناسراو'}</span>
                    <span>${new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <div style="font-size:11px; margin-top:3px;">${item.text}</div>
            `;
            list.appendChild(div);
        });
        document.getElementById('feedbackCounterBadge').innerText = count;
    });
}

// ============================================================
// Add New Team
// ============================================================
function addNewTeam() {
    const section = document.getElementById('newTeamSection').value;
    const nameInput = document.getElementById('newTeamNameInput');
    const name = nameInput.value.trim();
    if (!name) return showNotification('تکایە ناوی تیمەکە بنووسە', 'error');

    const key = name.toLowerCase().replace(/\s+/g, '_');
    const position = document.getElementById('newTeamPositionSelect').value;

    // Add to team lists in Firebase for future reference
    db.ref('teamList').push({
        name: name,
        key: key,
        section: section,
        position: position,
        createdAt: Date.now()
    }).then(() => {
        showNotification(`تیمی ${name} زیادکرا`);
        logActivity("Add Team", `تیمی نوێ زیادکرا: ${name} لە بەشی ${section}`);
        nameInput.value = '';
        populateTeamDropdowns();
    }).catch(err => {
        showNotification('هەڵە لە زیادکردن: ' + err.message, 'error');
    });
}

// ============================================================
// Startup Listener
// ============================================================
window.onload = function() {
    renderCasesGrid();
    populateTeamDropdowns();
    initChart();
    loadAdminData();
    logActivity("App Launch", "سیستمەکە کرایەوە لەسەر ئامێر");
};