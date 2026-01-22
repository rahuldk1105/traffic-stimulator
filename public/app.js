// ==================== CONFIGURATION ====================
const CONFIG = {
    SIGNAL_DURATION: 4000,
    VEHICLE_MOVE_DURATION: 1500,

    // Geometry (Scale Up for 850px map)
    INTERSECTION_SIZE: 850,
    CENTER_BOX: 140, // Road width 140
    LANE_WIDTH: 70,

    // Center is 425, 425
    // Stop Offset approx 72px from center (140/2 + buffer)
    LANES: {
        0: { startX: 390, startY: -200, stopX: 390, stopY: 353, dirX: 0, dirY: 1, angle: 180 }, // North (Down)
        1: { startX: 1050, startY: 390, stopX: 497, stopY: 390, dirX: -1, dirY: 0, angle: 270 }, // East (Left)
        2: { startX: 460, startY: 1050, stopX: 460, stopY: 497, dirX: 0, dirY: -1, angle: 0 },   // South (Up)
        3: { startX: -200, startY: 460, stopX: 353, stopY: 460, dirX: 1, dirY: 0, angle: 90 }     // West (Right)
    },
    VEHICLE_LENGTH: 50, // 1.4x scale
    VEHICLE_GAP: 20,

    // Hashing
    HASH_TABLE_SIZE: 13,
    HASH_PRIME: 7,

    // Limits
    MAX_VEHICLES_LIMIT: 20
};

const SCENARIO_INFO = {
    'weather': {
        title: "⚠️ WEATHER IMPACT",
        desc: "<strong>Slower Traffic & Longer Signals</strong><br>Vehicles move 50% slower due to rain/snow. Signal duration is increased to allow safe crossing. Throughput is halved."
    },
    'accident': {
        title: "⛔ ACCIDENT ALERT",
        desc: "<strong>Lane Blocked</strong><br>An accident has occurred in the East Lane. Vehicles are completely blocked and cannot pass until the accident is cleared."
    },
    'pedestrian': {
        title: "🚶 PEDESTRIAN CROSSING",
        desc: "<strong>Temporary Stop</strong><br>All vehicles in the North Lane must stop for 10 seconds to allow pedestrians to cross safely. Traffic resumes automatically."
    },
    'school_zone': {
        title: "🚸 SCHOOL ZONE",
        desc: "<strong>Bus Priority</strong><br>School buses in the West Lane get a massive priority boost (+5) to ensure students arrive on time."
    },
    'rush_hour': {
        title: "🕒 RUSH HOUR",
        desc: "<strong>High Traffic Volume</strong><br>Traffic density increases. Lanes with >5 vehicles get a priority boost to flush queues faster."
    },
    'vip': {
        title: "🌟 VIP CONVOY",
        desc: "<strong>Absolute Priority</strong><br>VIP vehicles bypass all other logic. The lane with a VIP gets immediate green light."
    },
    'main_road': {
        title: "🛣️ MAIN ROAD PRIORITY",
        desc: "<strong>Increased Lane Priority</strong><br>Vehicles on the Main Road (North/South) get a constant priority boost (+3) to maintain flow."
    }
};

// ==================== STATE MANAGEMENT ====================
const state = {
    isRunning: false,
    lastTime: 0,
    signalTimer: 0,
    currentGreenLane: -1,
    vehiclesToPass: 0,
    waitingForDecision: false,
    simulationMode: 'PRIORITY',
    autoSpawnEnabled: localStorage.getItem('autoSpawnEnabled') === 'true', // Load from localStorage

    // Metrics Tracking
    metrics: {
        'ROUND_ROBIN': { totalWait: 0, served: 0, typeData: {} },
        'PRIORITY': { totalWait: 0, served: 0, typeData: {} }
    },

    // Limits
    activeVehicleCount: 0,
    totalProcessedForStop: 0, // Counts cleared vehicles to check "processed"
    hasReachedLimit: false,

    lanes: Array.from({ length: 4 }, (_, i) => ({
        id: i,
        vehicles: [],
        priority: 0
    })),
    scenario: {
        is_main_road: false,
        is_accident: false,
        is_school_zone: false,
        is_heavy_weather: false,
        is_rush_hour: false,
        has_pedestrian_crossing: false
    },
    activeScenarios: new Set(),
    stats: {
        served: 0,
        switches: 0,
    },
    // Hash Table for DSA Demo
    hashTable: new Array(13).fill(null), // Fixed size 13
    showHashing: false
};

// ==================== INITIALIZATION ====================
// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initApp();      // Inject HTML structure first
    initControls(); // Attach listeners
    // Start loop in paused state to render initial static scene
    state.isRunning = true; // Temporary enable for one frame? 
    // No, gameLoop guard stops it.
    // Manually call render once.
    render();
    // Do NOT start loop automatically
});

function initApp() {
    // 1. Inject HTML Structure if not present
    const main = document.querySelector('.main-content') || document.body;
    // Check if we already have the structure (index.html might have it?)
    // If not, inject.
    if (!document.getElementById('intersection-container')) {
        main.innerHTML = `
            <div class="simulation-wrapper">
                
                <!-- CENTER SIMULATION AREA -->
                <div class="simulation-center">
                    <header>
                        <h1>Traffic Simulator</h1>
                        <div class="mode-controls">
                            <button id="mode-priority" class="mode-btn ${state.simulationMode === 'PRIORITY' ? 'active' : ''}">Priority Queue Mode</button>
                            <button id="mode-rr" class="mode-btn ${state.simulationMode === 'ROUND_ROBIN' ? 'active' : ''}">Round Robin Mode</button>
                        </div>
                    </header>
                    
                    <div class="controls">
                        <button id="btn-start">START SIMULATION</button>
                        <button id="btn-toggle-spawn" style="margin-left: 15px; background: ${state.autoSpawnEnabled ? '#28a745' : '#666'}; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">
                            ${state.autoSpawnEnabled ? '🚗 Auto-Spawn: ON' : '✋ Manual Only'}
                        </button>
                        <div class="status-bar-mini" style="margin-left: 20px; display: inline-flex; gap: 15px; font-size: 0.9rem;">
                            <div>Served: <span id="vehicles-served">0</span></div>
                            <div>Switches: <span id="signal-switches">0</span></div>
                            <div id="timer-container" style="display:none; color: #00dbff;">Time: <span id="simulation-time">0.0s</span></div>
                        </div>
                    </div>

                    <div id="intersection-container">
                        <div class="road-vertical"></div>
                        <div class="road-horizontal"></div>
                        <div class="intersection-center"></div>
                        
                        <!-- Stop Lines -->
                        <div class="stop-line north"></div>
                        <div class="stop-line east"></div>
                        <div class="stop-line south"></div>
                        <div class="stop-line west"></div>
                        
                        <!-- Signals -->
                        <div id="signal-0" class="traffic-signal north">
                            <div class="light red"></div><div class="light yellow"></div><div class="light green"></div>
                        </div>
                        <div id="signal-1" class="traffic-signal east">
                            <div class="light red"></div><div class="light yellow"></div><div class="light green"></div>
                        </div>
                        <div id="signal-2" class="traffic-signal south">
                            <div class="light red"></div><div class="light yellow"></div><div class="light green"></div>
                        </div>
                        <div id="signal-3" class="traffic-signal west">
                            <div class="light red"></div><div class="light yellow"></div><div class="light green"></div>
                        </div>
                        
                        <!-- Scenario Markers (Visual Feedback) -->
                        <div id="marker-north" class="scenario-marker"></div>
                        <div id="marker-south" class="scenario-marker"></div>
                        <div id="marker-east" class="scenario-marker"></div>
                        <div id="marker-west" class="scenario-marker"></div>
                        <div id="marker-center" class="scenario-marker"></div>
                        
                        <!-- Vehicles Layer -->
                        <div id="vehicle-layer" class="lane-layer"></div>
                    </div>
                    
                    <div class="legend" style="margin-top:20px">
                        <div class="legend-item"><div class="legend-color" style="background-color: #fff; border: 2px solid #cc0000;"></div><span>AMBULANCE</span></div>
                        <div class="legend-item"><div class="legend-color" style="background-color: #ff0000;"></div><span>FIRE</span></div>
                        <div class="legend-item"><div class="legend-color" style="background-color: #003366; border: 1px solid #fff;"></div><span>POLICE</span></div>
                        <div class="legend-item"><div class="legend-color" style="background-color: #111; border: 1px solid #ffd700;"></div><span>VIP</span></div>
                        <div class="legend-item"><div class="legend-color" style="background-color: #ffcc00;"></div><span>BUS</span></div>
                        <div class="legend-item"><div class="legend-color" style="background-color: #8B4513;"></div><span>TRUCK</span></div>
                        <div class="legend-item"><div class="legend-color" style="background-color: #FF6347;"></div><span>MOTORCYCLE</span></div>
                        <div class="legend-item"><div class="legend-color" style="background-color: #aab;"></div><span>NORMAL</span></div>
                    </div>

                    <!-- Double Hashing Panel -->
                    <button id="btn-toggle-hash" style="margin-top:20px;">Show/Hide Double Hashing Visualization</button>
                    <div id="hashing-panel" class="hashing-panel ${state.showHashing ? 'active' : ''}">
                         <div class="hashing-header">
                            <h3>Vehicle Lookup Table (Double Hashing)</h3>
                            <span>Size: ${CONFIG.HASH_TABLE_SIZE}, Prime: ${CONFIG.HASH_PRIME}</span>
                        </div>
                        <p style="font-size:0.8rem; margin-bottom:10px;">
                            h1(k) = k % ${CONFIG.HASH_TABLE_SIZE} <br>
                            h2(k) = ${CONFIG.HASH_PRIME} - (k % ${CONFIG.HASH_PRIME})
                        </p>
                        
                        <button id="btn-hash-demo" style="background:#ff9933; color:white; border:none; padding:5px 10px; border-radius:4px; margin-bottom:10px; cursor:pointer; font-size: 0.8rem;">
                             ⚠️ Run 3-Way Collision Demo
                        </button>

                        <table id="hash-table-view">
                            <thead>
                                <tr>
                                    <th>Idx</th>
                                    <th>Vehicle ID</th>
                                    <th>Key</th>
                                    <th>H1</th>
                                    <th>H2</th>
                                    <th>Probe</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>

                <!-- RIGHT CONTROLS SIDEBAR -->
                <div class="right-controls">
                    
                    <!-- MANUAL INJECTION -->
                    <div class="manual-control-box">
                        <h3>Manual Vehicle Control</h3>
                        <div class="control-group">
                            <label>Lane</label>
                            <select id="inject-lane" class="control-input">
                                <option value="0">North (Down)</option>
                                <option value="1">East (Left)</option>
                                <option value="2">South (Up)</option>
                                <option value="3">West (Right)</option>
                            </select>
                        </div>
                        <div class="control-group">
                            <label>Vehicle Type</label>
                            <select id="inject-type" class="control-input">
                                <option value="NORMAL">Car (Normal)</option>
                                <option value="TRUCK">Truck 🚚</option>
                                <option value="MOTORCYCLE">Motorcycle 🏍️</option>
                                <option value="AMBULANCE">Ambulance 🚑</option>
                                <option value="FIRE">Fire Truck 🚒</option>
                                <option value="POLICE">Police 🚓</option>
                                <option value="BUS">Bus 🚌</option>
                                <option value="VIP">VIP 🌟</option>
                                <option value="RANDOM">Random Mixed 🎲</option>
                            </select>
                        </div>
                        <div class="control-group">
                            <label>Turn Direction</label>
                            <select id="inject-dir" class="control-input">
                                <option value="STRAIGHT">Go Straight ⬆️</option>
                                <option value="LEFT">Turn Left ⬅️</option>
                                <option value="RIGHT">Turn Right ➡️</option>
                            </select>
                        </div>
                        <div class="control-group">
                            <label>Quantity</label>
                            <input type="number" id="inject-quantity" class="control-input" value="1" min="1" max="10" style="width: 100%; padding: 5px;">
                        </div>
                        <div class="control-group">
                            <label>Vehicle ID (Optional)</label>
                            <input type="text" id="inject-id" class="control-input" placeholder="e.g. V99" style="width: 100%; padding: 5px;">
                        </div>
                        <button id="btn-inject" class="btn-add-vehicle">
                            ➕ Add Vehicle(s)
                        </button>
                    </div>

                    <!-- COMPARISON TABLES -->
                    <div class="tables-container">
                        
                        <!-- LIVE VEHICLE INSPECTOR -->
                        <div class="table-section" id="vehicle-inspector" style="border: 1px solid #444; background: #222; margin-bottom: 20px; display: none;">
                            <h2 style="color: #00dbff; border-bottom: 1px solid #444; padding-bottom: 5px;">LIVE PRIORITY CALCULATION</h2>
                            <div id="inspector-content" style="padding: 10px; font-family: monospace; font-size: 0.9rem; color: #eee;">
                                Hover over a vehicle...
                            </div>
                        </div>

                        <!-- SCENARIO INFO BOX -->
                        <div class="table-section" id="scenario-info-box" style="border: 1px solid #ccaa00; background: #fffbe6; margin-bottom: 20px; display: none;">
                            <h2 id="scenario-info-title" style="color: #997f00; border-bottom: 1px solid #e6d580; padding-bottom: 5px;">⚠️ SCENARIO INFO</h2>
                            <div id="scenario-info-desc" style="padding: 10px; font-size: 0.9rem; color: #222; line-height: 1.4;">
                                Description here...
                            </div>
                        </div>

                        <div class="table-section">
                            <h2>PRIORITY QUEUE STATUS</h2>
                            <table id="priority-queue-table">
                                <thead>
                                    <tr>
                                        <th>Rk</th>
                                        <th>Lane</th>
                                        <th>Prio</th>
                                        <th>Wait</th>
                                        <th>Q</th>
                                        <th>Boosts</th>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        </div>

                        <div class="table-section">
                            <h2>ALGORITHM METRICS</h2>
                            <table id="algo-comparison-table">
                                <thead>
                                    <tr style="background-color: #333; color: white;">
                                        <th>Metric</th>
                                        <th id="header-rr">RR</th>
                                        <th id="header-pq">PQ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Wait (Total)</td>
                                        <td id="rr-wait">-</td>
                                        <td id="pq-wait">-</td>
                                    </tr>
                                    <tr style="font-size: 0.8em; color: #333;">
                                        <td>- Car</td>
                                        <td id="rr-wait-NORMAL">-</td>
                                        <td id="pq-wait-NORMAL">-</td>
                                    </tr>
                                    <tr style="font-size: 0.8em; color: #333;">
                                        <td>- Bus</td>
                                        <td id="rr-wait-BUS">-</td>
                                        <td id="pq-wait-BUS">-</td>
                                    </tr>
                                    <tr style="font-size: 0.8em; color: #333;">
                                        <td>- Truck</td>
                                        <td id="rr-wait-TRUCK">-</td>
                                        <td id="pq-wait-TRUCK">-</td>
                                    </tr>
                                    <tr style="font-size: 0.8em; color: #333;">
                                        <td>- Bike</td>
                                        <td id="rr-wait-MOTORCYCLE">-</td>
                                        <td id="pq-wait-MOTORCYCLE">-</td>
                                    </tr>
                                    <tr style="font-size: 0.8em; color: #333;">
                                        <td>- Emergency</td>
                                        <td id="rr-wait-EMG">-</td>
                                        <td id="pq-wait-EMG">-</td>
                                    </tr>
                                    <tr>
                                        <td title="Throughput: Vehicles served per minute">Thrup ℹ️</td>
                                        <td id="rr-throughput">-</td>
                                        <td id="pq-throughput">-</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- DECISION LOGS PANEL -->
                        <div class="table-section">
                            <h2>DECISION LOGS</h2>
                            <div id="decision-logs-content" style="height: 150px; overflow-y: auto; background: #111; border: 1px solid #444; padding: 8px; font-family: 'Courier New', monospace; font-size: 0.75rem; color: #0f0; white-space: pre-wrap;">Initializing logs...</div>
                        </div>

                        <!-- LIVE CHART -->
                        <div class="table-section" style="margin-top: 20px;">
                            <h2>LIVE ANALYTICS (Wait Time)</h2>
                            <div style="background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px;">
                                <canvas id="analyticsChart" width="300" height="200"></canvas>
                            </div>
                        </div>

                        <!-- Static Priority Reference Table -->
                        <!-- Base Priority Reference Table -->
                        <div class="table-section" style="margin-top: 20px;">
                            <h2>Base Priority Reference</h2>
                            <table style="width:100%; font-size: 0.85rem; border-collapse: collapse; color: #000;">
                                <thead>
                                    <tr style="border-bottom: 2px solid #333; text-align: left;">
                                        <th style="padding: 4px;">Vehicle Type</th>
                                        <th style="padding: 4px;">Base Priority</th>
                                        <th style="padding: 4px;">Order</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 4px;">🏍️ Motorcycle (Bike)</td><td style="font-weight:bold;">10</td><td style="color: #666;">Lowest</td></tr>
                                    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 4px;">🚗 Standard Car</td><td style="font-weight:bold;">20</td><td></td></tr>
                                    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 4px;">🚌 Public Bus</td><td style="font-weight:bold;">70</td><td></td></tr>
                                    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 4px;">🚚 Truck</td><td style="font-weight:bold;">80</td><td></td></tr>
                                    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 4px;">🌟 VIP Convoy</td><td style="font-weight:bold;">240</td><td></td></tr>
                                    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 4px;">🚓 Police Car</td><td style="font-weight:bold;">260</td><td></td></tr>
                                    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 4px;">🚒 Fire Truck</td><td style="font-weight:bold;">280</td><td></td></tr>
                                    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 4px;">🚑 Ambulance</td><td style="font-weight:bold;">300</td><td style="color: #007bff; font-weight:bold;">Highest</td></tr>
                                </tbody>
                            </table>
                            <p style="font-size: 0.75rem; color: #555; margin-top: 8px;">
                                * Formula: Priority = Base + (Wait Time × 1.0) + Scenario Boost
                            </p>
                        </div>

                    </div>
                </div>

            </div>
        `;
    }
}

function initControls() {
    // Mode Switching
    const modePriorityBtn = document.getElementById('mode-priority');
    if (modePriorityBtn) modePriorityBtn.addEventListener('click', () => setMode('PRIORITY'));

    const modeRrBtn = document.getElementById('mode-rr');
    if (modeRrBtn) modeRrBtn.addEventListener('click', () => setMode('ROUND_ROBIN'));

    // Scenario Sidebar
    document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const scenario = btn.dataset.scenario;
            toggleScenario(scenario, btn);
        });
    });

    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
        // Clone to clear previous listeners if any (though unlikely if element persists)
        // Actually, just binding onclick is safer for re-entrant initControls
        btnStart.onclick = () => {
            if (!state.isRunning) {
                startSimulation();
            } else {
                stopSimulation();
            }
        };
    }

    // Injection
    const btnInject = document.getElementById('btn-inject');
    if (btnInject) {
        btnInject.onclick = () => {
            const laneId = parseInt(document.getElementById('inject-lane').value);
            const type = document.getElementById('inject-type').value;
            const dir = document.getElementById('inject-dir').value;
            const customId = document.getElementById('inject-id').value.trim() || null;
            const quantity = parseInt(document.getElementById('inject-quantity').value) || 1;

            const laneNames = ["North", "East", "South", "West"];
            const types = ['NORMAL', 'TRUCK', 'MOTORCYCLE', 'AMBULANCE', 'FIRE', 'POLICE', 'BUS', 'VIP'];

            for (let i = 0; i < quantity; i++) {
                const vType = (type === 'RANDOM') ? types[Math.floor(Math.random() * types.length)] : type;
                const vehicleId = (customId && i === 0) ? customId : null;
                addVehicle(laneId, vType, dir, vehicleId);
            }

            console.log(`[UI] Injecting ${quantity} vehicle(s) [Type: ${type}] into ${laneNames[laneId]} Lane`);

            // Force Priority Table Update
            if (!state.waitingForDecision) makeDecision();
        };
    }

    // Hashing Toggle
    const btnHash = document.getElementById('btn-toggle-hash');
    if (btnHash) {
        btnHash.onclick = () => {
            state.showHashing = !state.showHashing;
            document.getElementById('hashing-panel').classList.toggle('active', state.showHashing);
            if (state.showHashing) renderHashView(); // Force Update
        };
    }

    // Hash Demo Button
    const btnHashDemo = document.getElementById('btn-hash-demo');
    if (btnHashDemo) btnHashDemo.onclick = runHashCollisionDemo;

    // Vehicle Popover / Inspector Logic
    const vehicleLayer = document.getElementById('vehicle-layer');
    if (vehicleLayer) {
        vehicleLayer.addEventListener('mouseover', (e) => {
            const target = e.target.closest('.vehicle');
            if (target) {
                // Find Vehicle Object
                const vid = target.id;
                let foundV = null;
                state.lanes.some(l => {
                    const v = l.vehicles.find(veh => veh.id === vid);
                    if (v) { foundV = v; return true; }
                    return false;
                });

                if (foundV) {
                    state.hoveredVehicle = foundV;
                    updateVehicleInspector(foundV);
                    target.style.border = "2px solid #00dbff";
                    target.style.zIndex = "100";
                }
            }
        });

        vehicleLayer.addEventListener('mouseout', (e) => {
            const target = e.target.closest('.vehicle');
            if (target) {
                state.hoveredVehicle = null;
                updateVehicleInspector(null);
                target.style.border = "none";
                target.style.zIndex = "";
            }
        });
    }

    // Auto-Spawn Toggle Button
    const btnToggleSpawn = document.getElementById('btn-toggle-spawn');
    if (btnToggleSpawn) {
        btnToggleSpawn.onclick = () => {
            state.autoSpawnEnabled = !state.autoSpawnEnabled;
            localStorage.setItem('autoSpawnEnabled', state.autoSpawnEnabled);

            // Update button appearance
            btnToggleSpawn.style.background = state.autoSpawnEnabled ? '#28a745' : '#666';
            btnToggleSpawn.textContent = state.autoSpawnEnabled ? '🚗 Auto-Spawn: ON' : '✋ Manual Only';

            console.log(`[UI] Auto-Spawn ${state.autoSpawnEnabled ? 'ENABLED' : 'DISABLED'}`);
        };
    }

    // Add Verification Button logic to help verify
    console.log("[HASH] Verification Suite Ready. Run 'runVerificationSuite()' in console to verify math.");

    initializeAnalyticsChart();
}

/**
 * VERIFICATION SUITE - MATHEMATICAL PROOF
 * Runs 3 complex test cases to verify the formula: idx = (h1 + i * h2) % m
 */
window.runVerificationSuite = function () {
    console.log("%c --- DOUBLE HASHING VERIFICATION ---", "color: #00ff00; font-weight: bold; font-size: 16px; border-bottom: 2px solid #00ff00;");

    // 1. Reset Table
    state.hashTable = new Array(CONFIG.HASH_TABLE_SIZE).fill(null);
    state.showHashing = true;
    document.getElementById('hashing-panel').classList.add('active');

    // These test cases are carefully chosen to force collisions on Index 0 and Index 2
    const cases = [
        { id: "A", task: "Base Entry (h1=0, h2=5)" },
        { id: "N", task: "Collision at 0 (h1=0, h2=6). Expect jump to Index 6." },
        { id: "[", task: "Triple collision at 0 (h1=0, h2=7). Expect jump to Index 7." },
        { id: "w", task: "Collision at 2 (h1=2, h2=7). Expect jump to Index 9." }
    ];

    cases.forEach((tc, idx) => {
        setTimeout(() => {
            console.log(`%c[TEST CASE ${idx + 1}] %cAdding ${tc.id}: ${tc.task}`, "color: #fff; background: #333; padding: 2px 5px;", "color: #00dbff;");
            insertToHashTable(tc.id);
        }, idx * 1200);
    });
};

// ... existing code ...

function runHashCollisionDemo() {
    console.log("[HASH] Starting Collision Demo...");

    // Clear Table
    state.hashTable = new Array(CONFIG.HASH_TABLE_SIZE).fill(null);
    renderHashView();
    state.showHashing = true;
    document.getElementById('hashing-panel').classList.add('active');

    // Find 3 colliding keys (Same h1 and Same h2) to force chaining
    const candidates = [];
    let i = 1;
    // Iterate to find strings that share hash properties
    let targetH1 = -1;
    let targetH2 = -1;

    while (candidates.length < 3 && i < 2000) {
        let str = "T" + i; // Short strings: T1, T2...
        let k = getVehicleKey(str);
        let m = CONFIG.HASH_TABLE_SIZE;
        let p = CONFIG.HASH_PRIME;

        let h1 = k % m;
        let h2 = p - (k % p);

        if (candidates.length === 0) {
            // Pick first one as template
            targetH1 = h1;
            targetH2 = h2;
            candidates.push(str);
        } else {
            if (h1 === targetH1 && h2 === targetH2) {
                candidates.push(str);
            }
        }
        i++;
    }

    console.log(`[HASH DEMO] Injecting setup: ${candidates.join(' -> ')} (All h1=${targetH1}, h2=${targetH2})`);

    // Insert with visual delay
    let count = 0;
    insertToHashTable(candidates[count++]); // Immediate first

    const intv = setInterval(() => {
        if (count >= candidates.length) { clearInterval(intv); return; }
        insertToHashTable(candidates[count++]);
    }, 1500);
}

function setMode(mode) {
    state.simulationMode = mode;
    const modePriorityBtn = document.getElementById('mode-priority');
    if (modePriorityBtn) modePriorityBtn.classList.toggle('active', mode === 'PRIORITY');

    const modeRrBtn = document.getElementById('mode-rr');
    if (modeRrBtn) modeRrBtn.classList.toggle('active', mode === 'ROUND_ROBIN');

    // Hide scenarios in Round Robin mode
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        if (mode === 'ROUND_ROBIN') {
            sidebar.style.display = 'none';
        } else {
            sidebar.style.display = 'flex';
        }
    }

    console.log(`[FRONTEND] Mode set to: ${mode}`);
}

// ==================== HASHING LOGIC ====================
function getVehicleKey(vid) {
    // Sum of ASCII values
    let key = 0;
    for (let i = 0; i < vid.length; i++) key += vid.charCodeAt(i);
    return key;
}

function insertToHashTable(vid) {
    const key = getVehicleKey(vid);
    const m = CONFIG.HASH_TABLE_SIZE;
    const p = CONFIG.HASH_PRIME;

    let h1 = key % m;
    let h2 = p - (key % p);

    let idx = h1;
    let i = 0;

    // Detailed Log
    console.log(`[HASH] Inserting ${vid} (Key=${key}) → h1=${h1}, h2=${h2}`);

    // Probe 0 is the initial attempt at h1 + 0*h2
    if (state.hashTable[idx] !== null) {
        console.log(`[HASH] Collision at Initial Index ${idx} (Occupied by ${state.hashTable[idx].vid})`);
    }

    while (state.hashTable[idx] !== null && i < m) {
        i++; // Increment probe count
        idx = (h1 + i * h2) % m; // Calculate NEXT probe index
        console.log(`[HASH] Probe #${i}: Trying Index ${idx}... ${state.hashTable[idx] ? 'OCCUPIED' : 'FREE'}`);
    }

    if (i < m) {
        // Store i+1 effectively because 0th probe was the first attempt
        // Actually, let's just store 'i' as number of Extra Probes needed, or 'i+1' as Attempt Count
        // Requirement: "Log each probe (i=1..)"
        state.hashTable[idx] = { vid, key, h1, h2, probes: i + 1, finalIdx: idx };
        console.log(`[HASH] SUCCESS: ${vid} inserted at Index ${idx}. Total Attempts: ${i + 1}`);
    } else {
        console.log(`[HASH] FAIL: Table Full! Could not insert ${vid}`);
    }

    // Force re-render of hash view if active
    if (state.showHashing) renderHashView();
}

function renderHashView() {
    const tbody = document.querySelector('#hash-table-view tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    state.hashTable.forEach((slot, idx) => {
        const row = document.createElement('tr');
        if (slot) {
            row.classList.add('filled');
            row.innerHTML = `
                <td>${idx}</td>
                <td><strong>${slot.vid}</strong></td>
                <td>${slot.key}</td>
                <td>${slot.h1}</td>
                <td>${slot.h2}</td>
                <td>${slot.probes}</td>
            `;
        } else {
            row.innerHTML = `
                <td style="color:#aaa">${idx}</td>
                <td colspan="5" style="color:#eee">-</td>
            `;
        }
        tbody.appendChild(row);
    });
}

function updateScenarioInfoVisibility() {
    const box = document.getElementById('scenario-info-box');
    const titleEl = document.getElementById('scenario-info-title');
    const descEl = document.getElementById('scenario-info-desc');

    if (!box) return;

    // Find active scenario
    let activeKey = null;
    const scenarioMap = {
        'main_road': 'is_main_road',
        'accident': 'is_accident',
        'school_zone': 'is_school_zone',
        'weather': 'is_heavy_weather',
        'rush_hour': 'is_rush_hour',
        'pedestrian': 'has_pedestrian_crossing',
        'vip': 'is_vip'
    };

    // Reverse lookup or just iterate active set?
    // state.activeScenarios has the keys like 'weather', 'accident'
    if (state.activeScenarios.size > 0) {
        activeKey = state.activeScenarios.values().next().value;
    }

    const info = SCENARIO_INFO[activeKey];

    if (info) {
        titleEl.innerHTML = info.title;
        descEl.innerHTML = info.desc;
        box.style.display = 'block';
    } else {
        box.style.display = 'none';
    }
}


function toggleScenario(scenario, btn) {
    const isActive = state.activeScenarios.has(scenario);

    // MUTUAL EXCLUSION: Deactivate all others first
    // Clear Visuals for currently active items
    state.activeScenarios.forEach(s => updateScenarioVisuals(s, false));
    state.activeScenarios.clear();

    document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));

    // Reset all flags in state.scenario logic
    const scenarioMap = {
        'main_road': 'is_main_road',
        'accident': 'is_accident',
        'school_zone': 'is_school_zone',
        'weather': 'is_heavy_weather',
        'rush_hour': 'is_rush_hour',
        'pedestrian': 'has_pedestrian_crossing',
        'vip': 'is_vip'
    };
    Object.values(scenarioMap).forEach(flag => state.scenario[flag] = false);

    // Update Scenario Info Visibility (Reset)
    updateScenarioInfoVisibility();

    if (!isActive) {
        // Activate NEW scenario
        state.activeScenarios.add(scenario);
        btn.classList.add('active');

        // Update State Flag
        const flagName = scenarioMap[scenario];
        if (flagName) {
            state.scenario[flagName] = true;
            console.log(`[SCENARIO] ${scenario.toUpperCase()} activated (${flagName}=true)`);
        }

        // Update Scenario Info Visibility
        updateScenarioInfoVisibility();

        // Update Visuals
        updateScenarioVisuals(scenario, true);

        // Trigger Immediate Actions (Spawns, etc.)
        handleInstantScenarioActions(scenario);

        // Force Backend Decision to update Priority Table immediately
        console.log(`[SCENARIO] Triggering priority recalculation...`);
        if (!state.waitingForDecision) makeDecision();

        // PEDESTRIAN TIMER LOGIC
        if (scenario === 'pedestrian') {
            if (state.pedestrianInterval) clearInterval(state.pedestrianInterval);
            let timeLeft = 10;
            const marker = document.getElementById('marker-north');

            state.pedestrianInterval = setInterval(() => {
                timeLeft--;
                if (marker) marker.textContent = `🚶 PEDESTRIAN XING (${timeLeft}s)`;

                if (timeLeft <= 0) {
                    clearInterval(state.pedestrianInterval);
                    toggleScenario('pedestrian', btn); // Deactivate
                }
            }, 1000);
        }

    } else {
        console.log(`[SCENARIO] All scenarios deactivated`);

        // Clear Timer if disabling manually
        if (scenario === 'pedestrian' && state.pedestrianInterval) {
            clearInterval(state.pedestrianInterval);
        }

        // Update to clear effects
        if (!state.waitingForDecision) makeDecision();
    }
}

function updateScenarioVisuals(scenario, isActive) {
    const markers = {
        'main_road': [
            { id: 'marker-north', text: 'MAIN ROAD ⬆️' },
            { id: 'marker-south', text: 'MAIN ROAD ⬇️' }
        ],
        'accident': [
            { id: 'marker-east', text: '⛔ LANE BLOCKED ⛔', style: 'background: rgba(255,0,0,0.8);' }
        ],
        'school_zone': [
            { id: 'marker-west', text: '🚸 SCHOOL ZONE' }
        ],
        'pedestrian': [
            { id: 'marker-north', text: '🚶 PEDESTRIAN XING (10s)', style: 'background: rgba(255,165,0,0.9); font-weight:bold;' }
        ],
        'rush_hour': [
            { id: 'marker-center', text: '🕒 RUSH HOUR' }
        ],
        'vip': [
            { id: 'marker-center', text: '🌟 VIP CONVOY' }
        ],
        'weather': [
            { id: 'marker-center', text: '🌧️ HEAVY WEATHER' }
        ],
        'congestion': [
            { id: 'marker-center', text: '🚙 HIGH CONGESTION' }
        ]
    };

    const configs = markers[scenario];
    if (configs) {
        configs.forEach(cfg => {
            const el = document.getElementById(cfg.id);
            if (el) {
                if (isActive) {
                    el.textContent = cfg.text;
                    el.classList.add('active');
                    if (cfg.style) el.style.cssText = cfg.style;
                    if (scenario === 'weather') document.querySelector('.main-content').style.filter = 'brightness(0.7) contrast(1.2)';
                } else {
                    el.classList.remove('active');
                    el.style.cssText = ''; // Reset custom styles
                    if (scenario === 'weather') document.querySelector('.main-content').style.filter = '';
                }
            }
        });
    }
}

// Fixed Update Flag Helper - Integrated above, removing separate function if not used elsewhere
function updateScenarioFlag(scenario, isActive) {
    // Kept for compatibility if used elsewhere, but toggleScenario handles it now
}

function updateScenarioFlag(scenario, isActive) {
    const map = {
        'main_road': 'is_main_road',
        'accident': 'is_accident',
        'school_zone': 'is_school_zone',
        'weather': 'is_heavy_weather',
        'rush_hour': 'is_rush_hour',
        'pedestrian': 'has_pedestrian_crossing'
    };
    if (map[scenario]) {
        state.scenario[map[scenario]] = isActive;
        console.log(`[FRONTEND] Scenario Flag ${map[scenario]}: ${isActive}`);
    }
}

function handleInstantScenarioActions(scenario) {
    const directions = ['STRAIGHT', 'LEFT', 'RIGHT'];
    // For vehicle specific scenarios, we might want to inject one immediately to verify
    if (scenario === 'ambulance') {
        spawnVehicle('AMBULANCE');
    } else if (scenario === 'fire') {
        spawnVehicle('FIRE');
    } else if (scenario === 'police') {
        spawnVehicle('POLICE');
    } else if (scenario === 'vip') {
        spawnVehicle('VIP');
    } else if (scenario === 'congestion') {
        // Spawn a burst
        for (let i = 0; i < 8; i++) spawnVehicle('NORMAL');
    } else if (scenario === 'mixed_emergency') {
        spawnVehicle('AMBULANCE');
        spawnVehicle('FIRE');
        spawnVehicle('POLICE');
    }
}

function spawnVehicle(type) {
    const laneId = Math.floor(Math.random() * 4);
    const directions = ['STRAIGHT', 'LEFT', 'RIGHT'];
    const dir = directions[Math.floor(Math.random() * directions.length)];
    addVehicle(laneId, type, dir);
}

function startSimulation() {
    // GUARD: Prevent multiple loops
    if (state.isRunning) return;

    console.log("[SIMULATION] Starting...");

    // Prevent double loops
    if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
    }

    state.isRunning = true;
    state.lastTime = performance.now();

    // Reset Timer & State
    state.signalTimer = CONFIG.SIGNAL_DURATION;
    state.currentGreenLane = -1;
    state.vehiclesToPass = 0;
    state.waitingForDecision = false;

    // Reset Limits & Counters, taking into account PRE-EXISTING vehicles (Manual Setup)
    state.activeVehicleCount = state.lanes.reduce((sum, lane) => sum + lane.vehicles.length, 0);
    state.totalSpawned = state.activeVehicleCount;

    state.totalProcessedForStop = 0;
    state.stats.served = 0;
    state.stats.switches = 0;
    state.simStartTime = Date.now();
    state.metrics['ROUND_ROBIN'] = { totalWait: 0, served: 0, typeData: {} };
    state.metrics['PRIORITY'] = { totalWait: 0, served: 0, typeData: {} };

    // Do NOT clear lanes if we have vehicles (Manual Setup Mode)
    // state.lanes.forEach(l => l.vehicles = []);

    // Generate Initial Traffic
    // generateInitialTraffic(); // DISABLED FOR MANUAL MODE

    // UI Updates
    const btn = document.getElementById('btn-start');
    if (btn) {
        btn.textContent = 'STOP SIMULATION';
        btn.style.backgroundColor = '#ff4444';
        btn.style.color = 'white';
    }

    console.log('[SIMULATION] Started');

    if (state.chartInterval) clearInterval(state.chartInterval);
    state.chartInterval = setInterval(updateAnalyticsChart, 1000);

    requestAnimationFrame(gameLoop);
}

function stopSimulation() {
    state.isRunning = false; // This kills the loop next frame

    if (state.chartInterval) {
        clearInterval(state.chartInterval);
        state.chartInterval = null;
    }

    const btn = document.getElementById('btn-start');
    if (btn) {
        btn.textContent = 'START SIMULATION';
        btn.style.backgroundColor = '';
        btn.style.color = '';
    }

    // Auto-Reset Scenarios (Flags, Visuals, UI)
    if (state.activeScenarios) {
        state.activeScenarios.forEach(s => updateScenarioVisuals(s, false));
        state.activeScenarios.clear();
    }

    // Reset flags
    const scenarioMap = {
        'main_road': 'is_main_road',
        'accident': 'is_accident',
        'school_zone': 'is_school_zone',
        'weather': 'is_heavy_weather',
        'rush_hour': 'is_rush_hour',
        'pedestrian': 'has_pedestrian_crossing',
        'vip': 'is_vip'
    };
    if (state.scenario) {
        Object.values(scenarioMap).forEach(flag => state.scenario[flag] = false);
    }

    // Reset Buttons
    document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));

    console.log(`[SIMULATION] Stopped. Total Served: ${state.stats.served}. Scenarios Reset.`);
}

function generateInitialTraffic() {
    const hasVehicles = state.lanes.some(l => l.vehicles.length > 0);
    if (hasVehicles) return;

    // Include variety of vehicle types
    const types = ['NORMAL', 'NORMAL', 'TRUCK', 'MOTORCYCLE', 'BUS'];
    const directions = ['STRAIGHT', 'LEFT', 'RIGHT'];

    state.lanes.forEach(lane => {
        for (let i = 0; i < 4; i++) {
            addVehicle(lane.id,
                types[Math.floor(Math.random() * types.length)],
                directions[Math.floor(Math.random() * directions.length)]
            );
        }
    });
}

// ==================== TRAFFIC LOGIC ====================
let vehicleIdCounter = 1;

function addVehicle(laneId, type, direction = 'STRAIGHT', customId = null) {
    // 1. LIMIT CHECK
    if (state.totalSpawned >= CONFIG.MAX_VEHICLES_LIMIT) {
        console.log(`[FRONTEND] Vehicle limit reached (${CONFIG.MAX_VEHICLES_LIMIT}). Cannot add.`);
        return;
    }

    const laneConfig = CONFIG.LANES[laneId];
    const lane = state.lanes[laneId];
    const queueIndex = lane.vehicles.length;

    // Position logic:
    // Distance from stop line = index * (length + gap)
    // Actual Pos = StopPos - (Distance * LaneDir)

    const distFromStop = queueIndex * (CONFIG.VEHICLE_LENGTH + CONFIG.VEHICLE_GAP);

    // Coordinates calculation
    const targetX = laneConfig.stopX - (distFromStop * laneConfig.dirX);
    const targetY = laneConfig.stopY - (distFromStop * laneConfig.dirY);

    // ID Generation
    const id = customId || `V${vehicleIdCounter++}`;

    // Hash Table Insert (DSA Demo)
    insertToHashTable(id);

    // Priority Mapping
    const priorityMap = {
        'MOTORCYCLE': 10,
        'NORMAL': 20,
        'BUS': 70,
        'TRUCK': 80,
        'VIP': 240,
        'POLICE': 260,
        'FIRE': 280,
        'AMBULANCE': 300
    };

    lane.vehicles.push({
        id: id,
        type: type,
        direction: direction,
        basePriority: priorityMap[type] || 2, // Fallback to 2 (Normal)

        // Dynamic Position
        x: targetX, // Instant spawn in queue
        y: targetY,

        // We will store actual stop target
        stopX: targetX,
        stopY: targetY,

        rotation: laneConfig.angle,

        moveStartTime: 0,
        state: 'queued',
        arrivalTime: Date.now()
    });

    // Update Counters
    state.activeVehicleCount++;
    state.totalSpawned++;

    // Explicit Log as Requested
    console.log(`[UI] Vehicle added: ${id}, Lane=${laneId}, Type=${type}, Turn=${direction}`);
    console.log(`[FRONTEND] Stats: Active=${state.activeVehicleCount}, Total=${state.totalSpawned}/${CONFIG.MAX_VEHICLES_LIMIT}`);

    // If paused, render once to show new vehicle
    if (!state.isRunning) {
        requestAnimationFrame(render);
    }
}

// ==================== GAME LOOP ====================
function gameLoop(timestamp) {
    if (!state.isRunning) {
        state.animationFrameId = null;
        return;
    }

    if (!state.lastTime) state.lastTime = timestamp;
    const dt = timestamp - state.lastTime;
    state.lastTime = timestamp;

    update(dt, timestamp);
    render();

    state.animationFrameId = requestAnimationFrame(gameLoop);
}

function update(dt, currentTime) {
    if (!state.isRunning) return;

    state.lanes.forEach(lane => {
        // 1. Queue Management & Shifting
        for (let i = 0; i < lane.vehicles.length; i++) {
            const v = lane.vehicles[i];

            if (v.state === 'queued') {
                const distFromStop = i * (CONFIG.VEHICLE_LENGTH + CONFIG.VEHICLE_GAP);
                const laneConfig = CONFIG.LANES[lane.id];

                // Target is behind stop line
                const targetX = laneConfig.stopX - (distFromStop * laneConfig.dirX);
                const targetY = laneConfig.stopY - (distFromStop * laneConfig.dirY);

                // Simple lerp for smooth shifting
                const speed = 0.1;
                const dx = targetX - v.x;
                const dy = targetY - v.y;

                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    v.x += dx * speed;
                    v.y += dy * speed;
                } else {
                    v.x = targetX;
                    v.y = targetY;
                }
            }
            else if (v.state === 'exiting') {
                const currentMoveDuration = state.scenario.is_heavy_weather ?
                    CONFIG.VEHICLE_MOVE_DURATION * 1.8 :
                    CONFIG.VEHICLE_MOVE_DURATION;

                const elapsed = currentTime - v.moveStartTime;
                let rawT = elapsed / currentMoveDuration;

                if (rawT >= 1) {
                    // Metrics
                    // FIX: Use Date.now() to match v.arrivalTime (Epoch)
                    const waitTime = (Date.now() - v.arrivalTime) / 1000;
                    const modeMetrics = state.metrics[state.simulationMode];
                    modeMetrics.totalWait += waitTime;
                    modeMetrics.served++;

                    // Per-type metrics
                    let displayType = v.type;
                    if (['AMBULANCE', 'FIRE', 'POLICE'].includes(v.type)) displayType = 'EMG';

                    if (!modeMetrics.typeData[displayType]) {
                        modeMetrics.typeData[displayType] = { total: 0, count: 0 };
                    }
                    modeMetrics.typeData[displayType].total += waitTime;
                    modeMetrics.typeData[displayType].count++;

                    lane.vehicles.splice(i, 1);
                    i--;
                    state.stats.served++;

                    // Vehicle Exited
                    state.activeVehicleCount--;
                    console.log(`[FRONTEND] Vehicle Exited. Active: ${state.activeVehicleCount}`);

                    // Auto-Stop Check
                    if (state.totalSpawned >= CONFIG.MAX_VEHICLES_LIMIT && state.activeVehicleCount <= 0) {
                        console.log(`[SIMULATION] Completed (${state.totalSpawned} vehicles processed). Stopping.`);
                        stopSimulation();
                    }

                    continue;
                }

                // Quadratic Ease-In for Acceleration
                let t = rawT * rawT;

                // Bezier Path Logic
                const path = getPath(lane.id, v.direction);
                const pos = getBezierPoint(t, path.p0, path.p1, path.p2);
                const angle = getBezierAngle(t, path.p0, path.p1, path.p2);

                v.x = pos.x;
                v.y = pos.y;
                v.rotation = angle;
            }
        }
    });

    // Check backend decision
    if (!state.waitingForDecision && state.signalTimer <= 0) {
        makeDecision();
    } else if (state.signalTimer > 0) {
        state.signalTimer -= dt;

        // Release vehicles from Green Lane
        if (state.currentGreenLane !== -1 && state.vehiclesToPass > 0) {

            // PEDESTRIAN SAFETY OVERRIDE: If pedestrians clearly visible, STOP Lane 0
            if (state.scenario.has_pedestrian_crossing && state.currentGreenLane === 0) {
                // Don't release
                return;
            }

            const lane = state.lanes[state.currentGreenLane];
            // Find first queued vehicle
            const waitingVehicle = lane.vehicles.find(v => v.state === 'queued');

            if (waitingVehicle) {
                // Throttle releases: 1 vehicle per 800ms to allow spacing
                if (!state.lastReleaseTime || (currentTime - state.lastReleaseTime > 800)) {
                    waitingVehicle.state = 'exiting';
                    waitingVehicle.moveStartTime = currentTime;
                    state.vehiclesToPass--;
                    state.lastReleaseTime = currentTime;

                    console.log(`[FRONTEND] Vehicle released from Lane ${lane.id}: ${waitingVehicle.id} turning ${waitingVehicle.direction}`);
                }
            }
        }
    }

    // Auto-spawn logic (Controlled by Toggle)
    if (state.autoSpawnEnabled && state.totalSpawned < CONFIG.MAX_VEHICLES_LIMIT && Math.random() < 0.01) {
        const types = ['NORMAL', 'NORMAL', 'TRUCK', 'MOTORCYCLE', 'BUS'];
        const type = types[Math.floor(Math.random() * types.length)];
        spawnVehicle(type);
    }
}

// ==================== GEOMETRY HELPERS ====================
function getPath(laneId, direction) {
    const laneCfg = CONFIG.LANES[laneId];
    // P0 is always the stop line position
    const p0 = { x: laneCfg.stopX, y: laneCfg.stopY };
    let p1, p2;

    // Exit targets (approximate off-screen points for 850px map)
    const exits = {
        NORTH: { x: 460, y: -200 }, // Exiting upwards
        EAST: { x: 1050, y: 460 },  // Exiting right
        SOUTH: { x: 390, y: 1050 }, // Exiting down
        WEST: { x: -200, y: 390 }   // Exiting left
    };

    // Determine target based on Origin + Turn
    // Lane 0 (North->South, stop X=390, Y=353)
    if (laneId == 0) {
        if (direction === 'STRAIGHT') {
            p2 = exits.SOUTH;
            p1 = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
        } else if (direction === 'LEFT') {
            // Turn Left (East, Y=460)
            p2 = exits.EAST;
            p1 = { x: 390, y: 460 }; // Intersection of flow
        } else { // RIGHT
            // Turn Right (West, Y=390)
            p2 = exits.WEST;
            p1 = { x: 390, y: 390 };
        }
    }
    // Lane 1 (East->West, stop X=497, Y=390)
    else if (laneId == 1) {
        if (direction === 'STRAIGHT') {
            p2 = exits.WEST;
            p1 = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
        } else if (direction === 'LEFT') {
            // Turn Left (South, X=390)
            p2 = exits.SOUTH;
            p1 = { x: 390, y: 390 };
        } else { // RIGHT
            // Turn Right (North, X=460)
            p2 = exits.NORTH;
            p1 = { x: 460, y: 390 };
        }
    }
    // Lane 2 (South->North, stop X=460, Y=497)
    else if (laneId == 2) {
        if (direction === 'STRAIGHT') {
            p2 = exits.NORTH;
            p1 = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
        } else if (direction === 'LEFT') {
            // Turn Left (West, Y=390)
            p2 = exits.WEST;
            p1 = { x: 460, y: 390 };
        } else { // RIGHT
            // Turn Right (East, Y=460)
            p2 = exits.EAST;
            p1 = { x: 460, y: 460 };
        }
    }
    // Lane 3 (West->East, stop X=353, Y=460)
    else if (laneId == 3) {
        if (direction === 'STRAIGHT') {
            p2 = exits.EAST;
            p1 = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
        } else if (direction === 'LEFT') {
            // Turn Left (North, X=460)
            p2 = exits.NORTH;
            p1 = { x: 460, y: 460 };
        } else { // RIGHT
            // Turn Right (South, X=390)
            p2 = exits.SOUTH;
            p1 = { x: 390, y: 460 };
        }
    }

    return { p0, p1, p2 };
}

function getBezierPoint(t, p0, p1, p2) {
    // Quadratic Bezier: (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    const oneMinusT = 1 - t;
    return {
        x: (oneMinusT * oneMinusT * p0.x) + (2 * oneMinusT * t * p1.x) + (t * t * p2.x),
        y: (oneMinusT * oneMinusT * p0.y) + (2 * oneMinusT * t * p1.y) + (t * t * p2.y)
    };
}

function getBezierAngle(t, p0, p1, p2) {
    // Derivative of Quadratic Bezier
    // B'(t) = 2(1-t)(P1 - P0) + 2t(P2 - P1)
    const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * (1 - t) * (p1.y - p0.y) + (2 * t * (p2.y - p1.y)); // Fixed typo from previous thought (2t)
    return Math.atan2(dy, dx) * (180 / Math.PI) + 90; // +90 because our vehicle sprite faces Up (0deg) or Down(180)?
    // From CSS: vehicle is 20px W x 35px H.
    // Standard rotation 0 assumes Top.
    // atan2(0,1) = 90. +90 = 180 (Down).
}

async function makeDecision() {
    state.waitingForDecision = true;
    // console.log('[FRONTEND] Backend decision requested'); // Reduced Log

    // Use currently queued vehicles for decision
    const payload = {
        current_time: Math.floor(Date.now() / 1000),
        simulation_mode: state.simulationMode, // Pass mode to backend
        ...state.scenario,
        lanes: state.lanes.map(l => ({
            id: l.id,
            vehicles: l.vehicles
                .filter(v => v.state === 'queued' || v.state === 'shifting')
                .map(v => ({
                    type: v.type,
                    arrival_time: Math.floor(v.arrivalTime / 1000),
                    base_priority: v.basePriority
                }))
        }))
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for cold starts (Render/Vercel)

    // Visual Feedback for "Waiting"
    const logBox = document.getElementById('decision-logs-content');
    if (logBox) {
        logBox.textContent = `[${new Date().toLocaleTimeString()}] 📡 Connecting to brain...\n` + logBox.textContent;
    }

    try {
        const response = await fetch('/api/decide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const decision = await response.json();

            // console.log(`[FRONTEND] Decision received: Green Lane ${decision.selected_lane}`);

            if (decision.selected_lane !== state.currentGreenLane) {
                state.stats.switches++;
                console.log(`[FRONTEND] Signal Switch: Lane ${decision.selected_lane}`);
            }

            state.currentGreenLane = decision.selected_lane;
            state.vehiclesToPass = decision.num_vehicles_to_pass;

            if (decision.priority_heap) {
                updatePriorityViz(decision.priority_heap);
            }

            // Update Logs Panel
            if (decision.debug_logs) {
                const logBox = document.getElementById('decision-logs-content');
                if (logBox) {
                    const timestamp = new Date().toLocaleTimeString();
                    const formattedLogs = decision.debug_logs.map(L => `[${timestamp}] ${L}`).join('\n');

                    // console.log("[BACKEND LOGS]", decision.debug_logs); // Browser Console

                    // Append
                    logBox.textContent = formattedLogs + "\n--------------------------------------------------\n" + logBox.textContent;

                    // Truncate if too long (approx 2000 chars)
                    if (logBox.textContent.length > 5000) {
                        logBox.textContent = logBox.textContent.substring(0, 5000) + "...";
                    }
                }
            }
        }
    } catch (e) {
        // console.error("[FRONTEND] Backend decision failed/timeout", e); // Reduced spam
    } finally {
        state.waitingForDecision = false;
        // Line 866: `state.signalTimer = 0;`
        // In `startSimulation`: `state.signalTimer = CONFIG.SIGNAL_DURATION;`
        // In `update`: `state.signalTimer -= dt`.
        // If it goes <= 0, we call `makeDecision`.
        // Once decision returns, we set `state.signalTimer = 0`??
        // If we set it to 0, next frame it is <= 0.
        // `update` calls `makeDecision` AGAIN.
        // Infinite loop of decisions!
        // FIX THIS CRITICAL BUG.
        // We must reset timer to `CONFIG.SIGNAL_DURATION` after a decision is made.
        state.signalTimer = CONFIG.SIGNAL_DURATION;
    }
}

// ==================== RENDERING ====================

function render() {
    // Stats update
    const servedEl = document.getElementById('vehicles-served');
    if (servedEl) servedEl.textContent = state.stats.served;

    const switchEl = document.getElementById('signal-switches');
    if (switchEl) switchEl.textContent = state.stats.switches;

    // Time Update
    const timerContainer = document.getElementById('timer-container');
    const timeEl = document.getElementById('simulation-time');
    if (timerContainer && timeEl) {
        if (state.isRunning) {
            timerContainer.style.display = 'block';
            const elapsed = (Date.now() - state.simStartTime) / 1000;
            timeEl.textContent = elapsed.toFixed(1) + 's';
        } else if (state.simStartTime && state.simStartTime > 0) {
            // Show final time if stopped but has run
            timerContainer.style.display = 'block';
        } else {
            timerContainer.style.display = 'none';
        }
    }

    // We build the visual state inside #intersection-container
    let container = document.getElementById('intersection-container');
    if (!container) return;

    // 1. Update Signals
    for (let i = 0; i < 4; i++) {
        const sig = document.getElementById(`signal-${i}`);
        if (sig) {
            if (state.currentGreenLane === i) {
                sig.classList.remove('red');
                sig.classList.add('green');
            } else {
                sig.classList.remove('green');
                sig.classList.add('red');
            }
        }
    }

    // Live update inspector if hovering
    if (state.hoveredVehicle) {
        updateVehicleInspector(state.hoveredVehicle);
    }

    // 2. Render Vehicles
    const layer = document.getElementById('vehicle-layer');
    if (!layer) return;

    // Sync DOM
    const currentVehicles = new Set();

    state.lanes.forEach(lane => {
        lane.vehicles.forEach(v => {
            currentVehicles.add(v.id);

            let el = document.getElementById(v.id);
            if (!el) {
                el = document.createElement('div');
                el.id = v.id;
                el.className = `vehicle ${v.type}`;
                el.dataset.type = v.type;
                layer.appendChild(el);
            }

            // Update Pos
            el.style.left = `${v.x}px`;
            el.style.top = `${v.y}px`;
            el.style.transform = `translate(-50%, -50%) rotate(${v.rotation}deg)`;

            // Opacity for exiting
            if (v.state === 'exiting') {
                // Fade out based on distance traveled?
                // Just use simple full opacity until it disappears
                el.style.opacity = 1;
            }
        });
    });

    // 3. Update Comparison Table
    const modes = ['ROUND_ROBIN', 'PRIORITY'];
    const pfx = { 'ROUND_ROBIN': 'rr', 'PRIORITY': 'pq' };

    modes.forEach(mode => {
        const m = state.metrics[mode];
        const prefix = pfx[mode];

        // Overall
        document.getElementById(`${prefix}-wait`).textContent = m.served > 0 ? (m.totalWait / m.served).toFixed(1) + 's' : '-';

        // Types
        const types = ['NORMAL', 'BUS', 'TRUCK', 'MOTORCYCLE', 'EMG'];
        types.forEach(t => {
            const el = document.getElementById(`${prefix}-wait-${t}`);
            if (el) {
                const data = m.typeData[t];
                el.textContent = (data && data.count > 0) ? (data.total / data.count).toFixed(1) + 's' : '-';
            }
        });

        // Thrup
        if (state.simStartTime && state.isRunning) {
            const elapsedSec = (Date.now() - state.simStartTime) / 1000;
            document.getElementById(`${prefix}-throughput`).textContent = m.served > 0 ? (m.served / elapsedSec * 60).toFixed(1) + '/m' : '-';
        }
    });

    // Highlight active mode headers
    const headerRR = document.getElementById('header-rr');
    const headerPQ = document.getElementById('header-pq');
    if (headerRR && headerPQ) {
        if (state.simulationMode === 'ROUND_ROBIN') {
            headerRR.style.backgroundColor = '#28a745';
            headerPQ.style.backgroundColor = '#333';
        } else {
            headerPQ.style.backgroundColor = '#28a745';
            headerRR.style.backgroundColor = '#333';
        }
    }
}

function updatePriorityViz(heap) {
    const tbody = document.querySelector('#priority-queue-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Heap items: { lane_id, priority, queue_length, boost_details }
    const sorted = [...heap].sort((a, b) => b.priority - a.priority);

    sorted.forEach((item, idx) => {
        const row = document.createElement('tr');
        if (idx === 0) row.style.backgroundColor = 'rgba(76, 175, 80, 0.2)'; // Green tint for selected

        // Fallback Logic for Boost Text (Handles stale server state)
        let boostText = item.boost_details || '';
        if (!boostText) {
            const reasons = [];
            const sc = state.scenario;
            const lId = item.lane_id;
            const lane = state.lanes[lId];
            const vehicleCount = lane ? lane.vehicles.filter(v => v.state === 'queued').length : 0;

            // --- LANE LEVEL ADJUSTMENTS ---
            if (sc.is_main_road && (lId === 0 || lId === 2)) {
                reasons.push("🛣️ Main Road");
            }
            if (sc.is_accident && lId === 1) {
                reasons.push("⚠️ BLOCKED (Accident)");
            }
            if (sc.is_school_zone && lId === 3) {
                reasons.push("🚸 School Lane");
            }
            if (sc.has_pedestrian_crossing && lId === 0) {
                reasons.push("🚶 STOP (Pedestrians)");
            }

            // Rush Hour Lane
            if (sc.is_rush_hour && vehicleCount > 5) {
                reasons.push("🔥 High Traffic");
            }

            if (lane) {
                const queued = lane.vehicles.filter(v => v.state === 'queued');
                if (queued.some(v => v.type === 'AMBULANCE')) reasons.push("🚑 Emergency");
                if (queued.some(v => v.type === 'FIRE')) reasons.push("🚒 Emergency");
                if (queued.some(v => v.type === 'POLICE')) reasons.push("🚓 Emergency");
                if (queued.some(v => v.type === 'VIP')) reasons.push("🌟 VIP");

                if (sc.is_school_zone && queued.some(v => v.type === 'BUS')) reasons.push("🚌 School Bus Priority");
            }
            boostText = [...new Set(reasons)].join(', ');
        }

        const prio = Math.round(item.priority);
        let prioStyle = "padding: 2px 6px; border-radius: 4px; display: inline-block; min-width: 35px; text-align: center; font-weight: bold;";

        if (prio >= 100) {
            // Triple Digit (High Stress / Emergency)
            prioStyle += "border: 1px solid #ff4444; color: #ff4444; background: rgba(255, 68, 68, 0.1); box-shadow: 0 0 5px rgba(255, 68, 68, 0.3);";
        } else if (prio >= 10) {
            // Double Digit (Standard Traffic)
            prioStyle += "border: 1px solid #ffeb3b; color: #ffeb3b; background: rgba(255, 235, 59, 0.1);";
        } else {
            // Single Digit (Low Priority - e.g. blocked or very low)
            prioStyle += "border: 1px solid #666; color: #888; background: rgba(100, 100, 100, 0.1);";
        }

        row.innerHTML = `
            <td>${idx + 1}</td>
            <td>L${item.lane_id}</td>
            <td><span style="${prioStyle}">${prio}</span></td>
            <td style="color:#aaa;">${item.max_wait ? item.max_wait.toFixed(0) + 's' : '-'}</td>
            <td>${item.queue_length || item.vehicle_count || 0}</td>
            <td style="font-size:0.75rem; color:#ffd700; max-width: 140px;">${boostText || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

// ==================== ANALYTICS CHART ====================
let analyticsChart = null;

function initializeAnalyticsChart() {
    const ctx = document.getElementById('analyticsChart');
    if (!ctx) return;

    if (typeof Chart === 'undefined') return;

    if (analyticsChart) analyticsChart.destroy();

    analyticsChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Global Queue',
                data: [],
                borderColor: '#00e676',
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 0,
                fill: true,
                backgroundColor: 'rgba(0, 230, 118, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            scales: {
                x: { display: false },
                y: {
                    beginAtZero: true,
                    suggestedMax: 20,
                    grid: { color: '#333' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function updateAnalyticsChart() {
    if (!analyticsChart) return;

    // Calculate metric: Total Queue Length
    const totalQ = state.lanes.reduce((acc, l) => acc + l.vehicles.filter(v => v.state === 'queued').length, 0);

    analyticsChart.data.labels.push('');
    analyticsChart.data.datasets[0].data.push(totalQ);

    if (analyticsChart.data.labels.length > 50) {
        analyticsChart.data.labels.shift();
        analyticsChart.data.datasets[0].data.shift();
    }
    analyticsChart.update();
}

// ==================== INSPECTOR LOGIC ====================
function updateVehicleInspector(v) {
    const inspector = document.getElementById('vehicle-inspector');
    const content = document.getElementById('inspector-content');
    if (!inspector || !content) return;

    if (!v) {
        inspector.style.display = 'none';
        return;
    }
    inspector.style.display = 'block';

    // 1. Calculate Priority Components (Client-Side Mirror of Server Logic)

    // Base
    const typeBase = v.basePriority || 2;

    // Wait
    const nowSec = Date.now() / 1000;
    const arrSec = v.arrivalTime / 1000;
    const waitTime = Math.max(0, nowSec - arrSec);
    const waitBonus = waitTime * 0.1;

    // Boosts
    let boost = 0;
    let boostText = [];
    const sc = state.scenario;

    // Vehicle Type Boosts/Penalties
    if (sc.is_school_zone && v.type === 'BUS') { boost += 5; boostText.push("School Bus(+5)"); }
    if (sc.is_vip && v.type === 'VIP') { boost += 5; boostText.push("VIP Mode(+5)"); }
    if (sc.is_rush_hour) { boost += 0.5; boostText.push("Rush(+0.5)"); }
    if (sc.is_heavy_weather) { boost -= 1; boostText.push("Weather(-1)"); }

    // Lane Boosts (Inferred from generic lane logic, slightly imperfect for specific lane ID without passing it, 
    // but we can find lane ID by geometry or just assume general boosts for demo)
    // Actually we can find lane ID:
    const lane = state.lanes.find(l => l.vehicles.includes(v));
    if (lane) {
        if (sc.is_main_road && (lane.id === 0 || lane.id === 2)) { boost += 3; boostText.push("MainRoad(+3)"); }
        if (sc.is_school_zone && lane.id === 3) { boost += 4; boostText.push("SchoolLane(+4)"); }
        if (sc.is_accident && lane.id === 1) { boost -= 100; boostText.push("Blocked(-100)"); }
        if (sc.has_pedestrian_crossing && lane.id === 0) { boost -= 100; boostText.push("Pedestrian(-100)"); }

        // Rush Hour Lane
        const count = lane.vehicles.length;
        if (sc.is_rush_hour && count > 5) { boost += 2; boostText.push("HighTraffic(+2)"); }
    }

    const final = typeBase + waitBonus + boost;

    // Render Formula
    content.innerHTML = `
        <div style="font-weight:bold; color: #fff; margin-bottom:8px;">${v.id} (${v.type})</div>
        <div>Base Priority: <span style="color: #4CAF50;">${typeBase}</span></div>
        <div>+ Wait Time: <span style="color: #FFC107;">${waitBonus.toFixed(1)}</span> <span style="color:#777;">(${waitTime.toFixed(0)}s)</span></div>
        <div>+ Boosts: <span style="color: #2196F3;">${boost}</span></div>
        ${boostText.length > 0 ? `<div style="font-size:0.8em; color:#aaa; margin-left:10px;">${boostText.join(', ')}</div>` : ''}
        <div style="border-top:1px solid #555; margin-top:5px; padding-top:5px;">
            = FINAL PRIORITY: <span style="color: #00dbff; font-weight:bold; font-size:1.1em;">${final.toFixed(1)}</span>
        </div>
    `;
}
