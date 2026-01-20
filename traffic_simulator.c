#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_VEHICLE_NUMBER 20
#define HASH_TABLE_SIZE 101
#define HASH_PRIME 97
#define MAX_HEAP_SIZE 100
#define NUM_LANES 4

// ============= VEHICLE STRUCTURE =============

typedef enum {
    NORMAL,
    BUS,
    VIP,
    AMBULANCE,
    FIRE,
    POLICE
} VehicleType;

typedef enum {
    LEFT,
    RIGHT,
    STRAIGHT
} Direction;

typedef struct {
    char vehicle_number[MAX_VEHICLE_NUMBER];
    VehicleType type;
    int arrival_time;
    Direction direction;
} Vehicle;

// ============= LANE QUEUE (FIFO) =============

typedef struct QueueNode {
    Vehicle vehicle;
    struct QueueNode* next;
} QueueNode;

typedef struct {
    QueueNode* front;
    QueueNode* rear;
    int size;
} LaneQueue;

LaneQueue* createLaneQueue() {
    LaneQueue* queue = (LaneQueue*)malloc(sizeof(LaneQueue));
    queue->front = NULL;
    queue->rear = NULL;
    queue->size = 0;
    return queue;
}

int isQueueEmpty(LaneQueue* queue) {
    return queue->front == NULL;
}

void enqueue(LaneQueue* queue, Vehicle vehicle) {
    QueueNode* newNode = (QueueNode*)malloc(sizeof(QueueNode));
    newNode->vehicle = vehicle;
    newNode->next = NULL;

    if (isQueueEmpty(queue)) {
        queue->front = newNode;
        queue->rear = newNode;
    } else {
        queue->rear->next = newNode;
        queue->rear = newNode;
    }
    queue->size++;
}

Vehicle dequeue(LaneQueue* queue) {
    Vehicle vehicle;
    if (isQueueEmpty(queue)) {
        memset(&vehicle, 0, sizeof(Vehicle));
        return vehicle;
    }

    QueueNode* temp = queue->front;
    vehicle = temp->vehicle;
    queue->front = queue->front->next;

    if (queue->front == NULL) {
        queue->rear = NULL;
    }

    free(temp);
    queue->size--;
    return vehicle;
}

Vehicle peek(LaneQueue* queue) {
    Vehicle vehicle;
    if (isQueueEmpty(queue)) {
        memset(&vehicle, 0, sizeof(Vehicle));
        return vehicle;
    }
    return queue->front->vehicle;
}

// ============= PRIORITY QUEUE (MAX HEAP) =============

typedef struct {
    int lane_id;
    int priority_value;
} HeapNode;

typedef struct {
    HeapNode nodes[MAX_HEAP_SIZE];
    int size;
} PriorityQueue;

PriorityQueue* createPriorityQueue() {
    PriorityQueue* pq = (PriorityQueue*)malloc(sizeof(PriorityQueue));
    pq->size = 0;
    return pq;
}

void swap(HeapNode* a, HeapNode* b) {
    HeapNode temp = *a;
    *a = *b;
    *b = temp;
}

void heapifyUp(PriorityQueue* pq, int index) {
    if (index == 0) return;

    int parent = (index - 1) / 2;

    if (pq->nodes[index].priority_value > pq->nodes[parent].priority_value) {
        swap(&pq->nodes[index], &pq->nodes[parent]);
        heapifyUp(pq, parent);
    }
}

void heapifyDown(PriorityQueue* pq, int index) {
    int largest = index;
    int left = 2 * index + 1;
    int right = 2 * index + 2;

    if (left < pq->size && pq->nodes[left].priority_value > pq->nodes[largest].priority_value) {
        largest = left;
    }

    if (right < pq->size && pq->nodes[right].priority_value > pq->nodes[largest].priority_value) {
        largest = right;
    }

    if (largest != index) {
        swap(&pq->nodes[index], &pq->nodes[largest]);
        heapifyDown(pq, largest);
    }
}

void insertHeap(PriorityQueue* pq, int lane_id, int priority_value) {
    if (pq->size >= MAX_HEAP_SIZE) {
        return;
    }

    pq->nodes[pq->size].lane_id = lane_id;
    pq->nodes[pq->size].priority_value = priority_value;
    heapifyUp(pq, pq->size);
    pq->size++;
}

HeapNode extractMax(PriorityQueue* pq) {
    HeapNode maxNode;
    if (pq->size == 0) {
        maxNode.lane_id = -1;
        maxNode.priority_value = -1;
        return maxNode;
    }

    maxNode = pq->nodes[0];
    pq->nodes[0] = pq->nodes[pq->size - 1];
    pq->size--;

    if (pq->size > 0) {
        heapifyDown(pq, 0);
    }

    return maxNode;
}

// ============= HASH TABLE (DOUBLE HASHING) =============

typedef struct {
    Vehicle vehicle;
    int occupied;
} HashEntry;

typedef struct {
    HashEntry entries[HASH_TABLE_SIZE];
} HashTable;

HashTable* createHashTable() {
    HashTable* table = (HashTable*)malloc(sizeof(HashTable));
    for (int i = 0; i < HASH_TABLE_SIZE; i++) {
        table->entries[i].occupied = 0;
    }
    return table;
}

int hash1(char* vehicle_number) {
    int sum = 0;
    for (int i = 0; vehicle_number[i] != '\0'; i++) {
        sum += (int)vehicle_number[i];
    }
    return sum % HASH_TABLE_SIZE;
}

int hash2(char* vehicle_number) {
    int sum = 0;
    for (int i = 0; vehicle_number[i] != '\0'; i++) {
        sum += (int)vehicle_number[i];
    }
    return HASH_PRIME - (sum % HASH_PRIME);
}

void insertHash(HashTable* table, Vehicle vehicle) {
    int index = hash1(vehicle.vehicle_number);
    int step = hash2(vehicle.vehicle_number);
    int i = 0;

    while (table->entries[index].occupied && i < HASH_TABLE_SIZE) {
        index = (index + step) % HASH_TABLE_SIZE;
        i++;
    }

    if (i < HASH_TABLE_SIZE) {
        table->entries[index].vehicle = vehicle;
        table->entries[index].occupied = 1;
    }
}

Vehicle* searchHash(HashTable* table, char* vehicle_number) {
    int index = hash1(vehicle_number);
    int step = hash2(vehicle_number);
    int i = 0;

    while (i < HASH_TABLE_SIZE) {
        if (table->entries[index].occupied &&
            strcmp(table->entries[index].vehicle.vehicle_number, vehicle_number) == 0) {
            return &table->entries[index].vehicle;
        }

        if (!table->entries[index].occupied) {
            return NULL;
        }

        index = (index + step) % HASH_TABLE_SIZE;
        i++;
    }

    return NULL;
}

// ============= MULTI-LANE SYSTEM =============

typedef struct {
    int lane_id;
    LaneQueue* queue;
    HashTable* hashTable;
} Lane;

typedef struct {
    Lane lanes[NUM_LANES];
} TrafficSystem;

TrafficSystem* createTrafficSystem() {
    TrafficSystem* system = (TrafficSystem*)malloc(sizeof(TrafficSystem));

    for (int i = 0; i < NUM_LANES; i++) {
        system->lanes[i].lane_id = i;
        system->lanes[i].queue = createLaneQueue();
        system->lanes[i].hashTable = createHashTable();
    }

    return system;
}

void addVehicleToLane(TrafficSystem* system, Vehicle vehicle, int lane_id) {
    if (lane_id < 0 || lane_id >= NUM_LANES) {
        return;
    }

    enqueue(system->lanes[lane_id].queue, vehicle);
    insertHash(system->lanes[lane_id].hashTable, vehicle);
}

Vehicle removeVehicleFromLane(TrafficSystem* system, int lane_id) {
    Vehicle vehicle;

    if (lane_id < 0 || lane_id >= NUM_LANES) {
        memset(&vehicle, 0, sizeof(Vehicle));
        return vehicle;
    }

    vehicle = dequeue(system->lanes[lane_id].queue);
    return vehicle;
}

Vehicle* lookupVehicleByNumber(TrafficSystem* system, char* vehicle_number) {
    for (int i = 0; i < NUM_LANES; i++) {
        Vehicle* vehicle = searchHash(system->lanes[i].hashTable, vehicle_number);
        if (vehicle != NULL) {
            return vehicle;
        }
    }

    return NULL;
}

// ============= PRIORITY CALCULATION =============

#define PRIORITY_AMBULANCE 1000
#define PRIORITY_FIRE 900
#define PRIORITY_POLICE 800
#define PRIORITY_VIP 500
#define PRIORITY_BUS_SCHOOL_ZONE 300
#define PRIORITY_MAIN_ROAD 200
#define PRIORITY_ACCIDENT 400
#define PRIORITY_PEDESTRIAN_CROSSING 250
#define PRIORITY_RUSH_HOUR 150
#define PRIORITY_HEAVY_WEATHER 100
#define BASE_PRIORITY_PER_VEHICLE 10
#define BASE_PRIORITY_PER_SECOND 5

typedef struct {
    int is_main_road;
    int is_accident;
    int is_school_zone;
    int is_heavy_weather;
    int is_rush_hour;
    int has_pedestrian_crossing;
} ScenarioFlags;

int getVehiclePriority(Vehicle vehicle, ScenarioFlags* flags) {
    int priority = 0;

    switch (vehicle.type) {
        case AMBULANCE:
            priority = PRIORITY_AMBULANCE;
            break;
        case FIRE:
            priority = PRIORITY_FIRE;
            break;
        case POLICE:
            priority = PRIORITY_POLICE;
            break;
        case VIP:
            priority = PRIORITY_VIP;
            break;
        case BUS:
            if (flags && flags->is_school_zone) {
                priority = PRIORITY_BUS_SCHOOL_ZONE;
            }
            break;
        case NORMAL:
        default:
            priority = 0;
            break;
    }

    return priority;
}

int getMaxVehiclePriorityInLane(LaneQueue* queue, ScenarioFlags* flags) {
    if (isQueueEmpty(queue)) {
        return 0;
    }

    int maxPriority = 0;
    QueueNode* current = queue->front;

    while (current != NULL) {
        int vehiclePriority = getVehiclePriority(current->vehicle, flags);
        if (vehiclePriority > maxPriority) {
            maxPriority = vehiclePriority;
        }
        current = current->next;
    }

    return maxPriority;
}

int getAverageWaitingTime(LaneQueue* queue, int current_time) {
    if (isQueueEmpty(queue)) {
        return 0;
    }

    int totalWaitTime = 0;
    int count = 0;
    QueueNode* current = queue->front;

    while (current != NULL) {
        int waitTime = current_time - current->vehicle.arrival_time;
        if (waitTime < 0) {
            waitTime = 0;
        }
        totalWaitTime += waitTime;
        count++;
        current = current->next;
    }

    return count > 0 ? totalWaitTime / count : 0;
}

int calculateLanePriority(TrafficSystem* system, int lane_id, ScenarioFlags* flags, int current_time) {
    if (lane_id < 0 || lane_id >= NUM_LANES) {
        return 0;
    }

    Lane* lane = &system->lanes[lane_id];
    int priority = 0;

    int queueLength = lane->queue->size;
    int avgWaitTime = getAverageWaitingTime(lane->queue, current_time);

    priority += queueLength * BASE_PRIORITY_PER_VEHICLE;
    priority += avgWaitTime * BASE_PRIORITY_PER_SECOND;

    int maxVehiclePriority = getMaxVehiclePriorityInLane(lane->queue, flags);
    priority += maxVehiclePriority;

    if (flags) {
        if (flags->is_main_road) {
            priority += PRIORITY_MAIN_ROAD;
        }

        if (flags->is_accident) {
            priority += PRIORITY_ACCIDENT;
        }

        if (flags->has_pedestrian_crossing) {
            priority += PRIORITY_PEDESTRIAN_CROSSING;
        }

        if (flags->is_rush_hour) {
            priority += PRIORITY_RUSH_HOUR;
        }

        if (flags->is_heavy_weather) {
            QueueNode* current = lane->queue->front;
            while (current != NULL) {
                if (current->vehicle.type == BUS) {
                    priority += PRIORITY_HEAVY_WEATHER;
                    break;
                }
                current = current->next;
            }
        }
    }

    return priority;
}

// ============= SCHEDULING ALGORITHMS =============

typedef enum {
    ROUND_ROBIN,
    PRIORITY_QUEUE_SCHEDULING
} SchedulingMode;

typedef struct {
    int total_vehicles_served;
    int total_waiting_time;
    int signal_switch_count;
    int current_lane;
} SchedulingStats;

SchedulingStats* createSchedulingStats() {
    SchedulingStats* stats = (SchedulingStats*)malloc(sizeof(SchedulingStats));
    stats->total_vehicles_served = 0;
    stats->total_waiting_time = 0;
    stats->signal_switch_count = 0;
    stats->current_lane = 0;
    return stats;
}

int scheduleRoundRobin(TrafficSystem* system, SchedulingStats* stats, int time_slice, int current_time) {
    int vehiclesProcessed = 0;
    int startLane = stats->current_lane;
    int nextLane = startLane;

    for (int i = 0; i < NUM_LANES; i++) {
        int lane_id = (startLane + i) % NUM_LANES;
        Lane* lane = &system->lanes[lane_id];

        if (!isQueueEmpty(lane->queue)) {
            nextLane = lane_id;
            break;
        }
    }

    if (nextLane != stats->current_lane) {
        stats->signal_switch_count++;
        stats->current_lane = nextLane;
    }

    Lane* currentLane = &system->lanes[stats->current_lane];
    int timeUsed = 0;

    while (timeUsed < time_slice && !isQueueEmpty(currentLane->queue)) {
        Vehicle vehicle = dequeue(currentLane->queue);

        int waitingTime = current_time - vehicle.arrival_time;
        if (waitingTime < 0) {
            waitingTime = 0;
        }

        stats->total_waiting_time += waitingTime;
        stats->total_vehicles_served++;
        vehiclesProcessed++;

        timeUsed++;
    }

    stats->current_lane = (stats->current_lane + 1) % NUM_LANES;

    return vehiclesProcessed;
}

int schedulePriorityQueue(TrafficSystem* system, SchedulingStats* stats, ScenarioFlags* flags, int time_slice, int current_time) {
    int vehiclesProcessed = 0;

    PriorityQueue* pq = createPriorityQueue();

    for (int i = 0; i < NUM_LANES; i++) {
        if (!isQueueEmpty(system->lanes[i].queue)) {
            int priority = calculateLanePriority(system, i, flags, current_time);
            insertHeap(pq, i, priority);
        }
    }

    if (pq->size == 0) {
        free(pq);
        return 0;
    }

    HeapNode maxNode = extractMax(pq);
    int selectedLane = maxNode.lane_id;

    if (selectedLane != stats->current_lane) {
        stats->signal_switch_count++;
        stats->current_lane = selectedLane;
    }

    Lane* currentLane = &system->lanes[selectedLane];
    int timeUsed = 0;

    while (timeUsed < time_slice && !isQueueEmpty(currentLane->queue)) {
        Vehicle vehicle = dequeue(currentLane->queue);

        int waitingTime = current_time - vehicle.arrival_time;
        if (waitingTime < 0) {
            waitingTime = 0;
        }

        stats->total_waiting_time += waitingTime;
        stats->total_vehicles_served++;
        vehiclesProcessed++;

        timeUsed++;
    }

    free(pq);
    return vehiclesProcessed;
}

int schedule(TrafficSystem* system, SchedulingStats* stats, SchedulingMode mode, ScenarioFlags* flags, int time_slice, int current_time) {
    if (mode == ROUND_ROBIN) {
        return scheduleRoundRobin(system, stats, time_slice, current_time);
    } else if (mode == PRIORITY_QUEUE_SCHEDULING) {
        return schedulePriorityQueue(system, stats, flags, time_slice, current_time);
    }

    return 0;
}
