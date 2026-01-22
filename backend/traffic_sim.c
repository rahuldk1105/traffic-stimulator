#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_BUFFER 65536
#define INITIAL_LANE_CAPACITY 10 // Start small to demonstrate realloc
#define NUM_LANES 4
#define TIME_SLICE 2
#define MAX_HEAP_SIZE 100

// ============= DATA STRUCTURES =============

typedef enum {
    NORMAL,
    BUS,
    VIP,
    AMBULANCE,
    FIRE,
    POLICE
} VehicleType;

typedef struct {
    char id[32];
    VehicleType type;
    int arrival_time;
} Vehicle;

typedef struct {
    Vehicle** vehicles; // Dynamic Array of pointers
    int count;
    int capacity;       // Track current allocated size
    int id;
} Lane;

typedef struct {
    int is_main_road;
    int is_accident;
    int is_school_zone;
    int is_heavy_weather;
    int is_rush_hour;
    int has_pedestrian_crossing;
} ScenarioFlags;

typedef struct {
    Lane lanes[NUM_LANES];
    ScenarioFlags flags;
    int current_time;
} TrafficState;

typedef struct {
    int lane_id;
    int priority_value;
    int avg_wait;
} HeapNode;

typedef struct {
    HeapNode nodes[MAX_HEAP_SIZE];
    int size;
} PriorityQueue;

// ============= CONSTANTS =============

#define BASE_WEIGHT 10

// Vehicle Priorities (Rule 2 & 3)
#define PRIORITY_AMBULANCE 10000
#define PRIORITY_FIRE 7000
#define PRIORITY_POLICE 5000
#define PRIORITY_VIP 3000

// Scenario Adjustments (Rules 4-9)
#define ADJUSTMENT_ACCIDENT -4000
#define ADJUSTMENT_SCHOOL_BUS 2000
#define ADJUSTMENT_WEATHER_HEAVY 1500
#define ADJUSTMENT_PEDESTRIAN -2000
#define ADJUSTMENT_MAIN_ROAD 1000

// ============= MEMORY MANAGEMENT UTILS =============

void initLane(Lane* lane, int id) {
    lane->id = id;
    lane->count = 0;
    lane->capacity = INITIAL_LANE_CAPACITY;
    // malloc: Allocate initial array of pointers
    lane->vehicles = (Vehicle**)malloc(sizeof(Vehicle*) * lane->capacity);
    if (!lane->vehicles) {
        fprintf(stderr, "FATAL: Memory allocation failed for lane %d\n", id);
        exit(1);
    }
}

void addVehicleToLane(Lane* lane, Vehicle* v) {
    if (lane->count >= lane->capacity) {
        // realloc: Double capacity if full
        int newCapacity = lane->capacity * 2;
        Vehicle** newArr = (Vehicle**)realloc(lane->vehicles, sizeof(Vehicle*) * newCapacity);
        if (!newArr) {
            fprintf(stderr, "FATAL: Memory reallocation failed for lane %d\n", lane->id);
            // Free current if we want to be safe, but usually exit
            exit(1);
        }
        lane->vehicles = newArr;
        lane->capacity = newCapacity;
        fprintf(stderr, "[MEM] Lane %d resized: %d -> %d\n", lane->id, lane->capacity / 2, lane->capacity);
    }
    lane->vehicles[lane->count++] = v;
}

void freeLane(Lane* lane) {
    for (int i = 0; i < lane->count; i++) {
        free(lane->vehicles[i]); // Free individual vehicle
    }
    free(lane->vehicles); // Free the array itself
}

// ============= PRIORITY QUEUE UTILS =============

void swap(HeapNode* a, HeapNode* b) {
    HeapNode temp = *a;
    *a = *b;
    *b = temp;
}

// Compare two nodes based on Rule 10: Tie-breaking
// Returns 1 if 'a' has higher priority than 'b', 0 otherwise
int compareNodes(HeapNode a, HeapNode b) {
    if (a.priority_value != b.priority_value) {
        return a.priority_value > b.priority_value;
    }
    // Tie case REMOVED as per client request
    // "tie case guess u can remove it as it isn't depicting that scenario"
    // We just return 0 (equal) or maybe 1? 
    // If strict sort needed, maybe by ID? For now, no strict tie-breaker.
    return 0; 
}

void heapifyUp(PriorityQueue* pq, int index) {
    if (index == 0) return;
    int parent = (index - 1) / 2;
    // Max heap based on compareNodes logic
    if (compareNodes(pq->nodes[index], pq->nodes[parent])) {
        swap(&pq->nodes[index], &pq->nodes[parent]);
        heapifyUp(pq, parent);
    }
}

void heapifyDown(PriorityQueue* pq, int index) {
    int largest = index;
    int left = 2 * index + 1;
    int right = 2 * index + 2;

    if (left < pq->size && compareNodes(pq->nodes[left], pq->nodes[largest])) {
        largest = left;
    }

    if (right < pq->size && compareNodes(pq->nodes[right], pq->nodes[largest])) {
        largest = right;
    }

    if (largest != index) {
        swap(&pq->nodes[index], &pq->nodes[largest]);
        heapifyDown(pq, largest);
    }
}

void insertHeap(PriorityQueue* pq, int lane_id, int priority_value, int avg_wait) {
    if (pq->size >= MAX_HEAP_SIZE) return;
    pq->nodes[pq->size].lane_id = lane_id;
    pq->nodes[pq->size].priority_value = priority_value;
    pq->nodes[pq->size].avg_wait = avg_wait;
    heapifyUp(pq, pq->size);
    pq->size++;
}

HeapNode extractMax(PriorityQueue* pq) {
    HeapNode maxNode = pq->nodes[0];
    pq->nodes[0] = pq->nodes[pq->size - 1];
    pq->size--;
    if (pq->size > 0) heapifyDown(pq, 0);
    return maxNode;
}

// ============= PARSING UTILS (Naive JSON parser) =============

char* find_key(char* json, const char* key) {
    char search[64];
    sprintf(search, "\"%s\"", key);
    char* pos = strstr(json, search);
    if (!pos) return NULL;
    pos += strlen(search);
    while (*pos == ':' || *pos == ' ' || *pos == '\t' || *pos == '\n' || *pos == '\"') pos++;
    return pos;
}

int parse_bool(char* json, const char* key) {
    char* val = find_key(json, key);
    if (!val) return 0;
    return (strncmp(val, "true", 4) == 0);
}

int parse_int(char* json, const char* key) {
    char* val = find_key(json, key);
    if (!val) return 0;
    return atoi(val);
}

VehicleType parse_type(char* type_str) {
    if (strstr(type_str, "AMBULANCE")) return AMBULANCE;
    if (strstr(type_str, "FIRE")) return FIRE;
    if (strstr(type_str, "POLICE")) return POLICE;
    if (strstr(type_str, "VIP")) return VIP;
    if (strstr(type_str, "BUS")) return BUS;
    return NORMAL;
}

void parse_input(char* json, TrafficState* state) {
    state->flags.is_main_road = parse_bool(json, "is_main_road");
    state->flags.is_accident = parse_bool(json, "is_accident");
    state->flags.is_school_zone = parse_bool(json, "is_school_zone");
    state->flags.is_heavy_weather = parse_bool(json, "is_heavy_weather");
    state->flags.is_rush_hour = parse_bool(json, "is_rush_hour");
    state->flags.has_pedestrian_crossing = parse_bool(json, "has_pedestrian_crossing");
    
    state->current_time = parse_int(json, "current_time");

    char* lane_start = strstr(json, "\"lanes\"");
    if (!lane_start) return;
    
    char* curr = lane_start;
    
    for(int i=0; i<NUM_LANES; i++) {
        // Init Dynamic Lane
        initLane(&state->lanes[i], i);
        
        // Find block start
        char* v_list_tag = strstr(curr, "\"vehicles\"");
        
        if (!v_list_tag) break;
        
        char* arr_open = strchr(v_list_tag, '[');
        if (!arr_open) break;
        char* arr_close = strchr(arr_open, ']');
        if (!arr_close) break;
        
        char* v_curr = arr_open;
        while (v_curr < arr_close) {
            char* obj_open = strchr(v_curr, '{');
            if (!obj_open || obj_open > arr_close) break;
            
            char* type_key = strstr(obj_open, "\"type\"");
            char* arrival_key = strstr(obj_open, "\"arrival_time\"");
            
            if (type_key && arrival_key && type_key < arr_close && arrival_key < arr_close) {
                // malloc: Create vehicle node
                Vehicle* v = (Vehicle*)malloc(sizeof(Vehicle));
                if (!v) { fprintf(stderr, "Mem fail\n"); exit(1); }
                
                char* type_val = strchr(type_key, ':');
                if (type_val) v->type = parse_type(type_val);

                char* arr_val = strchr(arrival_key, ':');
                if (arr_val) v->arrival_time = atoi(arr_val + 1);
                
                // Add to lane (handles capacity)
                addVehicleToLane(&state->lanes[i], v);
            }
            v_curr = strchr(obj_open, '}'); 
            if (!v_curr) break;
            v_curr++;
        }
        curr = arr_close + 1;
    }
}

// ============= LOGIC =============

int calculateLanePriority(Lane* lane, ScenarioFlags* flags, int current_time, int* out_avg_wait) {
    int priority = 0;
    int queueLength = lane->count;
    
    // Rule 1: Base priority
    priority += queueLength * BASE_WEIGHT;
    
    // Calculate Average Wait & scan for special vehicles
    int totalWait = 0;
    int maxEmergencyPriority = 0; // To track dominant rule
    int schoolZoneBusBonus = 0;
    int heavyWeatherBonus = 0;

    for (int i = 0; i < lane->count; i++) {
        Vehicle* v = lane->vehicles[i];
        
        // Wait time
        int wait = current_time - v->arrival_time;
        if (wait < 0) wait = 0;
        totalWait += wait;
        
        // Rule 2 & 3 checks
        VehicleType t = v->type;
        if (t == AMBULANCE && PRIORITY_AMBULANCE > maxEmergencyPriority) maxEmergencyPriority = PRIORITY_AMBULANCE;
        else if (t == FIRE && PRIORITY_FIRE > maxEmergencyPriority) maxEmergencyPriority = PRIORITY_FIRE;
        else if (t == POLICE && PRIORITY_POLICE > maxEmergencyPriority) maxEmergencyPriority = PRIORITY_POLICE;
        else if (t == VIP && PRIORITY_VIP > maxEmergencyPriority) maxEmergencyPriority = PRIORITY_VIP; // VIP is lower than emergency, so logic holds
        
        // Rule 5: School Zone Bus
        if (t == BUS && flags->is_school_zone) schoolZoneBusBonus = ADJUSTMENT_SCHOOL_BUS;
        
        // Rule 6: Heavy Weather (Heavy vehicles: Bus/Trucks - assuming Bus here as per inputs)
        // If "heavy vehicles" usually implies Bus/Trucks. We have Bus.
        if (t == BUS && flags->is_heavy_weather) heavyWeatherBonus = ADJUSTMENT_WEATHER_HEAVY;
    }
    
    int avgWait = (queueLength > 0) ? (totalWait / queueLength) : 0;
    
    *out_avg_wait = avgWait; // Store for tie-break logging

    fprintf(stderr, "[C-ENGINE] Lane %d Calculation:\n", lane->id);
    fprintf(stderr, "  Base (Queue %d): %d\n", queueLength, queueLength * BASE_WEIGHT);
    fprintf(stderr, "  Max Emergency Prio: %d\n", maxEmergencyPriority);

    priority += queueLength * BASE_WEIGHT;
    priority += maxEmergencyPriority;
    
    // Rule 4: Accident
    // ... (Comment logic kept same, logging added)
    if (flags->is_accident && lane->id == 0) {
        priority += ADJUSTMENT_ACCIDENT; 
        fprintf(stderr, "  Accident Penalty: %d\n", ADJUSTMENT_ACCIDENT);
    }
    
    // Rule 9: Main Road
    if (flags->is_main_road && (lane->id == 0 || lane->id == 2)) {
        priority += ADJUSTMENT_MAIN_ROAD;
        fprintf(stderr, "  Main Road Bonus: %d\n", ADJUSTMENT_MAIN_ROAD);
    }

    // Rule 5: School Zone (Bus bonus)
    if (schoolZoneBusBonus > 0) fprintf(stderr, "  School Bus Bonus: %d\n", schoolZoneBusBonus);
    priority += schoolZoneBusBonus;
    
    // Rule 6: Weather
    if (heavyWeatherBonus > 0) fprintf(stderr, "  Heavy Weather Bonus: %d\n", heavyWeatherBonus);
    priority += heavyWeatherBonus;
    
    // Rule 8: Pedestrian Crossing
    if (flags->has_pedestrian_crossing) {
        priority += ADJUSTMENT_PEDESTRIAN;
        fprintf(stderr, "  Pedestrian Penalty: %d\n", ADJUSTMENT_PEDESTRIAN);
    }
    
    // Rule 7: Rush Hour (Multiplier)
    if (flags->is_rush_hour) {
        int oldP = priority;
        priority = (int)(priority * 1.5);
        fprintf(stderr, "  Rush Hour Multiplier (1.5x): %d -> %d\n", oldP, priority);
    }
    
    fprintf(stderr, "  FINAL PRIORITY: %d\n", priority);
    
    return priority;
}

// ============= MAIN =============

int main() {
    char json_buffer[MAX_BUFFER];
    size_t len = fread(json_buffer, 1, MAX_BUFFER - 1, stdin);
    json_buffer[len] = '\0';
    
    if (len == 0) return 0;

    TrafficState state;
    memset(&state, 0, sizeof(TrafficState));
    parse_input(json_buffer, &state);
    
    PriorityQueue pq;
    pq.size = 0;
    
    // Calculate and Insert
    for (int i = 0; i < NUM_LANES; i++) {
        int avg_wait = 0;
        int p = calculateLanePriority(&state.lanes[i], &state.flags, state.current_time, &avg_wait);
        insertHeap(&pq, i, p, avg_wait);
    }
    
    // Extract ordered list for Rule 11
    HeapNode sortedLanes[NUM_LANES];
    int count = pq.size;
    int selected_lane = -1;
    
    for (int i = 0; i < count; i++) {
        sortedLanes[i] = extractMax(&pq);
        if (i == 0) selected_lane = sortedLanes[i].lane_id;
    }
    
    // Output JSON
    printf("{\n");
    printf("  \"selected_lane\": %d,\n", selected_lane);
    printf("  \"num_vehicles_to_pass\": %d,\n", TIME_SLICE);
    
    printf("  \"priority_heap\": [\n");
    for (int i = 0; i < count; i++) {
        printf("    {\"lane_id\": %d, \"priority\": %d, \"rank\": %d}", 
            sortedLanes[i].lane_id, sortedLanes[i].priority_value, i+1);
        if (i < count - 1) printf(",\n");
    }
    printf("\n  ]\n");
    printf("}\n");
    
    // Cleanup - DYNAMIC MEMORY
    for(int i=0; i<NUM_LANES; i++) {
        freeLane(&state.lanes[i]);
    }

    return 0;
}
