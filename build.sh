#!/bin/bash

# Compile the C backend
# We use -lm to link the math library just in case, as recommended in the README
gcc -o backend/traffic_sim backend/traffic_sim.c -lm

# Check if compilation was successful
if [ $? -eq 0 ]; then
    echo "Compilation successful."
    # Ensure the binary is executable
    chmod +x backend/traffic_sim
else
    echo "Compilation failed."
    exit 1
fi
