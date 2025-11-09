// Configuration constants for the self-driving car simulation
const CONFIG = {
    // Population settings
    POPULATION_SIZE: 50,
    MUTATION_RATE: 0.1,
    ELITISM_COUNT: 5, // Number of best cars to keep without mutation
    
    // Car physics
    CAR_WIDTH: 30,
    CAR_HEIGHT: 50,
    MAX_SPEED: 3,
    ACCELERATION: 0.2,
    FRICTION: 0.05,
    TURN_SPEED: 0.03,
    
    // Sensor settings
    SENSOR_RAY_COUNT: 5,
    SENSOR_RAY_LENGTH: 150,
    SENSOR_RAY_SPREAD: Math.PI / 2,
    
    // Neural network architecture
    NEURAL_NETWORK: {
        INPUT_NEURONS: 5, // Should match SENSOR_RAY_COUNT
        HIDDEN_NEURONS: 6,
        OUTPUT_NEURONS: 4 // [forward, left, right, reverse]
    },
    
    // Evolution settings
    GENERATION_DURATION: 30000, // 30 seconds per generation in milliseconds
    MIN_FITNESS_FOR_SAVE: 1000, // Minimum fitness before saving brain
    
    // Canvas settings
    CANVAS_MARGIN: 330,
    NETWORK_CANVAS_WIDTH: 300,
    MINIMAP_SIZE: 300,
    MINIMAP_SCALE: 0.05,
    
    // Visual settings
    NETWORK_ANIMATION_SPEED: 50,
    
    // Traffic settings
    ENABLE_TRAFFIC: false,
    TRAFFIC_COUNT: 20,
    TRAFFIC_MAX_SPEED: 2.0,
    CONTINUOUS_TRAFFIC: false,

    // Traffic lights
    ENABLE_LIGHTS: true,
    LIGHT_OFFSET: 30, // distance before intersection along incoming lane
    LIGHT_WIDTH_FACTOR: 0.6, // fraction of roadWidth used to draw the light bar

    // Driver assists
    LANE_ASSIST: true,
    LANE_ASSIST_THRESHOLD: 20,
    AUTO_RUN: true,
    HARD_LANE_ENFORCEMENT: true,
    HARD_LANE_MAX_DEVIATION: 35,

    // Error handling
    MAX_SAVE_RETRIES: 3
};
