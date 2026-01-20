const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

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

    const simulatorPath = path.join(__dirname, '../backend/traffic_sim');
    currentSimulation = spawn(simulatorPath, args);

    let outputBuffer = '';
    const stateHistory = [];

    currentSimulation.stdout.on('data', (data) => {
        outputBuffer += data.toString();

        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop();

        lines.forEach(line => {
            if (line.trim()) {
                try {
                    const jsonState = JSON.parse(line);
                    stateHistory.push(jsonState);
                    latestState = jsonState;
                } catch (err) {
                    console.error('JSON parse error:', err.message);
                }
            }
        });
    });

    currentSimulation.stderr.on('data', (data) => {
        console.error(`Simulator error: ${data}`);
    });

    currentSimulation.on('close', (code) => {
        simulationRunning = false;
        currentSimulation = null;

        if (code !== 0) {
            console.error(`Simulator exited with code ${code}`);
        }
    });

    currentSimulation.on('error', (err) => {
        simulationRunning = false;
        currentSimulation = null;
        console.error('Failed to start simulator:', err.message);
    });

    res.json({
        success: true,
        message: 'Simulation started',
        config: {
            emergency,
            accident,
            school_zone,
            rush_hour,
            tie_case,
            main_road,
            heavy_weather,
            pedestrian_crossing,
            algorithm,
            steps
        }
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

app.get('/api/status', (req, res) => {
    res.json({
        running: simulationRunning,
        hasData: latestState !== null
    });
});

app.post('/api/stop', (req, res) => {
    if (!simulationRunning || !currentSimulation) {
        return res.status(400).json({
            error: 'No simulation running',
            message: 'There is no active simulation to stop'
        });
    }

    currentSimulation.kill('SIGTERM');
    simulationRunning = false;
    currentSimulation = null;

    res.json({
        success: true,
        message: 'Simulation stopped'
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

app.listen(PORT, () => {
    console.log(`Traffic Simulator Server running on http://localhost:${PORT}`);
    console.log(`Frontend: http://localhost:${PORT}/`);
    console.log(`API endpoints:`);
    console.log(`  POST /api/start - Start simulation with scenario flags`);
    console.log(`  GET  /api/state - Get latest simulation state`);
    console.log(`  GET  /api/status - Get server status`);
    console.log(`  POST /api/stop - Stop running simulation`);
});

module.exports = app;
