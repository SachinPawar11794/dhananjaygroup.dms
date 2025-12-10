/*
 * ESP32 Stroke Counter -> Supabase
 * Replaces Google Sheets integration with Supabase REST API.
 * Buffering and display logic are kept from the previous program.
 */

 #include <WiFi.h>
 #include <HTTPClient.h>
 #include <ArduinoJson.h>
 #include <TFT_eSPI.h>
 #include <SPI.h>
 #include <time.h>
 #include <math.h>
 
 // ============================================================================
 // NETWORK CONFIGURATION
 // ============================================================================
 const char* ssid = "Sachin";       // Wi-Fi SSID
 const char* password = "Til12345"; // Wi-Fi password
 
 // ============================================================================
 // SUPABASE CONFIGURATION
 // ============================================================================
 const char* supabaseUrl = "https://tzoloagoaysipwxuyldu.supabase.co";
 const char* supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6b2xvYWdvYXlzaXB3eHV5bGR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MDM3MzIsImV4cCI6MjA3ODk3OTczMn0.BwC-uFnlkWtaGNVEee4VFuL-trsdz1aawDC77F3afWk";
 const char* iotDatabaseTable = "IoT%20Database";  // URL-encoded table name
 const char* settingsTable = "settings";
 const char* shiftScheduleTable = "ShiftSchedule"; // Supabase shift schedule table
 // Optional: leave empty when shift schedule uses the same plant value as device.
 const char* shiftSchedulePlantFallback = "";
 
 // ============================================================================
 // MACHINE CONFIGURATION
 // ============================================================================
const char* machineNo = "10000707_500_SUMMITO"; // Must match settings."Machine No."
 const char* plant = "DMCPLI_3001";              // Must match settings.plant
 const long gmtOffsetSeconds = 19800;            // UTC+5:30 for shift/time calculations
 const int daylightOffsetSeconds = 0;
 
 // ============================================================================
 // STROKE DETECTION CONFIGURATION
 // ============================================================================
 const bool USE_DUAL_SWITCH_MODE = false; // true = dual switch, false = single switch
 const bool SWITCH_NORMALLY_OPEN = true;  // true = NO, false = NC
 
 const int startLimitPin = 15; // D15
 const int endLimitPin = 19;   // D19 (dual mode only)
 const unsigned long debounceDelay = 50;
 
 // ============================================================================
 // DISPLAY CONFIGURATION
 // ============================================================================
 const unsigned long displayAutoRefreshMinutes = 30;
 
 // ============================================================================
 // DATA TRANSMISSION CONFIGURATION
 // ============================================================================
 const unsigned long sendInterval = 60000;     // 1 minute
 const unsigned long reconnectInterval = 5000; // 5 seconds
 
 // ============================================================================
 // PROGRAM VARIABLES (DO NOT MODIFY)
 // ============================================================================
 TFT_eSPI tft = TFT_eSPI();
 
 unsigned long lastDisplayUpdate = 0;
 unsigned long lastDisplayReferenceResponse = 0;
 unsigned long lastDataSendFailure = 0;
 unsigned long lastDisplayReinit = 0;
 
 int lastStrokeCount = 0;
 bool lastWiFiStatus = false;
 int lastTotalCount = 0;
 String lastTargetCount = "";
 String lastActualCount = "";
 int lastFailedStrokeCount = 0;
 
 volatile int strokeCount = 0;
 volatile int failedStrokeCount = 0;
 bool startLimitPrevState = HIGH;
 bool startLimitCurrentState = HIGH;
 bool endLimitPrevState = HIGH;
 bool endLimitCurrentState = HIGH;
 unsigned long lastDebounceTime = 0;
 
 enum StrokeState { WAITING_FOR_START, WAITING_FOR_END };
 StrokeState currentStrokeState = WAITING_FOR_START;
 
 unsigned long lastSendTime = 0;
 unsigned long lastReconnectAttempt = 0;
 TaskHandle_t supabaseTaskHandle;
 
 // Shift schedule cache
 struct ShiftSlot {
   int startMinutes; // minutes from 00:00
   int endMinutes;   // minutes from 00:00, may be >= 1440 when wrapping
   String shiftCode;
 };
 ShiftSlot shiftSlots[32];
 int shiftSlotCount = 0;
 unsigned long lastShiftFetch = 0;
 
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
 // HELPER FUNCTIONS
 // ============================================================================
 long parseLongSafe(const String& value) {
   if (value.length() == 0) return 0;
   return (long) value.toFloat(); // handles "4.00" -> 4
 }
 
 bool parseTimeRange(const String& range, int& startMins, int& endMins) {
   // Expected format: "HH:MM - HH:MM"
   int dash = range.indexOf('-');
   if (dash < 0) return false;
   String left = range.substring(0, dash);
   String right = range.substring(dash + 1);
   left.trim();
   right.trim();
   int colonL = left.indexOf(':');
   int colonR = right.indexOf(':');
   if (colonL < 0 || colonR < 0) return false;
   int lh = left.substring(0, colonL).toInt();
   int lm = left.substring(colonL + 1).toInt();
   int rh = right.substring(0, colonR).toInt();
   int rm = right.substring(colonR + 1).toInt();
   startMins = lh * 60 + lm;
   endMins = rh * 60 + rm;
   if (endMins < startMins) endMins += 24 * 60; // wrap past midnight
   return true;
 }
 
 String formatDateYMD(const tm& t) {
   char buf[11];
   snprintf(buf, sizeof(buf), "%04d-%02d-%02d", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday);
   return String(buf);
 }
 
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
 
 String getIsoTimestamp(time_t now) {
   struct tm timeinfo;
   gmtime_r(&now, &timeinfo); // UTC
   char buffer[25];
   strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo); // UTC
   return String(buffer);
 }
 
 bool fetchShiftSchedule(const char* plantForSchedule = nullptr) {
   if (WiFi.status() != WL_CONNECTED) {
     Serial.println("Wi-Fi not connected. Cannot fetch shift schedule.");
     return false;
   }
   const char* plantFilter = plantForSchedule ? plantForSchedule : plant;
   HTTPClient http;
   String url = String(supabaseUrl) + "/rest/v1/" + shiftScheduleTable +
                "?select=Shift,Time,Plant" +
                "&Plant=eq." + plantFilter;
 
   Serial.print("Fetching shift schedule from: ");
   Serial.println(url);
 
   http.begin(url);
   addSupabaseHeaders(http);
 
   int code = http.GET();
   if (code <= 0) {
     Serial.print("Error fetching shift schedule: ");
     Serial.println(code);
     http.end();
     return false;
   }
 
   String response = http.getString();
   Serial.print("Shift schedule response: ");
   Serial.println(response);
 
   StaticJsonDocument<4096> doc;
   if (deserializeJson(doc, response)) {
     Serial.println("Failed to parse shift schedule");
     http.end();
     return false;
   }
   if (!doc.is<JsonArray>()) {
     Serial.println("Shift schedule not array");
     http.end();
     return false;
   }
 
   shiftSlotCount = 0;
   for (JsonObject item : doc.as<JsonArray>()) {
     if (!item.containsKey("Time") || !item.containsKey("Shift")) continue;
     int sM = 0, eM = 0;
     if (!parseTimeRange(item["Time"].as<String>(), sM, eM)) continue;
     if (shiftSlotCount < (int)(sizeof(shiftSlots) / sizeof(shiftSlots[0]))) {
       shiftSlots[shiftSlotCount].startMinutes = sM;
       shiftSlots[shiftSlotCount].endMinutes = eM;
       shiftSlots[shiftSlotCount].shiftCode = item["Shift"].as<String>();
       shiftSlotCount++;
     }
   }
   http.end();
   lastShiftFetch = millis();
   Serial.print("Loaded shift slots: ");
   Serial.println(shiftSlotCount);
   if (shiftSlotCount == 0) {
     Serial.println("WARNING: No shift slots loaded. Check ShiftSchedule data/plant filter.");
   }
   return shiftSlotCount > 0;
 }
 
 bool resolveShiftAndWorkday(time_t nowUtc, String& shiftOut, String& workdayOut) {
   struct tm localTime;
   if (!localtime_r(&nowUtc, &localTime)) {
     Serial.println("Failed to get local time for shift");
     return false;
   }
   int minutes = localTime.tm_hour * 60 + localTime.tm_min;
 
   // Work day date: day starts at 07:00; before 07:00 belongs to previous day
   tm workday = localTime;
   if (minutes < 7 * 60) {
     // move to previous day
     time_t tnow = mktime(&localTime);
     tnow -= 24 * 60 * 60;
     localtime_r(&tnow, &workday);
   }
   workdayOut = formatDateYMD(workday);
 
   // Resolve shift from cached slots
   shiftOut = "NA";
   int minutesAlt = minutes + 24 * 60; // for wrapped ranges
   Serial.print("Shift resolve - local time: ");
   Serial.print(localTime.tm_hour);
   Serial.print(":");
   Serial.print(localTime.tm_min);
   Serial.print(" (");
   Serial.print(minutes);
   Serial.print(" mins), slots=");
   Serial.println(shiftSlotCount);
   for (int i = 0; i < shiftSlotCount; i++) {
     ShiftSlot& slot = shiftSlots[i];
     Serial.print("  slot ");
     Serial.print(i);
     Serial.print(": ");
     Serial.print(slot.startMinutes);
     Serial.print("->");
     Serial.print(slot.endMinutes);
     Serial.print(" shift ");
     Serial.println(slot.shiftCode);
     if ((minutes >= slot.startMinutes && minutes < slot.endMinutes) ||
         (minutesAlt >= slot.startMinutes && minutesAlt < slot.endMinutes)) {
       shiftOut = slot.shiftCode;
       Serial.print("Matched shift: ");
       Serial.println(shiftOut);
       break;
     }
   }
   if (shiftOut == "NA") {
     Serial.println("No matching shift found; sending NA.");
   }
   return true;
 }
 
 // ============================================================================
 // DISPLAY FUNCTIONS
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
 
 void reinitializeDisplayBackground() {
   tft.init();
   tft.setRotation(2);
   tft.fillScreen(TFT_BLACK);
   tft.setTextColor(TFT_WHITE, TFT_BLACK);
   tft.setTextSize(1);
 
   lastDisplayReinit = millis();
 
   lastStrokeCount = -1;
   lastWiFiStatus = !(WiFi.status() == WL_CONNECTED);
   lastTotalCount = -1;
   lastTargetCount = "";
   lastActualCount = "";
   lastFailedStrokeCount = -1;
 }
 
 void updateDisplay() {
   static bool isInitialDisplay = true;
 
   bool needsUpdate = false;
 
   if (strokeCount != lastStrokeCount) {
     needsUpdate = true;
     lastStrokeCount = strokeCount;
   }
 
   bool currentWiFiStatus = (WiFi.status() == WL_CONNECTED);
   if (currentWiFiStatus != lastWiFiStatus) {
     needsUpdate = true;
     lastWiFiStatus = currentWiFiStatus;
   }
 
   int currentTotalCount = currentSettings.actualCount.toInt() + failedStrokeCount;
   if (currentTotalCount != lastTotalCount) {
     needsUpdate = true;
     lastTotalCount = currentTotalCount;
   }
 
   if (currentSettings.targetCount != lastTargetCount) {
     lastTargetCount = currentSettings.targetCount;
     updateTargetAndTotalOnly();
     lastDisplayUpdate = millis();
   }
 
   if (currentSettings.actualCount != lastActualCount) {
     lastActualCount = currentSettings.actualCount;
     updateTargetAndTotalOnly();
     lastDisplayUpdate = millis();
   }
 
   if (failedStrokeCount != lastFailedStrokeCount) {
     lastFailedStrokeCount = failedStrokeCount;
     updateBufferedStrokeDisplay();
     lastDisplayUpdate = millis();
   }
 
   if (!needsUpdate && !isInitialDisplay) {
     return;
   }
 
   tft.fillScreen(TFT_BLACK);
 
   tft.setTextColor(TFT_CYAN, TFT_BLACK);
   // Top row: machine + plant without pushing other rows down
   tft.drawString("Machine:", 10, 5, 2);
   tft.drawString(String(machineNo), 10, 25, 4);
 
   tft.setTextColor(TFT_GREEN, TFT_BLACK);
   tft.drawString("Part:", 10, 55, 2);
   tft.drawString(currentSettings.partName, 10, 75, 4);
 
   tft.drawString("Operation:", 10, 105, 2);
   tft.drawString(currentSettings.operation, 10, 125, 4);
 
   tft.setTextColor(TFT_CYAN, TFT_BLACK);
   tft.drawString("Operator:", 10, 155, 2);
   tft.drawString(currentSettings.operatorCode, 10, 175, 4);
 
   tft.setTextColor(TFT_YELLOW, TFT_BLACK);
   tft.drawString("TARGET:", 10, 205, 2);
   tft.drawString(currentSettings.targetCount, 120, 205, 6);
 
   tft.drawString("TOTAL:", 10, 265, 2);
   tft.drawString(String(currentTotalCount), 120, 265, 6);
 
   tft.setTextColor(TFT_ORANGE, TFT_BLACK);
   tft.drawString("LIVE COUNT", 10, 320, 2);
   tft.setTextColor(TFT_GREENYELLOW, TFT_BLACK);
   tft.drawString("(This Minute):", 10, 340, 2);
   tft.setTextColor(TFT_ORANGE, TFT_BLACK);
   tft.drawString(String(strokeCount), 120, 320, 6);
 
   if (failedStrokeCount > 0) {
     tft.setTextColor(TFT_ORANGE, TFT_BLACK);
     tft.drawString("Buffered Strokes: " + String(failedStrokeCount), 10, 365, 4);
     tft.drawString("(Waiting for Internet...)", 10, 385, 4);
   }
 
   tft.setTextColor(TFT_GREEN, TFT_BLACK);
   tft.drawString("LOSS:", 10, 415, 2);
   String lossReason = currentSettings.lossReasons.length() > 0 ? currentSettings.lossReasons : "None";
   tft.drawString(lossReason, 10, 430, 4);
 
   uint16_t wifiColor = WiFi.status() == WL_CONNECTED ? TFT_GREEN : TFT_RED;
   tft.setTextColor(wifiColor, TFT_BLACK);
   tft.drawString("WiFi: " + String(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected"), 10, 460, 4);
 
   if (WiFi.status() == WL_CONNECTED) {
     isInitialDisplay = false;
   }
 }
 
 // ============================================================================
 // STROKE DETECTION
 // ============================================================================
 void dualSwitchMode() {
   startLimitCurrentState = digitalRead(startLimitPin);
   endLimitCurrentState = digitalRead(endLimitPin);
 
   static bool lastStartState = HIGH;
   static bool lastEndState = HIGH;
   static StrokeState lastReportedState = WAITING_FOR_START;
 
   if (startLimitCurrentState != lastStartState || endLimitCurrentState != lastEndState || currentStrokeState != lastReportedState) {
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
       if (currentStrokeState == WAITING_FOR_START) {
         currentStrokeState = WAITING_FOR_END;
         Serial.println("✓ Stroke start detected - waiting for end");
       }
       lastDebounceTime = millis();
     } else if (startLimitPrevState == LOW && startLimitCurrentState == HIGH) {
       lastDebounceTime = millis();
     }
 
     if (endLimitPrevState == HIGH && endLimitCurrentState == LOW) {
       if (currentStrokeState == WAITING_FOR_END) {
         noInterrupts();
         strokeCount++;
         interrupts();
         currentStrokeState = WAITING_FOR_START;
         lastDebounceTime = millis();
         Serial.println("✓ Complete stroke detected!");
         updateLiveCountOnly();
         lastDisplayUpdate = millis();
       }
     } else if (endLimitPrevState == LOW && endLimitCurrentState == HIGH) {
       lastDebounceTime = millis();
     }
   }
 
   startLimitPrevState = startLimitCurrentState;
   endLimitPrevState = endLimitCurrentState;
 }
 
 void singleSwitchMode() {
   startLimitCurrentState = digitalRead(startLimitPin);
 
   static bool lastReportedState = HIGH;
   if (startLimitCurrentState != lastReportedState) {
     Serial.print("Switch State Changed: ");
     Serial.print(startLimitCurrentState ? "HIGH" : "LOW");
     Serial.print(" | Prev: ");
     Serial.println(startLimitPrevState ? "HIGH" : "LOW");
     lastReportedState = startLimitCurrentState;
   }
 
   if ((millis() - lastDebounceTime) > debounceDelay) {
     if (startLimitPrevState == HIGH && startLimitCurrentState == LOW) {
       lastDebounceTime = millis();
     } else if (startLimitPrevState == LOW && startLimitCurrentState == HIGH) {
       noInterrupts();
       strokeCount++;
       interrupts();
       lastDebounceTime = millis();
       Serial.println("=== STROKE DETECTED ===");
       updateLiveCountOnly();
       lastDisplayUpdate = millis();
     }
   }
 
   startLimitPrevState = startLimitCurrentState;
 }
 
 // ============================================================================
 // SUPABASE HELPERS
 // ============================================================================
 void addSupabaseHeaders(HTTPClient& http) {
   http.addHeader("apikey", supabaseAnonKey);
   http.addHeader("Authorization", String("Bearer ") + supabaseAnonKey);
   http.addHeader("Content-Type", "application/json");
 }
 
 bool fetchSettingsData() {
   if (WiFi.status() != WL_CONNECTED) {
     Serial.println("Wi-Fi not connected. Cannot fetch settings.");
     return false;
   }
 
   HTTPClient http;
  // Note: column has been renamed to "Machine No." in settings. Use URL encoding for spaces.
  String url = String(supabaseUrl) + "/rest/v1/" + settingsTable +
               "?select=plant,part_no,part_name,operation,cycle_time,part_count_per_cycle,inspection_applicability,cell_name,cell_leader,workstations,mandays,tool_code,operator_code,loss_reason,target_count,actual_count,%22Machine%20No.%22" +
               "&plant=eq." + plant +
               "&%22Machine%20No.%22=eq." + machineNo +
               "&limit=1";
 
   Serial.print("Fetching settings from: ");
   Serial.println(url);
 
   http.begin(url);
   addSupabaseHeaders(http);
 
   int httpResponseCode = http.GET();
   if (httpResponseCode <= 0) {
     Serial.print("Error fetching settings: ");
     Serial.println(httpResponseCode);
     http.end();
     return false;
   }
 
   String response = http.getString();
   Serial.print("Settings response: ");
   Serial.println(response);
 
   StaticJsonDocument<2048> doc;
   DeserializationError error = deserializeJson(doc, response);
   if (error || !doc.is<JsonArray>() || doc.as<JsonArray>().size() == 0) {
     Serial.println("Failed to parse settings JSON or no data");
     http.end();
     return false;
   }
 
   JsonObject row = doc[0];
   currentSettings.plant = row["plant"] | "";
   currentSettings.partNo = row["part_no"] | "";
   currentSettings.partName = row["part_name"] | "";
   currentSettings.operation = row["operation"] | "";
   currentSettings.cycleTime = row["cycle_time"].isNull() ? "" : String(row["cycle_time"].as<float>());
   currentSettings.partCountPerCycle = row["part_count_per_cycle"].isNull() ? "" : String(row["part_count_per_cycle"].as<float>());
   currentSettings.inspection = row["inspection_applicability"] | "";
   currentSettings.cellName = row["cell_name"] | "";
   currentSettings.cellLeader = row["cell_leader"] | "";
   currentSettings.workStations = row["workstations"].isNull() ? "" : String(row["workstations"].as<float>());
   currentSettings.mandays = row["mandays"].isNull() ? "" : String(row["mandays"].as<float>());
   currentSettings.toolCode = row["tool_code"] | "";
   currentSettings.operatorCode = row["operator_code"] | "";
   currentSettings.lossReasons = row["loss_reason"] | "";
  currentSettings.targetCount = row["target_count"].isNull() ? "0" : String(row["target_count"].as<int>());
  currentSettings.actualCount = row["actual_count"].isNull() ? "0" : String(row["actual_count"].as<int>());
 
   lastDisplayReferenceResponse = millis();
   http.end();
   return true;
 }
 
 bool sendDataToSupabase(int totalStrokes) {
   if (WiFi.status() != WL_CONNECTED) {
     Serial.println("Wi-Fi disconnected. Cannot send data.");
     return false;
   }
 
   HTTPClient http;
   String url = String(supabaseUrl) + "/rest/v1/" + iotDatabaseTable;
   http.begin(url);
   addSupabaseHeaders(http);
   http.addHeader("Prefer", "return=representation");
 
   StaticJsonDocument<512> doc;
   JsonObject row = doc.to<JsonObject>();
 
   time_t now;
   time(&now);
   String isoTime = getIsoTimestamp(now);
   if (isoTime.length() > 0) {
     row["Timestamp"] = isoTime;
   }
   row["Part No."] = currentSettings.partNo;
   row["Part Name"] = currentSettings.partName;
   row["Operation"] = currentSettings.operation;
   row["Cycle Time"] = parseLongSafe(currentSettings.cycleTime);
   row["Part Count Per Cycle"] = parseLongSafe(currentSettings.partCountPerCycle);
   row["Inspection Applicability"] = currentSettings.inspection;
   row["Cell Name"] = currentSettings.cellName;
   row["Cell Leader"] = currentSettings.cellLeader;
   row["Work Stations"] = parseLongSafe(currentSettings.workStations);
   row["Mandays"] = parseLongSafe(currentSettings.mandays);
   row["Tool Code"] = currentSettings.toolCode;
   row["Operator Code"] = currentSettings.operatorCode;
   row["Loss Reasons"] = currentSettings.lossReasons;
   row["Machine No."] = machineNo;
   row["Value"] = totalStrokes;
   row["Plant"] = plant;
   String shiftCode, workdayDate;
   if (resolveShiftAndWorkday(now, shiftCode, workdayDate)) {
     row["Shift"] = shiftCode;
     row["Work Day Date"] = workdayDate;
   }
 
   String jsonString;
   serializeJson(doc, jsonString);
 
   Serial.println("\nSending data to Supabase:");
   Serial.print("URL: ");
   Serial.println(url);
   Serial.print("JSON Data: ");
   Serial.println(jsonString);
 
   int httpResponseCode = http.POST(jsonString);
   if (httpResponseCode > 0) {
     String response = http.getString();
     Serial.print("Supabase response: ");
     Serial.println(response);
     bool ok = httpResponseCode >= 200 && httpResponseCode < 300;
     http.end();
     return ok;
   } else {
     Serial.print("Error sending data to Supabase: ");
     Serial.println(httpResponseCode);
     http.end();
     return false;
   }
 }
 
 // ============================================================================
 // TASK: SEND DATA
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
         // Refresh shift schedule once per hour
         if (shiftSlotCount == 0 || (millis() - lastShiftFetch) > 3600000UL) {
           if (!fetchShiftSchedule()) {
             if (strlen(shiftSchedulePlantFallback) > 0 && String(shiftSchedulePlantFallback) != String(plant)) {
               fetchShiftSchedule(shiftSchedulePlantFallback);
             }
           }
         }
         if (!fetchSettingsData()) {
           Serial.println("Failed to fetch settings before send");
           noInterrupts();
           failedStrokeCount = totalStrokes;
           interrupts();
           lastDataSendFailure = millis();
           continue;
         }
 
         if (sendDataToSupabase(totalStrokes)) {
           Serial.println("Data sent successfully to Supabase");
           if (fetchSettingsData()) {
             Serial.println("Settings refreshed after send");
           } else {
             Serial.println("Failed to refresh settings after send");
           }
         } else {
           noInterrupts();
           failedStrokeCount = totalStrokes;
           interrupts();
           lastDataSendFailure = millis();
         }
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
 
 // ============================================================================
 // SETUP & LOOP
 // ============================================================================
 void setup() {
   Serial.begin(115200);
 
   tft.init();
   tft.setRotation(2);
   tft.fillScreen(TFT_BLACK);
   tft.setTextColor(TFT_WHITE, TFT_BLACK);
   tft.setTextSize(1);
   tft.drawString("Initializing...", 10, 10, 4);
 
   pinMode(startLimitPin, INPUT_PULLUP);
   pinMode(endLimitPin, INPUT_PULLUP);
 
   Serial.println("=== PIN TEST ===");
   Serial.print("Start Pin (D15) initial state: ");
   Serial.println(digitalRead(startLimitPin) ? "HIGH" : "LOW");
   Serial.print("End Pin (D19) initial state: ");
   Serial.println(digitalRead(endLimitPin) ? "HIGH" : "LOW");
   Serial.println("=== END PIN TEST ===");
 
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
 
   configTime(gmtOffsetSeconds, daylightOffsetSeconds, "pool.ntp.org", "time.nist.gov", "time.google.com");
 
   connectToWiFi();
   // Try device plant first; if none found, fall back to alternate plant name if provided
   if (!fetchShiftSchedule()) {
     if (strlen(shiftSchedulePlantFallback) > 0 && String(shiftSchedulePlantFallback) != String(plant)) {
       fetchShiftSchedule(shiftSchedulePlantFallback);
     }
   }
   fetchSettingsData();
   updateDisplay();
 
   xTaskCreate(
     sendDataToSupabaseTask,
     "Supabase Task",
     8192,
     NULL,
     1,
     &supabaseTaskHandle);
 }
 
 void loop() {
   if (USE_DUAL_SWITCH_MODE) {
     dualSwitchMode();
   } else {
     singleSwitchMode();
   }
 
   if (lastDisplayReferenceResponse > 0 && (millis() - lastDisplayReferenceResponse >= 5000)) {
     lastDisplayReferenceResponse = 0;
     updateDisplay();
     Serial.println("5-second display update after settings refresh");
   }
 
   if (lastDataSendFailure > 0 && (millis() - lastDataSendFailure >= 5000)) {
     lastDataSendFailure = 0;
     updateDisplay();
     Serial.println("5-second display update after data send failure");
   }
 
   if (millis() - lastDisplayReinit >= (displayAutoRefreshMinutes * 60000)) {
     reinitializeDisplayBackground();
     updateDisplay();
     Serial.println("Display content restored after reinitialization");
   }
 
   reconnectWiFiIfNeeded();
 }
 
 