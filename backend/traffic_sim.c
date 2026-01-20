#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_BUFFER 65536
#define MAX_VEHICLES_PER_LANE 100
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
    Vehicle* vehicles[MAX_VEHICLES_PER_LANE];
    int count;
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
    // Tie case: select lane with highest average waiting time
    return a.avg_wait > b.avg_wait;
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

// Ensure strict ordering extraction if needed, but array print loop is often sufficient for visualization if sorted.
// However, the standard array representation of a heap is not fully sorted, it's just a tree.
// To satisfy "return full priority queue as an ordered list", we should sort the output (or extract all).
// Let's implement extractMax to build a sorted list for output.
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
        state->lanes[i].count = 0;
        state->lanes[i].id = i; // Default ID
        
        // Find block start
        char* v_list_tag = strstr(curr, "\"vehicles\"");
        // Optional: Check if "id": n exists before this to confirm lane ID mapping.
        // Assuming strict order 0,1,2,3 for simplicity as per previous context.
        
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
                Vehicle* v = (Vehicle*)malloc(sizeof(Vehicle));
                
                char* type_val = strchr(type_key, ':');
                if (type_val) v->type = parse_type(type_val);

                char* arr_val = strchr(arrival_key, ':');
                if (arr_val) v->arrival_time = atoi(arr_val + 1);
                
                state->lanes[i].vehicles[state->lanes[i].count++] = v;
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
    
    *out_avg_wait = (queueLength > 0) ? (totalWait / queueLength) : 0;
    
    // Apply Rule 2/3 (Dominant Rule): Override queue length if emergency/VIP present
    // "Emergency priority must override queue length" implies adding it to base or replacing it.
    // Usually these constants are large enough to dominate (10000 vs 10*queue).
    // The requirement says "If a lane contains... +X". We add it.
    priority += maxEmergencyPriority;
    
    // Rule 4: Accident
    if (flags->is_accident) {
        // "If a lane is marked as accident-prone". 
        // In this simple input model, 'is_accident' is global flag for the simulation context,
        // but typically applies to a specific lane. The prompt says "If a lane is marked".
        // The current ScenarioFlags structure is global. We will assume if global accident flag is ON,
        // it applies to *some* logic. However, usually 'accident' flag in UI was toggleable per scenario.
        // If the flag assumes specific lane, we need that info. 
        // Given constraint: "is_accident" comes from global flags. 
        // We will Apply to ALL lanes? No, that cancels out.
        // We will assume for this challenge that if 'is_accident' is true, it might refer to a specific lane passed in config?
        // But we only have global flags. 
        // **Interpretation**: The requirement might mean "If the scenario is 'Is Accident', priority is adjusted" 
        // OR the user UI has a button "Accident" which usually implies an accident happened generally affecting flow 
        // or specifically on one lane.
        // Let's look at previous code: it applied `PRIORITY_ACCIDENT` addition globally or partially.
        // User Requirement Rule 4 says "If a lane is marked as accident-prone".
        // Without per-lane metadata in JSON, we can't distinguish. 
        // **However**, usually accident REDUCES capacity but INCREASES priority to clear?
        // Requirement says "subtract 4000". This means avoid the lane.
        // Strategy: We will apply this ONLY if we can identify the lane. 
        // Since we can't, we will skip applying strict per-lane accident logic UNLESS
        // we decide 'is_accident' applies to a fixed lane (e.g. Lane 0) or simply ignore if ambiguous.
        // *Correction*: Previous code added priority. New requirement subtracts.
        // Lacking specific lane ID in flags, I will apply to Lane 0 for demonstration/testing if flag is set,
        // OR safer: don't apply if ambiguous to avoid breaking logic. 
        // BUT, I must follow rules. Let's assume the 'is_accident' flag implies the "Main Road" or a specific condition.
        // Re-reading payload: we send `is_accident` bool.
        // I will apply it to Lane 0 as a "blocked lane" scenario for the sake of deterministic behavior complying with "Accident lane" concept.
        if (flags->is_accident && lane->id == 0) {
            priority += ADJUSTMENT_ACCIDENT; // Subtract 4000
        }
    }
    
    // Rule 9: Main Road priority
    // "If lane is North or South". Assuming Lanes 0 and 2 are N/S (or 0/1 depending on layout).
    // Standard Cross: 0=N, 1=E, 2=S, 3=W.
    // Let's assume 0 and 2 are Main Road.
    // Only apply if `is_main_road` flag is active? "If lane is North or South -> +1000". 
    // This sounds unconditional based on geometry, OR conditional on flag.
    // Let's make it conditional on `is_main_road` flag being true AND lane being 0 or 2.
    if (flags->is_main_road && (lane->id == 0 || lane->id == 2)) {
        priority += ADJUSTMENT_MAIN_ROAD;
    }

    // Rule 5: School Zone (Bus bonus)
    priority += schoolZoneBusBonus;
    
    // Rule 6: Weather
    priority += heavyWeatherBonus;
    
    // Rule 8: Pedestrian Crossing
    if (flags->has_pedestrian_crossing) {
        priority += ADJUSTMENT_PEDESTRIAN;
    }
    
    // Rule 7: Rush Hour (Multiplier)
    if (flags->is_rush_hour) {
        priority = (int)(priority * 1.5);
    }
    
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
    
    printf("  \"priority_heap\": [\n"); // Keeping key name 'priority_heap' for frontend compatibility, though it's fully sorted now
    for (int i = 0; i < count; i++) {
        printf("    {\"lane_id\": %d, \"priority\": %d, \"rank\": %d}", 
            sortedLanes[i].lane_id, sortedLanes[i].priority_value, i+1);
        if (i < count - 1) printf(",\n");
    }
    printf("\n  ]\n");
    printf("}\n");
    
    // Cleanup
    for(int i=0; i<NUM_LANES; i++) {
        for(int j=0; j<state.lanes[i].count; j++) {
            free(state.lanes[i].vehicles[j]);
        }
    }

    return 0;
}
