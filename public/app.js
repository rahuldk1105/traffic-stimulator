// ==================== CONFIGURATION ====================
const CONFIG = {
    SIGNAL_DURATION: 4000,        // Green light holds for 4s
    VEHICLE_MOVE_DURATION: 1500,  // Crossing intersection takes 1.5s

    // Layout
    LANE_COUNT: 4,
    VEHICLE_WIDTH: 60,
    VEHICLE_GAP: 10,
    INTERSECTION_SIZE: 200, // Visual space for intersection crossing
};

// ==================== STATE MANAGEMENT ====================
// ==================== STATE MANAGEMENT ====================
const state = {
    isRunning: false,
    lastTime: 0,
    signalTimer: 0,
    currentGreenLane: -1,
    vehiclesToPass: 0,
    waitingForDecision: false,
    simulationMode: 'PRIORITY', // 'PRIORITY' or 'ROUND_ROBIN'

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
        // Emergency and others are handled via spawners or temporary flags
    },
    activeScenarios: new Set(), // Track UI state for "Emergency", "Congestion" etc
    stats: {
        served: 0,
        switches: 0,
    }
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initControls();
    requestAnimationFrame(gameLoop);
});

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

    document.getElementById('btn-start').addEventListener('click', () => {
        if (!state.isRunning) {
            startSimulation();
        } else {
            stopSimulation();
        }
    });

    setMode('PRIORITY'); // Default
}

function setMode(mode) {
    state.simulationMode = mode;
    const modePriorityBtn = document.getElementById('mode-priority');
    if (modePriorityBtn) modePriorityBtn.classList.toggle('active', mode === 'PRIORITY');

    const modeRrBtn = document.getElementById('mode-rr');
    if (modeRrBtn) modeRrBtn.classList.toggle('active', mode === 'ROUND_ROBIN');
    console.log(`[FRONTEND] Mode set to: ${mode}`);
}

function toggleScenario(scenario, btn) {
    if (state.activeScenarios.has(scenario)) {
        state.activeScenarios.delete(scenario);
        btn.classList.remove('active');
        // Disable flag if applicable
        updateScenarioFlag(scenario, false);
    } else {
        state.activeScenarios.add(scenario);
        btn.classList.add('active');
        // Enable flag if applicable
        updateScenarioFlag(scenario, true);

        // Immediate Actions for specific vehicles
        handleInstantScenarioActions(scenario);
    }
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
    state.isRunning = true;
    state.lastTime = performance.now();
    state.signalTimer = CONFIG.SIGNAL_DURATION;
    state.currentGreenLane = -1;
    state.vehiclesToPass = 0;
    state.waitingForDecision = false;

    generateInitialTraffic();

    const btn = document.getElementById('btn-start');
    btn.textContent = 'STOP SIMULATION';
    btn.style.backgroundColor = '#ff4444';
    btn.style.color = 'white';
}

function stopSimulation() {
    state.isRunning = false;
    const btn = document.getElementById('btn-start');
    btn.textContent = 'START SIMULATION';
    btn.style.backgroundColor = '';
    btn.style.color = '';
}

function generateInitialTraffic() {
    const hasVehicles = state.lanes.some(l => l.vehicles.length > 0);
    if (hasVehicles) return;

    // Use active scenarios to bias initial traffic?
    // For now, standard random
    const types = ['NORMAL', 'BUS'];
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

let vehicleIdCounter = 1;
function addVehicle(laneId, type, direction = 'STRAIGHT') {
    const lane = state.lanes[laneId];
    const queueIndex = lane.vehicles.length;
    // Position 0 is closest to intersection (x=0)
    // x represents distance FROM intersection line
    const targetX = queueIndex * (CONFIG.VEHICLE_WIDTH + CONFIG.VEHICLE_GAP);

    lane.vehicles.push({
        id: `V${vehicleIdCounter++}`,
        type: type,
        direction: direction,
        x: targetX + 800, // Spawn off-screen right
        targetX: targetX,
        startX: targetX + 800,
        y: 0, // Cross-lane position (center)
        startY: 0,
        targetY: 0,
        moveStartTime: performance.now(),
        state: 'queued',
        arrivalTime: Date.now()
    });
}

// ==================== GAME LOOP ====================
function gameLoop(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const dt = timestamp - state.lastTime;
    state.lastTime = timestamp;

    if (state.isRunning) {
        update(dt, timestamp);
        render();
    }

    requestAnimationFrame(gameLoop);
}

function update(dt, currentTime) {
    // 0. Occasional Traffic
    if (Math.random() < 0.005) {
        const laneId = Math.floor(Math.random() * 4);
        const types = ['NORMAL', 'BUS'];
        const directions = ['STRAIGHT', 'LEFT', 'RIGHT'];
        if (state.lanes[laneId].vehicles.length < 10) {
            addVehicle(laneId,
                types[Math.floor(Math.random() * types.length)],
                directions[Math.floor(Math.random() * directions.length)]
            );
        }
    }

    // 1. Signal Timer Logic
    state.signalTimer += dt;
    if (state.signalTimer >= CONFIG.SIGNAL_DURATION && !state.waitingForDecision) {
        makeDecision();
    }

    // 2. Queue Mechanics - Move vehicles when Green
    if (state.currentGreenLane !== -1 && state.vehiclesToPass > 0) {
        const lane = state.lanes[state.currentGreenLane];
        const nextVehicle = lane.vehicles[0];

        if (nextVehicle && nextVehicle.state === 'queued') {
            nextVehicle.state = 'exiting';
            nextVehicle.startX = nextVehicle.x;
            nextVehicle.startY = nextVehicle.y;
            nextVehicle.moveStartTime = currentTime;

            // Set targets based on direction
            // Visual coordinate system: queued vehicle moves from Right(pos) to Left(0) then Left(neg)
            // Intersection is roughly at x=0 to x=-200
            if (nextVehicle.direction === 'STRAIGHT') {
                nextVehicle.targetX = -300; // Straight through
                nextVehicle.targetY = 0;
            } else if (nextVehicle.direction === 'LEFT') {
                nextVehicle.targetX = -150;
                nextVehicle.targetY = 150; // Curve down/left
            } else if (nextVehicle.direction === 'RIGHT') {
                nextVehicle.targetX = -150;
                nextVehicle.targetY = -150; // Curve up/right
            }

            state.vehiclesToPass--;
            state.stats.served++;

            // Shift others
            for (let i = 1; i < lane.vehicles.length; i++) {
                const v = lane.vehicles[i];
                if (v.state === 'queued') {
                    v.state = 'shifting';
                    v.startX = v.x;
                    v.targetX = (i - 1) * (CONFIG.VEHICLE_WIDTH + CONFIG.VEHICLE_GAP);
                    v.moveStartTime = currentTime;
                }
            }
        }
    }

    // 3. Physics & Interpolation
    state.lanes.forEach(lane => {
        for (let i = lane.vehicles.length - 1; i >= 0; i--) {
            const v = lane.vehicles[i];

            if (v.state === 'queued') {
                const properX = i * (CONFIG.VEHICLE_WIDTH + CONFIG.VEHICLE_GAP);
                if (v.targetX !== properX) v.targetX = properX;

                // Simple entry interpolation
                if (Math.abs(v.x - v.targetX) > 1) {
                    const approachSpeed = 0.5 * dt;
                    if (v.x > v.targetX) v.x -= approachSpeed;
                    if (v.x < v.targetX) v.x = v.targetX;
                }
            }
            else if (v.state === 'exiting' || v.state === 'shifting') {
                const elapsed = currentTime - v.moveStartTime;
                const duration = v.state === 'exiting' ? CONFIG.VEHICLE_MOVE_DURATION : 800; // Faster shifts
                const progress = Math.min(elapsed / duration, 1.0);

                const ease = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                const p = ease(progress);

                if (v.state === 'exiting') {
                    // Turn Logic (Bezier-like interpolation)
                    // For straight, just linear X
                    if (v.direction === 'STRAIGHT') {
                        v.x = v.startX + (v.targetX - v.startX) * p;
                    } else {
                        // Curve logic
                        // Simple Quadratic Bezier: P0(start), P1(corner), P2(end)
                        // Start: (startX, 0)
                        // End: (targetX, targetY)
                        // Control Point: (0, 0) -> The intersection center

                        // We interpolate t from 0 to 1
                        // B(t) = (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2
                        // Actually, startX is > 0 (queue head at 0). exit is negative.
                        // Let's assume start is x=0 (stop line)
                        // Wait, simulation uses positive X for queue distance. Stop line is X=0.
                        // Motion starts from X=0.

                        // But physically, `v.x` was `v.startX` (which was 0 or near 0)
                        // Let's refine P0. P0 = (v.startX, 0)
                        const cx = -50; // Control point slighly into intersection
                        const cy = v.direction === 'LEFT' ? 50 : -50;

                        // X Calc
                        v.x = Math.pow(1 - p, 2) * v.startX + 2 * (1 - p) * p * cx + Math.pow(p, 2) * v.targetX;
                        // Y Calc
                        v.y = Math.pow(1 - p, 2) * v.startY + 2 * (1 - p) * p * cy + Math.pow(p, 2) * v.targetY;
                    }
                } else {
                    // Shifting is just linear X
                    v.x = v.startX + (v.targetX - v.startX) * p;
                }

                if (progress >= 1.0) {
                    if (v.state === 'exiting') {
                        lane.vehicles.splice(i, 1);
                    } else if (v.state === 'shifting') {
                        v.state = 'queued';
                    }
                }
            }
        }
    });
}

async function makeDecision() {
    state.waitingForDecision = true;
    console.log('[FRONTEND] Backend decision requested');

    // Use currently queued vehicles for decision
    const payload = {
        current_time: Math.floor(Date.now() / 1000),
        simulation_mode: state.simulationMode, // Pass mode to backend
        ...state.scenario,
        lanes: state.lanes.map(l => ({
            id: l.id,
            vehicles: l.vehicles
                .filter(v => v.state === 'queued' || v.state === 'shifting')
                .map(v => ({ type: v.type, arrival_time: Math.floor(v.arrivalTime / 1000) }))
        }))
    };

    try {
        const response = await fetch('/api/decide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const decision = await response.json();

            console.log(`[FRONTEND] Decision received: Green Lane ${decision.selected_lane}`);

            if (decision.selected_lane !== state.currentGreenLane) {
                state.stats.switches++;
                console.log(`[FRONTEND] Signal cycle start: Green switched to Lane ${decision.selected_lane}`);
            } else {
                console.log(`[FRONTEND] Signal cycle start: Green continues on Lane ${decision.selected_lane}`);
            }

            state.currentGreenLane = decision.selected_lane;
            state.vehiclesToPass = decision.num_vehicles_to_pass;

            if (decision.priority_heap) {
                console.log('[FRONTEND] Priority queue data received');
                updatePriorityViz(decision.priority_heap);
            }
        }
    } catch (e) {
        console.error("[FRONTEND] Backend decision failed", e);
    } finally {
        state.waitingForDecision = false;
        state.signalTimer = 0;
        console.log('[FRONTEND] Signal cycle end (timer reset)');
    }
}

// ==================== RENDERING ====================
function render() {
    document.getElementById('vehicles-served').textContent = state.stats.served;
    document.getElementById('signal-switches').textContent = state.stats.switches;

    state.lanes.forEach(lane => {
        const laneEl = document.getElementById(`lane-${lane.id}`);
        // We need a specific visual container that allows XY translation
        // Assuming .lane-queue structure from previous HTML
        const queueEl = laneEl.querySelector('.lane-queue');

        // Ensure styling supports 2D movement visually if needed
        // Or we just translate X (distance from intersection) and Y (lateral offset)
        // Since lanes are horizontal bars in UI, Y offset might look weird unless we rotate?
        // Requirement says "Simple curves ... No physics required."
        // We will just translate the div.

        const header = laneEl.querySelector('.lane-header');
        if (state.currentGreenLane === lane.id) {
            header.classList.add('active');
            header.style.backgroundColor = '#28a745';
        } else {
            header.classList.remove('active');
            header.style.backgroundColor = '#333';
        }

        const domMap = new Map();
        queueEl.querySelectorAll('.vehicle').forEach(el => domMap.set(el.dataset.id, el));

        lane.vehicles.forEach(v => {
            let el = domMap.get(v.id);
            if (!el) {
                el = document.createElement('div');
                el.className = `vehicle ${v.type}`;
                el.dataset.id = v.id;
                el.dataset.type = v.type;
                el.textContent = v.id;
                el.style.position = 'absolute';
                // Add direction indicator
                const dirArrow = document.createElement('span');
                dirArrow.className = 'dir-arrow';
                dirArrow.textContent = v.direction === 'LEFT' ? '↰' : v.direction === 'RIGHT' ? '↱' : '↑';
                dirArrow.style.fontSize = '8px';
                dirArrow.style.color = 'black';
                dirArrow.style.marginLeft = '2px';
                el.appendChild(dirArrow);

                queueEl.appendChild(el);
            }

            // Visual Positioning
            // X is "distance from stop line". Visual Queue flows Right->Left.
            // Queue head is near left edge.
            // Let's assume queueEl is the "road".
            // Stop line is at left: 20px.
            // v.x is distance from stopline.
            // So left = 20 + v.x.

            // For turns (Y offset), we simply translate Y.
            // Note: This relies on overflow: visible to see turns "outside" the lane?
            // Or just implied within lane width.

            // Actually, "Left/Right" turns cross lanes.
            // For simple visualization without full map:
            // Just animate them moving and rotating slightly.

            el.style.left = `${20 + v.x}px`;
            el.style.top = `${10 + (v.y || 0)}px`; // Center is roughly 10px top padding + y

            if (v.state === 'exiting') {
                el.style.opacity = Math.max(0.2, 1 - (Math.abs(v.x) / 200));
                // Rotate based on direction
                let rot = 0;
                if (v.direction === 'LEFT') rot = -45 * (Math.abs(v.x) / 100);
                if (v.direction === 'RIGHT') rot = 45 * (Math.abs(v.x) / 100);
                el.style.transform = `rotate(${rot}deg)`;
            } else {
                el.style.opacity = 1;
                el.style.transform = 'none';
            }

            domMap.delete(v.id);
        });

        domMap.forEach(el => el.remove());
        queueEl.style.position = 'relative';
        queueEl.style.overflow = 'visible'; // Allow turns to be seen
    });
}

function updatePriorityViz(heap) {
    const tbody = document.querySelector('#priority-queue-table tbody');
    tbody.innerHTML = '';

    if (!heap || !Array.isArray(heap)) return;

    heap.forEach((node, idx) => {
        const row = document.createElement('tr');
        if (node.lane_id === state.currentGreenLane) {
            row.classList.add('selected-row');
        }

        const lane = state.lanes[node.lane_id];
        const queuedVehicles = lane ? lane.vehicles.filter(v => v.state === 'queued' || v.state === 'shifting') : [];
        const topV = queuedVehicles[0];

        let topText = '-';
        if (topV) {
            topText = `${topV.id} (${topV.type}) [${topV.direction[0]}]`;
        }

        row.innerHTML = `
            <td>${idx + 1}</td>
            <td>Lane ${node.lane_id}</td>
            <td>${node.priority}</td>
            <td>${queuedVehicles.length}</td>
            <td>${topText}</td>
        `;
        tbody.appendChild(row);
    });
}
