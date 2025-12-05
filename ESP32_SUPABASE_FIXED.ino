/*
 * ESP32 Stroke Counter Program - Supabase Integration
 * 
 * CONFIGURATION SECTION
 * ====================
 * All settings below can be modified as needed
 * 
 * Based on working Google Sheets version, adapted for Supabase
 * - ESP32 sends: Plant, Machine No., and Value (stroke count)
 * - All other fields fetched from Supabase settings table (Plant + Machine)
 * - Target/Actual counts from settings table (pre-calculated)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include <SPI.h>

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================
// Wi-Fi credentials - Change these to match your network
const char* ssid = "Sachin";              // Your WiFi network name
const char* password = "Til12345";         // Your WiFi password

// ============================================================================
// SUPABASE CONFIGURATION
// ============================================================================
// Supabase API settings - Update with your Supabase project details
const char* supabaseUrl = "https://tzoloagoaysipwxuyldu.supabase.co";
const char* supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6b2xvYWdvYXlzaXB3eHV5bGR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MDM3MzIsImV4cCI6MjA3ODk3OTczMn0.BwC-uFnlkWtaGNVEee4VFuL-trsdz1aawDC77F3afWk";
const char* iotDatabaseTable = "IoT Database";    // IoT data table name
const char* settingsTable = "settings";           // Settings table name

// ============================================================================
// MACHINE CONFIGURATION
// ============================================================================
// Machine identification - Change to match your machine
// IMPORTANT: Must match EXACTLY with the machine name in settings table
const char* machineNo = "10000707_500_SUMMITO";   // Your machine number/name (matches Supabase settings)
const char* plant = "DMCPLI_3001";                // Your plant name

// ============================================================================
// STROKE DETECTION CONFIGURATION
// ============================================================================
// Switch mode selection - Choose based on your machine's signal quality
const bool USE_DUAL_SWITCH_MODE = false;    // true = dual switch, false = single switch

// Switch type configuration - Choose based on your limit switch type
const bool SWITCH_NORMALLY_OPEN = true;     // true = NO switch, false = NC switch

// Pin assignments for limit switches
const int startLimitPin = 15;               // D15 - Start switch (or single switch)
const int endLimitPin = 19;                 // D19 - End switch (only used in dual mode)

// Debouncing settings
const unsigned long debounceDelay = 50;     // Debounce delay in milliseconds

// ============================================================================
// DISPLAY CONFIGURATION
// ============================================================================
const unsigned long displayAutoRefreshMinutes = 30;  // Auto refresh interval in minutes

// ============================================================================
// DATA TRANSMISSION CONFIGURATION
// ============================================================================
const unsigned long sendInterval = 60000;    // Data send interval (1 minute)
const unsigned long reconnectInterval = 5000; // WiFi reconnect interval (5 seconds)

// ============================================================================
// PROGRAM VARIABLES (DO NOT MODIFY)
// ============================================================================
TFT_eSPI tft = TFT_eSPI();

// Display update tracking
unsigned long lastDisplayUpdate = 0;
unsigned long lastSettingsResponse = 0;
unsigned long lastDataSendFailure = 0;
unsigned long lastDisplayReinit = 0;

// Variables to track changes
int lastStrokeCount = 0;
bool lastWiFiStatus = false;
int lastTotalCount = 0;
String lastTargetCount = "";
String lastActualCount = "";
int lastFailedStrokeCount = 0;

// Stroke detection variables
volatile int strokeCount = 0;
volatile int failedStrokeCount = 0;
bool startLimitPrevState = HIGH;
bool startLimitCurrentState = HIGH;
bool endLimitPrevState = HIGH;
bool endLimitCurrentState = HIGH;
unsigned long lastDebounceTime = 0;

// Stroke detection state machine
enum StrokeState {
  WAITING_FOR_START,
  WAITING_FOR_END
};
StrokeState currentStrokeState = WAITING_FOR_START;

// Timer for sending data
unsigned long lastSendTime = 0;

// Wi-Fi reconnect variables
unsigned long lastReconnectAttempt = 0;

// Task handle
TaskHandle_t supabaseTaskHandle;

// ============================================================================
// SETTINGS DATA STRUCTURE
// ============================================================================
struct Settings {
  String plant;
  String partNo;
  String partName;
  String operation;
  String cycleTime;
  String partCountPerCycle;
  String inspection;
  String cellName;
  String cellLeader;
  String workStations;
  String mandays;
  String toolCode;
  String operatorCode;
  String lossReasons;
  String targetCount;
  String actualCount;
} currentSettings;

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  
  // Initialize TFT display
  tft.init();
  tft.setRotation(2);
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(1);
  
  // Display welcome message
  tft.drawString("Initializing...", 10, 10, 4);
  
  pinMode(startLimitPin, INPUT_PULLUP);
  pinMode(endLimitPin, INPUT_PULLUP);
  
  // Test both pins on startup
  Serial.println("=== PIN TEST ===");
  Serial.print("Start Pin (D15) initial state: ");
  Serial.println(digitalRead(startLimitPin) ? "HIGH" : "LOW");
  Serial.print("End Pin (D19) initial state: ");
  Serial.println(digitalRead(endLimitPin) ? "HIGH" : "LOW");
  Serial.println("=== END PIN TEST ===");
  
  // Display mode configuration
  Serial.println("=== MODE CONFIGURATION ===");
  if (USE_DUAL_SWITCH_MODE) {
    Serial.println("✓ DUAL SWITCH MODE ENABLED");
    Serial.println("  - Start Switch: D15");
    Serial.println("  - End Switch: D19");
    Serial.println("  - Stroke recorded only when both switches activate in sequence");
  } else {
    Serial.println("✓ SINGLE SWITCH MODE ENABLED");
    Serial.println("  - Single Switch: D15");
    Serial.println("  - Stroke recorded on each switch activation");
  }
  
  // Display switch type configuration
  Serial.println("=== SWITCH TYPE CONFIGURATION ===");
  if (SWITCH_NORMALLY_OPEN) {
    Serial.println("✓ NORMALLY OPEN (NO) SWITCH CONFIGURED");
    Serial.println("  - Switch is HIGH when not pressed");
    Serial.println("  - Switch goes LOW when pressed");
  } else {
    Serial.println("✓ NORMALLY CLOSED (NC) SWITCH CONFIGURED");
    Serial.println("  - Switch is LOW when not pressed");
    Serial.println("  - Switch goes HIGH when pressed");
  }
  Serial.println("=== END SWITCH TYPE CONFIGURATION ===");

  // Connect to Wi-Fi and wait briefly for connection on first startup
  connectToWiFi();
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 15000) { // wait up to 15 seconds
    delay(500);
    Serial.print("Waiting for WiFi connection... Status=");
    Serial.println(WiFi.status());
  }

  // Fetch settings data immediately (if Wi-Fi is available)
  fetchSettingsFromSupabase();

  // Display initial screen immediately
  updateDisplay();

  xTaskCreate(
    sendDataToSupabaseTask,          
    "Supabase Task",           
    8192,                  
    NULL,                  
    1,                     
    &supabaseTaskHandle        
  );
}

// ============================================================================
// DISPLAY UPDATE
// ============================================================================
void updateDisplay() {
  static bool isInitialDisplay = true;
  
  // Check if we need to update
  bool needsUpdate = false;
  
  // Check for stroke count change
  if (strokeCount != lastStrokeCount) {
    needsUpdate = true;
    lastStrokeCount = strokeCount;
  }
  
  // Check for WiFi status change
  bool currentWiFiStatus = (WiFi.status() == WL_CONNECTED);
  if (currentWiFiStatus != lastWiFiStatus) {
    needsUpdate = true;
    lastWiFiStatus = currentWiFiStatus;
  }
  
  // Calculate current total and check if it has changed
  int currentTotalCount = currentSettings.actualCount.toInt() + failedStrokeCount;
  if (currentTotalCount != lastTotalCount) {
    needsUpdate = true;
    lastTotalCount = currentTotalCount;
  }
  
  // Check for Target Count change
  if (currentSettings.targetCount != lastTargetCount) {
    lastTargetCount = currentSettings.targetCount;
    updateTargetAndTotalOnly();
    lastDisplayUpdate = millis();
  }
  
  // Check for Actual Count change
  if (currentSettings.actualCount != lastActualCount) {
    lastActualCount = currentSettings.actualCount;
    updateTargetAndTotalOnly();
    lastDisplayUpdate = millis();
  }
  
  // Check for Failed Stroke Count change
  if (failedStrokeCount != lastFailedStrokeCount) {
    lastFailedStrokeCount = failedStrokeCount;
    updateBufferedStrokeDisplay();
    lastDisplayUpdate = millis();
  }
  
  // If no changes and not initial display, don't update
  if (!needsUpdate && !isInitialDisplay) {
    return;
  }
   
  // Regular display update
  tft.fillScreen(TFT_BLACK);
  
  // Display machine info at top
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString("Machine:", 10, 5, 2);
  tft.drawString(String(machineNo), 10, 25, 4);
  
  // Display Part
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawString("Part:", 10, 55, 2);
  tft.drawString(currentSettings.partName, 10, 75, 4);
  
  // Display Operation
  tft.drawString("Operation:", 10, 105, 2);
  tft.drawString(currentSettings.operation, 10, 125, 4);
  
  // Display Operator
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString("Operator:", 10, 155, 2);
  tft.drawString(currentSettings.operatorCode, 10, 175, 4);
  
  // Display Target
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.drawString("TARGET:", 10, 205, 2);
  tft.drawString(currentSettings.targetCount, 120, 205, 6);
  
  // Display Total
  tft.drawString("TOTAL:", 10, 265, 2);
  tft.drawString(String(currentTotalCount), 120, 265, 6);
  
  // Current minute strokes - LIVE COUNT
  tft.setTextColor(TFT_ORANGE, TFT_BLACK);
  tft.drawString("LIVE COUNT", 10, 320, 2);
  tft.setTextColor(TFT_GREENYELLOW, TFT_BLACK);
  tft.drawString("(This Minute):", 10, 340, 2);
  tft.setTextColor(TFT_ORANGE, TFT_BLACK);
  tft.drawString(String(strokeCount), 120, 320, 6);
  
  // Show buffered stroke notification
  if (failedStrokeCount > 0) {
    tft.setTextColor(TFT_ORANGE, TFT_BLACK);
    tft.drawString("Buffered Strokes: " + String(failedStrokeCount), 10, 365, 4);
    tft.drawString("(Waiting for Internet...)", 10, 385, 4);
  }
  
  // Display Loss
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawString("LOSS:", 10, 415, 2);
  String lossReason = currentSettings.lossReasons.length() > 0 ? currentSettings.lossReasons : "None";
  tft.drawString(lossReason, 10, 430, 4);
  
  // Status bar
  uint16_t wifiColor = WiFi.status() == WL_CONNECTED ? TFT_GREEN : TFT_RED;
  tft.setTextColor(wifiColor, TFT_BLACK);
  tft.drawString("WiFi: " + String(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected"), 10, 460, 4);

  if (WiFi.status() == WL_CONNECTED) {
    isInitialDisplay = false;
  }
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  if (USE_DUAL_SWITCH_MODE) {
    dualSwitchMode();
  } else {
    singleSwitchMode();
  }

  // Update display 5 seconds after receiving settings response
  if (lastSettingsResponse > 0 && (millis() - lastSettingsResponse >= 5000)) {
    lastSettingsResponse = 0;
    // Force full display update (same as old Google Sheets code)
    forceFullDisplayUpdate();
    Serial.println("5-second display update triggered after settings response");
  }
  
  // Update display 5 seconds after data send failure
  if (lastDataSendFailure > 0 && (millis() - lastDataSendFailure >= 5000)) {
    lastDataSendFailure = 0;
    // Force full display update
    forceFullDisplayUpdate();
    Serial.println("5-second display update triggered after data send failure");
  }
  
  // Background display reinitialization at configured interval
  if (millis() - lastDisplayReinit >= (displayAutoRefreshMinutes * 60000)) {
    reinitializeDisplayBackground();
    forceFullDisplayUpdate();
    Serial.println("Display content restored after reinitialization");
  }
  
  reconnectWiFiIfNeeded();
}

// ============================================================================
// DUAL SWITCH MODE
// ============================================================================
void dualSwitchMode() {
  startLimitCurrentState = digitalRead(startLimitPin);
  endLimitCurrentState = digitalRead(endLimitPin);

  static bool lastStartState = HIGH;
  static bool lastEndState = HIGH;
  static StrokeState lastReportedState = WAITING_FOR_START;
  
  if (startLimitCurrentState != lastStartState || 
      endLimitCurrentState != lastEndState || 
      currentStrokeState != lastReportedState) {
    
    Serial.print("Switch States Changed - Start (D15): ");
    Serial.print(startLimitCurrentState ? "HIGH" : "LOW");
    Serial.print(" | End (D19): ");
    Serial.print(endLimitCurrentState ? "HIGH" : "LOW");
    Serial.print(" | State: ");
    Serial.println(currentStrokeState == WAITING_FOR_START ? "WAITING_FOR_START" : "WAITING_FOR_END");
    
    lastStartState = startLimitCurrentState;
    lastEndState = endLimitCurrentState;
    lastReportedState = currentStrokeState;
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (startLimitPrevState == HIGH && startLimitCurrentState == LOW) {
      Serial.println("=== START SWITCH ACTIVATED ===");
      if (currentStrokeState == WAITING_FOR_START) {
        currentStrokeState = WAITING_FOR_END;
        Serial.println("✓ Stroke start detected - waiting for end");
      } else {
        Serial.println("✗ Start switch activated but already waiting for end");
      }
      lastDebounceTime = millis();
    } else if (startLimitPrevState == LOW && startLimitCurrentState == HIGH) {
      Serial.println("Start switch released");
      lastDebounceTime = millis();
    }
    
    if (endLimitPrevState == HIGH && endLimitCurrentState == LOW) {
      Serial.println("=== END SWITCH ACTIVATED ===");
      if (currentStrokeState == WAITING_FOR_END) {
        noInterrupts();
        strokeCount++;
        interrupts();
        currentStrokeState = WAITING_FOR_START;
        lastDebounceTime = millis();
        
        Serial.println("✓ Complete stroke detected!");
        Serial.print("✓ Stroke Count: ");
        Serial.println(strokeCount);
        
        updateLiveCountOnly();
        lastDisplayUpdate = millis();
      } else {
        Serial.println("✗ End switch activated but not in WAITING_FOR_END state");
      }
    } else if (endLimitPrevState == LOW && endLimitCurrentState == HIGH) {
      Serial.println("End switch released");
      lastDebounceTime = millis();
    }
  }

  startLimitPrevState = startLimitCurrentState;
  endLimitPrevState = endLimitCurrentState;
}

// ============================================================================
// SINGLE SWITCH MODE
// ============================================================================
void singleSwitchMode() {
  startLimitCurrentState = digitalRead(startLimitPin);

  static bool lastReportedState = HIGH;
  if (startLimitCurrentState != lastReportedState) {
    Serial.print("Switch State Changed: ");
    Serial.print(startLimitCurrentState ? "HIGH" : "LOW");
    Serial.print(" | Prev: ");
    Serial.print(startLimitPrevState ? "HIGH" : "LOW");
    Serial.println(" | Mode: SINGLE SWITCH");
    lastReportedState = startLimitCurrentState;
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (startLimitPrevState == HIGH && startLimitCurrentState == LOW) {
      lastDebounceTime = millis();
      Serial.println("Switch pressed (HIGH → LOW)");
    } 
    else if (startLimitPrevState == LOW && startLimitCurrentState == HIGH) {
      noInterrupts();
      strokeCount++;
      interrupts();
      lastDebounceTime = millis();
      
      Serial.println("=== STROKE DETECTED ===");
      Serial.println("✓ Switch released (LOW → HIGH)");
      Serial.print("✓ Stroke Count: ");
      Serial.println(strokeCount);
      
      updateLiveCountOnly();
      lastDisplayUpdate = millis();
    }
  }

  startLimitPrevState = startLimitCurrentState;
}

// ============================================================================
// DISPLAY UPDATE FUNCTIONS
// ============================================================================
void updateLiveCountOnly() {
  tft.fillRect(120, 320, 200, 40, TFT_BLACK);
  tft.setTextColor(TFT_ORANGE, TFT_BLACK);
  tft.drawString(String(strokeCount), 120, 320, 6);
}

void updateTargetAndTotalOnly() {
  tft.fillRect(120, 205, 200, 40, TFT_BLACK);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.drawString(currentSettings.targetCount, 120, 205, 6);
  
  int currentTotalCount = currentSettings.actualCount.toInt() + failedStrokeCount;
  tft.fillRect(120, 265, 200, 40, TFT_BLACK);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.drawString(String(currentTotalCount), 120, 265, 6);
}

void updateBufferedStrokeDisplay() {
  tft.fillRect(10, 365, 300, 40, TFT_BLACK);
  
  if (failedStrokeCount > 0) {
    tft.setTextColor(TFT_ORANGE, TFT_BLACK);
    tft.drawString("Buffered Strokes: " + String(failedStrokeCount), 10, 365, 4);
    tft.drawString("(Waiting for Internet...)", 10, 385, 4);
  }
}

// Force full display update - bypasses change detection
// Used after settings response or data send failure
void forceFullDisplayUpdate() {
  int currentTotalCount = currentSettings.actualCount.toInt() + failedStrokeCount;
  
  // Clear entire screen
  tft.fillScreen(TFT_BLACK);
  
  // Display machine info at top
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString("Machine:", 10, 5, 2);
  tft.drawString(String(machineNo), 10, 25, 4);
  
  // Display Part
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawString("Part:", 10, 55, 2);
  tft.drawString(currentSettings.partName, 10, 75, 4);
  
  // Display Operation
  tft.drawString("Operation:", 10, 105, 2);
  tft.drawString(currentSettings.operation, 10, 125, 4);
  
  // Display Operator
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString("Operator:", 10, 155, 2);
  tft.drawString(currentSettings.operatorCode, 10, 175, 4);
  
  // Display Target
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.drawString("TARGET:", 10, 205, 2);
  tft.drawString(currentSettings.targetCount, 120, 205, 6);
  
  // Display Total
  tft.drawString("TOTAL:", 10, 265, 2);
  tft.drawString(String(currentTotalCount), 120, 265, 6);
  
  // Current minute strokes - LIVE COUNT
  tft.setTextColor(TFT_ORANGE, TFT_BLACK);
  tft.drawString("LIVE COUNT", 10, 320, 2);
  tft.setTextColor(TFT_GREENYELLOW, TFT_BLACK);
  tft.drawString("(This Minute):", 10, 340, 2);
  tft.setTextColor(TFT_ORANGE, TFT_BLACK);
  tft.drawString(String(strokeCount), 120, 320, 6);
  
  // Show buffered stroke notification only if there are failed strokes
  if (failedStrokeCount > 0) {
    tft.setTextColor(TFT_ORANGE, TFT_BLACK);
    tft.drawString("Buffered Strokes: " + String(failedStrokeCount), 10, 365, 4);
    tft.drawString("(Waiting for Internet...)", 10, 385, 4);
  }
  
  // Display Loss
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawString("LOSS:", 10, 415, 2);
  String lossReason = currentSettings.lossReasons.length() > 0 ? currentSettings.lossReasons : "None";
  tft.drawString(lossReason, 10, 430, 4);
  
  // Status bar
  uint16_t wifiColor = WiFi.status() == WL_CONNECTED ? TFT_GREEN : TFT_RED;
  tft.setTextColor(wifiColor, TFT_BLACK);
  tft.drawString("WiFi: " + String(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected"), 10, 460, 4);
  
  // Update tracking variables to current values
  lastStrokeCount = strokeCount;
  lastWiFiStatus = (WiFi.status() == WL_CONNECTED);
  lastTotalCount = currentTotalCount;
  lastTargetCount = currentSettings.targetCount;
  lastActualCount = currentSettings.actualCount;
  lastFailedStrokeCount = failedStrokeCount;
  lastDisplayUpdate = millis();
}

void reinitializeDisplayBackground() {
  tft.init();
  tft.setRotation(2);
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(1);
  
  lastDisplayReinit = millis();
  
  Serial.println("Display reinitialized in background");
  // Note: forceFullDisplayUpdate() will be called after this to restore content
}

// ============================================================================
// WIFI FUNCTIONS
// ============================================================================
void connectToWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Attempting to connect to Wi-Fi...");
    WiFi.begin(ssid, password);
  }
}

void reconnectWiFiIfNeeded() {
  if (WiFi.status() != WL_CONNECTED && (millis() - lastReconnectAttempt >= reconnectInterval)) {
    lastReconnectAttempt = millis();  
    connectToWiFi();  
  }
}

// ============================================================================
// URL ENCODE HELPER
// ============================================================================
String urlEncode(String str) {
  String encoded = "";
  char c;
  for (int i = 0; i < str.length(); i++) {
    c = str.charAt(i);
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += c;
    } else if (c == ' ') {
      encoded += "%20";
    } else {
      encoded += "%";
      if (c < 16) encoded += "0";
      encoded += String(c, HEX);
    }
  }
  return encoded;
}

// ============================================================================
// FETCH SETTINGS FROM SUPABASE
// ============================================================================
bool fetchSettingsFromSupabase() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Cannot fetch settings.");
    return false;
  }

  HTTPClient http;
  
  String encodedPlant = urlEncode(String(plant));
  String encodedMachine = urlEncode(String(machineNo));
  String url = String(supabaseUrl) + "/rest/v1/" + String(settingsTable) + 
               "?plant=eq." + encodedPlant + 
               "&machine=eq." + encodedMachine + 
               "&order=timestamp.desc&limit=1";
  
  Serial.print("Fetching settings from: ");
  Serial.println(url);
  
  http.begin(url);
  http.addHeader("apikey", supabaseAnonKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseAnonKey));
  http.addHeader("Content-Type", "application/json");

  int httpResponseCode = http.GET();

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("Settings response: ");
    Serial.println(response);
    
    StaticJsonDocument<2048> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (!error && doc.is<JsonArray>()) {
      if (doc.size() > 0) {
        JsonObject settings = doc[0];
        
        currentSettings.plant = settings["plant"].as<String>();
        currentSettings.partNo = settings["part_no"].as<String>();
        currentSettings.partName = settings["part_name"].as<String>();
        currentSettings.operation = settings["operation"].as<String>();
        currentSettings.cycleTime = settings["cycle_time"].as<String>();
        currentSettings.partCountPerCycle = settings["part_count_per_cycle"].as<String>();
        currentSettings.inspection = settings["inspection_applicability"].as<String>();
        currentSettings.cellName = settings["cell_name"].as<String>();
        currentSettings.cellLeader = settings["cell_leader"].as<String>();
        currentSettings.workStations = settings["workstations"].as<String>();
        currentSettings.mandays = settings["mandays"].as<String>();
        currentSettings.toolCode = settings["tool_code"].as<String>();
        currentSettings.operatorCode = settings["operator_code"].as<String>();
        currentSettings.lossReasons = settings["loss_reason"].as<String>();
        currentSettings.targetCount = settings["target_count"].as<String>();
        currentSettings.actualCount = settings["actual_count"].as<String>();
        
        Serial.println("Settings received successfully");
        Serial.print("Target Count: ");
        Serial.println(currentSettings.targetCount);
        Serial.print("Actual Count: ");
        Serial.println(currentSettings.actualCount);
      } else {
        Serial.println("No settings found for this Plant + Machine. Using blank values.");
        currentSettings.plant = String(plant);
        currentSettings.partNo = "";
        currentSettings.partName = "";
        currentSettings.operation = "";
        currentSettings.cycleTime = "";
        currentSettings.partCountPerCycle = "";
        currentSettings.inspection = "";
        currentSettings.cellName = "";
        currentSettings.cellLeader = "";
        currentSettings.workStations = "";
        currentSettings.mandays = "";
        currentSettings.toolCode = "";
        currentSettings.operatorCode = "";
        currentSettings.lossReasons = "";
        currentSettings.targetCount = "0";
        currentSettings.actualCount = "0";
      }
      
      lastSettingsResponse = millis();
      Serial.println("Display will update in 5 seconds");
      
      http.end();
      return true;
    } else {
      Serial.print("JSON parse error: ");
      if (error) {
        Serial.println(error.c_str());
      } else {
        Serial.println("Response is not a JSON array");
      }
    }
  } else {
    Serial.print("Error fetching settings: ");
    Serial.println(httpResponseCode);
  }
  
  http.end();
  return false;
}

// ============================================================================
// SEND DATA TO SUPABASE TASK
// ============================================================================
void sendDataToSupabaseTask(void* parameter) {
  for (;;) {
    if (millis() - lastSendTime >= sendInterval) {
      lastSendTime = millis();

      int totalStrokes;
      noInterrupts();
      totalStrokes = strokeCount + failedStrokeCount;
      failedStrokeCount = 0;
      strokeCount = 0;
      interrupts();

      if (WiFi.status() == WL_CONNECTED) {
        // First fetch latest settings
        if (!fetchSettingsFromSupabase()) {
          Serial.println("Failed to fetch settings");
          noInterrupts();
          failedStrokeCount = totalStrokes;
          interrupts();
          lastDataSendFailure = millis();
          vTaskDelay(1000 / portTICK_PERIOD_MS);
          continue;
        }

        // Prepare the data payload
        StaticJsonDocument<1024> doc;
        
        // Core identifiers from ESP32
        doc["Plant"] = plant;
        doc["Machine No."] = machineNo;
        doc["Value"] = totalStrokes;

        // Text fields (only if not empty)
        if (currentSettings.partNo.length() > 0) {
          doc["Part No."] = currentSettings.partNo;
        }
        if (currentSettings.partName.length() > 0) {
          doc["Part Name"] = currentSettings.partName;
        }
        if (currentSettings.operation.length() > 0) {
          doc["Operation"] = currentSettings.operation;
        }
        if (currentSettings.inspection.length() > 0) {
          doc["Inspection Applicability"] = currentSettings.inspection;
        }
        if (currentSettings.cellName.length() > 0) {
          doc["Cell Name"] = currentSettings.cellName;
        }
        if (currentSettings.cellLeader.length() > 0) {
          doc["Cell Leader"] = currentSettings.cellLeader;
        }
        if (currentSettings.toolCode.length() > 0) {
          doc["Tool Code"] = currentSettings.toolCode;
        }
        if (currentSettings.operatorCode.length() > 0) {
          doc["Operator Code"] = currentSettings.operatorCode;
        }
        if (currentSettings.lossReasons.length() > 0) {
          doc["Loss Reasons"] = currentSettings.lossReasons;
        }

        // Numeric fields (send as numbers, only if non-empty)
        if (currentSettings.cycleTime.length() > 0) {
          doc["Cycle Time"] = currentSettings.cycleTime.toInt();
        }
        if (currentSettings.partCountPerCycle.length() > 0) {
          doc["Part Count Per Cycle"] = currentSettings.partCountPerCycle.toInt();
        }
        if (currentSettings.workStations.length() > 0) {
          doc["Work Stations"] = currentSettings.workStations.toInt();
        }
        if (currentSettings.mandays.length() > 0) {
          doc["Mandays"] = currentSettings.mandays.toInt();
        }

        String jsonPayload;
        serializeJson(doc, jsonPayload);

        // Send data to Supabase
        HTTPClient http;
        String url = String(supabaseUrl) + "/rest/v1/" + String(iotDatabaseTable);
        
        http.begin(url);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("apikey", supabaseAnonKey);
        http.addHeader("Authorization", "Bearer " + String(supabaseAnonKey));
        http.addHeader("Prefer", "return=minimal");

        Serial.println("\nSending data to Supabase:");
        Serial.print("URL: ");
        Serial.println(url);
        Serial.print("Payload: ");
        Serial.println(jsonPayload);

        int httpResponseCode = http.POST(jsonPayload);
        if (httpResponseCode > 0) {
          Serial.print("HTTP Response code: ");
          Serial.println(httpResponseCode);
          
          if (httpResponseCode == 201) {
            Serial.println("Data successfully sent to Supabase!");
            
            // Fetch new settings after successful data send
            if (fetchSettingsFromSupabase()) {
              Serial.println("Settings updated successfully");
            } else {
              Serial.println("Failed to update settings");
            }
          } else {
            String response = http.getString();
            Serial.print("Response: ");
            Serial.println(response);
            noInterrupts();
            failedStrokeCount = totalStrokes;
            interrupts();
            lastDataSendFailure = millis();
          }
        } else {
          Serial.print("Error sending data: ");
          Serial.println(httpResponseCode);
          Serial.println(http.errorToString(httpResponseCode));
          noInterrupts();
          failedStrokeCount = totalStrokes;
          interrupts();
          lastDataSendFailure = millis();
        }

        http.end();
      } else {
        Serial.println("Wi-Fi disconnected!");
        noInterrupts();
        failedStrokeCount = totalStrokes;
        interrupts();
        lastDataSendFailure = millis();
      }
    }
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
}

