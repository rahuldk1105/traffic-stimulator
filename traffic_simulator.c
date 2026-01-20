#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_VEHICLE_NUMBER 20
#define HASH_TABLE_SIZE 101
#define HASH_PRIME 97
#define MAX_HEAP_SIZE 100

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
