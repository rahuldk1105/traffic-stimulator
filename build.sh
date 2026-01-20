#!/bin/bash

# Build script for Traffic Simulator
# Compiles C backend for deployment

echo "Building Traffic Simulator backend..."

# Compile C program
gcc -o backend/traffic_sim backend/traffic_sim.c -lm

if [ $? -eq 0 ]; then
    echo "✓ C backend compiled successfully: backend/traffic_sim"
    chmod +x backend/traffic_sim
    echo "✓ Made executable"
else
    echo "✗ Compilation failed"
    exit 1
fi

echo "Build complete!"
