// State storage
let lastState = null;
let isAnimating = false;
let pendingState = null;

let currentMode = 'priority';
let scenarioFlags = {
    emergency: false,
    accident: false,
    school_zone: false,
    rush_hour: false,
    tie_case: false
};

let rrStats = { avgWaitTime: 0, served: 0, switches: 0 };
let pqStats = { avgWaitTime: 0, served: 0, switches: 0 };
let pollingInterval = null;
let isSimulationRunning = false;

const btnEmergency = document.getElementById('btn-emergency');
const btnAccident = document.getElementById('btn-accident');
const btnSchoolZone = document.getElementById('btn-school-zone');
const btnRushHour = document.getElementById('btn-rush-hour');
const btnTieCase = document.getElementById('btn-tie-case');
const btnMode = document.getElementById('btn-mode');
const btnStart = document.getElementById('btn-start');

btnEmergency.addEventListener('click', () => toggleScenario('emergency', btnEmergency));
btnAccident.addEventListener('click', () => toggleScenario('accident', btnAccident));
btnSchoolZone.addEventListener('click', () => toggleScenario('school_zone', btnSchoolZone));
btnRushHour.addEventListener('click', () => toggleScenario('rush_hour', btnRushHour));
btnTieCase.addEventListener('click', () => toggleScenario('tie_case', btnTieCase));
btnMode.addEventListener('click', toggleMode);
btnStart.addEventListener('click', startSimulation);

function toggleScenario(scenario, button) {
    scenarioFlags[scenario] = !scenarioFlags[scenario];
    button.classList.toggle('active');
}

function toggleMode() {
    currentMode = currentMode === 'priority' ? 'round_robin' : 'priority';
    btnMode.textContent = `MODE: ${currentMode.toUpperCase().replace('_', ' ')}`;
}

async function startSimulation() {
    try {
        const response = await fetch('/api/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                emergency: scenarioFlags.emergency,
                accident: scenarioFlags.accident,
                school_zone: scenarioFlags.school_zone,
                rush_hour: scenarioFlags.rush_hour,
                tie_case: scenarioFlags.tie_case,
                algorithm: currentMode,
                steps: 10
            })
        });

        const result = await response.json();

        if (response.ok) {
            isSimulationRunning = true;
            // Reset client-side state on new simulation start
            lastState = null;
            selectedLaneId = -1;

            if (!pollingInterval) {
                pollingInterval = setInterval(fetchSimulationState, 500);
            }
        } else {
            console.error('Failed to start simulation:', result.error);
        }
    } catch (error) {
        console.error('Error starting simulation:', error);
    }
}

async function fetchSimulationState() {
    try {
        const response = await fetch('/api/state');

        if (!response.ok) {
            return;
        }

        const result = await response.json();

        // Check if simulation stopped
        if (!result.running) {
            isSimulationRunning = false;
        }

        // Only update if we have a valid state and it's new
        if (result.state) {
            if (!lastState || result.state.current_time !== lastState.current_time) {
                handleStateUpdate(result.state);
            }
        }
    } catch (error) {
        console.error('Error fetching simulation state:', error);
    }
}

function handleStateUpdate(newState) {
    if (isAnimating) {
        pendingState = newState;
        return;
    }

    // Initial render
    if (!lastState) {
        fullRender(newState);
        lastState = newState;
        return;
    }

    // Determine if we need animation
    // Animation needed if vehicles moved in the selected lane
    const laneId = newState.selected_lane;
    const vehiclesMoved = newState.vehicles_moved_this_cycle;

    if (vehiclesMoved > 0) {
        isAnimating = true;
        animateLane(laneId, vehiclesMoved, newState);
    } else {
        fullRender(newState);
        lastState = newState;
    }
}

function animateLane(laneId, movedCount, newState) {
    const laneEl = document.getElementById(`lane-${laneId}`);
    if (!laneEl) {
        isAnimating = false;
        fullRender(newState);
        lastState = newState;
        return;
    }

    const queueEl = laneEl.querySelector('.lane-queue');
    const vehicles = Array.from(queueEl.children);

    // Apply animation classes
    vehicles.forEach((v, idx) => {
        if (idx < movedCount) {
            v.classList.add('moving-out');
        } else {
            v.classList.add('shifting');
        }
    });

    // Wait for transition to complete (700ms match with CSS)
    setTimeout(() => {
        fullRender(newState);
        lastState = newState;
        isAnimating = false;

        // Process pending state if any
        if (pendingState) {
            const next = pendingState;
            pendingState = null;
            // Prevent recursion stack overflow if rapid updates (using setTimeout 0)
            setTimeout(() => handleStateUpdate(next), 0);
        }
    }, 700);
}

function fullRender(data) {
    document.getElementById('current-time').textContent = data.current_time;
    document.getElementById('vehicles-served').textContent = data.performance_metrics.total_vehicles_served;
    document.getElementById('avg-wait-time').textContent = data.performance_metrics.average_waiting_time.toFixed(1);
    document.getElementById('signal-switches').textContent = data.performance_metrics.signal_switch_count;

    for (let i = 0; i < 4; i++) {
        const lane = data.lanes[i];
        const laneElement = document.getElementById(`lane-${i}`);
        const header = laneElement.querySelector('.lane-header');
        const queueElement = laneElement.querySelector('.lane-queue');

        header.classList.toggle('active', i === data.selected_lane);
        header.querySelector('.lane-priority').textContent = lane.priority;
        header.querySelector('.lane-queue-length').textContent = lane.queue_length;

        queueElement.innerHTML = '';
        lane.vehicles.forEach((vehicle) => {
            const vehicleElement = document.createElement('div');
            vehicleElement.className = `vehicle ${vehicle.type}`;
            vehicleElement.setAttribute('data-type', vehicle.type);
            vehicleElement.textContent = vehicle.vehicle_number;
            queueElement.appendChild(vehicleElement);
        });
    }

    updatePriorityQueueTable(data);

    if (data.scheduling_mode === 'ROUND_ROBIN') {
        rrStats = {
            avgWaitTime: data.performance_metrics.average_waiting_time,
            served: data.performance_metrics.total_vehicles_served,
            switches: data.performance_metrics.signal_switch_count
        };
    } else {
        pqStats = {
            avgWaitTime: data.performance_metrics.average_waiting_time,
            served: data.performance_metrics.total_vehicles_served,
            switches: data.performance_metrics.signal_switch_count
        };
    }

    updateComparisonTable();
}

function updatePriorityQueueTable(data) {
    const tbody = document.querySelector('#priority-queue-table tbody');
    tbody.innerHTML = '';

    const selectedLaneId = data.selected_lane;

    if (data.priority_heap && data.priority_heap.length > 0) {
        data.priority_heap.forEach((node, index) => {
            const lane = data.lanes[node.lane_id];
            const row = document.createElement('tr');

            // Highlight if this is the selected lane
            // Note: In priority scheduling, the selected lane is usually the top of the heap.
            // But we check against data.selected_lane to be sure.
            if (node.lane_id === selectedLaneId) {
                row.classList.add('selected-row');
            }

            const topVehicle = lane.vehicles.length > 0 ?
                `${lane.vehicles[0].vehicle_number} (${lane.vehicles[0].type})` :
                '-';

            row.innerHTML = `
                <td>${index + 1}</td>
                <td>Lane ${node.lane_id}</td>
                <td>${node.priority}</td>
                <td>${lane.queue_length}</td>
                <td>${topVehicle}</td>
            `;
            tbody.appendChild(row);
        });
    } else {
        data.lanes.forEach((lane, index) => {
            const row = document.createElement('tr');

            if (lane.lane_id === selectedLaneId) {
                row.classList.add('selected-row');
            }

            const topVehicle = lane.vehicles.length > 0 ?
                `${lane.vehicles[0].vehicle_number} (${lane.vehicles[0].type})` :
                '-';

            row.innerHTML = `
                <td>${index + 1}</td>
                <td>Lane ${lane.lane_id}</td>
                <td>${lane.priority}</td>
                <td>${lane.queue_length}</td>
                <td>${topVehicle}</td>
            `;
            tbody.appendChild(row);
        });
    }
}

function updateComparisonTable() {
    document.getElementById('rr-wait').textContent = rrStats.avgWaitTime.toFixed(1);
    document.getElementById('rr-served').textContent = rrStats.served;
    document.getElementById('rr-switches').textContent = rrStats.switches;

    document.getElementById('pq-wait').textContent = pqStats.avgWaitTime.toFixed(1);
    document.getElementById('pq-served').textContent = pqStats.served;
    document.getElementById('pq-switches').textContent = pqStats.switches;
}


