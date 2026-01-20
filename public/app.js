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

btnEmergency.addEventListener('click', () => toggleScenario('emergency', btnEmergency));
btnAccident.addEventListener('click', () => toggleScenario('accident', btnAccident));
btnSchoolZone.addEventListener('click', () => toggleScenario('school_zone', btnSchoolZone));
btnRushHour.addEventListener('click', () => toggleScenario('rush_hour', btnRushHour));
btnTieCase.addEventListener('click', () => toggleScenario('tie_case', btnTieCase));
btnMode.addEventListener('click', toggleMode);

function toggleScenario(scenario, button) {
    scenarioFlags[scenario] = !scenarioFlags[scenario];
    button.classList.toggle('active');
    startSimulation();
}

function toggleMode() {
    currentMode = currentMode === 'priority' ? 'round_robin' : 'priority';
    btnMode.textContent = `MODE: ${currentMode.toUpperCase().replace('_', ' ')}`;
    startSimulation();
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

        if (result.state) {
            updateUI(result.state);
        }

        if (!result.running) {
            isSimulationRunning = false;
        }
    } catch (error) {
        console.error('Error fetching simulation state:', error);
    }
}

function updateUI(data) {
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
        lane.vehicles.forEach((vehicle, idx) => {
            const vehicleElement = document.createElement('div');
            vehicleElement.className = `vehicle ${vehicle.type}`;
            vehicleElement.setAttribute('data-type', vehicle.type);
            vehicleElement.textContent = vehicle.vehicle_number;

            if (idx === 0 && i === data.selected_lane && data.vehicles_moved_this_cycle > 0) {
                setTimeout(() => {
                    vehicleElement.classList.add('moving');
                }, 100);
            }

            queueElement.appendChild(vehicleElement);
        });
    }

    updatePriorityQueueTable(data.lanes);

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

function updatePriorityQueueTable(lanes) {
    const tbody = document.querySelector('#priority-queue-table tbody');
    tbody.innerHTML = '';

    lanes.forEach(lane => {
        const row = document.createElement('tr');
        const topVehicle = lane.vehicles.length > 0 ?
            `${lane.vehicles[0].vehicle_number} (${lane.vehicles[0].type})` :
            '-';

        row.innerHTML = `
            <td>Lane ${lane.lane_id}</td>
            <td>${lane.priority}</td>
            <td>${lane.queue_length}</td>
            <td>${topVehicle}</td>
        `;
        tbody.appendChild(row);
    });
}

function updateComparisonTable() {
    document.getElementById('rr-wait').textContent = rrStats.avgWaitTime.toFixed(1);
    document.getElementById('rr-served').textContent = rrStats.served;
    document.getElementById('rr-switches').textContent = rrStats.switches;

    document.getElementById('pq-wait').textContent = pqStats.avgWaitTime.toFixed(1);
    document.getElementById('pq-served').textContent = pqStats.served;
    document.getElementById('pq-switches').textContent = pqStats.switches;
}

startSimulation();
