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

app.get('/api/state', (req, res) => {
    if (!latestState) {
        return res.status(404).json({
            error: 'No simulation data available',
            message: 'Start a simulation first using POST /api/start'
        });
    }

    res.json({
        running: simulationRunning,
        state: latestState
    });
});

app.use(express.static(path.join(__dirname, '../public')));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
