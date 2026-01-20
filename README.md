# Priority-Based Traffic Simulator

An academic DSA project implementing traffic signal scheduling using Queue (FIFO), Priority Queue (Max Heap), and Hash Table (Double Hashing) data structures.

## Project Structure

```
traffic-stimulator/
├── traffic_simulator.c    # C backend implementation
├── index.html             # Frontend visualization
└── README.md             # This file
```

## Data Structures Implemented

1. **Queue (FIFO)** - Lane vehicle management
2. **Priority Queue (Max Heap)** - Lane scheduling
3. **Hash Table (Double Hashing)** - O(1) vehicle lookup
4. **Round Robin Scheduling** - Equal time slices
5. **Priority Queue Scheduling** - Dynamic priority-based

## Compilation

### Method 1: GCC (Linux/Mac/WSL)
```bash
gcc -o traffic_simulator traffic_simulator.c -lm
```

### Method 2: Clang
```bash
clang -o traffic_simulator traffic_simulator.c -lm
```

### Method 3: Windows (MinGW)
```bash
gcc -o traffic_simulator.exe traffic_simulator.c
```

## Running the Simulation

The C program currently contains all data structures and functions but **no main() function**. You need to add a main() function to test the implementation.

### Example main() function:

```c
int main() {
    // Create traffic system
    TrafficSystem* system = createTrafficSystem();
    SchedulingStats* stats = createSchedulingStats();

    // Create scenario flags
    ScenarioFlags flags;
    flags.is_main_road = 0;
    flags.is_accident = 0;
    flags.is_school_zone = 1;
    flags.is_heavy_weather = 0;
    flags.is_rush_hour = 1;
    flags.has_pedestrian_crossing = 0;

    // Add sample vehicles
    Vehicle v1 = {"V001", AMBULANCE, 0, STRAIGHT};
    Vehicle v2 = {"V002", NORMAL, 1, LEFT};
    Vehicle v3 = {"V003", BUS, 2, RIGHT};
    Vehicle v4 = {"V004", VIP, 3, STRAIGHT};

    addVehicleToLane(system, v1, 0);
    addVehicleToLane(system, v2, 1);
    addVehicleToLane(system, v3, 2);
    addVehicleToLane(system, v4, 3);

    // Run simulation for 10 cycles
    for (int time = 0; time < 10; time++) {
        int vehicles_moved = schedule(system, stats, PRIORITY_QUEUE_SCHEDULING, &flags, 2, time);
        printSimulationStateJSON(system, stats, PRIORITY_QUEUE_SCHEDULING, &flags, time, vehicles_moved);
    }

    // Lookup performance test
    printPerformanceComparison(system, "V001");

    return 0;
}
```

Add this to the end of `traffic_simulator.c`, then compile and run:

```bash
gcc -o traffic_simulator traffic_simulator.c -lm
./traffic_simulator
```

## Serving the Frontend

The frontend (`index.html`) is a standalone file that can be opened directly in a browser, but it's better to serve it via HTTP.

### Method 1: Python HTTP Server (Recommended)

**Python 3:**
```bash
python3 -m http.server 8000
```

**Python 2:**
```bash
python -m SimpleHTTPServer 8000
```

Then open browser to: `http://localhost:8000/index.html`

### Method 2: Node.js HTTP Server

```bash
npx http-server -p 8000
```

### Method 3: PHP Built-in Server

```bash
php -S localhost:8000
```

### Method 4: Direct File Access

Simply double-click `index.html` to open in your browser.

**Note:** The frontend currently uses **mock data**. To connect it to the C backend, you'll need to:
1. Create a web server that executes the C program
2. Serve the JSON output via HTTP endpoint
3. Replace `generateMockData()` in `index.html` with actual `fetch()` calls

## Frontend Features

- **4-Lane Visualization** with color-coded vehicles
- **Scenario Controls:**
  - Emergency (spawns ambulances)
  - Accident (increases priority)
  - School Zone (bus priority)
  - Rush Hour (general boost)
  - Tie Case (equal priorities)
- **Mode Toggle:** Round Robin ↔ Priority Queue
- **Real-time Metrics:**
  - Current time
  - Vehicles served
  - Average wait time
  - Signal switches
- **Priority Queue Table** showing lane priorities
- **Algorithm Comparison** (RR vs PQ)

## Vehicle Color Coding

- 🔴 **Red** - Ambulance (Priority: 1000)
- 🟠 **Orange** - Fire (Priority: 900)
- 🔵 **Blue** - Police (Priority: 800)
- 🟣 **Purple** - VIP (Priority: 500)
- 🟡 **Yellow** - Bus (Priority: 300 in school zone)
- ⚫ **Gray** - Normal (Priority: 0)

## Priority Calculation

```
Lane Priority = Base Priority + Vehicle Priority + Scenario Modifiers

Base Priority:
- Queue Length × 10
- Average Wait Time × 5

Vehicle Priority:
- Ambulance: 1000
- Fire: 900
- Police: 800
- VIP: 500
- Bus (school zone): 300

Scenario Modifiers:
- Accident: +400
- Pedestrian Crossing: +250
- Main Road: +200
- Rush Hour: +150
- Heavy Weather (buses): +100
```

## Testing Hash Table Performance

To test the hash table lookup performance:

```c
int main() {
    TrafficSystem* system = createTrafficSystem();

    Vehicle v1 = {"ABC123", AMBULANCE, 0, STRAIGHT};
    addVehicleToLane(system, v1, 0);

    // Print detailed hash analysis
    printDetailedHashAnalysis(system->lanes[0].hashTable, "ABC123");

    // Print performance comparison
    printPerformanceComparison(system, "ABC123");

    // JSON output
    SearchResult linear = linearSearchInLane(system->lanes[0].queue, "ABC123");
    SearchResult hash = hashTableSearch(system->lanes[0].hashTable, "ABC123");
    printSearchResultJSON("ABC123", linear, hash, 0);

    return 0;
}
```

## Algorithm Comparison Example

Run both scheduling modes on the same dataset:

```c
int main() {
    // Setup
    TrafficSystem* system1 = createTrafficSystem();
    TrafficSystem* system2 = createTrafficSystem();
    SchedulingStats* rrStats = createSchedulingStats();
    SchedulingStats* pqStats = createSchedulingStats();

    ScenarioFlags flags = {0, 1, 1, 0, 1, 0}; // Accident + School Zone + Rush Hour

    // Add same vehicles to both systems
    Vehicle vehicles[] = {
        {"V001", AMBULANCE, 0, STRAIGHT},
        {"V002", NORMAL, 1, LEFT},
        {"V003", BUS, 2, RIGHT},
        {"V004", VIP, 3, STRAIGHT},
        {"V005", FIRE, 4, LEFT},
        {"V006", NORMAL, 5, STRAIGHT}
    };

    for (int i = 0; i < 6; i++) {
        addVehicleToLane(system1, vehicles[i], i % 4);
        addVehicleToLane(system2, vehicles[i], i % 4);
    }

    // Run Round Robin
    printf("=== ROUND ROBIN ===\n");
    for (int t = 0; t < 10; t++) {
        int moved = schedule(system1, rrStats, ROUND_ROBIN, &flags, 2, t);
        printSimulationStateJSON(system1, rrStats, ROUND_ROBIN, &flags, t, moved);
    }

    // Run Priority Queue
    printf("\n=== PRIORITY QUEUE ===\n");
    for (int t = 0; t < 10; t++) {
        int moved = schedule(system2, pqStats, PRIORITY_QUEUE_SCHEDULING, &flags, 2, t);
        printSimulationStateJSON(system2, pqStats, PRIORITY_QUEUE_SCHEDULING, &flags, t, moved);
    }

    printf("\nRound Robin - Avg Wait: %.2f, Switches: %d\n",
           rrStats->total_vehicles_served > 0 ?
           (double)rrStats->total_waiting_time / rrStats->total_vehicles_served : 0,
           rrStats->signal_switch_count);

    printf("Priority Queue - Avg Wait: %.2f, Switches: %d\n",
           pqStats->total_vehicles_served > 0 ?
           (double)pqStats->total_waiting_time / pqStats->total_vehicles_served : 0,
           pqStats->signal_switch_count);

    return 0;
}
```

## Expected Output

### JSON Format
```json
{
  "current_time": 5,
  "scheduling_mode": "PRIORITY_QUEUE_SCHEDULING",
  "selected_lane": 0,
  "vehicles_moved_this_cycle": 2,
  "performance_metrics": {
    "total_vehicles_served": 10,
    "total_waiting_time": 300,
    "average_waiting_time": 30.00,
    "signal_switch_count": 3
  },
  "scenario_flags": {
    "is_main_road": false,
    "is_accident": true,
    "is_school_zone": true,
    "is_heavy_weather": false,
    "is_rush_hour": true,
    "has_pedestrian_crossing": false
  },
  "lanes": [...]
}
```

## Quick Start

1. **Compile the C code** (add main() first):
   ```bash
   gcc -o traffic_simulator traffic_simulator.c -lm
   ```

2. **Run the simulation**:
   ```bash
   ./traffic_simulator
   ```

3. **Serve the frontend**:
   ```bash
   python3 -m http.server 8000
   ```

4. **Open browser**:
   ```
   http://localhost:8000/index.html
   ```

## Requirements

- **C Compiler:** GCC 4.8+ or Clang 3.4+
- **Standard Libraries:** stdio.h, stdlib.h, string.h, time.h
- **Web Browser:** Any modern browser (Chrome, Firefox, Safari, Edge)
- **HTTP Server:** Python 3.x (for serving frontend)

## License

Academic project - Free to use for educational purposes.

## Notes

- All data structures implemented from scratch (no external libraries)
- JSON output for easy integration with frontend
- Double hashing prevents clustering
- Max heap ensures O(log n) priority queue operations
- FIFO queue maintains vehicle order within lanes
