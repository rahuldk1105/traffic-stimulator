const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static files from 'public' directory (parent sibling)
app.use(express.static(path.join(__dirname, '../public')));

// Simulation State (In-Memory)
let currentState = {
    simulationMode: 'PRIORITY',
    lanes: [],
    scenario: {}
};

// ============= TRAFFIC LOGIC (ALGORITHMS) =============
/*
    Ported from backend/traffic_sim.c
*/

// CONSTANTS (Logarithmic/Expanded Scale)
const BASE_WEIGHT = 0; // Type now defines the base
const PRIORITY_AMBULANCE = 300;
const PRIORITY_FIRE = 280;
const PRIORITY_POLICE = 260;
const PRIORITY_VIP = 240;
const PRIORITY_TRUCK = 80;
const PRIORITY_BUS = 70;
const PRIORITY_CAR = 20;
const PRIORITY_MOTORCYCLE = 10;

const ADJUSTMENT_ACCIDENT = -10; // Complete block
const ADJUSTMENT_SCHOOL_BUS = 2;
const ADJUSTMENT_WEATHER_HEAVY = 1;
const ADJUSTMENT_PEDESTRIAN = -10;
const ADJUSTMENT_MAIN_ROAD = 1;

function calculateLanePriority(lane, scenario, currentTime) {
    let lanePriority = 0;
    let totalWait = 0;
    let vehicleCount = lane.vehicles.length;
    let boostReasons = new Set(); // Use Set to avoid duplicates

    if (vehicleCount === 0) return { priority: 0, avgWait: 0, boostDetails: "-" };

    lane.vehicles.forEach(v => {
        let waitTime = currentTime - v.arrival_time;
        if (waitTime < 0) waitTime = 0;

        // Base Priority by Type (1-9)
        let typeBase = v.base_priority;

        if (typeBase === undefined) {
            typeBase = PRIORITY_CAR;
            if (v.type === 'AMBULANCE') typeBase = PRIORITY_AMBULANCE;
            else if (v.type === 'FIRE') typeBase = PRIORITY_FIRE;
            else if (v.type === 'POLICE') typeBase = PRIORITY_POLICE;
            else if (v.type === 'VIP') typeBase = PRIORITY_VIP;
            else if (v.type === 'TRUCK') typeBase = PRIORITY_TRUCK;
            else if (v.type === 'BUS') typeBase = PRIORITY_BUS;
            else if (v.type === 'MOTORCYCLE') typeBase = PRIORITY_MOTORCYCLE;
        }

        // Waiting Time Bonus (1.0 per second - stronger influence)
        const waitBonus = waitTime * 1.0;

        let vPriority = typeBase + waitBonus;
        let scenarioBoost = 0;

        // Add to boostReasons if it's a priority vehicle
        if (v.type === 'AMBULANCE' || v.type === 'FIRE' || v.type === 'POLICE') {
            boostReasons.add("🚑 Emergency");
        } else if (v.type === 'VIP') {
            boostReasons.add("🌟 VIP");
        }

        // --- SCENARIO VEHICLE BOOSTS ---
        if (scenario.is_school_zone && v.type === 'BUS') {
            // Priority boost in school zones (+50)
            // Bus (70) -> 120 (High Priority)
            scenarioBoost += 50;
            vPriority += 50;
            boostReasons.add("🚌 School Bus Priority");
        }
        if (scenario.is_vip && v.type === 'VIP') {
            scenarioBoost += 100; // VIP (240) -> 340 (Absolute Highest)
            vPriority += 100;
            boostReasons.add("🌟 VIP Convoy");
        }
        if (scenario.is_rush_hour) {
            scenarioBoost += 2;
            vPriority += 2;
            boostReasons.add("🕒 Rush Hour");
        }
        if (scenario.is_heavy_weather) {
            scenarioBoost -= 5;
            vPriority -= 5;
            boostReasons.add("🌧️ Weather Penalty");
        }

        // Log priority calculation
        const logLine = `[${v.id || '?'}] ${v.type} | Base: ${typeBase} + Wait: ${waitBonus.toFixed(1)} + Boost: ${scenarioBoost} = Final: ${vPriority.toFixed(1)}`;

        // Console output (Server Side)
        console.log(`[PRIORITY] ${logLine}`);

        laneLogs.push(logLine);

        lanePriority += vPriority;
        totalWait += waitTime;
    });

    const avgWait = vehicleCount > 0 ? totalWait / vehicleCount : 0;
    const maxWait = vehicleCount > 0 ? Math.max(...lane.vehicles.map(v => Math.max(0, currentTime - v.arrival_time))) : 0;

    // --- LANE LEVEL ADJUSTMENTS ---
    // Scaled for 10-300 System
    if (scenario.is_main_road && (lane.id === 0 || lane.id === 2)) {
        lanePriority += 30; // Moderate bias
        boostReasons.add("🛣️ Main Road");
    }
    if (scenario.is_accident && lane.id === 1) {
        lanePriority = -1000; // Impossible to select
        boostReasons.clear();
        boostReasons.add("⛔ BLOCKED");
    }
    if (scenario.is_school_zone && lane.id === 3) {
        lanePriority += 40; // Significant lane boost
        boostReasons.add("🚸 School Lane");
    }
    if (scenario.has_pedestrian_crossing && lane.id === 0) {
        lanePriority = -100;
        boostReasons.clear();
        boostReasons.add("🚶 WAIT (Pedestrians)");
    }

    // Rush Hour Lane
    if (scenario.is_rush_hour && vehicleCount > 5) {
        lanePriority += 20;
        boostReasons.add("🔥 High Traffic");
    }

    return {
        priority: lanePriority,
        avgWait,
        maxWait,
        boostDetails: Array.from(boostReasons).join(', '),
        queue_length: vehicleCount,
        lane_id: lane.id,
        logs: laneLogs // Return logs
    };
}

// ============= ENDPOINTS =============

// Decision Endpoint (Replaces C backend spawn)
app.post('/api/decide', (req, res) => {
    try {
        const { lanes, simulation_mode, current_time, ...scenario } = req.body;
        console.log("[BACKEND] Scenario Flags:", JSON.stringify(scenario)); // Debug Log

        // Update State
        currentState = { lanes, simulationMode: simulation_mode, scenario };
        const currentTime = current_time || Date.now() / 1000;

        let lanePriorities = [];
        let allLogs = []; // Collect all logs

        currentState.lanes.forEach(lane => {
            const result = calculateLanePriority(lane, currentState.scenario, currentTime);
            lanePriorities.push(result);
            if (result.logs && result.logs.length > 0) {
                allLogs.push(...result.logs);
            }
        });

        let selectedLaneId = -1;
        let numVehiclesToPass = 0;
        let sortedHeap = [];

        if (simulation_mode === 'ROUND_ROBIN') {
            // STRICT ROUND ROBIN: Cycle 0 -> 1 -> 2 -> 3
            // Find next lane with vehicles starting from current state's last green

            // We need to persist state between requests for RR to work cyclically
            if (!global.lastRRLane) global.lastRRLane = -1;

            // Round Robin Logic
            // Cycle 0 -> 1 -> 2 -> 3
            let startLane = (global.lastRRLane + 1) % 4;
            let nextLane = -1;

            // Find next non-empty lane starting from startLane
            for (let i = 0; i < 4; i++) {
                let check = (startLane + i) % 4;
                const laneData = lanes.find(l => l.id === check);
                if (laneData && laneData.vehicles && laneData.vehicles.length > 0) {
                    nextLane = check;
                    break;
                }
            }

            if (nextLane !== -1) {
                selectedLaneId = nextLane;
                global.lastRRLane = nextLane;
            } else {
                // No vehicles, stay? or reset?
                selectedLaneId = (global.lastRRLane + 1) % 4; // Default next even if empty
            }

            // For visualization, just return unsorted or ID-sorted list
            // "No priority comparison used"
            sortedHeap = lanePriorities.sort((a, b) => a.lane_id - b.lane_id);

            numVehiclesToPass = 5; // Fixed burst for RR

        } else {
            // PRIORITY MODE
            // Sort by Priority
            lanePriorities.sort((a, b) => {
                if (b.priority !== a.priority) return b.priority - a.priority; // Desc
                return b.avg_wait - a.avg_wait; // Tie break
            });

            selectedLaneId = lanePriorities[0].lane_id;
            sortedHeap = lanePriorities;

            // Determine green duration allocation (num vehicles)
            // If priority is high (Emergency), pass ALL?
            // If Ambulance/Fire/Police in list?
            const topLane = lanes.find(l => l.id === selectedLaneId);
            const hasEmergency = topLane.vehicles.some(v => ['AMBULANCE', 'FIRE', 'POLICE'].includes(v.type));

            if (hasEmergency) {
                numVehiclesToPass = topLane.vehicles.length; // Flush all
            } else {
                numVehiclesToPass = 5 + Math.floor(lanePriorities[0].queue_length / 3);
            }
        }

        // Standard Bounds
        if (numVehiclesToPass < 3) numVehiclesToPass = 3;
        if (numVehiclesToPass > 10) numVehiclesToPass = 10;

        // WEATHER IMPACT: Reduce flow
        if (scenario.is_heavy_weather) {
            numVehiclesToPass = Math.floor(numVehiclesToPass / 2);
            if (numVehiclesToPass < 2) numVehiclesToPass = 2; // Min flow in bad weather
            console.log(`[BACKEND] Weather Flow Reduction: Allowing ${numVehiclesToPass} vehicles.`);
        }

        res.json({
            selected_lane: selectedLaneId,
            num_vehicles_to_pass: numVehiclesToPass,
            priority_heap: sortedHeap,
            debug_logs: allLogs // Send logs to frontend
        });

    } catch (err) {
        console.error("Decision Error:", err);
        res.status(500).send("Simulation Error");
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Serving static files from ../public`);
});
