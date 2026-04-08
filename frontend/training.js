// CPR Training System - Main Logic
// ระบบการฝึกปั้มหัวใจ CPR

// ==================== API Configuration ====================
const API_BASE = 'http://localhost:3000/api';

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const studentName = urlParams.get('name') || 'ไม่ระบุ';
const scenario = urlParams.get('scenario') || 'ทั่วไป';
const difficulty = urlParams.get('difficulty') || 'beginner';

// ==================== ESP32 WebSocket Configuration ====================
// 🎮 โหมดการทำงาน
const SIMULATION_MODE = false; // ตั้งเป็น false = เชื่อมต่อ ESP32 ผ่าน Serial Bridge

// สำหรับ Serial Bridge (Python)
const WEBSOCKET_URL = 'ws://localhost:3000'; // Node.js backend (Serial + WiFi)

// สำหรับ WiFi (ใช้เมื่อ ESP32 เชื่อม WiFi โดยตรง)
const ESP32_IP = '192.168.1.100';
const ESP32_PORT = 81;

let ws = null;
let wsConnected = false;
let reconnectInterval = null;
let useESP32Data = false; // จะเป็น true เมื่อเชื่อมต่อ ESP32 สำเร็จ

// Training state
let isRunning = true;
let isPaused = false;
let soundEnabled = false;
let startTime = Date.now();
let elapsedSeconds = 0;
let timerInterval;

// Compression tracking
let compressionCount = 0;
let currentSet = 0;
let cycleNumber = 1;
let lastCompressionTime = null;
let compressionTimes = [];
let depthValues = [];
let forceValues = [];  // เก็บค่าแรงกด (kg) จาก ESP32 compression events

// BPM calculation
let currentBPM = 0;
let bpmHistory = [];

// Audio context for metronome
let audioContext = null;
let metronomeTick = null;

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
    startTimer();
    setupKeyboardControls();

    // เชื่อมต่อ ESP32 เฉพาะเมื่อไม่ได้อยู่ในโหมดจำลอง
    if (!SIMULATION_MODE) {
        connectESP32();
    } else {
        console.log('🎮 โหมดจำลอง: ใช้ข้อมูลจำลองแทน ESP32');
        updateConnectionStatus(false, true); // แสดงว่าอยู่ในโหมดจำลอง
    }
});

function initializePage() {
    // Display session info
    document.getElementById('studentName').textContent = studentName;
    document.getElementById('scenarioType').textContent = scenario;
    document.getElementById('difficultyLevel').textContent =
        difficulty === 'beginner' ? 'เริ่มต้น (ระดับ 2 ขวบ)' : 'ขั้นสูง (ระดับ 4 ขวบ)';
}

function startTimer() {
    timerInterval = setInterval(() => {
        if (!isPaused && isRunning) {
            elapsedSeconds++;
            updateTimerDisplay();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('timerDisplay').textContent = display;
}

function simulateCompression() {
    if (isPaused || !isRunning) return;

    compressionCount++;
    currentSet++;

    // Animate heart
    animateHeart();

    // Calculate BPM
    const now = Date.now();
    if (lastCompressionTime) {
        const interval = now - lastCompressionTime;
        currentBPM = Math.round(60000 / interval); // Convert to BPM
        bpmHistory.push(currentBPM);
        compressionTimes.push(interval);

        // Keep only last 10 compressions for average
        if (bpmHistory.length > 10) {
            bpmHistory.shift();
            compressionTimes.shift();
        }
    }
    lastCompressionTime = now;

    // ใช้ข้อมูลจาก ESP32 ถ้าเชื่อมต่อ ไม่เช่นนั้นใช้ค่าจำลอง
    if (!useESP32Data) {
        // Simulate depth (random between 4-7cm for manual testing)
        const depth = (Math.random() * 3 + 4).toFixed(1);
        depthValues.push(parseFloat(depth));
        if (depthValues.length > 10) {
            depthValues.shift();
        }
    }
    // ถ้าใช้ ESP32 ข้อมูลจะมาจาก handleESP32Data() แทน

    // Check if set is complete (30 compressions)
    if (currentSet >= 30) {
        currentSet = 0;
        cycleNumber++;
    }

    // Update UI
    updateMetrics();

    // Play sound if enabled
    if (soundEnabled) {
        playMetronomeSound();
    }
}

function animateHeart() {
    const heart = document.getElementById('heartIcon');
    const animation = document.querySelector('.cpr-animation');

    // Add compress class
    heart.classList.add('compress');

    // Create wave effect
    const wave = document.createElement('div');
    wave.className = 'compression-wave';
    animation.appendChild(wave);

    // Remove after animation
    setTimeout(() => {
        heart.classList.remove('compress');
    }, 150);

    setTimeout(() => {
        wave.remove();
    }, 1000);
}

function updateMetrics() {
    // Update compression counter
    document.getElementById('compressionCount').textContent = compressionCount;
    document.getElementById('currentSet').textContent = currentSet;
    document.getElementById('cycleNumber').textContent = cycleNumber;

    // Update progress bar (30 compressions per set)
    const progress = (currentSet / 30) * 100;
    document.getElementById('compressionProgress').style.width = progress + '%';

    // Update compression status
    const compressionStatus = document.getElementById('compressionStatus');
    if (compressionCount === 0) {
        compressionStatus.textContent = 'เริ่มต้น';
        compressionStatus.className = 'metric-status status-good';
    } else if (currentSet < 10) {
        compressionStatus.textContent = '✅ เริ่มต้นดี';
        compressionStatus.className = 'metric-status status-good';
    } else if (currentSet < 20) {
        compressionStatus.textContent = '✅ ทำได้ดี';
        compressionStatus.className = 'metric-status status-good';
    } else {
        compressionStatus.textContent = '⚡ ใกล้ครบรอบ';
        compressionStatus.className = 'metric-status status-warning';
    }

    // Update BPM
    const avgBPM = bpmHistory.length > 0
        ? Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length)
        : currentBPM;

    document.getElementById('bpmValue').textContent = avgBPM + ' BPM';

    const bpmStatus = document.getElementById('bpmStatus');
    if (compressionCount === 0) {
        bpmStatus.textContent = 'รอการกด';
        bpmStatus.className = 'metric-status status-good';
    } else if (avgBPM >= 100 && avgBPM <= 120) {
        bpmStatus.textContent = '✅ จังหวะดีมาก';
        bpmStatus.className = 'metric-status status-good';
    } else if (avgBPM >= 90 && avgBPM < 100) {
        bpmStatus.textContent = '⚠️ ช้าไป เพิ่มความถี่';
        bpmStatus.className = 'metric-status status-warning';
    } else if (avgBPM > 120 && avgBPM <= 130) {
        bpmStatus.textContent = '⚠️ เร็วไป ลดความถี่';
        bpmStatus.className = 'metric-status status-warning';
    } else if (avgBPM > 130) {
        bpmStatus.textContent = '❌ เร็วเกินไป!';
        bpmStatus.className = 'metric-status status-danger';
    } else {
        bpmStatus.textContent = '❌ ช้าเกินไป!';
        bpmStatus.className = 'metric-status status-danger';
    }

    // Update depth
    const avgDepth = depthValues.length > 0
        ? (depthValues.reduce((a, b) => a + b, 0) / depthValues.length).toFixed(1)
        : 0;

    document.getElementById('depthValue').textContent = avgDepth + ' cm';

    const depthProgress = Math.min((avgDepth / 6) * 100, 100);
    document.getElementById('depthProgress').style.width = depthProgress + '%';

    const depthStatus = document.getElementById('depthStatus');
    if (compressionCount === 0) {
        depthStatus.textContent = 'รอการกด';
        depthStatus.className = 'metric-status status-good';
    } else if (avgDepth >= 5 && avgDepth <= 6) {
        depthStatus.textContent = '✅ ความลึกพอดี';
        depthStatus.className = 'metric-status status-good';
    } else if (avgDepth >= 4 && avgDepth < 5) {
        depthStatus.textContent = '⚠️ ตื้นไป เพิ่มแรง';
        depthStatus.className = 'metric-status status-warning';
    } else if (avgDepth > 6 && avgDepth <= 7) {
        depthStatus.textContent = '⚠️ ลึกไป ลดแรง';
        depthStatus.className = 'metric-status status-warning';
    } else if (avgDepth > 7) {
        depthStatus.textContent = '❌ ลึกเกินไป!';
        depthStatus.className = 'metric-status status-danger';
    } else {
        depthStatus.textContent = '❌ ตื้นเกินไป!';
        depthStatus.className = 'metric-status status-danger';
    }
}

function togglePause() {
    isPaused = !isPaused;
    const pauseIcon = document.getElementById('pauseIcon');
    const pauseText = document.getElementById('pauseText');

    if (isPaused) {
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'เล่นต่อ';
    } else {
        pauseIcon.textContent = '⏸️';
        pauseText.textContent = 'หยุดชั่วคราว';
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const soundIcon = document.getElementById('soundIcon');

    if (soundEnabled) {
        soundIcon.textContent = '🔊';
        initAudioContext();
    } else {
        soundIcon.textContent = '🔇';
    }
}

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playMetronomeSound() {
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function finishTraining() {
    isRunning = false;
    clearInterval(timerInterval);
    showSummary();
    saveSession(); // บันทึกลง PostgreSQL
}

// ==================== Save Session to Database ====================
async function saveSession() {
    const avgBPM = bpmHistory.length > 0
        ? Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length)
        : 0;
    const avgDepth = depthValues.length > 0
        ? parseFloat((depthValues.reduce((a, b) => a + b, 0) / depthValues.length).toFixed(1))
        : 0;
    const consistency = calculateConsistency();
    const score = calculatePerformanceRating(avgBPM, avgDepth, consistency, elapsedSeconds);
    const status = score >= 70 ? 'รอด' : 'ไม่รอด';

    // avg_force จาก ESP32 จริง (kg) หรือ 0 ถ้าไม่ได้เชื่อมต่อ
    const avgForce = forceValues.length > 0
        ? parseFloat((forceValues.reduce((a, b) => a + b, 0) / forceValues.length).toFixed(1))
        : 0;

    const payload = {
        name: studentName,
        scenario: scenario,
        difficulty: difficulty,
        duration: elapsedSeconds,
        avg_force: avgForce,
        avg_bpm: avgBPM,
        avg_depth: avgDepth,
        compression_count: compressionCount,
        consistency: consistency,
        score: score,
        status: status
    };

    // แสดงสถานะกำลังบันทึก
    const saveStatus = document.getElementById('saveStatus');
    if (saveStatus) saveStatus.textContent = '💾 กำลังบันทึก...';

    try {
        const response = await fetch(`${API_BASE}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.success) {
            console.log('✅ บันทึกผลสำเร็จ! ID:', result.data.id);
            if (saveStatus) {
                saveStatus.textContent = '✅ บันทึกผลสำเร็จ!';
                saveStatus.style.color = '#22c55e';
            }
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('❌ บันทึกไม่สำเร็จ:', err);
        if (saveStatus) {
            saveStatus.textContent = '⚠️ บันทึกไม่สำเร็จ (offline mode)';
            saveStatus.style.color = '#eab308';
        }
    }
}

function showSummary() {
    const modal = document.getElementById('summaryModal');

    // Calculate statistics
    const avgBPM = bpmHistory.length > 0
        ? Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length)
        : 0;

    const avgDepth = depthValues.length > 0
        ? (depthValues.reduce((a, b) => a + b, 0) / depthValues.length).toFixed(1)
        : 0;

    // Calculate consistency score (based on variance)
    const consistency = calculateConsistency();

    // Calculate performance rating
    const rating = calculatePerformanceRating(avgBPM, avgDepth, consistency, elapsedSeconds);

    // Update summary
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    document.getElementById('summaryTime').textContent =
        `${minutes} นาที ${seconds} วินาที`;

    document.getElementById('summaryCompressions').textContent =
        `${compressionCount} ครั้ง`;

    document.getElementById('summaryBPM').textContent =
        `${avgBPM} BPM ${avgBPM >= 100 && avgBPM <= 120 ? '✅' : '⚠️'}`;

    document.getElementById('summaryDepth').textContent =
        `${avgDepth} cm ${avgDepth >= 5 && avgDepth <= 6 ? '✅' : '⚠️'}`;

    document.getElementById('summaryConsistency').textContent =
        `${consistency}%`;

    // Display rating
    displayRating(rating);

    modal.classList.add('active');
}

function calculateConsistency() {
    if (compressionTimes.length < 2) return 100;

    const avg = compressionTimes.reduce((a, b) => a + b, 0) / compressionTimes.length;
    const variance = compressionTimes.reduce((sum, val) =>
        sum + Math.pow(val - avg, 2), 0) / compressionTimes.length;
    const stdDev = Math.sqrt(variance);

    // Convert to percentage (lower variance = higher consistency)
    const consistency = Math.max(0, 100 - (stdDev / avg * 100));
    return Math.round(consistency);
}

function calculatePerformanceRating(bpm, depth, consistency, time) {
    let score = 0;

    // BPM score (30 points)
    if (bpm >= 100 && bpm <= 120) score += 30;
    else if (bpm >= 90 && bpm <= 130) score += 20;
    else score += 10;

    // Depth score (30 points)
    if (depth >= 5 && depth <= 6) score += 30;
    else if (depth >= 4 && depth <= 7) score += 20;
    else score += 10;

    // Consistency score (20 points)
    score += consistency * 0.2;

    // Time score (20 points) - at least 2 minutes
    if (time >= 120) score += 20;
    else score += (time / 120) * 20;

    return Math.round(score);
}

function displayRating(score) {
    const ratingEl = document.getElementById('performanceRating');
    const textEl = document.getElementById('performanceText');

    if (score >= 90) {
        ratingEl.textContent = '⭐⭐⭐⭐⭐';
        textEl.textContent = 'ผลการปฏิบัติ: ดีเยี่ยม!';
        textEl.style.color = '#22c55e';
    } else if (score >= 75) {
        ratingEl.textContent = '⭐⭐⭐⭐';
        textEl.textContent = 'ผลการปฏิบัติ: ดีมาก';
        textEl.style.color = '#22c55e';
    } else if (score >= 60) {
        ratingEl.textContent = '⭐⭐⭐';
        textEl.textContent = 'ผลการปฏิบัติ: ดี';
        textEl.style.color = '#eab308';
    } else if (score >= 40) {
        ratingEl.textContent = '⭐⭐';
        textEl.textContent = 'ผลการปฏิบัติ: พอใช้';
        textEl.style.color = '#eab308';
    } else {
        ratingEl.textContent = '⭐';
        textEl.textContent = 'ผลการปฏิบัติ: ควรฝึกฝนเพิ่มเติม';
        textEl.style.color = '#ef4444';
    }
}

function closeSummary() {
    document.getElementById('summaryModal').classList.remove('active');
    isRunning = true;
    isPaused = false;
    startTimer();
}

function backToDashboard() {
    window.location.href = 'index.html';
}

function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        // Prevent default if it's one of our control keys
        if (['Space', 'KeyP', 'KeyF'].includes(e.code)) {
            e.preventDefault();
        }

        switch (e.code) {
            case 'Space':
                simulateCompression();
                break;
            case 'KeyP':
                togglePause();
                break;
            case 'KeyF':
                finishTraining();
                break;
        }
    });
}

// Allow clicking heart to compress (for touch/mouse input)
document.addEventListener('DOMContentLoaded', () => {
    const heart = document.getElementById('heartIcon');
    if (heart) {
        heart.style.cursor = 'pointer';
        heart.addEventListener('click', simulateCompression);
    }
});

// ==================== ESP32 WebSocket Functions ====================
function connectESP32() {
    try {
        // เลือก URL ตามโหมด
        const wsUrl = WEBSOCKET_URL || `ws://${ESP32_IP}:${ESP32_PORT}`;

        console.log(`🔌 กำลังเชื่อมต่อ ESP32 ที่ ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('✅ เชื่อมต่อ ESP32 สำเร็จ!');
            wsConnected = true;
            useESP32Data = true;
            updateConnectionStatus(true);

            // Clear reconnect interval
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
            }

            // Send start command
            ws.send(JSON.stringify({ type: 'start' }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleESP32Data(data);
            } catch (error) {
                console.error('❌ Error parsing ESP32 data:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('❌ WebSocket Error:', error);
            updateConnectionStatus(false);
        };

        ws.onclose = () => {
            console.log('📡 การเชื่อมต่อ ESP32 ถูกปิด');
            wsConnected = false;
            useESP32Data = false;
            updateConnectionStatus(false);

            // Auto reconnect every 3 seconds
            if (!reconnectInterval) {
                reconnectInterval = setInterval(() => {
                    console.log('🔄 กำลังพยายามเชื่อมต่อใหม่...');
                    connectESP32();
                }, 3000);
            }
        };
    } catch (error) {
        console.error('❌ ไม่สามารถเชื่อมต่อ ESP32:', error);
        updateConnectionStatus(false);
    }
}

function handleESP32Data(data) {
    // ======= compression event (ส่งมาทุกครั้งที่กดเสร็จ) =======
    if (data.type === 'compression') {
        // บันทึก depth (cm) จากการกดครั้งนี้
        if (data.depth !== undefined) {
            depthValues.push(parseFloat(data.depth));
            if (depthValues.length > 10) depthValues.shift();
        }
        // บันทึก force (kg) จากการกดครั้งนี้
        if (data.force !== undefined) {
            forceValues.push(parseFloat(data.force));
            if (forceValues.length > 10) forceValues.shift();
            console.log(`💓 ESP32 Compression #${data.id}: ${data.force}kg | ${data.quality} | BPM:${data.bpm} | Depth:${data.depth}cm`);
        }
        // trigger animation + counter เหมือนกดปุ่ม
        simulateCompression();
        return;
    }

    // ======= live update (ทุก 100ms — ใช้ตรวจ position เท่านั้น) =======
    if (data.type === 'live') {
        // สามารถแสดง force live ได้ในอนาคต (ตอนนี้ไม่มี UI element)
        return;
    }

    // ======= legacy 'data' type (รองรับ firmware เก่า) =======
    if (data.type === 'data') {
        if (data.depth !== undefined) {
            depthValues.push(parseFloat(data.depth));
            if (depthValues.length > 10) depthValues.shift();
        }
        if (data.force !== undefined) {
            forceValues.push(parseFloat(data.force));
            if (forceValues.length > 10) forceValues.shift();
        }
        if (data.compression === true) simulateCompression();
        return;
    }

    if (data.type === 'status') {
        console.log('📡 ESP32 Status:', data);
    }
}

function updateConnectionStatus(connected, simulationMode = false) {
    const icon = document.getElementById('esp32StatusIcon');
    const text = document.getElementById('esp32StatusText');

    if (simulationMode) {
        icon.textContent = '🎮';
        text.textContent = 'โหมดจำลอง';
        text.style.color = '#3b82f6'; 
    } else if (connected) {
        icon.textContent = '🟢';
        text.textContent = 'Connected';
        text.style.color = '#22c55e';
    } else {
        icon.textContent = '🔴';
        text.textContent = 'Disconnected';
        text.style.color = '#ef4444';
    }
}
