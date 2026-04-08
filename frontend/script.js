// ==================== Configuration ====================
const API_BASE = 'http://localhost:3000/api';

let currentData = [];

// ==================== Initialize on Page Load ====================
document.addEventListener('DOMContentLoaded', function () {
    loadData();
});

// ==================== Load Data from API ====================
async function loadData() {
    showLoadingState(true);
    try {
        const response = await fetch(`${API_BASE}/sessions`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();

        if (result.success) {
            currentData = result.data.map(row => ({
                id: row.id,
                datetime: row.datetime,
                name: row.name,
                scenario: row.scenario,
                difficulty: row.difficulty,
                duration: row.duration_display || row.duration,
                avgForce: parseFloat(row.avg_force) || 0,
                avgRhythm: parseInt(row.avg_bpm) || 0,
                avgDepth: parseFloat(row.avg_depth) || 0,
                compressionCount: parseInt(row.compression_count) || 0,
                consistency: parseInt(row.consistency) || 0,
                score: parseInt(row.score) || 0,
                status: row.status
            }));

            updateStatistics();
            renderTable();
            initializeCharts();
        }
    } catch (err) {
        console.error('❌ ไม่สามารถเชื่อมต่อ Backend:', err);
        showApiError();
    } finally {
        showLoadingState(false);
    }
}

function showLoadingState(isLoading) {
    const tbody = document.getElementById('tableBody');
    if (isLoading) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                    ⏳ กำลังโหลดข้อมูล...
                </td>
            </tr>`;
    }
}

function showApiError() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align:center; padding:2rem; color:#ef4444;">
                ❌ ไม่สามารถเชื่อมต่อ Backend ได้<br>
                <small style="color:var(--text-secondary);">กรุณารัน <code>node backend/server.js</code> ก่อนเปิดเว็บ</small>
            </td>
        </tr>`;
    ['totalTests', 'passCount', 'failCount', 'avgScore'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '-';
    });
}

// ==================== Statistics Calculation ====================
function updateStatistics() {
    const totalTests = currentData.length;
    if (totalTests === 0) {
        ['totalTests', 'passCount', 'failCount', 'avgScore'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });
        document.getElementById('passRate').textContent = '0%';
        document.getElementById('failRate').textContent = '0%';
        return;
    }

    const passCount = currentData.filter(d => d.status === "รอด").length;
    const failCount = totalTests - passCount;
    const passRate = ((passCount / totalTests) * 100).toFixed(1);
    const failRate = ((failCount / totalTests) * 100).toFixed(1);
    const avgScore = (currentData.reduce((sum, d) => sum + d.score, 0) / totalTests).toFixed(1);

    document.getElementById('totalTests').textContent = totalTests;
    document.getElementById('passCount').textContent = passCount;
    document.getElementById('failCount').textContent = failCount;
    document.getElementById('passRate').textContent = passRate + '%';
    document.getElementById('failRate').textContent = failRate + '%';
    document.getElementById('avgScore').textContent = avgScore;
}

// ==================== Render Table ====================
function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (currentData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                    📭 ยังไม่มีข้อมูลการทดสอบ
                </td>
            </tr>`;
        return;
    }

    currentData.forEach(record => {
        const tr = document.createElement('tr');
        const scoreClass = getScoreClass(record.score);
        const statusClass = record.status === "รอด" ? "status-pass" : "status-fail";

        tr.innerHTML = `
            <td>${record.id}</td>
            <td>${record.datetime}</td>
            <td><strong>${record.name}</strong></td>
            <td>${record.duration} นาที</td>
            <td>${record.avgForce} N</td>
            <td>${record.avgRhythm} ครั้ง/นาที</td>
            <td class="score-cell ${scoreClass}">${record.score}</td>
            <td>
                <span class="status-badge ${statusClass}">${record.status}</span>
                <button class="btn-delete" onclick="deleteSession(${record.id})" title="ลบข้อมูล">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getScoreClass(score) {
    if (score >= 90) return 'score-excellent';
    if (score >= 75) return 'score-good';
    if (score >= 60) return 'score-average';
    return 'score-poor';
}

// ==================== Delete Session ====================
async function deleteSession(id) {
    if (!confirm('ต้องการลบข้อมูลนี้หรือไม่?')) return;
    try {
        const response = await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            await loadData();
        } else {
            alert('❌ ลบไม่สำเร็จ: ' + result.error);
        }
    } catch (err) {
        alert('❌ ไม่สามารถเชื่อมต่อ Backend');
    }
}

// ==================== Charts ====================
let scoreChart, passFailChart;
let chartsInitialized = false;

function initializeCharts() {
    if (chartsInitialized) {
        updateCharts();
        return;
    }
    chartsInitialized = true;

    const displayData = [...currentData].reverse(); // แสดง oldest → newest

    // Score Trend Chart
    const scoreCtx = document.getElementById('scoreChart').getContext('2d');
    scoreChart = new Chart(scoreCtx, {
        type: 'line',
        data: {
            labels: displayData.map(d => d.name),
            datasets: [{
                label: 'คะแนนการทดสอบ',
                data: displayData.map(d => d.score),
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: '#06b6d4',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#000000', font: { family: 'Noto Sans Thai', size: 14, weight: '600' } } },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f1f5f9', bodyColor: '#cbd5e1',
                    borderColor: '#06b6d4', borderWidth: 1, padding: 12,
                    titleFont: { family: 'Noto Sans Thai', size: 14 },
                    bodyFont: { family: 'Noto Sans Thai', size: 13 }
                }
            },
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { color: '#000000', font: { family: 'Noto Sans Thai', weight: '600' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#000000', font: { family: 'Noto Sans Thai', size: 11, weight: '600' }, maxRotation: 45, minRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });

    // Pass/Fail Pie Chart
    const passFailCtx = document.getElementById('passFailChart').getContext('2d');
    const passCount = currentData.filter(d => d.status === "รอด").length;
    const failCount = currentData.length - passCount;

    passFailChart = new Chart(passFailCtx, {
        type: 'doughnut',
        data: {
            labels: ['รอด', 'ไม่รอด'],
            datasets: [{
                data: [passCount, failCount],
                backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(239, 68, 68, 0.8)'],
                borderColor: ['#10b981', '#ef4444'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#000000', font: { family: 'Noto Sans Thai', size: 14, weight: '600' }, padding: 20 } },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f1f5f9', bodyColor: '#cbd5e1',
                    borderColor: '#06b6d4', borderWidth: 1, padding: 12,
                    titleFont: { family: 'Noto Sans Thai', size: 14 },
                    bodyFont: { family: 'Noto Sans Thai', size: 13 },
                    callbacks: {
                        label: function (context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} คน (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ==================== Filter Data ====================
function filterData() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchInput = document.getElementById('searchInput').value.toLowerCase();

    // Filter จาก currentData ปัจจุบัน (ดึงจาก API แล้ว)
    const allData = window._allData || currentData;
    currentData = allData.filter(record => {
        const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
        const matchesSearch = record.name.toLowerCase().includes(searchInput);
        return matchesStatus && matchesSearch;
    });

    updateStatistics();
    renderTable();
    updateCharts();
}

// ==================== Sort Data ====================
function sortData() {
    const sortBy = document.getElementById('sortBy').value;
    switch (sortBy) {
        case 'date-desc': currentData.sort((a, b) => b.id - a.id); break;
        case 'date-asc': currentData.sort((a, b) => a.id - b.id); break;
        case 'score-desc': currentData.sort((a, b) => b.score - a.score); break;
        case 'score-asc': currentData.sort((a, b) => a.score - b.score); break;
        case 'name-asc': currentData.sort((a, b) => a.name.localeCompare(b.name, 'th')); break;
    }
    renderTable();
    updateCharts();
}

// ==================== Update Charts ====================
function updateCharts() {
    if (!scoreChart || !passFailChart) return;
    const displayData = [...currentData].reverse();
    scoreChart.data.labels = displayData.map(d => d.name);
    scoreChart.data.datasets[0].data = displayData.map(d => d.score);
    scoreChart.update();

    const passCount = currentData.filter(d => d.status === "รอด").length;
    const failCount = currentData.length - passCount;
    passFailChart.data.datasets[0].data = [passCount, failCount];
    passFailChart.update();
}

// ==================== Export to CSV ====================
function exportData() {
    const headers = ['ID', 'วันที่-เวลา', 'ชื่อผู้ทดสอบ', 'สถานการณ์', 'เวลาที่ใช้ฝึก', 'เฉลี่ยแรงกด (N)', 'จังหวะ (ครั้ง/นาที)', 'คะแนน', 'สถานะ'];
    const csvContent = [
        headers.join(','),
        ...currentData.map(r => [r.id, r.datetime, r.name, r.scenario, r.duration, r.avgForce, r.avgRhythm, r.score, r.status].join(','))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `CPR_Training_Data_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== Refresh Data ====================
async function refreshData() {
    const btn = event?.target?.closest('button');
    if (btn) btn.style.transform = 'rotate(360deg)';
    setTimeout(() => { if (btn) btn.style.transform = ''; }, 600);

    document.getElementById('statusFilter').value = 'all';
    document.getElementById('searchInput').value = '';
    document.getElementById('sortBy').value = 'date-desc';

    await loadData();
}

// ==================== New Test Modal ====================
function showNewTestModal() {
    const modal = document.getElementById('newTestModal');
    modal.classList.add('active');
    document.getElementById('newTestForm').reset();
}

function closeNewTestModal() {
    document.getElementById('newTestModal').classList.remove('active');
}

document.addEventListener('click', function (event) {
    const modal = document.getElementById('newTestModal');
    if (event.target === modal) closeNewTestModal();
});

// ==================== Handle New Test ====================
function handleNewTest(event) {
    event.preventDefault();
    const studentName = document.getElementById('studentName').value;
    const patientCondition = document.getElementById('patientCondition').value;
    const difficultyLevel = document.getElementById('difficultyLevel').value;

    closeNewTestModal();

    const params = new URLSearchParams({ name: studentName, scenario: patientCondition, difficulty: difficultyLevel });
    window.location.href = `scenario.html?${params.toString()}`;
}
