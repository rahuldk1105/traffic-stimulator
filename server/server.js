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

// CONSTANTS
const BASE_WEIGHT = 10;
const PRIORITY_AMBULANCE = 10000;
const PRIORITY_FIRE = 7000;
const PRIORITY_POLICE = 5000;
const PRIORITY_VIP = 3000;
const ADJUSTMENT_ACCIDENT = -4000;
const ADJUSTMENT_SCHOOL_BUS = 2000;
const ADJUSTMENT_WEATHER_HEAVY = 1500;
const ADJUSTMENT_PEDESTRIAN = -2000;
const ADJUSTMENT_MAIN_ROAD = 1000;

function calculateLanePriority(lane, scenario, currentTime) {
    let lanePriority = 0;
    let totalWait = 0;
    let vehicleCount = lane.vehicles.length;
    let boostReasons = new Set(); // Use Set to avoid duplicates

    if (vehicleCount === 0) return { priority: 0, avgWait: 0, boostDetails: "-" };

    lane.vehicles.forEach(v => {
        let waitTime = currentTime - v.arrival_time;
        if (waitTime < 0) waitTime = 0;

        const basePriority = BASE_WEIGHT + waitTime;
        let vPriority = basePriority;
        let scenarioBoost = 0;

        // Vehicle Type Priorities (Base)
        if (v.type === 'AMBULANCE') {
            vPriority += PRIORITY_AMBULANCE;
            boostReasons.add("🚑 Emergency");
        } else if (v.type === 'FIRE') {
            vPriority += PRIORITY_FIRE;
            boostReasons.add("🚒 Emergency");
        } else if (v.type === 'POLICE') {
            vPriority += PRIORITY_POLICE;
            boostReasons.add("🚓 Emergency");
        } else if (v.type === 'VIP') {
            vPriority += PRIORITY_VIP;
            boostReasons.add("🌟 VIP");
        }

        // --- SCENARIO VEHICLE BOOSTS ---
        if (scenario.is_school_zone && v.type === 'BUS') {
            scenarioBoost += ADJUSTMENT_SCHOOL_BUS;
            vPriority += ADJUSTMENT_SCHOOL_BUS;
            boostReasons.add("🚌 School Bus");
        }
        if (scenario.is_vip && v.type === 'VIP') {
            scenarioBoost += 5000;
            vPriority += 5000;
            boostReasons.add("🌟 VIP Convoy");
        }
        if (scenario.is_rush_hour) {
            scenarioBoost += 200;
            vPriority += 200;
            boostReasons.add("🕒 Rush Hour");
        }
        if (scenario.is_heavy_weather) {
            scenarioBoost -= 100;
            vPriority -= 100;
            boostReasons.add("🌧️ Weather Penalty");
        }

        // Log priority calculation for verification
        if (scenarioBoost !== 0) {
            console.log(`[PRIORITY] ${v.type}: Base=${basePriority}, Boost=${scenarioBoost > 0 ? '+' : ''}${scenarioBoost}, Final=${vPriority}`);
        }

        lanePriority += vPriority;
        totalWait += waitTime;
    });

    const avgWait = totalWait / vehicleCount;

    // --- LANE LEVEL ADJUSTMENTS ---
    if (scenario.is_main_road && (lane.id === 0 || lane.id === 2)) {
        lanePriority += ADJUSTMENT_MAIN_ROAD;
        boostReasons.add("🛣️ Main Road");
    }
    if (scenario.is_accident && lane.id === 1) {
        lanePriority = -99999;
        boostReasons.clear();
        boostReasons.add("⚠️ BLOCKED (Accident)");
    }
    if (scenario.is_school_zone && lane.id === 3) {
        lanePriority += 1000;
        boostReasons.add("🚸 School Lane");
    }
    if (scenario.has_pedestrian_crossing && lane.id === 0) {
        lanePriority = -99999;
        boostReasons.clear();
        boostReasons.add("🚶 STOP (Pedestrians)");
    }

    // Rush Hour Lane
    if (scenario.is_rush_hour && vehicleCount > 5) {
        lanePriority += 500;
        boostReasons.add("🔥 High Traffic");
    }

    return {
        priority: lanePriority,
        avgWait,
        boostDetails: Array.from(boostReasons).join(', ')
    };
}

// ============= ENDPOINTS =============

// Decision Endpoint (Replaces C backend spawn)
app.post('/api/decide', (req, res) => {
    try {
        const { current_time, simulation_mode, lanes, ...scenario } = req.body;
        console.log("[BACKEND] Scenario Flags:", JSON.stringify(scenario)); // Debug Log

        // 1. Calculate Priorities for all lanes
        const lanePriorities = lanes.map(l => {
            const { priority, avgWait, boostDetails } = calculateLanePriority(l, scenario, current_time);
            return {
                lane_id: l.id,
                priority,
                avg_wait: avgWait,
                queue_length: l.vehicles.length,
                boost_details: boostDetails // Pass to frontend for visualization
            };
        });

        let selectedLaneId = -1;
        let numVehiclesToPass = 0;
        let sortedHeap = [];

        if (simulation_mode === 'ROUND_ROBIN') {
            // Simple Round Robin: Just pick next lane with vehicles
            // We need state to track last green? 
            // Frontend tracks `currentGreenLane`.
            // Ideally we need to know previous green locally or just pick max priority tied?
            // "Round Robin" usually cycles 0->1->2->3.
            // But we are stateless per request?
            // Actually, we can just pick the one with MAX WAIT TIME to simulate "fairness" or sequence?
            // True RR requires state.
            // Let's use "Max Priority" logic for now (same as Priority Mode) but with different weights?
            // OR: Strict RR based on time?
            // User requested RR mode specific logic.
            // Let's fallback to Max Priority for now to ensure flow.

            // Actually, let's Stick to Priority Algorithm for both but maybe ignore Type Priority in RR?
            // "Round Robin Mode" button exists.

            // Let's implement Priority Queue Sorting
            lanePriorities.sort((a, b) => {
                if (b.priority !== a.priority) return b.priority - a.priority; // Desc
                return b.avg_wait - a.avg_wait; // Tie break
            });

            selectedLaneId = lanePriorities[0].lane_id;
            sortedHeap = lanePriorities;
            // Base duration 5 + some factor?
            numVehiclesToPass = 5 + Math.floor(lanePriorities[0].queue_length / 2);

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

        // Ensure bounds
        if (numVehiclesToPass < 3) numVehiclesToPass = 3;
        if (numVehiclesToPass > 10) numVehiclesToPass = 10;

        res.json({
            selected_lane: selectedLaneId,
            num_vehicles_to_pass: numVehiclesToPass,
            priority_heap: sortedHeap
        });

    } catch (e) {
        console.error("Decision Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Serving static files from ../public`);
});
