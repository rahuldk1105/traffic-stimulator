# Priority-Based Traffic Simulator

This project simulates traffic flow at a 4-way intersection using a priority-based scheduling algorithm alongside a standard Round Robin approach. It features a C-based simulation engine for high-performance logic and a Node.js Express server that provides a web API and serves the interactive frontend dashboard.

## How Render Builds the Project

Render compiles the C backend and installs Node.js dependencies:
1.  **Build Command**: The `build.sh` script compiles the C source code (`backend/traffic_sim.c`) into an executable binary (`backend/traffic_sim`).
2.  **Dependencies**: `npm install` runs within the `server` directory to install Express and other required packages.

## How to Deploy on Render

1.  Create a new **Web Service** on Render connected to this repository.
2.  Set the **Environment** to `Node`.
3.  Configure the following settings:
    *   **Build Command**: `./build.sh && cd server && npm install`
    *   **Start Command**: `cd server && npm start`
4.  Click **Create Web Service**.

## How to Run Locally

1.  **Build the Simulator**:
    ```bash
    ./build.sh
    ```
2.  **Install Dependencies**:
    ```bash
    cd server
    npm install
    ```
3.  **Start the Server**:
    ```bash
    npm start
    ```
4.  Open your browser and navigate to `http://localhost:3000`.
