const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let currentSimulation = null;
let latestState = null;
let simulationRunning = false;

app.post('/api/start', (req, res) => {
    if (simulationRunning) {
        return res.status(409).json({
            error: 'Simulation already running',
            message: 'Please wait for the current simulation to complete'
        });
    }

    const {
        emergency = false,
        accident = false,
        school_zone = false,
        rush_hour = false,
        tie_case = false,
        main_road = false,
        heavy_weather = false,
        pedestrian_crossing = false,
        algorithm = 'priority',
        steps = 10
    } = req.body;

    const args = [];

    if (emergency) args.push('--emergency');
    if (accident) args.push('--accident');
    if (school_zone) args.push('--school_zone');
    if (rush_hour) args.push('--rush_hour');
    if (tie_case) args.push('--tie_case');
    if (main_road) args.push('--main_road');
    if (heavy_weather) args.push('--heavy_weather');
    if (pedestrian_crossing) args.push('--pedestrian_crossing');

    args.push(`--algorithm=${algorithm}`);
    args.push(`--steps=${steps}`);

    latestState = null;
    simulationRunning = true;

    // Use absolute path relative to this file
    const simulatorPath = path.join(__dirname, '../backend/traffic_sim');

    try {
        currentSimulation = spawn(simulatorPath, args);
    } catch (err) {
        simulationRunning = false;
        return res.status(500).json({ error: 'Failed to spawn simulator', details: err.message });
    }

    let outputBuffer = '';

    currentSimulation.stdout.on('data', (data) => {
        outputBuffer += data.toString();

        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop(); // Keep partial line

        lines.forEach(line => {
            if (line.trim()) {
                try {
                    const jsonState = JSON.parse(line);
                    latestState = jsonState;
                } catch (err) {
                    // Ignore parsing errors usually caused by partial or non-json output
                }
            }
        });
    });

    currentSimulation.stderr.on('data', (data) => {
        console.error(`Simulator stderr: ${data}`);
    });

    currentSimulation.on('close', (code) => {
        simulationRunning = false;
        currentSimulation = null;
    });

    currentSimulation.on('error', (err) => {
        simulationRunning = false;
        currentSimulation = null;
        console.error('Simulator process error:', err);
    });

    res.json({
        success: true,
        message: 'Simulation started'
    });
});
console.log('Route registered: /api/start');

app.get('/api/state', (req, res) => {
    if (!latestState) {
        return res.json({
            running: simulationRunning,
            state: null,
            message: "Simulation running, no data yet"
        });
    }

    res.json({
        running: simulationRunning,
        state: latestState
    });
});
console.log('Route registered: /api/state');

// This decision route spawns the stateless backend for a single decision
app.post('/api/decide', (req, res) => {
    console.log('[BACKEND] /api/decide called');
    const simulatorPath = path.join(__dirname, '../backend/traffic_sim');
    const inputData = JSON.stringify(req.body);

    let decisionProcess;
    try {
        // Spawn without arguments, since it reads from STDIN
        console.log('[BACKEND] Spawning C decision engine...');
        decisionProcess = spawn(simulatorPath, []);
    } catch (err) {
        console.error('[BACKEND] Failed to spawn decision process:', err);
        return res.status(500).json({ error: 'Failed to spawn decision engine', details: err.message });
    }

    let outputData = '';
    let errorData = '';

    // Send data to C program via stdin
    decisionProcess.stdin.write(inputData);
    decisionProcess.stdin.end();

    decisionProcess.stdout.on('data', (chunk) => {
        outputData += chunk.toString();
    });

    decisionProcess.stderr.on('data', (chunk) => {
        errorData += chunk.toString();
        // Assume C engine logs to stderr as requested, pass through to console
        process.stderr.write(`[C-ENGINE RAW] ${chunk.toString()}`);
    });

    decisionProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`[BACKEND] Decision process exited with code ${code}. Stderr: ${errorData}`);
            return res.status(500).json({ error: 'Decision engine failed', details: errorData });
        }

        try {
            // Check if output is empty
            if (!outputData.trim()) {
                console.error('[BACKEND] No output from decision engine');
                return res.status(500).json({ error: 'No output from decision engine' });
            }

            const result = JSON.parse(outputData);
            console.log(`[BACKEND] Decision sent: green_lane=${result.selected_lane}, vehicles_to_pass=${result.num_vehicles_to_pass}`);
            res.json(result);
        } catch (e) {
            console.error('[BACKEND] Failed to parse decision output:', e, 'Raw output:', outputData);
            res.status(500).json({ error: 'Invalid JSON from decision engine', raw: outputData });
        }
    });

    decisionProcess.on('error', (err) => {
        console.error('[BACKEND] Decision process error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Process execution error', details: err.message });
        }
    });
});
console.log('Route registered: /api/decide');

app.use(express.static(path.join(__dirname, '../public')));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
