// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

// Performance tracking utility
const perfTracker = {
    enabled: true, // Set to false to disable logging
    timers: {},
    
    start(label) {
        if (!this.enabled) return;
        this.timers[label] = performance.now();
        console.log(`⏱️ [PERF] Starting: ${label}`);
    },
    
    end(label) {
        if (!this.enabled || !this.timers[label]) return;
        const duration = performance.now() - this.timers[label];
        const color = duration > 1000 ? 'color: red; font-weight: bold' : 
                      duration > 500 ? 'color: orange' : 'color: green';
        console.log(`%c⏱️ [PERF] ${label}: ${duration.toFixed(2)}ms`, color);
        delete this.timers[label];
        return duration;
    },
    
    async track(label, asyncFn) {
        this.start(label);
        try {
            const result = await asyncFn();
            this.end(label);
            return result;
        } catch (error) {
            this.end(label);
            throw error;
        }
    }
};

// Log all Supabase queries for debugging
function logSupabaseQuery(table, operation, duration, rowCount) {
    if (!perfTracker.enabled) return;
    const icon = duration > 1000 ? '🔴' : duration > 500 ? '🟡' : '🟢';
    console.log(`${icon} Supabase: ${operation} ${table} - ${duration.toFixed(0)}ms - ${rowCount} rows`);
}

// Debug function - call from browser console: checkSupabaseStatus()
window.checkSupabaseStatus = async function() {
    console.log('\n========== SUPABASE STATUS CHECK ==========\n');
    
    // Check if Supabase is loaded
    if (!window.supabase) {
        console.error('❌ Supabase client is NOT loaded!');
        return;
    }
    console.log('✅ Supabase client is loaded');
    
    // Check auth
    if (!window.supabase.auth) {
        console.error('❌ Supabase auth is NOT available!');
        return;
    }
    console.log('✅ Supabase auth is available');
    
    // Check session
    try {
        const startAuth = performance.now();
        const { data: { session }, error } = await window.supabase.auth.getSession();
        const authDuration = performance.now() - startAuth;
        
        if (error) {
            console.error('❌ Session check error:', error);
        } else if (session) {
            console.log(`✅ User logged in: ${session.user.email} (${authDuration.toFixed(0)}ms)`);
        } else {
            console.log(`⚠️ No active session (${authDuration.toFixed(0)}ms)`);
        }
    } catch (e) {
        console.error('❌ Session check failed:', e);
    }
    
    // Test database connection with a simple query
    console.log('\n--- Database Connection Test ---');
    const tables = ['settings', 'Process Master', 'WorkCenterMaster', 'IoT Database', 'ShiftSchedule', 'LossReason', 'HourlyReport'];
    
    for (const table of tables) {
        try {
            const start = performance.now();
            const { count, error } = await window.supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
            const duration = performance.now() - start;
            
            if (error) {
                console.error(`❌ ${table}: ${error.message}`);
            } else {
                const icon = duration > 1000 ? '🔴' : duration > 500 ? '🟡' : '🟢';
                console.log(`${icon} ${table}: ${count} rows (${duration.toFixed(0)}ms)`);
            }
        } catch (e) {
            console.error(`❌ ${table}: ${e.message}`);
        }
    }
    
    console.log('\n========== END STATUS CHECK ==========\n');
    console.log('💡 Tips:');
    console.log('   - 🟢 < 500ms = Good');
    console.log('   - 🟡 500-1000ms = Slow');
    console.log('   - 🔴 > 1000ms = Very slow (check network/Supabase status)');
    console.log('   - If all queries are slow, your Supabase project might be paused (free tier)');
    console.log('   - Go to supabase.com/dashboard and check if project needs to be restored');
};

// Quick test function - call from browser console: testQuery('settings')
window.testQuery = async function(tableName) {
    if (!window.supabase) {
        console.error('Supabase not loaded');
        return;
    }
    
    console.log(`\nTesting query to "${tableName}"...`);
    const start = performance.now();
    
    try {
        const { data, error, count } = await window.supabase
            .from(tableName)
            .select('*', { count: 'exact' })
            .limit(5);
        
        const duration = performance.now() - start;
        
        if (error) {
            console.error(`Error: ${error.message}`);
        } else {
            console.log(`✅ Query completed in ${duration.toFixed(0)}ms`);
            console.log(`   Total rows: ${count}`);
            console.log(`   Sample data:`, data);
        }
    } catch (e) {
        console.error(`Failed: ${e.message}`);
    }
};

// Enable/disable performance logging - call: togglePerfLogs()
window.togglePerfLogs = function() {
    perfTracker.enabled = !perfTracker.enabled;
    console.log(`Performance logging: ${perfTracker.enabled ? 'ENABLED' : 'DISABLED'}`);
};

// Monitor Supabase connection status
let connectionCheckInterval = null;
let lastConnectionCheck = Date.now();

function updateConnectionStatus(isConnected) {
    const statusDot = document.querySelector('.status-dot');
    if (statusDot) {
        statusDot.className = 'status-dot ' + (isConnected ? 'connected' : 'disconnected');
        statusDot.parentElement.title = isConnected ? 'Connected to server' : 'Connection lost - Click refresh to retry';
    }
}

async function checkConnection() {
    // Check if Supabase is fully initialized
    if (!window.supabase || !window.supabase.auth) {
        // Supabase not ready yet - don't show error, just wait
        console.log('Supabase not ready yet...');
        return false;
    }
    
    try {
        // Simple health check - get current user (fast, cached)
        const { data, error } = await window.supabase.auth.getSession();
        
        if (error) {
            updateConnectionStatus(false);
            return false;
        }
        
        updateConnectionStatus(true);
        lastConnectionCheck = Date.now();
        return true;
    } catch (err) {
        console.warn('Connection check failed:', err.message);
        updateConnectionStatus(false);
        return false;
    }
}

// Start connection monitoring
function startConnectionMonitoring() {
    // Only start if Supabase is ready
    if (!window.supabase || !window.supabase.auth) {
        console.log('Supabase not ready, skipping connection monitoring start');
        return;
    }
    
    // Check connection every 30 seconds
    connectionCheckInterval = setInterval(async () => {
        if (window.supabase && window.supabase.auth) {
            await checkConnection();
        }
    }, 30000);
    
    // Also check when window regains focus
    window.addEventListener('focus', async () => {
        // Only check if last check was more than 10 seconds ago
        if (Date.now() - lastConnectionCheck > 10000) {
            if (window.supabase && window.supabase.auth) {
                await checkConnection();
            }
        }
    });
    
    // Check when coming back online
    window.addEventListener('online', async () => {
        console.log('Network online - checking connection...');
        if (window.supabase && window.supabase.auth) {
            await checkConnection();
        }
    });
    
    window.addEventListener('offline', () => {
        console.log('Network offline');
        updateConnectionStatus(false);
    });
}

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

// Wait for DOM and Supabase to be ready
window.addEventListener("DOMContentLoaded", () => {
    // Show connecting message on login page
    const loginConnecting = document.getElementById('loginConnecting');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    
    if (loginConnecting) loginConnecting.style.display = 'flex';
    if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = 'Connecting...';
    }
    
    // Wait for Supabase to be initialized
    // Increased timeout for slower mobile devices
    const checkSupabase = setInterval(() => {
        if (window.supabase && window.supabase.auth) {
            clearInterval(checkSupabase);
            console.log('✅ Supabase ready, initializing app...');
            
            // Hide connecting message and enable login
            if (loginConnecting) loginConnecting.style.display = 'none';
            if (loginSubmitBtn) {
                loginSubmitBtn.disabled = false;
                loginSubmitBtn.textContent = 'Login';
            }
            
            if (!window.appInitialized) {
                window.appInitialized = true;
            initializeApp();
            }
        } else {
            // Log if still waiting
            if (checkSupabase._count === undefined) {
                checkSupabase._count = 0;
            }
            checkSupabase._count++;
            // Increased timeout to 15 seconds for mobile devices (150 * 100ms = 15s)
            if (checkSupabase._count > 150) {
                clearInterval(checkSupabase);
                console.error('❌ Supabase failed to load after 15 seconds.');
                
                // Update connecting message to error
                if (loginConnecting) {
                    loginConnecting.innerHTML = '⚠️ Failed to connect. <a href="javascript:location.reload()" style="color: inherit; text-decoration: underline;">Tap to retry</a>';
                    loginConnecting.style.background = '#fef2f2';
                    loginConnecting.style.color = '#b91c1c';
                    loginConnecting.style.borderLeftColor = '#b91c1c';
                }
                if (loginSubmitBtn) {
                    loginSubmitBtn.disabled = true;
                    loginSubmitBtn.textContent = 'Connection Failed';
                }
            }
        }
    }, 100);
});

// Also listen for the supabaseReady event as backup
window.addEventListener('supabaseReady', () => {
    if (window.supabase && window.supabase.auth) {
        console.log('✅ Supabase ready via event, initializing app...');
        // Only initialize if not already initialized
        if (!window.appInitialized) {
            window.appInitialized = true;
            initializeApp();
        }
    }
});

function initializeApp() {
    console.log('🚀 initializeApp() started...');
    
    // Start connection monitoring (only after Supabase is confirmed ready)
    if (window.supabase && window.supabase.auth) {
        startConnectionMonitoring();
        checkConnection();
    }
    
    // Handle email confirmation callback from URL
    handleEmailConfirmation();
    
    console.log('🔐 Checking authentication state...');
    // Check authentication state
    checkAuthState();
    
    // Initialize authentication
    initializeAuthentication();
    
    // Initialize sidebar
    initializeSidebar();
    
    // Initialize browser history and navigation
    initializeBrowserHistory();
    
    // Initialize navigation
    initializeNavigation();
    
    // Initialize modal functionality
    initializeModal();
    
    // Initialize Process Master modal (will be re-initialized on page switch)
    initializeProcessMasterModal();
    
    // Initialize Work Center Master modal
    initializeWorkCenterMasterModal();
    
    // Initialize Task Manager modal
    initializeTaskManagerModal();
    
    // Initialize User Management modal
    initializeUserManagementModal();
    
    // Initialize Shift Schedule modal
    initializeShiftScheduleModal();
    
    // Initialize Loss Reason modal
    initializeLossReasonModal();
    
    // Initialize search functionality
    initializeSearchFunctionality();
    
    // Listen for auth state changes (only if Supabase is available)
    if (window.supabase && window.supabase.auth) {
    window.supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            updateUIForAuth(session);
        } else if (event === 'SIGNED_OUT') {
            updateUIForAuth(null);
        }
    });
    } else {
        console.error('Cannot set up auth state listener: Supabase not available');
    }
}

// Initialize search functionality for Process Master and Work Center Master
function initializeSearchFunctionality() {
    // Process Master search
    const processSearchInput = document.getElementById("processMasterSearch");
    if (processSearchInput) {
        let searchTimeout;
        processSearchInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                paginationState.processMaster.searchTerm = e.target.value;
                paginationState.processMaster.currentPage = 1; // Reset to first page on search
                loadProcessMasterTable(1);
            }, 300); // Debounce search by 300ms
        });
    }
    
    // Work Center Master search
    const workcenterSearchInput = document.getElementById("workcenterMasterSearch");
    if (workcenterSearchInput) {
        let searchTimeout;
        workcenterSearchInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                workcenterPaginationState.searchTerm = e.target.value;
                workcenterPaginationState.currentPage = 1; // Reset to first page on search
                loadWorkCenterMasterTable(1);
            }, 300); // Debounce search by 300ms
        });
    }
}

// Handle email confirmation from URL hash
async function handleEmailConfirmation() {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = hashParams.get('error');
    const errorDescription = hashParams.get('error_description');
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');
    
    // Clear the hash from URL
    if (hashParams.has('error') || hashParams.has('access_token')) {
        window.history.replaceState(null, '', window.location.pathname);
    }
    
    // Handle errors
    if (error) {
        if (error === 'access_denied' && errorDescription && errorDescription.includes('expired')) {
            showToast("Email confirmation link has expired. Please request a new one.", "error");
        } else {
            showToast("Email confirmation failed: " + (errorDescription || error), "error");
        }
        return;
    }
    
    // Handle successful email confirmation
    if (type === 'signup' && accessToken) {
        try {
            // Exchange the token for a session
            const { data, error } = await window.supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: hashParams.get('refresh_token') || ''
            });
            
            if (error) throw error;
            
            showToast("Email confirmed successfully! You are now logged in.", "success");
            updateUIForAuth(data.session);
        } catch (err) {
            console.error("Session error:", err);
            showToast("Email confirmed but login failed. Please try logging in manually.", "error");
        }
    }
}

// Sidebar state - global so it can be accessed
let sidebarOpen = false;

// Global function to toggle sidebar - can be called from console: toggleMobileSidebar()
window.toggleMobileSidebar = function() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) {
        console.error("Sidebar not found");
        return;
    }
    
    sidebarOpen = !sidebarOpen;
    
    if (sidebarOpen) {
        // Use setProperty with 'important' to override CSS !important rules
        sidebar.style.setProperty('left', '0px', 'important');
        sidebar.style.setProperty('box-shadow', '5px 0 25px rgba(0,0,0,0.5)', 'important');
        sidebar.style.setProperty('display', 'flex', 'important');
        sidebar.style.setProperty('visibility', 'visible', 'important');
        sidebar.classList.add("open");
        document.body.style.overflow = "hidden";
        console.log("📱 Sidebar OPENED - left set to 0px with !important");
    } else {
        sidebar.style.setProperty('left', '-280px', 'important');
        sidebar.style.setProperty('box-shadow', 'none', 'important');
        sidebar.classList.remove("open");
        document.body.style.overflow = "";
        console.log("📱 Sidebar CLOSED");
    }
};

// Sidebar functionality
function initializeSidebar() {
    const menuToggle = document.getElementById("menuToggle");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");

    console.log("🔧 initializeSidebar called", { 
        menuToggle: !!menuToggle, 
        sidebar: !!sidebar,
        menuToggleVisible: menuToggle ? window.getComputedStyle(menuToggle).display : 'N/A'
    });

    if (!sidebar) {
        console.error("Sidebar element not found");
        return;
    }
    
    // Make sure sidebar starts closed on mobile
    if (window.innerWidth <= 768) {
        sidebar.style.setProperty('left', '-280px', 'important');
        sidebarOpen = false;
    }

    // Menu toggle button (hamburger ☰)
    if (menuToggle) {
        console.log("📱 Setting up menu toggle button...");
        
        // Direct onclick assignment (most reliable)
        menuToggle.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("📱 Menu button CLICKED via onclick");
            window.toggleMobileSidebar();
        };
        
        // Also add event listener as backup
        menuToggle.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("📱 Menu button CLICKED via addEventListener");
            window.toggleMobileSidebar();
        });
        
        console.log("✅ Menu toggle onclick assigned");
    } else {
        console.error("❌ menuToggle element not found!");
    }

    // Close button inside sidebar (X button)
    if (sidebarToggle) {
        sidebarToggle.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (sidebarOpen) {
                window.toggleMobileSidebar();
            }
        };
    }

    // Close sidebar when clicking outside
    document.addEventListener("click", (e) => {
        if (sidebarOpen && window.innerWidth <= 768) {
            const menuBtn = document.getElementById("menuToggle");
            if (!sidebar.contains(e.target) && (!menuBtn || !menuBtn.contains(e.target))) {
                window.toggleMobileSidebar();
            }
        }
    });
    
    // Close sidebar when navigating (selecting a menu item)
    const navItems = sidebar.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            if (window.innerWidth <= 768 && sidebarOpen) {
                window.toggleMobileSidebar();
            }
        });
    });
}

// Global interval for IoT Data auto-refresh
let iotDataRefreshInterval = null;

// Navigation history management
const navigationHistory = {
    stack: [],
    currentIndex: -1,
    
    push(hash, path, title) {
        // Remove any forward history if we're not at the end
        if (this.currentIndex < this.stack.length - 1) {
            this.stack = this.stack.slice(0, this.currentIndex + 1);
        }
        this.stack.push({ hash, path, title });
        this.currentIndex = this.stack.length - 1;
    },
    
    canGoBack() {
        return this.currentIndex > 0;
    },
    
    canGoForward() {
        return this.currentIndex < this.stack.length - 1;
    }
};

let suppressPopstateNav = false;

// Update breadcrumb with clickable path
function updateBreadcrumb(pathArray) {
    const pagePath = document.getElementById("pagePath");
    if (!pagePath) return;
    
    pagePath.className = "page-path breadcrumb";
    pagePath.innerHTML = "";
    
    pathArray.forEach((item, index) => {
        const isLast = index === pathArray.length - 1;
        const breadcrumbItem = document.createElement("span");
        breadcrumbItem.className = `breadcrumb-item ${isLast ? "active" : ""}`;
        breadcrumbItem.textContent = item.label;
        
        if (!isLast && item.hash) {
            breadcrumbItem.setAttribute("data-hash", item.hash);
            breadcrumbItem.addEventListener("click", () => {
                navigateToHash(item.hash, false);
            });
        }
        
        pagePath.appendChild(breadcrumbItem);
        
        if (!isLast) {
            const separator = document.createElement("span");
            separator.className = "breadcrumb-separator";
            separator.textContent = " / ";
            pagePath.appendChild(separator);
        }
    });
}

function getCurrentRoute() {
    const path = window.location.pathname.replace(/^\//, "");
    return path || "pms/dashboard";
}

// Navigate to a route with history management (path-based)
function navigateToHash(hash, addToHistory = true) {
    if (!hash) return;
    
    // Normalize route: strip # or leading slash
    const routeKey = hash.startsWith("#")
        ? hash.substring(1)
        : hash.replace(/^\//, "");
    const fullRoute = routeKey;
    const pathToPush = "/" + routeKey;
    
    // Parse the hash to determine navigation
    const hashParts = routeKey.split("/");
    const module = hashParts[0];
    const page = hashParts[1] || "dashboard";
    
    // Get current page elements
    const pages = document.querySelectorAll(".page");
    const pageTitle = document.getElementById("pageTitle");
    const pagePath = document.getElementById("pagePath");
    const openFormBtn = document.getElementById("openFormBtn");
    const navModules = document.querySelectorAll(".nav-module");
    const navSubItems = document.querySelectorAll(".nav-subitem");
    const pmsSubmenu = document.getElementById("pmsSubmenu");
    
    // Hide all pages
    pages.forEach(p => p.classList.remove("active"));
    
    // Clear IoT auto-refresh when leaving IoT page
    if (routeKey !== "pms/iot-data" && iotDataRefreshInterval) {
        clearInterval(iotDataRefreshInterval);
        iotDataRefreshInterval = null;
    }
    
    // Determine breadcrumb path
    let breadcrumbPath = [];
    let title = "";
    
    // Handle navigation based on hash
    if (module === "pms") {
        // Update active module
        navModules.forEach(nav => nav.classList.remove("active"));
        const pmsModule = document.querySelector('.nav-module[data-module="pms"]');
        if (pmsModule) pmsModule.classList.add("active");
        
        if (page === "dashboard") {
            document.getElementById("pmsDashboardPage")?.classList.add("active");
            title = "PMS";
            breadcrumbPath = [
                { label: "PMS", hash: "#pms/dashboard" },
                { label: "Dashboard" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            loadPMSDashboardStats();
        } else if (page === "settings") {
            document.getElementById("settingsPage")?.classList.add("active");
            title = "PMS";
            breadcrumbPath = [
                { label: "PMS", hash: "#pms/dashboard" },
                { label: "Machine Settings" }
            ];
            if (openFormBtn) openFormBtn.style.display = "flex";
            loadSettingsTable();
            updateSettingsHeaderInfo();
        } else if (page === "process-master") {
            document.getElementById("processMasterPage")?.classList.add("active");
            title = "PMS";
            breadcrumbPath = [
                { label: "PMS", hash: "#pms/dashboard" },
                { label: "Process Master" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            loadProcessMasterTable();
        } else if (page === "workcenter-master") {
            document.getElementById("workcenterMasterPage")?.classList.add("active");
            title = "PMS";
            breadcrumbPath = [
                { label: "PMS", hash: "#pms/dashboard" },
                { label: "Work Center Master" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            loadWorkCenterMasterTable();
        } else if (page === "iot-data") {
            document.getElementById("iotDataPage")?.classList.add("active");
            title = "PMS";
            breadcrumbPath = [
                { label: "PMS", hash: "#pms/dashboard" },
                { label: "IoT Data" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            loadIoTFilters();
            loadIoTDataTable(1);
            
            if (!iotDataRefreshInterval) {
                iotDataRefreshInterval = setInterval(() => {
                    loadIoTDataTable(paginationState.iotData.currentPage || 1, true);
                }, 10000);
            }
        } else if (page === "shift-schedule") {
            document.getElementById("shiftSchedulePage")?.classList.add("active");
            title = "PMS";
            breadcrumbPath = [
                { label: "PMS", hash: "#pms/dashboard" },
                { label: "Shift Schedule" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            loadShiftScheduleFilters();
            loadShiftScheduleTable(1);
        } else if (page === "loss-reason") {
            document.getElementById("lossReasonPage")?.classList.add("active");
            title = "PMS";
            breadcrumbPath = [
                { label: "PMS", hash: "#pms/dashboard" },
                { label: "Loss Reason" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            loadLossReasonTable(1);
        } else if (page === "hourly-report") {
            document.getElementById("hourlyReportPage")?.classList.add("active");
            title = "PMS";
            breadcrumbPath = [
                { label: "PMS", hash: "#pms/dashboard" },
                { label: "Hourly Report" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            loadHourlyReportTable(1);
            startAutoUpdateCountdown(); // Start countdown timer
        }
    } else if (module === "task-manager") {
        navModules.forEach(nav => nav.classList.remove("active"));
        const taskModule = document.querySelector('.nav-module[data-module="task-manager"]');
        if (taskModule) taskModule.classList.add("active");
        if (pmsSubmenu) pmsSubmenu.style.display = "none";
        
        document.getElementById("taskManagerPage")?.classList.add("active");
        title = "Task Manager";
        breadcrumbPath = [
            { label: "Task Manager", hash: "#task-manager" },
            { label: "Tasks" }
        ];
        if (openFormBtn) openFormBtn.style.display = "none";
        loadTaskManagerTable(1);
    } else if (module === "user-management") {
        navModules.forEach(nav => nav.classList.remove("active"));
        const userModule = document.querySelector('.nav-module[data-module="user-management"]');
        if (userModule) userModule.classList.add("active");
        if (pmsSubmenu) pmsSubmenu.style.display = "none";
        
        document.getElementById("userManagementPage")?.classList.add("active");
        title = "User Management";
        breadcrumbPath = [
            { label: "Settings", hash: "#app-settings" },
            { label: "User Management" }
        ];
        if (openFormBtn) openFormBtn.style.display = "none";
        checkAdminAndLoadUsers();
    } else if (module === "app-settings") {
        navModules.forEach(nav => nav.classList.remove("active"));
        const settingsModule = document.querySelector('.nav-module[data-module="app-settings"]');
        if (settingsModule) settingsModule.classList.add("active");
        if (pmsSubmenu) pmsSubmenu.style.display = "none";
        
        if (page === "user-management") {
            document.getElementById("userManagementPage")?.classList.add("active");
            title = "Settings";
            breadcrumbPath = [
                { label: "Settings", hash: "#app-settings" },
                { label: "User Management" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            checkAdminAndLoadUsers();
        } else if (page === "app-branding") {
            document.getElementById("appBrandingPage")?.classList.add("active");
            title = "Settings";
            breadcrumbPath = [
                { label: "Settings", hash: "#app-settings" },
                { label: "App Branding" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            loadBrandingSettings();
        } else {
            // Default to app settings dashboard
            document.getElementById("appSettingsPage")?.classList.add("active");
            title = "Settings";
            breadcrumbPath = [
                { label: "Settings", hash: "#app-settings" }
            ];
            if (openFormBtn) openFormBtn.style.display = "none";
            loadSettingsPageStats();
        }
    }
    
    // Update UI
    if (pageTitle) pageTitle.textContent = title;
    updateBreadcrumb(breadcrumbPath);
    
    // Update URL and history using path (no hash)
    const isSamePath = window.location.pathname === pathToPush && window.location.search === "";
    const currentPath = window.location.pathname || "";
    if (addToHistory === true) {
        if (!isSamePath) {
            const shouldReplace = currentPath === pathToPush;
            navigationHistory.push(fullRoute, breadcrumbPath, title);
            if (shouldReplace) {
                window.history.replaceState({ hash: fullRoute, path: breadcrumbPath, title }, title, pathToPush);
            } else {
                window.history.pushState({ hash: fullRoute, path: breadcrumbPath, title }, title, pathToPush);
            }
        }
    } else if (addToHistory === "replace") {
        window.history.replaceState({ hash: fullRoute, path: breadcrumbPath, title }, title, pathToPush);
    }
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        document.getElementById("sidebar")?.classList.remove("open");
    }
}

// Handle browser back/forward buttons
function handlePopState(event) {
    const route = getCurrentRoute();
    navigateToHash(route, false);
}

// Initialize browser history on page load
function initializeBrowserHistory() {
    // Listen for back/forward button clicks
    window.addEventListener("popstate", handlePopState);
    
    // Handle initial route on page load (path-based)
    const initialRoute = getCurrentRoute();
    const state = {
        hash: "#" + initialRoute,
        path: [],
        title: ""
    };
    window.history.replaceState(state, "", "/" + initialRoute);
    navigateToHash(initialRoute, false);
}

// Load distinct Plant and Machine values for IoT filters
async function loadIoTFilters() {
    const plantSelect = document.getElementById("iotPlantFilter");
    const machineSelect = document.getElementById("iotMachineFilter");
    if (!plantSelect || !machineSelect || !window.supabase) return;

    try {
        // Fetch distinct plants
        const { data: plantData, error: plantError } = await window.supabase
            .from("IoT Database")
            .select("Plant")
            .not("Plant", "is", null);

        if (!plantError && plantData) {
            const plants = [...new Set(plantData.map(row => row.Plant).filter(Boolean))].sort();
            const currentPlant = paginationState.iotData.plantFilter || "";
            plantSelect.innerHTML = '<option value="">All Plants</option>';
            plants.forEach(plant => {
                const opt = document.createElement("option");
                opt.value = plant;
                opt.textContent = plant;
                plantSelect.appendChild(opt);
            });
            plantSelect.value = currentPlant;
        }

        // Fetch distinct machines
        const { data: machineData, error: machineError } = await window.supabase
            .from("IoT Database")
            // Column name has a space, so we must quote it consistently everywhere
            .select('"Machine No."')
            .not('"Machine No."', "is", null);

        if (!machineError && machineData) {
            const machines = [...new Set(machineData.map(row => row["Machine No."]).filter(Boolean))].sort();
            const currentMachine = paginationState.iotData.machineFilter || "";
            machineSelect.innerHTML = '<option value="">All Machines</option>';
            machines.forEach(machine => {
                const opt = document.createElement("option");
                opt.value = machine;
                opt.textContent = machine;
                machineSelect.appendChild(opt);
            });
            machineSelect.value = currentMachine;
        }
    } catch (err) {
        console.error("Error loading IoT filters:", err);
    }
}

// Navigation functionality
function initializeNavigation() {
    const navModules = document.querySelectorAll(".nav-module");
    const navSubItems = document.querySelectorAll(".nav-subitem");
    const pages = document.querySelectorAll(".page");
    const pageTitle = document.getElementById("pageTitle");
    const pagePath = document.getElementById("pagePath");
    const openFormBtn = document.getElementById("openFormBtn");
    const pmsSubmenu = document.getElementById("pmsSubmenu");

    // Handle module-level navigation (PMS, Task Manager)
    navModules.forEach((module) => {
        module.addEventListener("click", (e) => {
            e.preventDefault();
            
            const targetModule = module.getAttribute("data-module");
            
            // Update active module
            navModules.forEach(nav => nav.classList.remove("active"));
            module.classList.add("active");
            
            // Hide all pages
            pages.forEach(page => page.classList.remove("active"));
            
            // Clear IoT auto-refresh when leaving IoT page
            if (iotDataRefreshInterval) {
                clearInterval(iotDataRefreshInterval);
                iotDataRefreshInterval = null;
            }

            // Navigate using new navigation system
            if (targetModule === "pms") {
                navigateToHash("#pms/dashboard", true);
            } else if (targetModule === "task-manager") {
                navigateToHash("#task-manager", true);
            } else if (targetModule === "user-management") {
                navigateToHash("#user-management", true);
            } else if (targetModule === "app-settings") {
                navigateToHash("#app-settings", true);
            }
            
            // Close sidebar on mobile after navigation
            if (window.innerWidth <= 768) {
                document.getElementById("sidebar").classList.remove("open");
            }
        });
    });

    // Handle submenu item navigation (PMS pages)
    navSubItems.forEach((item) => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            
            const targetPage = item.getAttribute("data-page");
            
            // Update active nav item
            navSubItems.forEach(nav => nav.classList.remove("active"));
            item.classList.add("active");
            
            // Hide all pages
            pages.forEach(page => page.classList.remove("active"));
            
            // Clear IoT auto-refresh when leaving IoT page
            if (targetPage !== "iot-data" && iotDataRefreshInterval) {
                clearInterval(iotDataRefreshInterval);
                iotDataRefreshInterval = null;
            }

            // Navigate using new navigation system
            if (targetPage === "pms-dashboard") {
                navigateToHash("/pms/dashboard", true);
            } else if (targetPage === "settings") {
                navigateToHash("/pms/settings", true);
            } else if (targetPage === "process-master") {
                navigateToHash("/pms/process-master", true);
            } else if (targetPage === "workcenter-master") {
                navigateToHash("/pms/workcenter-master", true);
            } else if (targetPage === "user-management") {
                navigateToHash("/user-management", true);
            } else if (targetPage === "iot-data") {
                navigateToHash("/pms/iot-data", true);
            }
            
            // Close sidebar on mobile after navigation
            if (window.innerWidth <= 768) {
                document.getElementById("sidebar").classList.remove("open");
            }
        });
    });

    // Handle PMS dashboard card clicks to open PMS sub-pages on right side
    const dashboardCards = document.querySelectorAll(".dashboard-card");
    dashboardCards.forEach((card) => {
        card.addEventListener("click", (e) => {
            e.preventDefault();
            const targetPage = card.getAttribute("data-page");
            if (!targetPage) return;

            // Ensure PMS module is marked active
            const pmsModule = document.querySelector('.nav-module[data-module="pms"]');
            if (pmsModule) {
                navModules.forEach(nav => nav.classList.remove("active"));
                pmsModule.classList.add("active");
            }

            // Hide all pages
            pages.forEach(page => page.classList.remove("active"));

            // Clear IoT auto-refresh when leaving IoT page
            if (targetPage !== "iot-data" && iotDataRefreshInterval) {
                clearInterval(iotDataRefreshInterval);
                iotDataRefreshInterval = null;
            }

            // Navigate using new navigation system
            if (targetPage === "settings") {
                navigateToHash("/pms/settings", true);
            } else if (targetPage === "process-master") {
                navigateToHash("/pms/process-master", true);
            } else if (targetPage === "workcenter-master") {
                navigateToHash("/pms/workcenter-master", true);
            } else if (targetPage === "iot-data") {
                navigateToHash("/pms/iot-data", true);
            } else if (targetPage === "shift-schedule") {
                navigateToHash("/pms/shift-schedule", true);
            } else if (targetPage === "loss-reason") {
                navigateToHash("/pms/loss-reason", true);
            } else if (targetPage === "hourly-report") {
                navigateToHash("/pms/hourly-report", true);
            }
        });
    });

    // Handle Settings dashboard card clicks
    const settingsCards = document.querySelectorAll(".settings-card");
    settingsCards.forEach((card) => {
        card.addEventListener("click", (e) => {
            e.preventDefault();
            const targetSettingsPage = card.getAttribute("data-settings-page");
            if (!targetSettingsPage) return;

            // Ensure Settings module is marked active
            const settingsModule = document.querySelector('.nav-module[data-module="app-settings"]');
            if (settingsModule) {
                navModules.forEach(nav => nav.classList.remove("active"));
                settingsModule.classList.add("active");
            }

            // Navigate to the settings sub-page
            if (targetSettingsPage === "user-management") {
                navigateToHash("#app-settings/user-management", true);
            } else if (targetSettingsPage === "app-branding") {
                navigateToHash("#app-settings/app-branding", true);
            }
        });
    });
}

// Load PMS Dashboard Statistics
async function loadPMSDashboardStats() {
    // Ensure Supabase is available
    if (!window.supabase) {
        console.error('Supabase not available in loadPMSDashboardStats');
        return;
    }
    
    perfTracker.start('Dashboard Stats Total');
    
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        console.log('📊 Loading dashboard stats...');
        const startTime = performance.now();
        
        // Run ALL queries in PARALLEL for faster loading
        const queryStart = performance.now();
        const [
            settingsResult,
            processResult,
            machineResult,
            iotResult,
            shiftResult,
            lossResult,
            hourlyResult
        ] = await Promise.all([
            perfTracker.track('Query: settings', () => 
                window.supabase.from("settings").select("*", { count: "exact", head: true })),
            perfTracker.track('Query: Process Master', () => 
                window.supabase.from("Process Master").select("*", { count: "exact", head: true })),
            perfTracker.track('Query: WorkCenterMaster', () => 
                window.supabase.from("WorkCenterMaster").select("*", { count: "exact", head: true })),
            perfTracker.track('Query: IoT Database', () => 
                window.supabase.from("IoT Database").select("*", { count: "exact", head: true }).gte("Timestamp", yesterday.toISOString())),
            perfTracker.track('Query: ShiftSchedule', () => 
                window.supabase.from("ShiftSchedule").select("*", { count: "exact", head: true })),
            perfTracker.track('Query: LossReason', () => 
                window.supabase.from("LossReason").select("*", { count: "exact", head: true })),
            perfTracker.track('Query: HourlyReport', () => 
                window.supabase.from("HourlyReport").select("*", { count: "exact", head: true }))
        ]);
        
        const queryDuration = performance.now() - queryStart;
        console.log(`📊 All parallel queries completed in ${queryDuration.toFixed(0)}ms`);

        // Log any errors
        if (settingsResult.error) console.error('Settings error:', settingsResult.error);
        if (processResult.error) console.error('Process error:', processResult.error);
        if (machineResult.error) console.error('Machine error:', machineResult.error);
        if (iotResult.error) console.error('IoT error:', iotResult.error);
        if (shiftResult.error) console.error('Shift error:', shiftResult.error);
        if (lossResult.error) console.error('Loss error:', lossResult.error);
        if (hourlyResult.error) console.error('Hourly error:', hourlyResult.error);
        
        // Update UI with results
        document.getElementById("pmsSettingsCount").textContent = settingsResult.count || 0;
        document.getElementById("pmsProcessCount").textContent = processResult.count || 0;
        document.getElementById("pmsMachineCount").textContent = machineResult.count || 0;
        document.getElementById("pmsIoTCount").textContent = iotResult.count || 0;
        
        const shiftScheduleCountEl = document.getElementById("pmsShiftScheduleCount");
        if (shiftScheduleCountEl) shiftScheduleCountEl.textContent = shiftResult.count || 0;

        const lossReasonCountEl = document.getElementById("pmsLossReasonCount");
        if (lossReasonCountEl) lossReasonCountEl.textContent = lossResult.count || 0;

        const hourlyReportCountEl = document.getElementById("pmsHourlyReportCount");
        if (hourlyReportCountEl) hourlyReportCountEl.textContent = hourlyResult.count || 0;
        
        const totalDuration = performance.now() - startTime;
        console.log(`✅ Dashboard stats loaded in ${totalDuration.toFixed(0)}ms`);
        
    } catch (error) {
        console.error("Error loading PMS dashboard stats:", error);
    }
    
    perfTracker.end('Dashboard Stats Total');
}

// Modal functionality
function initializeModal() {
    const openBtn = document.getElementById("openFormBtn");
    const closeBtn = document.getElementById("closeModalBtn");
    const cancelBtn = document.getElementById("cancelFormBtn");
    const modalOverlay = document.getElementById("modalOverlay");
    const form = document.getElementById("settingsForm");

    // Open modal for adding new
    if (openBtn) {
        openBtn.addEventListener("click", async () => {
            const modalTitle = document.getElementById("settingsModalTitle");
            if (modalTitle) modalTitle.textContent = "Add Machine Settings";
            const editIdField = document.getElementById("settingsEditId");
            if (editIdField) editIdField.value = "";
            form.reset();
            
            // Clear part combined input
            const partCombinedInput = document.getElementById("part_combined");
            if (partCombinedInput) partCombinedInput.value = "";
            
            // Load dropdowns when opening modal
            await loadProcessMasterDropdowns();
            modalOverlay.classList.add("active");
            document.body.style.overflow = "hidden";
        });
    }

    // Close modal
    function closeModal() {
        modalOverlay.classList.remove("active");
        document.body.style.overflow = "";
        form.reset();
        document.getElementById("settingsEditId").value = "";
        const modalTitle = document.getElementById("settingsModalTitle");
        if (modalTitle) modalTitle.textContent = "Add Machine Settings";
    }

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    // Close on overlay click
    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
            closeModal();
        }
    });

    // Form submission handler
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await handleFormSubmit();
    });
}

// Process Master Modal functionality
let processMasterModalInitialized = false;

function initializeProcessMasterModal() {
    const openBtn = document.getElementById("openProcessMasterFormBtn");
    const closeBtn = document.getElementById("closeProcessMasterModalBtn");
    const cancelBtn = document.getElementById("cancelProcessMasterFormBtn");
    const modalOverlay = document.getElementById("processMasterModalOverlay");
    const form = document.getElementById("processMasterForm");
    const modalTitle = document.getElementById("processMasterModalTitle");

    if (!openBtn || !form) return;
    
    // Prevent duplicate initialization
    if (processMasterModalInitialized) return;
    processMasterModalInitialized = true;

    // Open modal for adding
    openBtn.addEventListener("click", () => {
        modalTitle.textContent = "Add Process Master";
        document.getElementById("pm_edit_id").value = "";
        form.reset();
        modalOverlay.classList.add("active");
        document.body.style.overflow = "hidden";
    });

    // Close modal
    function closeModal() {
        modalOverlay.classList.remove("active");
        document.body.style.overflow = "";
        form.reset();
        document.getElementById("pm_edit_id").value = "";
    }

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    // Close on overlay click
    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
            closeModal();
        }
    });

    // Form submission handler
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await handleProcessMasterFormSubmit();
    });
}

// Open Process Master modal for editing
function openEditProcessMasterModal(item) {
    const modalOverlay = document.getElementById("processMasterModalOverlay");
    const form = document.getElementById("processMasterForm");
    const modalTitle = document.getElementById("processMasterModalTitle");

    modalTitle.textContent = "Edit Process Master";
    
    // Populate form with item data
    // Use id as primary key if available, otherwise fall back to Sr. No.
    document.getElementById("pm_edit_id").value = item.id || item["Sr. No."] || "";
    document.getElementById("pm_plant").value = item["Plant"] || "";
    document.getElementById("pm_sr_no").value = item["Sr. No."] || "";
    document.getElementById("pm_cell_name").value = item["Cell Name"] || "";
    document.getElementById("pm_sap_code").value = item["SAP Code/ Part No."] || "";
    document.getElementById("pm_part_name").value = item["Part Name"] || "";
    document.getElementById("pm_operation").value = item["Operation"] || "";
    document.getElementById("pm_cycle_time").value = item["Cycle Time per Piece"] || "";
    document.getElementById("pm_cavities").value = item["No. of Cavities in Tool"] || "";
    document.getElementById("pm_machine").value = item["Machine"] || "";
    document.getElementById("pm_workstations").value = item["No. of Workstations"] || "";
    document.getElementById("pm_inspection").value = item["Inspection Applicability"] || "";
    document.getElementById("pm_mandays").value = item["Mandays"] || "";
    document.getElementById("pm_cell_leader").value = item["Cell Leader"] || "";
    document.getElementById("pm_setup_time").value = item["Average Setup & Change Over Time (Minutes)"] || "";
    document.getElementById("pm_batch_qty").value = item["Batch Qty."] || "";

    modalOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

// Handle Process Master form submission
async function handleProcessMasterFormSubmit() {
    const submitBtn = document.getElementById("processMasterSubmitBtn");
    const originalText = submitBtn.textContent;
    const editId = document.getElementById("pm_edit_id").value;
    const isEdit = editId !== "";

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? "Updating..." : "Saving...";

    const data = {
        "Plant": document.getElementById("pm_plant").value || null,
        "Sr. No.": document.getElementById("pm_sr_no").value ? parseInt(document.getElementById("pm_sr_no").value) : null,
        "Cell Name": document.getElementById("pm_cell_name").value || null,
        "SAP Code/ Part No.": document.getElementById("pm_sap_code").value || null,
        "Part Name": document.getElementById("pm_part_name").value || null,
        "Operation": document.getElementById("pm_operation").value || null,
        "Cycle Time per Piece": document.getElementById("pm_cycle_time").value ? parseFloat(document.getElementById("pm_cycle_time").value) : null,
        "No. of Cavities in Tool": document.getElementById("pm_cavities").value ? parseInt(document.getElementById("pm_cavities").value) : null,
        "Machine": document.getElementById("pm_machine").value || null,
        "No. of Workstations": document.getElementById("pm_workstations").value ? parseInt(document.getElementById("pm_workstations").value) : null,
        "Inspection Applicability": document.getElementById("pm_inspection").value || null,
        "Mandays": document.getElementById("pm_mandays").value ? parseInt(document.getElementById("pm_mandays").value) : null,
        "Cell Leader": document.getElementById("pm_cell_leader").value || null,
        "Average Setup & Change Over Time (Minutes)": document.getElementById("pm_setup_time").value ? parseInt(document.getElementById("pm_setup_time").value) : null,
        "Batch Qty.": document.getElementById("pm_batch_qty").value ? parseInt(document.getElementById("pm_batch_qty").value) : null
    };

    try {
        let result;
        if (isEdit) {
            // Update existing record - use id (primary key) if available, otherwise use Sr. No. as fallback
            const editIdNum = parseInt(editId);
            if (!isNaN(editIdNum) && editIdNum > 0) {
                // Check if id column exists by trying to update by id first
                result = await window.supabase
                    .from("Process Master")
                    .update(data)
                    .eq("id", editIdNum);
                
                // If update by id fails (column might not exist yet), try by Sr. No.
                if (result.error) {
                    console.warn("Update by id failed, trying by Sr. No.:", result.error);
                    result = await window.supabase
                        .from("Process Master")
                        .update(data)
                        .eq("Sr. No.", editIdNum);
                }
            } else {
                // Fall back to Sr. No. if id is not a valid number
                result = await window.supabase
                    .from("Process Master")
                    .update(data)
                    .eq("Sr. No.", parseInt(editId));
            }
        } else {
            // Insert new record
            result = await window.supabase
                .from("Process Master")
                .insert([data]);
        }

        if (result.error) {
            throw result.error;
        }

        // Success
        showToast(isEdit ? "Process Master updated successfully!" : "Process Master saved successfully!", "success");
        document.getElementById("processMasterForm").reset();
        document.getElementById("pm_edit_id").value = "";
        
        // Close modal after short delay
        setTimeout(() => {
            document.getElementById("processMasterModalOverlay").classList.remove("active");
            document.body.style.overflow = "";
        }, 500);
        
        // Refresh the table
        loadProcessMasterTable();
        
    } catch (err) {
        console.error("Error saving process master:", err);
        showToast("Error: " + (err.message || "Failed to save process master"), "error");
    } finally {
        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Delete Process Master record
async function deleteProcessMaster(idOrSrNo) {
    if (!confirm(`Are you sure you want to delete this process master entry?`)) {
        return;
    }

    try {
        const idOrSrNoNum = parseInt(idOrSrNo);
        let result;
        
        // Try to delete by id first (primary key)
        if (!isNaN(idOrSrNoNum) && idOrSrNoNum > 0) {
            result = await window.supabase
                .from("Process Master")
                .delete()
                .eq("id", idOrSrNoNum);
            
            // If delete by id fails (column might not exist yet), try by Sr. No.
            if (result.error) {
                console.warn("Delete by id failed, trying by Sr. No.:", result.error);
                result = await window.supabase
                    .from("Process Master")
                    .delete()
                    .eq("Sr. No.", idOrSrNoNum);
            }
        } else {
            // Fall back to Sr. No. if id is not available
            result = await window.supabase
                .from("Process Master")
                .delete()
                .eq("Sr. No.", parseInt(idOrSrNo));
        }
        
        const { error } = result;

        if (error) {
            throw error;
        }

        showToast("Process Master deleted successfully!", "success");
        loadProcessMasterTable();
    } catch (err) {
        console.error("Error deleting process master:", err);
        showToast("Error: " + (err.message || "Failed to delete process master"), "error");
    }
}

// Open Settings modal for editing
async function openEditSettingsModal(setting) {
    const modalOverlay = document.getElementById("modalOverlay");
    const form = document.getElementById("settingsForm");
    const modalTitle = document.getElementById("settingsModalTitle");

    modalTitle.textContent = "Edit Machine Settings";
    
    // Reset auto-populate flag to allow fresh setup
    autoPopulateListenersSetup = false;
    
    // Load dropdowns first
    await loadProcessMasterDropdowns();
    
    // Populate form with setting data
    document.getElementById("settingsEditId").value = setting.id || "";
    document.getElementById("plant").value = setting.plant || "";
    document.getElementById("machine").value = setting["Machine No."] || "";
    
    // Set hidden fields for part_no and part_name
    const partNoHidden = document.getElementById("part_no");
    const partNameHidden = document.getElementById("part_name");
    const partCombinedInput = document.getElementById("part_combined");
    
    if (partNoHidden) partNoHidden.value = setting.part_no || "";
    if (partNameHidden) partNameHidden.value = setting.part_name || "";
    
    // Set combined field display value
    if (partCombinedInput && setting.part_no && setting.part_name) {
        partCombinedInput.value = `${setting.part_no} - ${setting.part_name}`;
    } else if (partCombinedInput && setting.part_no) {
        partCombinedInput.value = setting.part_no;
    } else if (partCombinedInput && setting.part_name) {
        partCombinedInput.value = setting.part_name;
    } else if (partCombinedInput) {
        partCombinedInput.value = "";
    }
    
    document.getElementById("operation").value = setting.operation || "";
    document.getElementById("cycle_time").value = setting.cycle_time || "";
    document.getElementById("part_count_per_cycle").value = setting.part_count_per_cycle || "";
    document.getElementById("inspection_applicability").value = setting.inspection_applicability || "";
    document.getElementById("cell_name").value = setting.cell_name || "";
    document.getElementById("cell_leader").value = setting.cell_leader || "";
    document.getElementById("workstations").value = setting.workstations || "";
    document.getElementById("mandays").value = setting.mandays || "";
    document.getElementById("tool_code").value = setting.tool_code || "";
    document.getElementById("operator_code").value = setting.operator_code || "";
    document.getElementById("loss_reason").value = setting.loss_reason || "";

    // Set plant to trigger cascading updates
    const plantSelect = document.getElementById("plant");
    const operationSelect = document.getElementById("operation");
    
    if (plantSelect && setting.plant) {
        plantSelect.value = setting.plant;
        // Trigger change to filter machines and parts
        await loadMachinesFromWorkCenterMaster(setting.plant);
        updatePartDropdowns(); // Update part dropdowns based on plant
    }
    
    // Set machine (no need to filter parts by machine - parts are filtered by plant only)
    const machineSelect = document.getElementById("machine");
    if (machineSelect && setting["Machine No."]) {
        setTimeout(() => {
            machineSelect.value = setting["Machine No."];
        }, 100);
    }
    
    // Update operation dropdown based on part, then set operation and trigger auto-population
    if (partNoHidden && partNoHidden.value) {
        updateOperationDropdown();
        // Wait for operation dropdown to be populated
        setTimeout(() => {
            if (operationSelect && setting.operation) {
                operationSelect.value = setting.operation;
                // Trigger auto-population based on Plant + Part + Operation
                setTimeout(() => {
                    autoPopulateFromProcessMaster("operation");
                }, 100);
            }
        }, 150);
    } else if (operationSelect && setting.operation) {
        operationSelect.value = setting.operation;
    }

    modalOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

// Store Process Master data for auto-population
let processMasterData = [];
// Choices.js instance for Part No. / Part Name dropdown
let partCombinedChoices = null;

// ============================
// TASK MANAGER (EMPLOYEE CHECKLIST)
// ============================

// Load Task Manager table with pagination and search
async function loadTaskManagerTable(page = 1) {
    const tableBody = document.getElementById("taskManagerTableBody");
    const loadingMessage = document.getElementById("taskManagerLoadingMessage");
    const table = document.getElementById("taskManagerTable");
    const pagination = document.getElementById("taskManagerPagination");
    const emptyMessage = document.getElementById("taskManagerEmptyMessage");
    const errorMessage = document.getElementById("taskManagerErrorMessage");
    const totalEl = document.getElementById("taskTotalCount");
    const openEl = document.getElementById("taskOpenCount");
    const overdueEl = document.getElementById("taskOverdueCount");

    if (!window.supabase) return;

    if (loadingMessage) loadingMessage.style.display = "block";
    if (table) table.style.display = "none";
    if (pagination) pagination.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";

    try {
        const pageSize = paginationState.taskManager.pageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const searchTerm = (paginationState.taskManager.searchTerm || "").trim().toLowerCase();
        const plantFilter = (paginationState.taskManager.plantFilter || "").trim();
        const frequencyFilter = (paginationState.taskManager.frequencyFilter || "").trim();
        const statusFilter = (paginationState.taskManager.statusFilter || "").trim();

        let query = window.supabase
            .from("TaskManager")
            .select("*", { count: "exact" })
            .order("planned_date", { ascending: true });

        const { data, error, count } = await query.range(from, to);

        if (error) {
            throw error;
        }

        // Populate Plant filter options from data (all plants)
        const plantSelect = document.getElementById("taskPlantFilter");
        if (plantSelect && data) {
            const plants = [...new Set(data.map((row) => row.plant).filter(Boolean))].sort();
            const currentPlant = paginationState.taskManager.plantFilter || "";
            plantSelect.innerHTML = '<option value="">All Plants</option>';
            plants.forEach((p) => {
                const opt = document.createElement("option");
                opt.value = p;
                opt.textContent = p;
                plantSelect.appendChild(opt);
            });
            plantSelect.value = currentPlant;
        }

        // Client-side filters & search (small dataset assumption)
        let filtered = data || [];
        if (plantFilter) {
            filtered = filtered.filter((row) => row.plant === plantFilter);
        }
        if (frequencyFilter) {
            filtered = filtered.filter((row) => row.frequency === frequencyFilter);
        }
        if (statusFilter) {
            filtered = filtered.filter((row) => row.status === statusFilter);
        }
        if (searchTerm) {
            filtered = filtered.filter((row) => {
                const fields = [
                    row.task_id,
                    row.plant,
                    row.name,
                    row.frequency,
                    row.task,
                    row.status,
                    row.remark,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return fields.includes(searchTerm);
            });
        }

        paginationState.taskManager.totalItems = count || filtered.length || 0;
        paginationState.taskManager.totalPages =
            Math.ceil((paginationState.taskManager.totalItems || 0) / pageSize) || 1;
        paginationState.taskManager.currentPage = page;

        if (loadingMessage) loadingMessage.style.display = "none";

        // Summary counts (on filtered set)
        const totalTasks = filtered.length;
        const openTasks = filtered.filter((row) => row.status === "Planned").length;
        const overdueTasks = filtered.filter((row) => {
            if (!row.planned_date) return false;
            const d = new Date(row.planned_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            d.setHours(0, 0, 0, 0);
            return d < today && row.status !== "Completed" && row.status !== "Cancelled";
        }).length;
        if (totalEl) totalEl.textContent = totalTasks;
        if (openEl) openEl.textContent = openTasks;
        if (overdueEl) overdueEl.textContent = overdueTasks;

        if (!filtered || filtered.length === 0) {
            if (tableBody) tableBody.innerHTML = "";
            if (table) table.style.display = "none";
            if (emptyMessage) emptyMessage.style.display = "block";
            return;
        }

        if (tableBody) {
            tableBody.innerHTML = "";

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            filtered.forEach((item) => {
                const row = document.createElement("tr");

                // Determine overdue flag
                let isOverdue = false;
                if (item.planned_date && item.status !== "Completed" && item.status !== "Cancelled") {
                    const d = new Date(item.planned_date);
                    d.setHours(0, 0, 0, 0);
                    if (d < today) isOverdue = true;
                }
                if (isOverdue) {
                    row.classList.add("task-row-overdue");
                }

                const status = item.status || "-";
                let statusClass = "status-planned";
                if (status === "Completed") statusClass = "status-completed";
                else if (status === "Cancelled") statusClass = "status-cancelled";
                else if (isOverdue) statusClass = "status-overdue";

                const frequency = item.frequency || "-";

                row.innerHTML = `
                    <td>${item.task_id || "-"}</td>
                    <td>${item.plant || "-"}</td>
                    <td>${item.name || "-"}</td>
                    <td><span class="frequency-badge">${frequency}</span></td>
                    <td>${item.task || "-"}</td>
                    <td>${item.planned_date ? formatDateOnly(item.planned_date) : "-"}</td>
                    <td>${item.actual_date ? formatDateOnly(item.actual_date) : "-"}</td>
                    <td>
                        <select class="task-status-select" data-id="${item.id}">
                            <option value="Planned" ${status === "Planned" ? "selected" : ""}>Planned</option>
                            <option value="Completed" ${status === "Completed" ? "selected" : ""}>Completed</option>
                            <option value="Cancelled" ${status === "Cancelled" ? "selected" : ""}>Cancelled</option>
                            <option value="Overdue" ${status === "Overdue" ? "selected" : ""}>Overdue</option>
                        </select>
                    </td>
                    <td>
                        <input type="text" class="task-remark-input" data-id="${item.id}" value="${(item.remark || "").replace(/"/g, "&quot;")}" />
                    </td>
                    <td>
                        <button class="btn-small" data-action="save" data-id="${item.id}">Save</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });

            // Attach action handlers (save status & remark)
            tableBody.querySelectorAll("button[data-action='save']").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const id = btn.getAttribute("data-id");
                    const statusSelect = tableBody.querySelector(`select.task-status-select[data-id="${id}"]`);
                    const remarkInput = tableBody.querySelector(`input.task-remark-input[data-id="${id}"]`);
                    if (!statusSelect || !remarkInput) return;

                    const newStatus = statusSelect.value;
                    const newRemark = remarkInput.value.trim();

                    try {
                        const { error } = await window.supabase
                            .from("TaskManager")
                            .update({
                                status: newStatus,
                                remark: newRemark,
                            })
                            .eq("id", id);

                        if (error) throw error;
                        showToast("Task updated successfully", "success");
                        loadTaskManagerTable(paginationState.taskManager.currentPage || 1);
                    } catch (err) {
                        console.error("Error updating task:", err);
                        showToast("Error updating task: " + err.message, "error");
                    }
                });
            });
        }

        if (table) table.style.display = "table";
        if (pagination) {
            pagination.style.display = "flex";
            updateTaskManagerPagination();
        }
    } catch (error) {
        console.error("Error loading Task Manager data:", error);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading tasks: " + error.message;
            errorMessage.style.display = "block";
        }
    }
}

// Simple date formatter (YYYY-MM-DD to DD/MM/YYYY)
// Simple date formatter (YYYY-MM-DD to DD/MM/YYYY) using IST timezone
function formatDateOnly(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    
    // Format date in IST timezone
    const istDateStr = d.toLocaleString("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
    
    // If already in DD/MM/YYYY format, return as is
    if (istDateStr.includes('/')) {
        return istDateStr;
    }
    
    // Fallback: manual formatting using IST date components
    const istDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const day = String(istDate.getDate()).padStart(2, "0");
    const month = String(istDate.getMonth() + 1).padStart(2, "0");
    const year = istDate.getFullYear();
    return `${day}/${month}/${year}`;
}

// Update Task Manager pagination UI
function updateTaskManagerPagination() {
    const state = paginationState.taskManager;
    const prevBtn = document.getElementById("taskManagerPrevBtn");
    const nextBtn = document.getElementById("taskManagerNextBtn");
    const pageNumbers = document.getElementById("taskManagerPageNumbers");
    const paginationInfo = document.getElementById("taskManagerPaginationInfo");

    if (prevBtn) prevBtn.disabled = state.currentPage === 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;

    if (paginationInfo) {
        const from = state.totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
        const to = Math.min(state.currentPage * state.pageSize, state.totalItems);
        paginationInfo.textContent = `Showing ${from}-${to} of ${state.totalItems} entries`;
    }

    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPages = 5;
        let startPage = Math.max(1, state.currentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(state.totalPages, startPage + maxPages - 1);

        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-page ${i === state.currentPage ? "active" : ""}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener("click", () => loadTaskManagerTable(i));
            pageNumbers.appendChild(pageBtn);
        }
    }
}

// Generate a simple Task ID based on timestamp
function generateTaskId() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `TASK-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

// Handle Task form submission (create daily/other tasks with minimal automation)
async function handleTaskFormSubmit(event) {
    event.preventDefault();

    const plant = document.getElementById("tm_plant").value.trim();
    const name = document.getElementById("tm_name").value.trim();
    const frequency = document.getElementById("tm_frequency").value;
    const taskText = document.getElementById("tm_task").value.trim();
    const plannedDateInput = document.getElementById("tm_planned_date").value;
    const remark = document.getElementById("tm_remark").value.trim();

    if (!plant || !name || !frequency || !taskText || !plannedDateInput) {
        showToast("Please fill in all required fields", "error");
        return;
    }

    const modalOverlay = document.getElementById("taskManagerModalOverlay");
    const submitBtn = document.getElementById("taskManagerSubmitBtn");
    const originalText = submitBtn ? submitBtn.textContent : "";

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
    }

    try {
        const baseTaskId = generateTaskId();
        const startDate = new Date(plannedDateInput);
        if (Number.isNaN(startDate.getTime())) {
            throw new Error("Invalid planned date");
        }

        // Build rows to insert
        const rows = [];

        if (frequency === "Daily") {
            // Plan next 7 days automatically as best-practice starter horizon
            for (let i = 0; i < 7; i++) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + i);
                rows.push({
                    task_id: baseTaskId,
                    plant,
                    name,
                    frequency,
                    task: taskText,
                    planned_date: d.toISOString().slice(0, 10),
                    status: "Planned",
                    remark,
                });
            }
        } else {
            rows.push({
                task_id: baseTaskId,
                plant,
                name,
                frequency,
                task: taskText,
                planned_date: startDate.toISOString().slice(0, 10),
                status: "Planned",
                remark,
            });
        }

        const { error } = await window.supabase.from("TaskManager").insert(rows);
        if (error) {
            throw error;
        }

        showToast("Task(s) created successfully", "success");

        if (modalOverlay) {
            modalOverlay.classList.remove("active");
            document.body.style.overflow = "";
        }
        const form = document.getElementById("taskManagerForm");
        if (form) form.reset();

        loadTaskManagerTable(1);
    } catch (err) {
        console.error("Error saving task:", err);
        showToast("Error saving task: " + err.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// Mark task completed and (for daily tasks) auto-plan next occurrence
async function markTaskCompleted(id) {
    if (!id) return;

    try {
        // Fetch existing row
        const { data, error } = await window.supabase
            .from("TaskManager")
            .select("*")
            .eq("id", id)
            .single();
        if (error) throw error;

        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);

        // Update this entry to Completed
        const { error: updateError } = await window.supabase
            .from("TaskManager")
            .update({
                status: "Completed",
                actual_date: todayStr,
            })
            .eq("id", id);
        if (updateError) throw updateError;

        // If this is a Daily task, create next day's planned entry
        if (data.frequency === "Daily") {
            const nextDate = new Date(data.planned_date || todayStr);
            nextDate.setDate(nextDate.getDate() + 1);

            const nextRow = {
                task_id: data.task_id || generateTaskId(),
                plant: data.plant,
                name: data.name,
                frequency: data.frequency,
                task: data.task,
                planned_date: nextDate.toISOString().slice(0, 10),
                status: "Planned",
                remark: data.remark || "",
            };

            const { error: insertError } = await window.supabase
                .from("TaskManager")
                .insert(nextRow);
            if (insertError) throw insertError;
        }

        showToast("Task updated successfully", "success");
        loadTaskManagerTable(paginationState.taskManager.currentPage || 1);
    } catch (err) {
        console.error("Error completing task:", err);
        showToast("Error completing task: " + err.message, "error");
    }
}

// Load Process Master data and populate dropdowns
async function loadProcessMasterDropdowns() {
    try {
        // Fetch all Process Master data
        const { data, error } = await window.supabase
            .from("Process Master")
            .select("*");

        if (error) {
            console.error("Error loading Process Master data:", error);
            showToast("Error loading Process Master data: " + error.message, "error");
            return;
        }

        if (!data || data.length === 0) {
            console.warn("No Process Master data found");
            return;
        }

        // Store data for auto-population
        processMasterData = data;

        // Get unique values for dropdowns
        const plants = [...new Set(data.map(item => item["Plant"]).filter(Boolean))].sort();
        const partNos = [...new Set(data.map(item => item["SAP Code/ Part No."]).filter(Boolean))].sort();
        const partNames = [...new Set(data.map(item => item["Part Name"]).filter(Boolean))].sort();
        const operations = [...new Set(data.map(item => item["Operation"]).filter(Boolean))].sort();

        // Populate Plant dropdown
        const plantSelect = document.getElementById("plant");
        if (plantSelect) {
            const currentValue = plantSelect.value;
            plantSelect.innerHTML = '<option value="">Select Plant</option>';
            plants.forEach(plant => {
                const option = document.createElement("option");
                option.value = plant;
                option.textContent = plant;
                plantSelect.appendChild(option);
            });
            if (currentValue) plantSelect.value = currentValue;
        }

        // Load machines from WorkCenterMaster (will be filtered by plant selection)
        await loadMachinesFromWorkCenterMaster();

        // Populate combined Part No./Part Name searchable dropdown (will be filtered by plant)
        const partCombinedSelect = document.getElementById("part_combined");
        const partNoHidden = document.getElementById("part_no");
        const partNameHidden = document.getElementById("part_name");
        
        if (partCombinedSelect && data) {
            // Create a map of unique Part No./Part Name combinations
            const partMap = new Map();
            data.forEach(item => {
                const partNo = item["SAP Code/ Part No."] || item["SAP Code/Part No."] || "";
                const partName = item["Part Name"] || "";
                
                if (partNo || partName) {
                    const combinedKey = `${partNo}|||${partName}`;
                    if (!partMap.has(combinedKey)) {
                        partMap.set(combinedKey, { partNo, partName });
                    }
                }
            });
            
            // Build choices list for Choices.js
            const choices = Array.from(partMap.values())
                .sort((a, b) => {
                    const aText = `${a.partNo} - ${a.partName}`;
                    const bText = `${b.partNo} - ${b.partName}`;
                    return aText.localeCompare(bText);
                })
                .map(({ partNo, partName }) => {
                    const displayText = partNo && partName ? `${partNo} - ${partName}` : (partNo || partName);
                    return {
                        value: displayText,
                        label: displayText,
                    };
                });

            // Initialize or update Choices.js instance
            if (!partCombinedChoices) {
                partCombinedChoices = new Choices(partCombinedSelect, {
                    searchEnabled: true,
                    shouldSort: false,
                    itemSelectText: "",
                    removeItemButton: false,
                    placeholder: true,
                    placeholderValue: "Select Part No. / Part Name",
                });
            }

            partCombinedChoices.clearChoices();
            partCombinedChoices.setChoices(
                [{ value: "", label: "Select Part No. / Part Name", selected: true, disabled: true }, ...choices],
                "value",
                "label",
                true
            );
        }
        
        // Setup behavior: update hidden fields when selection changes
        if (partCombinedSelect) {
            partCombinedSelect.addEventListener("change", function () {
                const value = this.value;
                if (!value) {
                    if (partNoHidden) partNoHidden.value = "";
                    if (partNameHidden) partNameHidden.value = "";
                    updateOperationDropdown();
                    clearAutoPopulatedFields();
                    return;
                }

                const [partNoRaw, ...rest] = value.split(" - ");
                const partNo = (partNoRaw || "").trim();
                const partName = rest.join(" - ").trim();

                if (partNoHidden) partNoHidden.value = partNo;
                if (partNameHidden) partNameHidden.value = partName;

                updateOperationDropdown();
                clearAutoPopulatedFields();
            });
        }

        // Populate Operation dropdown
        const operationSelect = document.getElementById("operation");
        if (operationSelect) {
            const currentValue = operationSelect.value;
            operationSelect.innerHTML = '<option value="">Select Operation</option>';
            operations.forEach(operation => {
                const option = document.createElement("option");
                option.value = operation;
                option.textContent = operation;
                operationSelect.appendChild(option);
            });
            if (currentValue) operationSelect.value = currentValue;
        }

        // Setup event listeners for auto-population
        setupAutoPopulationListeners();
        setupCascadingDropdowns();

    } catch (err) {
        console.error("Error in loadProcessMasterDropdowns:", err);
        showToast("Error loading dropdown data: " + err.message, "error");
    }
}

// Flag to track if listeners are already set up
let autoPopulateListenersSetup = false;

// Setup event listeners for auto-population when Part No. or Part Name changes
function setupAutoPopulationListeners() {
    if (autoPopulateListenersSetup) return; // Already set up
    
    // All listeners for part selection are configured in loadProcessMasterDropdowns
    
    autoPopulateListenersSetup = true;
}

// Setup cascading dropdown dependencies
function setupCascadingDropdowns() {
    // Plant -> Machine dependency
    const plantSelect = document.getElementById("plant");
    if (plantSelect) {
        plantSelect.addEventListener("change", async function() {
            const selectedPlant = this.value;
            // Filter machines by selected plant
            await loadMachinesFromWorkCenterMaster(selectedPlant);
            // Clear machine selection if it doesn't match the new plant
            const machineSelect = document.getElementById("machine");
            if (machineSelect && machineSelect.value) {
                const currentMachine = machineSelect.value;
                const options = Array.from(machineSelect.options).map(opt => opt.value);
                if (!options.includes(currentMachine)) {
                    machineSelect.value = "";
                }
            }
            // Update Part No./Part Name dropdown based on plant
            updatePartDropdowns();
            // Clear auto-populated fields when plant changes
            clearAutoPopulatedFields();
        });
    }

    // Part No./Part Name -> Operation dependency
    const partCombinedInput = document.getElementById("part_combined");
    if (partCombinedInput) {
        partCombinedInput.addEventListener("change", function() {
            // Update Operation dropdown based on selected part
            updateOperationDropdown();
            // Clear auto-populated fields when part changes
            clearAutoPopulatedFields();
        });
    }

    // Operation -> Auto-populate other fields
    const operationSelect = document.getElementById("operation");
    if (operationSelect) {
        operationSelect.addEventListener("change", function() {
            // Auto-populate fields based on Plant + Part No. + Operation
            autoPopulateFromProcessMaster("operation");
        });
    }
}

// Update Part No./Part Name dropdown based on selected Plant only
function updatePartDropdowns() {
    const plantSelect = document.getElementById("plant");
    const partCombinedSelect = document.getElementById("part_combined");
    
    if (!partCombinedSelect || !processMasterData || processMasterData.length === 0 || !partCombinedChoices) {
        return;
    }

    const selectedPlant = plantSelect ? plantSelect.value : null;

    // Filter Process Master data based on selected Plant only
    let filteredData = processMasterData;
    
    if (selectedPlant) {
        filteredData = filteredData.filter(item => item["Plant"] === selectedPlant);
    }

    // Create a map of unique Part No./Part Name combinations from filtered data
    const partMap = new Map();
    filteredData.forEach(item => {
        const partNo = item["SAP Code/ Part No."] || item["SAP Code/Part No."] || "";
        const partName = item["Part Name"] || "";
        
        if (partNo || partName) {
            const combinedKey = `${partNo}|||${partName}`;
            if (!partMap.has(combinedKey)) {
                partMap.set(combinedKey, { partNo, partName });
            }
        }
    });
    
    // Build choices list for Choices.js
    const choices = Array.from(partMap.values())
        .sort((a, b) => {
            const aText = `${a.partNo} - ${a.partName}`;
            const bText = `${b.partNo} - ${b.partName}`;
            return aText.localeCompare(bText);
        })
        .map(({ partNo, partName }) => {
            const displayText = partNo && partName ? `${partNo} - ${partName}` : (partNo || partName);
            return {
                value: displayText,
                label: displayText,
            };
        });

    partCombinedChoices.clearChoices();
    partCombinedChoices.setChoices(
        [{ value: "", label: "Select Part No. / Part Name", selected: true, disabled: true }, ...choices],
        "value",
        "label",
        true
    );
}

// Update Operation dropdown based on selected Part No./Part Name
function updateOperationDropdown() {
    const partNoHidden = document.getElementById("part_no");
    const partNameHidden = document.getElementById("part_name");
    const operationSelect = document.getElementById("operation");
    
    if (!operationSelect || !processMasterData || processMasterData.length === 0) {
        return;
    }

    const selectedPartNo = partNoHidden ? partNoHidden.value : null;
    const selectedPartName = partNameHidden ? partNameHidden.value : null;

    if (!selectedPartNo && !selectedPartName) {
        // If no part selected, show all operations from Process Master
        const operations = [...new Set(processMasterData.map(item => item["Operation"]).filter(Boolean))].sort();
        const currentValue = operationSelect.value;
        operationSelect.innerHTML = '<option value="">Select Operation</option>';
        operations.forEach(op => {
            const option = document.createElement("option");
            option.value = op;
            option.textContent = op;
            operationSelect.appendChild(option);
        });
        if (currentValue && operations.includes(currentValue)) {
            operationSelect.value = currentValue;
        }
        return;
    }

    // Filter Process Master data based on selected Part No. or Part Name
    let filteredData = processMasterData;
    
    if (selectedPartNo) {
        filteredData = filteredData.filter(item => item["SAP Code/ Part No."] === selectedPartNo);
    } else if (selectedPartName) {
        filteredData = filteredData.filter(item => item["Part Name"] === selectedPartName);
    }

    // Get unique operations from filtered data
    const operations = [...new Set(filteredData.map(item => item["Operation"]).filter(Boolean))].sort();
    
    const currentValue = operationSelect.value;
    operationSelect.innerHTML = '<option value="">Select Operation</option>';
    operations.forEach(op => {
        const option = document.createElement("option");
        option.value = op;
        option.textContent = op;
        operationSelect.appendChild(option);
    });
    
    // Only restore value if it still exists in the filtered list
    if (currentValue && operations.includes(currentValue)) {
        operationSelect.value = currentValue;
    } else {
        operationSelect.value = "";
    }
}

// Clear auto-populated fields when dependencies change
function clearAutoPopulatedFields() {
    const autoPopulatedFields = [
        "operation", "cycle_time", "part_count_per_cycle",
        "inspection_applicability", "cell_name", "cell_leader", "workstations", "mandays"
    ];
    
    autoPopulatedFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = "";
            field.removeAttribute("readonly");
            field.disabled = false; // Enable fields
        }
    });
}

// Auto-populate fields from Process Master based on Plant + Part No. + Operation selection
function autoPopulateFromProcessMaster(triggerField) {
    const plantSelect = document.getElementById("plant");
    const partNoHidden = document.getElementById("part_no");
    const partNameHidden = document.getElementById("part_name");
    const operationSelect = document.getElementById("operation");
    
    if (!plantSelect || !partNoHidden || !partNameHidden || !operationSelect || !processMasterData || processMasterData.length === 0) {
        return;
    }

    const selectedPlant = plantSelect.value;
    const selectedPartNo = partNoHidden.value;
    const selectedPartName = partNameHidden.value;
    const selectedOperation = operationSelect.value;

    // Need Plant, Part No./Part Name, and Operation to auto-populate
    if (!selectedPlant || (!selectedPartNo && !selectedPartName) || !selectedOperation) {
        return;
    }

    // Find matching record in Process Master based on Plant + Part No./Part Name + Operation
    let matchingRecord = null;

    if (selectedPartNo) {
        matchingRecord = processMasterData.find(item => 
            item["Plant"] === selectedPlant &&
            item["SAP Code/ Part No."] === selectedPartNo &&
            item["Operation"] === selectedOperation
        );
    } else if (selectedPartName) {
        matchingRecord = processMasterData.find(item => 
            item["Plant"] === selectedPlant &&
            item["Part Name"] === selectedPartName &&
            item["Operation"] === selectedOperation
        );
    }

    // If we have a matching record, populate other fields
    // Note: Plant, Machine, Part No./Part Name, and Operation are NOT auto-populated - they remain editable
    // Only the following fields are auto-populated and locked:
    if (matchingRecord) {
        // Cycle Time
        const cycleTimeInput = document.getElementById("cycle_time");
        if (cycleTimeInput && matchingRecord["Cycle Time per Piece"] != null) {
            cycleTimeInput.value = matchingRecord["Cycle Time per Piece"];
            cycleTimeInput.setAttribute("readonly", "readonly");
        }

        // Part Count Per Cycle (No. of Cavities in Tool)
        const partCountInput = document.getElementById("part_count_per_cycle");
        if (partCountInput && matchingRecord["No. of Cavities in Tool"] != null) {
            partCountInput.value = matchingRecord["No. of Cavities in Tool"];
            partCountInput.setAttribute("readonly", "readonly");
        }

        // Inspection Applicability
        const inspectionInput = document.getElementById("inspection_applicability");
        if (inspectionInput && matchingRecord["Inspection Applicability"]) {
            inspectionInput.value = matchingRecord["Inspection Applicability"];
            inspectionInput.setAttribute("readonly", "readonly");
        }

        // Cell Name
        const cellNameInput = document.getElementById("cell_name");
        if (cellNameInput && matchingRecord["Cell Name"]) {
            cellNameInput.value = matchingRecord["Cell Name"];
            cellNameInput.setAttribute("readonly", "readonly");
        }

        // Cell Leader
        const cellLeaderInput = document.getElementById("cell_leader");
        if (cellLeaderInput && matchingRecord["Cell Leader"]) {
            cellLeaderInput.value = matchingRecord["Cell Leader"];
            cellLeaderInput.setAttribute("readonly", "readonly");
        }

        // Workstations
        const workstationsInput = document.getElementById("workstations");
        if (workstationsInput && matchingRecord["No. of Workstations"] != null) {
            workstationsInput.value = matchingRecord["No. of Workstations"];
            workstationsInput.setAttribute("readonly", "readonly");
        }

        // Mandays
        const mandaysInput = document.getElementById("mandays");
        if (mandaysInput && matchingRecord["Mandays"] != null) {
            mandaysInput.value = matchingRecord["Mandays"];
            mandaysInput.setAttribute("readonly", "readonly");
        }

        // Tool code, Operator code, and Loss Reason are NOT auto-populated (as per requirement)
        // These fields remain editable
    }
}

// Handle form submission
async function handleFormSubmit() {
    const submitBtn = document.querySelector(".btn-submit");
    const originalText = submitBtn.textContent;
    const editId = document.getElementById("settingsEditId").value;
    const isEdit = editId !== "";
    
    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? "Updating..." : "Saving...";

    const machine = document.getElementById("machine").value;
    const data = {
        plant: document.getElementById("plant").value,
        "Machine No.": machine,
        part_no: document.getElementById("part_no").value,
        part_name: document.getElementById("part_name").value,
        operation: document.getElementById("operation").value,
        cycle_time: parseFloat(document.getElementById("cycle_time").value),
        part_count_per_cycle: parseInt(document.getElementById("part_count_per_cycle").value),
        inspection_applicability: document.getElementById("inspection_applicability").value,
        cell_name: document.getElementById("cell_name").value,
        cell_leader: document.getElementById("cell_leader").value,
        workstations: parseInt(document.getElementById("workstations").value),
        mandays: parseFloat(document.getElementById("mandays").value),
        tool_code: document.getElementById("tool_code").value,
        operator_code: document.getElementById("operator_code").value,
        loss_reason: document.getElementById("loss_reason").value || null
    };

    console.log("Saving data to Supabase:", data, "isEdit:", isEdit);

    try {
        let result;
        
        // Always use UPSERT to ensure uniqueness (one record per Plant + Machine)
        // This replaces existing settings for Plant + Machine combination
        // If Plant + Machine combination exists, it updates; otherwise, it inserts
        result = await window.supabase
            .from("settings")
            .upsert(data, {
                onConflict: 'plant,"Machine No."'
            });

        if (result.error) {
            throw result.error;
        }

        // Success
        showToast(isEdit ? "Settings updated successfully!" : "Settings saved successfully!", "success");
        document.getElementById("settingsForm").reset();
        document.getElementById("settingsEditId").value = "";
        
        // Close modal after short delay
        setTimeout(() => {
            document.getElementById("modalOverlay").classList.remove("active");
            document.body.style.overflow = "";
        }, 500);
        
        // Refresh the table
        loadSettingsTable(paginationState.settings.currentPage);
        
    } catch (err) {
        console.error("Error saving settings:", err);
        showToast("Error: " + (err.message || "Failed to save settings"), "error");
    } finally {
        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Pagination state
const paginationState = {
    settings: {
        currentPage: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0
    },
    processMaster: {
        currentPage: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        searchTerm: ""
    },
    iotData: {
        currentPage: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        plantFilter: "",
        machineFilter: ""
    },
    taskManager: {
        currentPage: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        searchTerm: "",
        plantFilter: "",
        frequencyFilter: "",
        statusFilter: ""
    },
    shiftSchedule: {
        currentPage: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        plantFilter: "",
        shiftFilter: ""
    },
    lossReason: {
        currentPage: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0
    },
    hourlyReport: {
        currentPage: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        dateFilter: "",
        shiftFilter: ""
    }
};

// Work Center Master pagination state
const workcenterPaginationState = {
    currentPage: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 0,
    searchTerm: ""
};

// Function to load and display settings table with pagination
async function loadSettingsTable(page = 1) {
    perfTracker.start('Load Settings Table');
    
    const loadingMessage = document.getElementById("loadingMessage");
    const table = document.getElementById("settingsTable");
    const tableBody = document.getElementById("settingsTableBody");
    const errorMessage = document.getElementById("errorMessage");
    const emptyMessage = document.getElementById("emptyMessage");
    const pagination = document.getElementById("settingsPagination");

    if (!loadingMessage) return;
    
    // Ensure Supabase is available
    if (!window.supabase) {
        console.error('Supabase not available in loadSettingsTable');
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Connection error. Please refresh the page.";
            errorMessage.style.display = "block";
        }
        return;
    }

    const pageSize = paginationState.settings.pageSize;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    loadingMessage.style.display = "flex";
    if (table) table.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";
    if (pagination) pagination.style.display = "none";

    try {
        // First, get all IoT-enabled machines from WorkCenterMaster
        const { data: iotMachines, error: iotError } = await window.supabase
            .from("WorkCenterMaster")
            .select("Machine")
            .eq("IoT Enabled", true);

        if (iotError) {
            console.warn("Error loading IoT-enabled machines:", iotError);
            // Continue without filtering if WorkCenterMaster doesn't exist yet
        }

        // Create a set of valid IoT-enabled machine names for quick lookup
        const validMachines = new Set();
        if (iotMachines && iotMachines.length > 0) {
            iotMachines.forEach(item => {
                const machineName = item["Machine"] || item.Machine;
                if (machineName) {
                    validMachines.add(machineName);
                }
            });
        }

        // Helper to build a consistent key for cross-table aggregation
        const buildKey = (plantValue, machineValue, partValue, operationValue) => {
            return [plantValue, machineValue, partValue, operationValue]
                .map(v => (v || "").toString().trim().toLowerCase())
                .join("__");
        };

        // Get all settings data to group by machine
        const { data: allData, error: allError } = await window.supabase
            .from("settings")
            .select("*")
            .order("timestamp", { ascending: false });

        if (allError) throw allError;

        // Figure out current work day and shift to scope aggregates
        const currentWorkDay = getWorkDayDateForDB(new Date());

        let currentShift = null;
        try {
            const { data: shiftRows } = await window.supabase
                .from("ShiftSchedule")
                .select("Time,Shift")
                .order("Time", { ascending: true });
            currentShift = getCurrentShiftFromSchedule(shiftRows);
        } catch (e) {
            console.warn("Unable to determine current shift; aggregating without shift filter", e);
        }

        // Aggregate target counts from HourlyReport filtered by work day + shift
        const { data: hourlyRows, error: countsError } = await window.supabase
            .from("HourlyReport")
            .select('Plant,"Machine No.","Part No.","Operation","Hourly Target","Work Day Date","Shift"')
            .eq("Work Day Date", currentWorkDay);

        if (countsError) {
            console.warn("Error loading HourlyReport aggregates for settings:", countsError);
        }

        const countsMap = new Map();
        if (hourlyRows && hourlyRows.length > 0) {
            hourlyRows.forEach(row => {
                if (currentShift && row?.Shift && row.Shift !== currentShift) return;
                const key = buildKey(row?.Plant, row?.["Machine No."], row?.["Part No."], row?.Operation);
                const target = Number(row?.["Hourly Target"]) || 0;

                if (!countsMap.has(key)) {
                    countsMap.set(key, { target: 0, actual: 0 });
                }
                const current = countsMap.get(key);
                current.target += target;
            });
        }

        // Aggregate actual counts from IoT Database filtered by work day + shift
        const { data: iotRows, error: iotErr } = await window.supabase
            .from("IoT Database")
            .select('Plant,"Machine No.","Part No.","Operation","Value","Work Day Date","Shift"')
            .eq("Work Day Date", currentWorkDay);

        if (iotErr) {
            console.warn("Error loading IoT aggregates for settings:", iotErr);
        }

        if (iotRows && iotRows.length > 0) {
            iotRows.forEach(row => {
                if (currentShift && row?.Shift && row.Shift !== currentShift) return;
                const key = buildKey(row?.Plant, row?.["Machine No."], row?.["Part No."], row?.Operation);
                const actual = Number(row?.Value) || 0;

                if (!countsMap.has(key)) {
                    countsMap.set(key, { target: 0, actual: 0 });
                }
                const current = countsMap.get(key);
                current.actual += actual;
            });
        }

        // Filter settings to only include IoT-enabled machines from WorkCenterMaster
        const filteredData = allData ? allData.filter(setting => {
            const machine = setting["Machine No."] || setting.machine;
            if (!machine) return false;
            // If we have valid machines list, filter by it; otherwise show all (for backward compatibility)
            if (validMachines.size > 0) {
                return validMachines.has(machine);
            }
            return true; // If no IoT machines found, show all (backward compatibility)
        }) : [];

        // Group by machine and keep only the latest entry for each machine
        const machineMap = new Map();
        if (filteredData) {
            filteredData.forEach(setting => {
                const machine = setting["Machine No."] || setting.machine;
                if (machine) {
                    if (!machineMap.has(machine) || 
                        (setting.timestamp && machineMap.get(machine).timestamp && 
                         new Date(setting.timestamp) > new Date(machineMap.get(machine).timestamp))) {
                        machineMap.set(machine, setting);
                    } else if (!machineMap.get(machine).timestamp && setting.timestamp) {
                        machineMap.set(machine, setting);
                    }
                }
            });
        }

        // Convert map to array and sort by timestamp (newest first)
        const uniqueData = Array.from(machineMap.values())
            .sort((a, b) => {
                if (!a.timestamp && !b.timestamp) return 0;
                if (!a.timestamp) return 1;
                if (!b.timestamp) return -1;
                return new Date(b.timestamp) - new Date(a.timestamp);
            });

        // Update pagination state based on unique machines
        paginationState.settings.totalItems = uniqueData.length;
        paginationState.settings.totalPages = Math.ceil(uniqueData.length / pageSize) || 1;
        paginationState.settings.currentPage = page;

        // Apply pagination to unique data
        const paginatedData = uniqueData.slice(from, Math.min(to + 1, uniqueData.length));
        const data = paginatedData;
        const error = null;

        if (loadingMessage) loadingMessage.style.display = "none";

        if (data && data.length > 0) {
            if (tableBody) {
                tableBody.innerHTML = "";
                data.forEach((setting) => {
                const countsKey = buildKey(setting.plant, setting["Machine No."] || setting.machine, setting.part_no, setting.operation);
                    const aggregated = countsMap.get(countsKey);
                    const targetCount = aggregated ? aggregated.target : setting.target_count;
                    const actualCount = aggregated ? aggregated.actual : setting.actual_count;

                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${setting.id || "-"}</td>
                        <td>${formatTimestamp(setting.timestamp)}</td>
                        <td>${setting.plant || "-"}</td>
                        <td>${setting["Machine No."] || setting.machine || "-"}</td>
                        <td>${setting.part_no || "-"}</td>
                        <td>${setting.part_name || "-"}</td>
                        <td>${setting.operation || "-"}</td>
                        <td>${setting.cycle_time || "-"}</td>
                        <td>${setting.part_count_per_cycle || "-"}</td>
                        <td>${setting.inspection_applicability || "-"}</td>
                        <td>${setting.cell_name || "-"}</td>
                        <td>${setting.cell_leader || "-"}</td>
                        <td>${setting.workstations || "-"}</td>
                        <td>${setting.mandays || "-"}</td>
                        <td>${setting.tool_code || "-"}</td>
                        <td>${setting.operator_code || "-"}</td>
                        <td>${setting.loss_reason || "-"}</td>
                        <td>${targetCount !== null && targetCount !== undefined ? targetCount : "-"}</td>
                        <td>${actualCount !== null && actualCount !== undefined ? actualCount : "-"}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-edit" data-setting='${JSON.stringify(setting).replace(/'/g, "&apos;")}' title="Edit">
                                    ✏️
                                </button>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(row);
                    
                    // Add event listener for edit button
                    const editBtn = row.querySelector(".btn-edit");
                    if (editBtn) {
                        editBtn.addEventListener("click", () => {
                            const settingData = JSON.parse(editBtn.getAttribute("data-setting"));
                            openEditSettingsModal(settingData);
                        });
                    }
                });
            }
            if (table) table.style.display = "table";
        } else {
            if (emptyMessage) emptyMessage.style.display = "block";
        }
        
        // Always update pagination (even if no data, to show "0-0 of 0")
        updateSettingsPagination();
    } catch (err) {
        console.error("Error loading settings:", err);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading settings: " + (err.message || "Unknown error");
            errorMessage.style.display = "block";
        }
    }
    
    perfTracker.end('Load Settings Table');
}

// Update settings pagination controls
function updateSettingsPagination() {
    const state = paginationState.settings;
    const pagination = document.getElementById("settingsPagination");
    const info = document.getElementById("settingsPaginationInfo");
    const prevBtn = document.getElementById("settingsPrevBtn");
    const nextBtn = document.getElementById("settingsNextBtn");
    const pageNumbers = document.getElementById("settingsPageNumbers");

    if (!pagination) {
        console.warn("Settings pagination element not found");
        return;
    }

    // Show pagination only if there are items
    if (state.totalItems === 0) {
        pagination.style.display = "none";
        return;
    }

    // Force display flex
    pagination.style.display = "flex";
    pagination.style.visibility = "visible";

    // Update info
    const from = (state.currentPage - 1) * state.pageSize + 1;
    const to = Math.min(state.currentPage * state.pageSize, state.totalItems);
    if (info) {
        info.textContent = `Showing ${from}-${to} of ${state.totalItems}`;
    }

    // Update buttons
    if (prevBtn) prevBtn.disabled = state.currentPage === 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;

    // Update page numbers
    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPages = 5;
        let startPage = Math.max(1, state.currentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(state.totalPages, startPage + maxPages - 1);
        
        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        if (startPage > 1) {
            const btn = document.createElement("button");
            btn.className = "pagination-page";
            btn.textContent = "1";
            btn.onclick = () => loadSettingsTable(1);
            pageNumbers.appendChild(btn);
            if (startPage > 2) {
                const ellipsis = document.createElement("span");
                ellipsis.className = "pagination-ellipsis";
                ellipsis.textContent = "...";
                pageNumbers.appendChild(ellipsis);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement("button");
            btn.className = "pagination-page";
            if (i === state.currentPage) {
                btn.classList.add("active");
            }
            btn.textContent = i;
            btn.onclick = () => loadSettingsTable(i);
            pageNumbers.appendChild(btn);
        }

        if (endPage < state.totalPages) {
            if (endPage < state.totalPages - 1) {
                const ellipsis = document.createElement("span");
                ellipsis.className = "pagination-ellipsis";
                ellipsis.textContent = "...";
                pageNumbers.appendChild(ellipsis);
            }
            const btn = document.createElement("button");
            btn.className = "pagination-page";
            btn.textContent = state.totalPages;
            btn.onclick = () => loadSettingsTable(state.totalPages);
            pageNumbers.appendChild(btn);
        }
    }

    // Page size change handler
    const pageSizeSelect = document.getElementById("settingsPageSize");
    if (pageSizeSelect) {
        pageSizeSelect.value = state.pageSize;
        pageSizeSelect.onchange = (e) => {
            paginationState.settings.pageSize = parseInt(e.target.value);
            loadSettingsTable(1);
        };
    }

    // Previous/Next handlers
    if (prevBtn) {
        prevBtn.onclick = () => {
            if (state.currentPage > 1) {
                loadSettingsTable(state.currentPage - 1);
            }
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            if (state.currentPage < state.totalPages) {
                loadSettingsTable(state.currentPage + 1);
            }
        };
    }
}

// Function to filter Process Master data based on search term
function filterProcessMasterData(data, searchTerm) {
    if (!searchTerm || searchTerm.trim() === "") {
        return data;
    }
    
    const term = searchTerm.toLowerCase().trim();
    return data.filter(item => {
        const plant = (item["Plant"] ?? item.plant ?? "").toString().toLowerCase();
        const partNo = (item["SAP Code/ Part No."] ?? item["SAP Code/Part No."] ?? item.sap_code ?? "").toString().toLowerCase();
        const partName = (item["Part Name"] ?? item["PartName"] ?? item.part_name ?? "").toString().toLowerCase();
        const operation = (item["Operation"] ?? item.operation ?? "").toString().toLowerCase();
        const machine = (item["Machine No."] ?? item["Machine"] ?? item.machine ?? "").toString().toLowerCase();
        const cellName = (item["Cell Name"] ?? item["CellName"] ?? item.cell_name ?? "").toString().toLowerCase();
        const cellLeader = (item["Cell Leader"] ?? item["CellLeader"] ?? item.cell_leader ?? "").toString().toLowerCase();
        const srNo = (item["Sr. No."] ?? item["Sr No."] ?? item.sr_no ?? "").toString().toLowerCase();
        
        return plant.includes(term) ||
               partNo.includes(term) ||
               partName.includes(term) ||
               operation.includes(term) ||
               machine.includes(term) ||
               cellName.includes(term) ||
               cellLeader.includes(term) ||
               srNo.includes(term);
    });
}

// Function to load and display Process Master table with pagination
async function loadProcessMasterTable(page = 1) {
    const loadingMessage = document.getElementById("processLoadingMessage");
    const table = document.getElementById("processMasterTable");
    const tableBody = document.getElementById("processMasterTableBody");
    const errorMessage = document.getElementById("processErrorMessage");
    const emptyMessage = document.getElementById("processEmptyMessage");
    const pagination = document.getElementById("processPagination");

    if (!loadingMessage) return;

    const pageSize = paginationState.processMaster.pageSize;
    const searchTerm = paginationState.processMaster.searchTerm || "";

    loadingMessage.style.display = "flex";
    if (table) table.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";
    if (pagination) pagination.style.display = "none";

    try {
        // Get all data (we'll filter client-side for search)
        const { data: allData, error } = await window.supabase
            .from("Process Master")
            .select("*")
            .order("id", { ascending: false, nullsFirst: false })
            .order('"Sr. No."', { ascending: true, nullsFirst: false });

        if (error) {
            console.error("Supabase Error Details:", error);
            throw error;
        }

        // Filter data based on search term
        const filteredData = filterProcessMasterData(allData || [], searchTerm);
        
        // Update pagination state with filtered data
        paginationState.processMaster.totalItems = filteredData.length;
        paginationState.processMaster.totalPages = Math.ceil(filteredData.length / pageSize) || 1;
        paginationState.processMaster.currentPage = page;
        
        // Get paginated data from filtered results
        const from = (page - 1) * pageSize;
        const to = from + pageSize;
        const paginatedData = filteredData.slice(from, to);

        if (loadingMessage) loadingMessage.style.display = "none";

        if (paginatedData && paginatedData.length > 0) {
            if (tableBody) {
                tableBody.innerHTML = "";
                paginatedData.forEach((item, index) => {
                    const row = document.createElement("tr");
                    const srNo = item["Sr. No."] ?? item["Sr No."] ?? item.sr_no ?? "-";
                    // Use id as primary identifier, fall back to Sr. No. if id doesn't exist
                    const itemId = item.id || item["Sr. No."] || srNo;
                    
                    // Access properties with bracket notation for column names with spaces
                    row.innerHTML = `
                        <td>${srNo}</td>
                        <td>${item["Plant"] ?? item.plant ?? "-"}</td>
                        <td>${item["Cell Name"] ?? item["CellName"] ?? item.cell_name ?? "-"}</td>
                        <td>${item["SAP Code/ Part No."] ?? item["SAP Code/Part No."] ?? item.sap_code ?? "-"}</td>
                        <td>${item["Part Name"] ?? item["PartName"] ?? item.part_name ?? "-"}</td>
                        <td>${item["Operation"] ?? item.operation ?? "-"}</td>
                        <td>${item["Cycle Time per Piece"] ?? item["CycleTimePerPiece"] ?? item.cycle_time ?? "-"}</td>
                        <td>${item["No. of Cavities in Tool"] ?? item["NoOfCavitiesInTool"] ?? item.cavities ?? "-"}</td>
                        <td>${item["Machine No."] ?? item["Machine"] ?? item.machine ?? "-"}</td>
                        <td>${item["No. of Workstations"] ?? item["NoOfWorkstations"] ?? item.workstations ?? "-"}</td>
                        <td>${item["Inspection Applicability"] ?? item["InspectionApplicability"] ?? item.inspection ?? "-"}</td>
                        <td>${item["Mandays"] ?? item.mandays ?? "-"}</td>
                        <td>${item["Cell Leader"] ?? item["CellLeader"] ?? item.cell_leader ?? "-"}</td>
                        <td>${item["Average Setup & Change Over Time (Minutes)"] ?? item["AverageSetupChangeOverTime"] ?? item.setup_time ?? "-"}</td>
                        <td>${item["Batch Qty."] ?? item["BatchQty"] ?? item.batch_qty ?? "-"}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-edit" data-item='${JSON.stringify(item).replace(/'/g, "&apos;")}' title="Edit">
                                    ✏️
                                </button>
                                <button class="btn-delete" data-id="${itemId}" title="Delete">
                                    🗑️
                                </button>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(row);
                    
                    // Add event listeners after row is added
                    const editBtn = row.querySelector(".btn-edit");
                    const deleteBtn = row.querySelector(".btn-delete");
                    
                    if (editBtn) {
                        editBtn.addEventListener("click", () => {
                            const itemData = JSON.parse(editBtn.getAttribute("data-item"));
                            openEditProcessMasterModal(itemData);
                        });
                    }
                    
                    if (deleteBtn) {
                        deleteBtn.addEventListener("click", () => {
                            const idValue = deleteBtn.getAttribute("data-id");
                            deleteProcessMaster(idValue);
                        });
                    }
                });
            }
            if (table) table.style.display = "table";
            // Always try to update pagination, even if no data (to show/hide properly)
            updateProcessMasterPagination();
        } else {
            if (emptyMessage) emptyMessage.style.display = "block";
            // Hide pagination when no data
            const pagination = document.getElementById("processPagination");
            if (pagination) pagination.style.display = "none";
        }
    } catch (err) {
        console.error("Error loading process master:", err);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading process master: " + (err.message || "Unknown error") + ". Check console for details.";
            errorMessage.style.display = "block";
        }
    }
}

// Update Process Master pagination controls
function updateProcessMasterPagination() {
    const state = paginationState.processMaster;
    const pagination = document.getElementById("processPagination");
    const info = document.getElementById("processPaginationInfo");
    const prevBtn = document.getElementById("processPrevBtn");
    const nextBtn = document.getElementById("processNextBtn");
    const pageNumbers = document.getElementById("processPageNumbers");

    if (!pagination) {
        console.warn("Process Master pagination element not found");
        return;
    }

    // Show pagination only if there are items
    if (state.totalItems === 0) {
        pagination.style.display = "none";
        return;
    }

    // Force display flex
    pagination.style.display = "flex";
    pagination.style.visibility = "visible";

    // Update info
    const from = (state.currentPage - 1) * state.pageSize + 1;
    const to = Math.min(state.currentPage * state.pageSize, state.totalItems);
    if (info) {
        info.textContent = `Showing ${from}-${to} of ${state.totalItems}`;
    }

    // Update buttons
    if (prevBtn) prevBtn.disabled = state.currentPage === 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;

    // Update page numbers
    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPages = 5;
        let startPage = Math.max(1, state.currentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(state.totalPages, startPage + maxPages - 1);
        
        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        if (startPage > 1) {
            const btn = document.createElement("button");
            btn.className = "pagination-page";
            btn.textContent = "1";
            btn.onclick = () => loadProcessMasterTable(1);
            pageNumbers.appendChild(btn);
            if (startPage > 2) {
                const ellipsis = document.createElement("span");
                ellipsis.className = "pagination-ellipsis";
                ellipsis.textContent = "...";
                pageNumbers.appendChild(ellipsis);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement("button");
            btn.className = "pagination-page";
            if (i === state.currentPage) {
                btn.classList.add("active");
            }
            btn.textContent = i;
            btn.onclick = () => loadProcessMasterTable(i);
            pageNumbers.appendChild(btn);
        }

        if (endPage < state.totalPages) {
            if (endPage < state.totalPages - 1) {
                const ellipsis = document.createElement("span");
                ellipsis.className = "pagination-ellipsis";
                ellipsis.textContent = "...";
                pageNumbers.appendChild(ellipsis);
            }
            const btn = document.createElement("button");
            btn.className = "pagination-page";
            btn.textContent = state.totalPages;
            btn.onclick = () => loadProcessMasterTable(state.totalPages);
            pageNumbers.appendChild(btn);
        }
    }

    // Page size change handler
    const pageSizeSelect = document.getElementById("processPageSize");
    if (pageSizeSelect) {
        pageSizeSelect.value = state.pageSize;
        pageSizeSelect.onchange = (e) => {
            paginationState.processMaster.pageSize = parseInt(e.target.value);
            loadProcessMasterTable(1);
        };
    }

    // Previous/Next handlers
    if (prevBtn) {
        prevBtn.onclick = () => {
            if (state.currentPage > 1) {
                loadProcessMasterTable(state.currentPage - 1);
            }
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            if (state.currentPage < state.totalPages) {
                loadProcessMasterTable(state.currentPage + 1);
            }
        };
    }
}

// Function to format timestamp in dd/mm/yyyy hh:mm:ss (India time by default)
function formatTimestamp(timestamp) {
    if (!timestamp) return "-";

    // Many Supabase/Postgres timestamps are stored as UTC or without timezone.
    // We treat them as UTC and then display in Asia/Kolkata explicitly.

    let iso = String(timestamp);
    // If the string has no explicit timezone (no 'Z' and no '+' offset), treat as UTC
    if (!iso.includes("Z") && !iso.includes("+")) {
        iso = iso + "Z";
    }

    const date = new Date(iso);

    return date.toLocaleString("en-GB", {
        timeZone: "Asia/Kolkata",      // Adjust here if you need a different timezone
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
}

// Work day date helper: uses 07:00 - 06:59 boundary in IST
function getWorkDayDateForDB(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    
    const istHour = parseInt(d.toLocaleString("en-US", { 
        timeZone: "Asia/Kolkata", 
        hour: "2-digit", 
        hour12: false 
    }));
    
    const istDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    
    if (istHour >= 0 && istHour < 7) {
        istDate.setDate(istDate.getDate() - 1);
    }
    
    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, "0");
    const day = String(istDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// Determine current shift from ShiftSchedule based on current IST time
function getCurrentShiftFromSchedule(scheduleRows) {
    if (!scheduleRows || scheduleRows.length === 0) return null;
    
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const nowMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();
    
    for (const row of scheduleRows) {
        const timeRange = row?.Time || row?.time;
        const shift = row?.Shift || row?.shift;
        if (!timeRange || !shift) continue;
        
        const [startTime, endTime] = timeRange.split(" - ").map(t => t.trim());
        if (!startTime || !endTime) continue;
        
        const [startHour, startMin] = startTime.split(":").map(Number);
        const [endHour, endMin] = endTime.split(":").map(Number);
        
        let startMinutes = startHour * 60 + startMin;
        let endMinutes = endHour * 60 + endMin;
        let checkMinutes = nowMinutes;
        
        // Handle overnight ranges
        if (endMinutes < startMinutes) {
            endMinutes += 24 * 60;
            if (checkMinutes < startMinutes) {
                checkMinutes += 24 * 60;
            }
        }
        
        if (checkMinutes >= startMinutes && checkMinutes < endMinutes) {
            return shift;
        }
    }
    
    return null;
}

// Update header chips on Settings page with current work day date and shift
async function updateSettingsHeaderInfo() {
    const workDayEl = document.getElementById("settingsWorkDayDate");
    const shiftEl = document.getElementById("settingsCurrentShift");
    if (!workDayEl || !shiftEl) return;
    
    // Default placeholders
    workDayEl.textContent = "--";
    shiftEl.textContent = "Loading...";
    
    // Work day date based on 07:00-06:59 rule
    workDayEl.textContent = getWorkDayDateForDB(new Date()) || "--";
    
    try {
        const { data, error } = await window.supabase
            .from("ShiftSchedule")
            .select("Time,Shift")
            .order("Time", { ascending: true });
        
        if (error) throw error;
        
        const currentShift = getCurrentShiftFromSchedule(data);
        shiftEl.textContent = currentShift || "Not Set";
    } catch (err) {
        console.warn("Unable to load current shift info:", err);
        shiftEl.textContent = "Unavailable";
    }
}

// Flexible date parser to handle ISO, DD/MM/YYYY, MM/DD/YYYY
function parseDateFlexible(dateStr) {
    if (!dateStr) return null;
    if (Object.prototype.toString.call(dateStr) === "[object Date]") {
        return isNaN(dateStr.getTime()) ? null : dateStr;
    }

    // Try native parse (handles ISO best)
    const d1 = new Date(dateStr);
    if (!isNaN(d1.getTime())) return d1;

    // DD/MM/YYYY
    const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const m1 = ddmmyyyy.exec(dateStr);
    if (m1) {
        const day = parseInt(m1[1], 10);
        const month = parseInt(m1[2], 10);
        const year = parseInt(m1[3], 10);
        const d = new Date(Date.UTC(year, month - 1, day));
        if (!isNaN(d.getTime())) return d;
    }

    // MM/DD/YYYY
    const mmddyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const m2 = mmddyyyy.exec(dateStr);
    if (m2) {
        const month = parseInt(m2[1], 10);
        const day = parseInt(m2[2], 10);
        const year = parseInt(m2[3], 10);
        const d = new Date(Date.UTC(year, month - 1, day));
        if (!isNaN(d.getTime())) return d;
    }

    return null;
}

// Function to format Work Day Date / IoT Date as DD/MM/YYYY (date only)
function formatWorkDayDate(dateStr) {
    const d = parseDateFlexible(dateStr);
    if (!d) return "-";
    return formatDateToDDMMYYYY(d);
}

// Function to format DATE type to DD/MM/YYYY
function formatDateToDDMMYYYY(dateStr) {
    const d = parseDateFlexible(dateStr);
    if (!d) return "-";
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
}

// Toast notification function
function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// Authentication Functions
async function checkAuthState() {
    console.log('🔐 checkAuthState() called...');
    
    // Debug: Check localStorage for auth token
    const authKeys = Object.keys(localStorage).filter(k => k.includes('auth') || k.includes('supabase'));
    console.log('🔑 Auth keys in localStorage:', authKeys);
    
    // Ensure Supabase is available
    if (!window.supabase || !window.supabase.auth) {
        console.error('Supabase not available in checkAuthState');
        updateUIForAuth(null);
        return null;
    }
    
    try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Session check timeout after 10s')), 10000)
        );
        
        console.log('⏳ Calling getSession()...');
        const sessionPromise = window.supabase.auth.getSession();
        
        const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
        
        console.log('✅ getSession() completed', session ? 'with session' : 'no session');
        if (session) {
            console.log('👤 Session user:', session.user?.email);
            console.log('🕐 Session expires at:', new Date(session.expires_at * 1000).toLocaleString());
        }
        
        if (error) {
            console.error('Error getting session:', error);
            updateUIForAuth(null);
            return null;
        }
    updateUIForAuth(session);
    return session;
    } catch (error) {
        console.error('Error in checkAuthState:', error);
        updateUIForAuth(null);
        return null;
    }
}

// Prevent duplicate UI updates
let lastUIUpdateTime = 0;
let isUpdatingUI = false;

function updateUIForAuth(session) {
    // Debounce - prevent rapid repeated calls
    const now = Date.now();
    if (now - lastUIUpdateTime < 500 || isUpdatingUI) {
        console.log('⏭️ Skipping duplicate updateUIForAuth call');
        return;
    }
    lastUIUpdateTime = now;
    isUpdatingUI = true;
    
    console.log('🎨 updateUIForAuth() called', session ? 'with session' : 'no session');
    
    const userMenu = document.getElementById("userMenu");
    const loginBtn = document.getElementById("loginBtn");
    const userEmail = document.getElementById("userEmail");
    const mainLayout = document.querySelector(".main-layout");
    const sidebar = document.getElementById("sidebar");
    const openFormBtn = document.getElementById("openFormBtn");

    if (session && session.user) {
        console.log('👤 User logged in:', session.user.email);
        
        // User is logged in
        if (userMenu) userMenu.style.display = "flex";
        if (loginBtn) loginBtn.style.display = "none";
        if (userEmail) userEmail.textContent = session.user.email;
        if (mainLayout) mainLayout.style.display = "flex";
        
        // Show sidebar and add authenticated class for mobile CSS
        if (sidebar) {
            sidebar.style.display = "flex";
            sidebar.classList.add("authenticated");
        }
        
        // Hide login page
        const loginPage = document.getElementById("loginPage");
        if (loginPage) loginPage.style.display = "none";
        
        console.log('🔍 Checking admin status...');
        // Check admin status and show/hide user management menu
        checkAdminStatus();
        
        // Set button visibility based on active page
        const activePage = document.querySelector(".page.active");
        if (activePage) {
            if (activePage.id === "settingsPage") {
                if (openFormBtn) openFormBtn.style.display = "flex";
                loadSettingsTable();
            } else if (activePage.id === "processMasterPage") {
                if (openFormBtn) openFormBtn.style.display = "none";
                loadProcessMasterTable();
            } else if (activePage.id === "workcenterMasterPage") {
                if (openFormBtn) openFormBtn.style.display = "none";
                loadWorkCenterMasterTable();
            } else if (activePage.id === "userManagementPage") {
                if (openFormBtn) openFormBtn.style.display = "none";
                checkAdminAndLoadUsers();
            } else if (activePage.id === "pmsDashboardPage") {
                if (openFormBtn) openFormBtn.style.display = "none";
                loadPMSDashboardStats();
            } else if (activePage.id === "taskManagerPage") {
                if (openFormBtn) openFormBtn.style.display = "none";
                loadTaskManagerTable(1);
            } else {
                // Default: show button if on settings page
                if (openFormBtn) openFormBtn.style.display = "flex";
            }
        } else {
            // No active page, default to showing button (will be on settings page)
            if (openFormBtn) openFormBtn.style.display = "flex";
        }
    } else {
        // User is not logged in
        if (userMenu) userMenu.style.display = "none";
        if (loginBtn) loginBtn.style.display = "block";
        if (openFormBtn) openFormBtn.style.display = "none";
        if (mainLayout) mainLayout.style.display = "none";
        
        // Hide sidebar and remove authenticated class
        if (sidebar) {
            sidebar.style.display = "none";
            sidebar.classList.remove("authenticated");
            sidebar.classList.remove("open");
        }
        
        // Show login page (full page, not modal)
        const loginPage = document.getElementById("loginPage");
        if (loginPage) {
            loginPage.style.display = "flex";
        }
    }
    
    // Reset flag after a short delay
    setTimeout(() => { isUpdatingUI = false; }, 100);
}

function initializeAuthentication() {
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const loginPage = document.getElementById("loginPage");
    const loginForm = document.getElementById("loginForm");

    // Show login page when login button is clicked
    if (loginBtn) {
        loginBtn.addEventListener("click", () => {
            if (loginPage) loginPage.style.display = "flex";
        });
    }

    // Auth tab switching
    const authTabs = document.querySelectorAll(".auth-tab");
    const signupForm = document.getElementById("signupForm");
    const switchToSignupLink = document.getElementById("switchToSignupLink");
    const switchToLoginLink = document.getElementById("switchToLoginLink");
    const forgotPasswordLink = document.getElementById("forgotPasswordLink");

    const switchToTab = (tabName) => {
        const targetTab = document.querySelector(`.auth-tab[data-tab="${tabName}"]`);
        if (targetTab) {
            targetTab.click();
        }
    };

    authTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const targetTab = tab.getAttribute("data-tab");
            
            // Update active tab
            authTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            // Show/hide forms
            if (loginForm) loginForm.classList.toggle("active", targetTab === "login");
            if (signupForm) signupForm.classList.toggle("active", targetTab === "signup");
        });
    });

    // Switch to signup link
    if (switchToSignupLink) {
        switchToSignupLink.addEventListener("click", (e) => {
            e.preventDefault();
            switchToTab("signup");
        });
    }

    // Switch to login link
    if (switchToLoginLink) {
        switchToLoginLink.addEventListener("click", (e) => {
            e.preventDefault();
            switchToTab("login");
        });
    }

    // Forgot password link
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener("click", (e) => {
            e.preventDefault();
            showToast("Please contact your administrator to reset password.", "info");
        });
    }

    // Login form submission
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            await handleLogin();
        });
    }

    // Signup form submission
    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            await handleSignup();
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            await handleLogout();
        });
    }
}

async function handleLogin() {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const errorDiv = document.getElementById("loginError");

    if (errorDiv) {
        errorDiv.style.display = "none";
        errorDiv.textContent = "";
    }

    // Check if Supabase is ready
    if (!window.supabase || !window.supabase.auth) {
        if (errorDiv) {
            errorDiv.textContent = "Please wait, connecting to server... Try again in a few seconds.";
            errorDiv.style.display = "block";
        }
        console.error('Supabase not ready for login');
        return;
    }

    try {
        const { data, error } = await window.supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // Check if user is approved
        if (data.user) {
            try {
                const { data: profile, error: profileError } = await window.supabase
                    .from('profiles')
                    .select('is_approved, role, full_name')
                    .eq('id', data.user.id)
                    .single();
                
                // If profile doesn't exist, create it with is_approved = false
                if (profileError && profileError.code === 'PGRST116') {
                    // Try to create profile
                    const { error: insertError } = await window.supabase
                        .from('profiles')
                        .insert({
                            id: data.user.id,
                            email: email,
                            full_name: email.split('@')[0].replace(/[._]/g, ' ').split(' ').map(word => 
                                word.charAt(0).toUpperCase() + word.slice(1)
                            ).join(' '),
                            role: 'operator',
                            plant: null,
                            is_approved: false // New profile = not approved
                        });
                    
                    if (insertError) {
                        console.error("Failed to create profile:", insertError);
                    }
                    
                    // User not approved yet - sign them out
                    await window.supabase.auth.signOut();
                    throw new Error("Your account is pending admin approval. Please wait for approval before logging in.");
                }
                
                // Check if user is approved
                // Admins are always approved, others must have is_approved === true
                const isAdmin = profile && profile.role === 'admin';
                const isApproved = profile && profile.is_approved === true;
                
                if (!isAdmin && !isApproved) {
                    // User is not admin and not approved
                    await window.supabase.auth.signOut();
                    throw new Error("Your account is pending admin approval. Please wait for approval before logging in.");
                }
            } catch (profileErr) {
                if (profileErr.message && profileErr.message.includes("approval")) {
                    throw profileErr; // Re-throw approval errors
                }
                console.warn("Profile check/creation:", profileErr);
            }
        }

        showToast("Login successful!", "success");
        
        // Hide login page
        const loginPage = document.getElementById("loginPage");
        if (loginPage) {
            loginPage.style.display = "none";
        }

        // Update UI
        updateUIForAuth(data.session);
        
    } catch (error) {
        console.error("Login error:", error);
        let errorMessage = error.message || "Failed to login. Please check your credentials.";
        
        // Better error message for email confirmation
        if (error.message && error.message.includes("email not confirmed") || error.message.includes("Email not confirmed")) {
            errorMessage = "Please verify your email address first. Check your inbox for the confirmation link.";
        }
        
        if (errorDiv) {
            errorDiv.textContent = errorMessage;
            errorDiv.style.display = "block";
        }
        showToast("Login failed: " + errorMessage, "error");
    }
}

async function handleSignup() {
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;
    const passwordConfirm = document.getElementById("signupPasswordConfirm").value;
    const errorDiv = document.getElementById("signupError");

    if (errorDiv) {
        errorDiv.style.display = "none";
        errorDiv.textContent = "";
    }

    // Check if Supabase is ready
    if (!window.supabase || !window.supabase.auth) {
        if (errorDiv) {
            errorDiv.textContent = "Please wait, connecting to server... Try again in a few seconds.";
            errorDiv.style.display = "block";
        }
        console.error('Supabase not ready for signup');
        return;
    }

    // Validate passwords match
    if (password !== passwordConfirm) {
        if (errorDiv) {
            errorDiv.textContent = "Passwords do not match.";
            errorDiv.style.display = "block";
        }
        return;
    }

    // Validate password length
    if (password.length < 6) {
        if (errorDiv) {
            errorDiv.textContent = "Password must be at least 6 characters long.";
            errorDiv.style.display = "block";
        }
        return;
    }

    try {
        const { data, error } = await window.supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin, // Redirect to current app URL after email confirmation
                data: {
                    is_approved: false // New signups need admin approval
                }
            }
        });

        if (error) throw error;

        // Create/update profile if it doesn't exist (trigger should handle this, but ensure it's created)
        if (data.user) {
            try {
                // Wait for trigger to create profile
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Try to upsert the profile (insert if doesn't exist, update if exists)
                const { error: profileError } = await window.supabase
                    .from('profiles')
                    .upsert({
                        id: data.user.id,
                        email: email,
                        full_name: email.split('@')[0].replace(/[._]/g, ' ').split(' ').map(word => 
                            word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' '),
                        role: 'operator',
                        plant: null,
                        is_approved: false // New signups need admin approval
                    }, {
                        onConflict: 'id'
                    });
                
                if (profileError) {
                    console.warn("Profile upsert warning:", profileError);
                    // If upsert fails, try insert (in case profile doesn't exist)
                    if (profileError.code === 'PGRST116' || profileError.message?.includes('violates')) {
                        const { error: insertError } = await window.supabase
                            .from('profiles')
                            .insert({
                                id: data.user.id,
                                email: email,
                                full_name: email.split('@')[0].replace(/[._]/g, ' ').split(' ').map(word => 
                                    word.charAt(0).toUpperCase() + word.slice(1)
                                ).join(' '),
                                role: 'operator',
                                plant: null,
                                is_approved: false
                            });
                        
                        if (insertError) {
                            console.error("Profile creation failed:", insertError);
                        }
                    }
                }
            } catch (profileErr) {
                console.error("Profile creation error:", profileErr);
            }
        }

        // Sign out the user immediately after signup (they need admin approval)
        // This prevents auto-login for unapproved users
        if (data.session) {
            await window.supabase.auth.signOut();
        }

        // Check if email confirmation is required
        if (data.user && !data.session) {
            // Email confirmation required
            showToast("Account created! Please check your email (including spam folder) to verify your account. After verification, wait for admin approval.", "success");
            // Show additional info about email
            console.log("Email confirmation required. Check your inbox for:", email);
        } else {
            // No email confirmation needed
            showToast("Account created successfully! Your account is pending admin approval. You will be notified once approved.", "success");
        }
        
        // Switch to login tab
        const loginTab = document.querySelector('.auth-tab[data-tab="login"]');
        const signupTab = document.querySelector('.auth-tab[data-tab="signup"]');
        
        if (loginTab && signupTab) {
            signupTab.classList.remove("active");
            loginTab.classList.add("active");
        }
        if (signupForm) signupForm.classList.remove("active");
        if (loginForm) loginForm.classList.add("active");
        
        // Pre-fill email in login form
        document.getElementById("loginEmail").value = email;
        
        // Clear signup form
        document.getElementById("signupEmail").value = "";
        document.getElementById("signupPassword").value = "";
        document.getElementById("signupPasswordConfirm").value = "";
        
    } catch (error) {
        console.error("Signup error:", error);
        if (errorDiv) {
            errorDiv.textContent = error.message || "Failed to create account. Please try again.";
            errorDiv.style.display = "block";
        }
        showToast("Signup failed: " + (error.message || "Unable to create account"), "error");
    }
}

async function handleLogout() {
    // Check if Supabase is ready
    if (!window.supabase || !window.supabase.auth) {
        console.error('Supabase not ready for logout');
        // Just update UI anyway
        updateUIForAuth(null);
        return;
    }
    
    try {
        const { error } = await window.supabase.auth.signOut();
        
        if (error) throw error;

        showToast("Logged out successfully", "success");
        updateUIForAuth(null);
        
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Error logging out: " + (error.message || "Unknown error"), "error");
    }
}

// ==================== Work Center Master Functions ====================

// Load machines from WorkCenterMaster into Machine dropdown
async function loadMachinesFromWorkCenterMaster(selectedPlant = null) {
    try {
        // Build query for IoT-enabled machines
        let query = window.supabase
            .from("WorkCenterMaster")
            .select("Machine, Plant")
            .eq("IoT Enabled", true); // Filter only IoT-enabled machines
        
        // If plant is selected, filter by plant
        if (selectedPlant) {
            query = query.eq("Plant", selectedPlant);
        }
        
        const { data, error } = await query.order("Machine", { ascending: true });

        if (error) {
            console.error("Error loading WorkCenterMaster data:", error);
            // Don't show error toast, just log it (table might not exist yet)
            return;
        }

        const machineSelect = document.getElementById("machine");
        if (machineSelect && data && data.length > 0) {
            const currentValue = machineSelect.value;
            machineSelect.innerHTML = '<option value="">Select Machine</option>';
            data.forEach(item => {
                const option = document.createElement("option");
                option.value = item["Machine"] || item.Machine || "";
                option.textContent = item["Machine"] || item.Machine || "";
                machineSelect.appendChild(option);
            });
            // Only restore value if it still exists in the filtered list
            if (currentValue && data.some(item => (item["Machine"] || item.Machine) === currentValue)) {
                machineSelect.value = currentValue;
            } else {
                machineSelect.value = "";
            }
        } else if (machineSelect) {
            // If no IoT-enabled machines found, show message
            if (selectedPlant) {
                machineSelect.innerHTML = '<option value="">No IoT-enabled machines found for selected plant</option>';
            } else {
                machineSelect.innerHTML = '<option value="">No IoT-enabled machines found</option>';
            }
        }
    } catch (err) {
        console.error("Error in loadMachinesFromWorkCenterMaster:", err);
    }
}

// Initialize Work Center Master modal
function initializeWorkCenterMasterModal() {
    const openBtn = document.getElementById("openWorkCenterFormBtn");
    const closeBtn = document.getElementById("closeWorkCenterModalBtn");
    const cancelBtn = document.getElementById("cancelWorkCenterFormBtn");
    const modalOverlay = document.getElementById("workcenterModalOverlay");
    const form = document.getElementById("workcenterForm");

    // Open modal
    if (openBtn) {
        openBtn.addEventListener("click", () => {
            const modalTitle = document.getElementById("workcenterModalTitle");
            if (modalTitle) modalTitle.textContent = "Add Machine";
            document.getElementById("workcenterEditId").value = "";
            form.reset();
            modalOverlay.classList.add("active");
            document.body.style.overflow = "hidden";
        });
    }

    // Close modal
    const closeModal = () => {
        modalOverlay.classList.remove("active");
        document.body.style.overflow = "";
        form.reset();
    };

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    // Close on overlay click
    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
            closeModal();
        }
    });

    // Form submission handler
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await handleWorkCenterFormSubmit();
    });
}

// ==================== SHIFT SCHEDULE FUNCTIONS ====================

// Load distinct Plant values for Shift Schedule filters
async function loadShiftScheduleFilters() {
    try {
        const plantSelect = document.getElementById("shiftSchedulePlantFilter");
        if (!plantSelect) return;

        const { data, error } = await window.supabase
            .from("ShiftSchedule")
            .select("Plant")
            .not("Plant", "is", null);

        if (error) throw error;

        if (data) {
            const plants = [...new Set(data.map(row => row.Plant).filter(Boolean))].sort();
            const currentPlant = paginationState.shiftSchedule.plantFilter || "";
            plantSelect.innerHTML = '<option value="">All Plants</option>';
            plants.forEach(plant => {
                const opt = document.createElement("option");
                opt.value = plant;
                opt.textContent = plant;
                plantSelect.appendChild(opt);
            });
            plantSelect.value = currentPlant;
        }
    } catch (err) {
        console.error("Error loading Shift Schedule filters:", err);
    }
}

// Load Shift Schedule Table
async function loadShiftScheduleTable(page = 1) {
    const tableBody = document.getElementById("shiftScheduleTableBody");
    const loadingMessage = document.getElementById("shiftScheduleLoadingMessage");
    const table = document.getElementById("shiftScheduleTable");
    const pagination = document.getElementById("shiftSchedulePagination");
    const errorMessage = document.getElementById("shiftScheduleErrorMessage");
    const emptyMessage = document.getElementById("shiftScheduleEmptyMessage");

    if (loadingMessage) loadingMessage.style.display = "block";
    if (table) table.style.display = "none";
    if (pagination) pagination.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";
    
    // Ensure Supabase is available
    if (!window.supabase) {
        console.error('Supabase not available in loadShiftScheduleTable');
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Connection error. Please refresh the page.";
            errorMessage.style.display = "block";
        }
        return;
    }

    try {
        const pageSize = paginationState.shiftSchedule.pageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const plantFilter = (paginationState.shiftSchedule.plantFilter || "").trim();
        const shiftFilter = (paginationState.shiftSchedule.shiftFilter || "").trim();

        // Build base query
        let query = window.supabase
            .from("ShiftSchedule")
            .select("*", { count: "exact" });

        // Apply filters
        if (plantFilter) {
            query = query.eq("Plant", plantFilter);
        }
        if (shiftFilter) {
            query = query.eq("Shift", shiftFilter);
        }

        // Apply ordering by ID (ascending) and pagination
        const { data, error, count } = await query
            .order("id", { ascending: true })
            .range(from, to);

        if (error) throw error;

        if (loadingMessage) loadingMessage.style.display = "none";

        // Update pagination state
        paginationState.shiftSchedule.totalItems = count || 0;
        paginationState.shiftSchedule.totalPages = Math.ceil((paginationState.shiftSchedule.totalItems || 0) / pageSize) || 1;
        paginationState.shiftSchedule.currentPage = page;

        if (data && data.length > 0) {
            if (tableBody) {
                tableBody.innerHTML = "";
                data.forEach((item) => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${item.id || "-"}</td>
                        <td>${item.Plant || "-"}</td>
                        <td>${item.Shift || "-"}</td>
                        <td>${item.Time || "-"}</td>
                        <td>${item["Available Time"] != null ? item["Available Time"] : "-"}</td>
                        <td>${item["Planned Down Time"] != null ? item["Planned Down Time"] : "-"}</td>
                        <td>${item.Remark || "-"}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-edit" onclick="editShiftScheduleEntry(${item.id})" title="Edit">
                                    ✏️
                                </button>
                                <button class="btn-delete" onclick="deleteShiftScheduleEntry(${item.id})" title="Delete">
                                    🗑️
                                </button>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });
            }
            if (table) table.style.display = "table";
            if (pagination) pagination.style.display = "flex";
            updateShiftSchedulePagination();
        } else {
            if (tableBody) tableBody.innerHTML = "";
            if (table) table.style.display = "none";
            if (emptyMessage) emptyMessage.style.display = "block";
        }
    } catch (error) {
        console.error("Error loading Shift Schedule data:", error);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading shift schedule: " + error.message;
            errorMessage.style.display = "block";
        }
        if (table) table.style.display = "none";
    }
}

// Update Shift Schedule Pagination UI
function updateShiftSchedulePagination() {
    const state = paginationState.shiftSchedule;
    const prevBtn = document.getElementById("shiftSchedulePrevBtn");
    const nextBtn = document.getElementById("shiftScheduleNextBtn");
    const pageNumbers = document.getElementById("shiftSchedulePageNumbers");
    const paginationInfo = document.getElementById("shiftSchedulePaginationInfo");

    if (prevBtn) prevBtn.disabled = state.currentPage === 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;

    if (paginationInfo) {
        const from = state.totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
        const to = Math.min(state.currentPage * state.pageSize, state.totalItems);
        paginationInfo.textContent = `Showing ${from}-${to} of ${state.totalItems}`;
    }

    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPages = 5;
        let startPage = Math.max(1, state.currentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(state.totalPages, startPage + maxPages - 1);
        
        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-page ${i === state.currentPage ? "active" : ""}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener("click", () => loadShiftScheduleTable(i));
            pageNumbers.appendChild(pageBtn);
        }
    }
}

// Initialize Shift Schedule Modal
function initializeShiftScheduleModal() {
    const openBtn = document.getElementById("openShiftScheduleFormBtn");
    const closeBtn = document.getElementById("closeShiftScheduleModalBtn");
    const cancelBtn = document.getElementById("cancelShiftScheduleFormBtn");
    const modalOverlay = document.getElementById("shiftScheduleModalOverlay");
    const form = document.getElementById("shiftScheduleForm");
    const modalTitle = document.getElementById("shiftScheduleModalTitle");

    if (openBtn) {
        openBtn.addEventListener("click", () => {
            if (modalOverlay) modalOverlay.classList.add("active");
            if (form) {
                form.reset();
                document.getElementById("shiftScheduleEditId").value = "";
                document.getElementById("ss_id").value = "";
            }
            if (modalTitle) modalTitle.textContent = "Add Shift Schedule Entry";
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            if (modalOverlay) modalOverlay.classList.remove("active");
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            if (modalOverlay) modalOverlay.classList.remove("active");
        });
    }

    if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.classList.remove("active");
            }
        });
    }

    if (form) {
        form.addEventListener("submit", handleShiftScheduleFormSubmit);
    }
}

// Handle Shift Schedule Form Submit
async function handleShiftScheduleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const editId = document.getElementById("shiftScheduleEditId").value;
    const submitBtn = document.getElementById("shiftScheduleSubmitBtn");
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
    }

    const newId = parseInt(document.getElementById("ss_id").value) || null;

    const formData = {
        Plant: document.getElementById("ss_plant").value.trim(),
        Shift: document.getElementById("ss_shift").value,
        Time: document.getElementById("ss_time").value.trim(),
        "Available Time": parseInt(document.getElementById("ss_available_time").value) || 0,
        "Planned Down Time": parseInt(document.getElementById("ss_planned_downtime").value) || 0,
        Remark: document.getElementById("ss_remark").value.trim() || null
    };

    try {
        let result;
        if (editId) {
            // Update existing entry
            // If ID is being changed, we need to handle it specially
            const updateData = { ...formData };
            if (newId && newId !== parseInt(editId)) {
                updateData.id = newId;
            }
            
            const { data, error } = await window.supabase
                .from("ShiftSchedule")
                .update(updateData)
                .eq("id", editId)
                .select();
            
            if (error) throw error;
            result = data;
            showToast("Shift schedule entry updated successfully", "success");
        } else {
            // Insert new entry with specified ID
            const insertData = { ...formData };
            if (newId) {
                insertData.id = newId;
            }
            
            const { data, error } = await window.supabase
                .from("ShiftSchedule")
                .insert([insertData])
                .select();
            
            if (error) throw error;
            result = data;
            showToast("Shift schedule entry added successfully", "success");
        }

        // Close modal and reload table
        const modalOverlay = document.getElementById("shiftScheduleModalOverlay");
        if (modalOverlay) modalOverlay.classList.remove("active");
        form.reset();
        document.getElementById("shiftScheduleEditId").value = "";
        
        // Reload filters and table
        loadShiftScheduleFilters();
        loadShiftScheduleTable(paginationState.shiftSchedule.currentPage || 1);
        
        // Update dashboard stats
        loadPMSDashboardStats();
    } catch (error) {
        console.error("Error saving shift schedule entry:", error);
        showToast("Error saving entry: " + error.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Save Entry";
        }
    }
}

// Edit Shift Schedule Entry
async function editShiftScheduleEntry(id) {
    try {
        const { data, error } = await window.supabase
            .from("ShiftSchedule")
            .select("*")
            .eq("id", id)
            .single();

        if (error) throw error;

        if (data) {
            document.getElementById("shiftScheduleEditId").value = id;
            document.getElementById("ss_id").value = data.id || "";
            document.getElementById("ss_plant").value = data.Plant || "";
            document.getElementById("ss_shift").value = data.Shift || "";
            document.getElementById("ss_time").value = data.Time || "";
            document.getElementById("ss_available_time").value = data["Available Time"] || 60;
            document.getElementById("ss_planned_downtime").value = data["Planned Down Time"] || 0;
            document.getElementById("ss_remark").value = data.Remark || "";

            const modalTitle = document.getElementById("shiftScheduleModalTitle");
            if (modalTitle) modalTitle.textContent = "Edit Shift Schedule Entry";

            const modalOverlay = document.getElementById("shiftScheduleModalOverlay");
            if (modalOverlay) modalOverlay.classList.add("active");
        }
    } catch (error) {
        console.error("Error loading shift schedule entry:", error);
        showToast("Error loading entry: " + error.message, "error");
    }
}

// Delete Shift Schedule Entry
async function deleteShiftScheduleEntry(id) {
    if (!confirm("Are you sure you want to delete this shift schedule entry?")) {
        return;
    }

    try {
        const { error } = await window.supabase
            .from("ShiftSchedule")
            .delete()
            .eq("id", id);

        if (error) throw error;

        showToast("Shift schedule entry deleted successfully", "success");
        loadShiftScheduleTable(paginationState.shiftSchedule.currentPage || 1);
        loadPMSDashboardStats();
    } catch (error) {
        console.error("Error deleting shift schedule entry:", error);
        showToast("Error deleting entry: " + error.message, "error");
    }
}

// Initialize Shift Schedule event listeners
document.addEventListener("DOMContentLoaded", () => {
    const prevBtn = document.getElementById("shiftSchedulePrevBtn");
    const nextBtn = document.getElementById("shiftScheduleNextBtn");
    const pageSizeSelect = document.getElementById("shiftSchedulePageSize");
    const plantFilter = document.getElementById("shiftSchedulePlantFilter");
    const shiftFilter = document.getElementById("shiftScheduleShiftFilter");
    const clearFiltersBtn = document.getElementById("clearShiftScheduleFiltersBtn");

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (paginationState.shiftSchedule.currentPage > 1) {
                loadShiftScheduleTable(paginationState.shiftSchedule.currentPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (paginationState.shiftSchedule.currentPage < paginationState.shiftSchedule.totalPages) {
                loadShiftScheduleTable(paginationState.shiftSchedule.currentPage + 1);
            }
        });
    }

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            paginationState.shiftSchedule.pageSize = parseInt(e.target.value);
            paginationState.shiftSchedule.currentPage = 1;
            loadShiftScheduleTable(1);
        });
    }

    if (plantFilter) {
        plantFilter.addEventListener("change", (e) => {
            paginationState.shiftSchedule.plantFilter = e.target.value;
            paginationState.shiftSchedule.currentPage = 1;
            loadShiftScheduleTable(1);
        });
    }

    if (shiftFilter) {
        shiftFilter.addEventListener("change", (e) => {
            paginationState.shiftSchedule.shiftFilter = e.target.value;
            paginationState.shiftSchedule.currentPage = 1;
            loadShiftScheduleTable(1);
        });
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener("click", () => {
            paginationState.shiftSchedule.plantFilter = "";
            paginationState.shiftSchedule.shiftFilter = "";
            if (plantFilter) plantFilter.value = "";
            if (shiftFilter) shiftFilter.value = "";
            paginationState.shiftSchedule.currentPage = 1;
            loadShiftScheduleTable(1);
        });
    }
});

// ==================== LOSS REASON FUNCTIONS ====================

// Load Loss Reason Table
async function loadLossReasonTable(page = 1) {
    const tableBody = document.getElementById("lossReasonTableBody");
    const loadingMessage = document.getElementById("lossReasonLoadingMessage");
    const table = document.getElementById("lossReasonTable");
    const pagination = document.getElementById("lossReasonPagination");
    const errorMessage = document.getElementById("lossReasonErrorMessage");
    const emptyMessage = document.getElementById("lossReasonEmptyMessage");

    if (loadingMessage) loadingMessage.style.display = "block";
    if (table) table.style.display = "none";
    if (pagination) pagination.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";

    try {
        const pageSize = paginationState.lossReason.pageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        // Build query
        const { data, error, count } = await window.supabase
            .from("LossReason")
            .select("*", { count: "exact" })
            .order("Loss Reason", { ascending: true })
            .range(from, to);

        if (error) throw error;

        if (loadingMessage) loadingMessage.style.display = "none";

        // Update pagination state
        paginationState.lossReason.totalItems = count || 0;
        paginationState.lossReason.totalPages = Math.ceil((paginationState.lossReason.totalItems || 0) / pageSize) || 1;
        paginationState.lossReason.currentPage = page;

        if (data && data.length > 0) {
            if (tableBody) {
                tableBody.innerHTML = "";
                data.forEach((item) => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${item["Loss Reason"] || "-"}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-edit" onclick="editLossReasonEntry(${item.id})" title="Edit">
                                    ✏️
                                </button>
                                <button class="btn-delete" onclick="deleteLossReasonEntry(${item.id})" title="Delete">
                                    🗑️
                                </button>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });
            }
            if (table) table.style.display = "table";
            if (pagination) pagination.style.display = "flex";
            updateLossReasonPagination();
        } else {
            if (tableBody) tableBody.innerHTML = "";
            if (table) table.style.display = "none";
            if (emptyMessage) emptyMessage.style.display = "block";
        }
    } catch (error) {
        console.error("Error loading Loss Reason data:", error);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading loss reasons: " + error.message;
            errorMessage.style.display = "block";
        }
        if (table) table.style.display = "none";
    }
}

// Update Loss Reason Pagination UI
function updateLossReasonPagination() {
    const state = paginationState.lossReason;
    const prevBtn = document.getElementById("lossReasonPrevBtn");
    const nextBtn = document.getElementById("lossReasonNextBtn");
    const pageNumbers = document.getElementById("lossReasonPageNumbers");
    const paginationInfo = document.getElementById("lossReasonPaginationInfo");

    if (prevBtn) prevBtn.disabled = state.currentPage === 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;

    if (paginationInfo) {
        const from = state.totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
        const to = Math.min(state.currentPage * state.pageSize, state.totalItems);
        paginationInfo.textContent = `Showing ${from}-${to} of ${state.totalItems}`;
    }

    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPages = 5;
        let startPage = Math.max(1, state.currentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(state.totalPages, startPage + maxPages - 1);
        
        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-page ${i === state.currentPage ? "active" : ""}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener("click", () => loadLossReasonTable(i));
            pageNumbers.appendChild(pageBtn);
        }
    }
}

// Initialize Loss Reason Modal
function initializeLossReasonModal() {
    const openBtn = document.getElementById("openLossReasonFormBtn");
    const closeBtn = document.getElementById("closeLossReasonModalBtn");
    const cancelBtn = document.getElementById("cancelLossReasonFormBtn");
    const modalOverlay = document.getElementById("lossReasonModalOverlay");
    const form = document.getElementById("lossReasonForm");
    const modalTitle = document.getElementById("lossReasonModalTitle");

    if (openBtn) {
        openBtn.addEventListener("click", () => {
            if (modalOverlay) modalOverlay.classList.add("active");
            if (form) {
                form.reset();
                document.getElementById("lossReasonEditId").value = "";
            }
            if (modalTitle) modalTitle.textContent = "Add Loss Reason";
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            if (modalOverlay) modalOverlay.classList.remove("active");
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            if (modalOverlay) modalOverlay.classList.remove("active");
        });
    }

    if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.classList.remove("active");
            }
        });
    }

    if (form) {
        form.addEventListener("submit", handleLossReasonFormSubmit);
    }
}

// Handle Loss Reason Form Submit
async function handleLossReasonFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const editId = document.getElementById("lossReasonEditId").value;
    const submitBtn = document.getElementById("lossReasonSubmitBtn");
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
    }

    const formData = {
        "Loss Reason": document.getElementById("lr_loss_reason").value.trim()
    };

    try {
        let result;
        if (editId) {
            // Update existing entry
            const { data, error } = await window.supabase
                .from("LossReason")
                .update(formData)
                .eq("id", editId)
                .select();
            
            if (error) throw error;
            result = data;
            showToast("Loss reason updated successfully", "success");
        } else {
            // Insert new entry
            const { data, error } = await window.supabase
                .from("LossReason")
                .insert([formData])
                .select();
            
            if (error) throw error;
            result = data;
            showToast("Loss reason added successfully", "success");
        }

        // Close modal and reload table
        const modalOverlay = document.getElementById("lossReasonModalOverlay");
        if (modalOverlay) modalOverlay.classList.remove("active");
        form.reset();
        document.getElementById("lossReasonEditId").value = "";
        
        // Reload table
        loadLossReasonTable(paginationState.lossReason.currentPage || 1);
        
        // Update dashboard stats
        loadPMSDashboardStats();
    } catch (error) {
        console.error("Error saving loss reason:", error);
        showToast("Error saving loss reason: " + error.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Save Loss Reason";
        }
    }
}

// Edit Loss Reason Entry
async function editLossReasonEntry(id) {
    try {
        const { data, error } = await window.supabase
            .from("LossReason")
            .select("*")
            .eq("id", id)
            .single();

        if (error) throw error;

        if (data) {
            document.getElementById("lossReasonEditId").value = id;
            document.getElementById("lr_loss_reason").value = data["Loss Reason"] || "";

            const modalTitle = document.getElementById("lossReasonModalTitle");
            if (modalTitle) modalTitle.textContent = "Edit Loss Reason";

            const modalOverlay = document.getElementById("lossReasonModalOverlay");
            if (modalOverlay) modalOverlay.classList.add("active");
        }
    } catch (error) {
        console.error("Error loading loss reason:", error);
        showToast("Error loading loss reason: " + error.message, "error");
    }
}

// Delete Loss Reason Entry
async function deleteLossReasonEntry(id) {
    if (!confirm("Are you sure you want to delete this loss reason?")) {
        return;
    }

    try {
        const { error } = await window.supabase
            .from("LossReason")
            .delete()
            .eq("id", id);

        if (error) throw error;

        showToast("Loss reason deleted successfully", "success");
        loadLossReasonTable(paginationState.lossReason.currentPage || 1);
        loadPMSDashboardStats();
    } catch (error) {
        console.error("Error deleting loss reason:", error);
        showToast("Error deleting loss reason: " + error.message, "error");
    }
}

// Initialize Loss Reason event listeners
document.addEventListener("DOMContentLoaded", () => {
    const prevBtn = document.getElementById("lossReasonPrevBtn");
    const nextBtn = document.getElementById("lossReasonNextBtn");
    const pageSizeSelect = document.getElementById("lossReasonPageSize");

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (paginationState.lossReason.currentPage > 1) {
                loadLossReasonTable(paginationState.lossReason.currentPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (paginationState.lossReason.currentPage < paginationState.lossReason.totalPages) {
                loadLossReasonTable(paginationState.lossReason.currentPage + 1);
            }
        });
    }

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            paginationState.lossReason.pageSize = parseInt(e.target.value);
            paginationState.lossReason.currentPage = 1;
            loadLossReasonTable(1);
        });
    }
});

// ==================== HOURLY REPORT FUNCTIONS ====================

// Fetch most recent updated/created timestamp for HourlyReport (with filters)
async function fetchHourlyReportMostRecentTimestamp({ dateFilter, shiftFilter, hideArchived }) {
    if (!window.supabase) return null;
    try {
        let lastUpdatedQuery = window.supabase
            .from("HourlyReport")
            .select("updated_at, created_at")
            .order("updated_at", { ascending: false, nulls: "last" })
            .order("created_at", { ascending: false, nulls: "last" })
            .limit(1);

        if (dateFilter) lastUpdatedQuery = lastUpdatedQuery.eq("IoT Date", dateFilter);
        if (shiftFilter) lastUpdatedQuery = lastUpdatedQuery.eq("Shift", shiftFilter);
        if (hideArchived === true) lastUpdatedQuery = lastUpdatedQuery.eq("archived", false);

        const { data, error } = await lastUpdatedQuery;
        if (error) throw error;
        if (data && data.length > 0) {
            return data[0].updated_at || data[0].created_at || null;
        }
    } catch (err) {
        console.warn("Could not fetch latest HourlyReport timestamp:", err.message);
    }
    return null;
}

// Load Hourly Report Table
async function loadHourlyReportTable(page = 1) {
    console.log('📊 loadHourlyReportTable() started, page:', page);
    perfTracker.start('Load Hourly Report Table');
    
    const tableBody = document.getElementById("hourlyReportTableBody");
    const loadingMessage = document.getElementById("hourlyReportLoadingMessage");
    const table = document.getElementById("hourlyReportTable");
    const pagination = document.getElementById("hourlyReportPagination");
    const errorMessage = document.getElementById("hourlyReportErrorMessage");
    const emptyMessage = document.getElementById("hourlyReportEmptyMessage");

    if (loadingMessage) loadingMessage.style.display = "block";
    if (table) table.style.display = "none";
    if (pagination) pagination.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";
    
    // Ensure Supabase is available
    if (!window.supabase) {
        console.error('Supabase not available in loadHourlyReportTable');
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Connection error. Please refresh the page.";
            errorMessage.style.display = "block";
        }
        perfTracker.end('Load Hourly Report Table');
        return;
    }

    try {
        const pageSize = paginationState.hourlyReport.pageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const dateFilter = (paginationState.hourlyReport.dateFilter || "").trim();
        const shiftFilter = (paginationState.hourlyReport.shiftFilter || "").trim();
        // Default to showing all reports (archived + active)
        // Only filter to active if explicitly set to hide archived
        const hideArchived = paginationState.hourlyReport.hideArchived || false;

        // OPTIMIZED: Select only needed columns instead of "*"
        // Note: Column names must match exact Supabase schema
        const selectColumns = `
            id, Plant, "Machine No.", "Sr No", Shift, "Work Day Date", "IoT Date", Time, 
            Operator, "Part No.", "Part Name", Operation, 
            "Cycle Time (Second) per piece", "Hourly Target", "Total Produced Qty.",
            "OK Qty.", "Rej. Qty.", "Rew. Qty.", "Defect Type",
            "Available Time (Minutes)", "Operating Time as per Cycle Time (Minutes)", 
            "Total Down Time (Minutes)", "Loss Reasons", "Cell Name", "Cell Leader",
            archived, created_at, updated_at
        `.replace(/\s+/g, ' ').trim();

        // Build query with specific columns
        let query = window.supabase
            .from("HourlyReport")
            .select(selectColumns, { count: "exact" });

        // Apply filters
        if (dateFilter) {
            query = query.eq("Work Day Date", dateFilter);
        }
        if (shiftFilter) {
            query = query.eq("Shift", shiftFilter);
        }
        // Show BOTH archived and real-time (non-archived) reports together by default
        // Only filter if explicitly requested to hide archived records
        // This allows users to see: archived hourly reports + real-time hourly reports
        if (hideArchived === true) {
            query = query.eq("archived", false);
        }
        // Otherwise show all (archived + real-time) - this is the default behavior

        // OPTIMIZED: Run main query and archive config in PARALLEL
        const queryStart = performance.now();
        
        // Wrap RPC call to handle errors gracefully
        const getArchiveConfig = async () => {
            try {
                return await window.supabase.rpc('get_archive_config');
            } catch (e) {
                return { data: null };
            }
        };
        
        const [mainResult, archiveResult, latestTimestamp] = await Promise.all([
            query
                .order('"Work Day Date"', { ascending: false })
                .order('"Shift"', { ascending: true })
                .order('"Time"', { ascending: true })
                .range(from, to),
            getArchiveConfig(),
            fetchHourlyReportMostRecentTimestamp({ dateFilter, shiftFilter, hideArchived })
        ]);
        
        console.log(`⚡ Parallel queries completed in ${(performance.now() - queryStart).toFixed(0)}ms`);

        const { data, error, count } = mainResult;
        if (error) throw error;

        if (loadingMessage) loadingMessage.style.display = "none";

        // Update pagination state
        paginationState.hourlyReport.totalItems = count || 0;
        paginationState.hourlyReport.totalPages = Math.ceil((paginationState.hourlyReport.totalItems || 0) / pageSize) || 1;
        paginationState.hourlyReport.currentPage = page;

        // Get archive frequency from parallel query result
        let archiveFrequencyDays = 8; // Default
        if (archiveResult.data && archiveResult.data.length > 0) {
            archiveFrequencyDays = archiveResult.data[0].archive_frequency_days || 8;
        }

        if (data && data.length > 0) {
            if (tableBody) {
                tableBody.innerHTML = "";
                data.forEach((item) => {
                    const row = document.createElement("tr");
                    const isArchived = item.archived === true;
                    
                    // Calculate archive status display
                    let archiveStatus;
                    if (isArchived) {
                        archiveStatus = '<span class="status-badge status-archived" title="Archived - Read Only">Archived</span>';
                    } else {
                        // Use Custom Date if available, otherwise use Date field
                        const recordDate = item["Work Day Date"] || item["IoT Date"];
                        const daysUntilArchive = recordDate ? calculateDaysUntilArchive(recordDate, archiveFrequencyDays) : null;
                        if (daysUntilArchive !== null) {
                            if (daysUntilArchive === 0) {
                                archiveStatus = '<span class="status-badge status-active" title="Will be archived soon">Archiving soon</span>';
                            } else {
                                const dayText = daysUntilArchive === 1 ? 'day' : 'days';
                                archiveStatus = `<span class="status-badge status-active" title="Will be archived in ${daysUntilArchive} ${dayText}">${daysUntilArchive} ${dayText} to archive</span>`;
                            }
                        } else {
                            archiveStatus = '<span class="status-badge status-active" title="Active - Can be modified">Active</span>';
                        }
                    }
                    
                    row.innerHTML = `
                        <td>${item.Plant || "-"}</td>
                        <td>${item["Machine No."] || "-"}</td>
                        <td>${item["Sr No"] || "-"}</td>
                        <td>${item.Shift || "-"}</td>
                        <td>${item["Work Day Date"] ? formatWorkDayDate(item["Work Day Date"]) : "-"}</td>
                        <td>${item.Time || "-"}</td>
                        <td>${item.Operator || "-"}</td>
                        <td>${item["Part No."] || "-"}</td>
                        <td>${item["Part Name"] || "-"}</td>
                        <td>${item.Operation || "-"}</td>
                        <td>${item["Cycle Time (Second) per piece"] != null ? item["Cycle Time (Second) per piece"] : "-"}</td>
                        <td>${item["Hourly Target"] != null ? item["Hourly Target"] : "-"}</td>
                        <td>${item["Total Produced Qty."] != null ? item["Total Produced Qty."] : "-"}</td>
                        <td>${item["OK Qty."] || "-"}</td>
                        <td>${item["Rej. Qty."] || "-"}</td>
                        <td>${item["Rew. Qty."] || "-"}</td>
                        <td>${item["Defect Type"] || "-"}</td>
                        <td>${item["Available Time (Minutes)"] != null ? parseFloat(item["Available Time (Minutes)"]).toFixed(2) : "-"}</td>
                        <td>${item["Operating Time as per Cycle Time (Minutes)"] != null ? parseFloat(item["Operating Time as per Cycle Time (Minutes)"]).toFixed(2) : "-"}</td>
                        <td>${item["Total Down Time (Minutes)"] != null ? parseFloat(item["Total Down Time (Minutes)"]).toFixed(2) : "-"}</td>
                        <td>${item["Loss Reasons"] || "-"}</td>
                        <td>${item["Cell Name"] || "-"}</td>
                        <td>${item["Cell Leader"] || "-"}</td>
                        <td>${archiveStatus}</td>
                        <td>${item["IoT Date"] ? formatWorkDayDate(item["IoT Date"]) : "-"}</td>
                    `;
                    tableBody.appendChild(row);
                });
            }
            if (table) table.style.display = "table";
            if (pagination) pagination.style.display = "flex";
            updateHourlyReportPagination();
            
            // Update Last Updated timestamp
            updateHourlyReportLastUpdated(data, latestTimestamp);
        } else {
            if (tableBody) tableBody.innerHTML = "";
            if (table) table.style.display = "none";
            if (emptyMessage) emptyMessage.style.display = "block";
            
            // Hide Last Updated when no data
            const lastUpdatedContainer = document.getElementById("hourlyReportLastUpdated");
            if (lastUpdatedContainer) lastUpdatedContainer.style.display = "none";
        }
    } catch (error) {
        console.error("Error loading Hourly Report data:", error);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading hourly reports: " + error.message;
            errorMessage.style.display = "block";
        }
        if (table) table.style.display = "none";
    }
    
    perfTracker.end('Load Hourly Report Table');
    console.log('📊 loadHourlyReportTable() completed');
}

// Update Hourly Report Pagination UI
function updateHourlyReportPagination() {
    const state = paginationState.hourlyReport;
    const prevBtn = document.getElementById("hourlyReportPrevBtn");
    const nextBtn = document.getElementById("hourlyReportNextBtn");
    const pageNumbers = document.getElementById("hourlyReportPageNumbers");
    const paginationInfo = document.getElementById("hourlyReportPaginationInfo");

    if (prevBtn) prevBtn.disabled = state.currentPage === 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;

    if (paginationInfo) {
        const from = state.totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
        const to = Math.min(state.currentPage * state.pageSize, state.totalItems);
        paginationInfo.textContent = `Showing ${from}-${to} of ${state.totalItems}`;
    }

    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPages = 5;
        let startPage = Math.max(1, state.currentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(state.totalPages, startPage + maxPages - 1);
        
        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-page ${i === state.currentPage ? "active" : ""}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener("click", () => loadHourlyReportTable(i));
            pageNumbers.appendChild(pageBtn);
        }
    }
}

// Safely convert Supabase timestamp (with/without TZ) into Date
function parseHourlyTimestamp(timestamp) {
    if (!timestamp) return null;
    let iso = String(timestamp);
    if (!iso.includes("Z") && !iso.includes("+")) {
        iso = iso + "Z";
    }
    const parsed = new Date(iso);
    return isNaN(parsed.getTime()) ? null : parsed;
}

// Update Hourly Report Last Updated timestamp
function updateHourlyReportLastUpdated(data, latestTimestamp) {
    const lastUpdatedContainer = document.getElementById("hourlyReportLastUpdated");
    const lastUpdatedTime = document.getElementById("hourlyReportLastUpdatedTime");
    
    if (!lastUpdatedContainer || !lastUpdatedTime) return;
    
    // Find the most recent "updated_at" or "created_at" timestamp from the data
    // Prefer backend-fetched latest timestamp to include rows outside the current page
    let mostRecentDate = parseHourlyTimestamp(latestTimestamp);
    
    if (data && data.length > 0) {
        for (const item of data) {
            // Use updated_at first, then created_at as fallback
            const timestamp = item["updated_at"] || item["created_at"] || item["Work Day Date"];
            if (timestamp) {
                const itemDate = parseHourlyTimestamp(timestamp);
                if (!mostRecentDate || (itemDate && itemDate > mostRecentDate)) {
                    mostRecentDate = itemDate;
                }
            }
        }
    }
    
    if (mostRecentDate) {
        // Format the date in IST timezone
        const formattedDate = mostRecentDate.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
        });
        lastUpdatedTime.textContent = formattedDate;
        lastUpdatedContainer.style.display = "flex";
    } else {
        lastUpdatedContainer.style.display = "none";
    }
}

// =============================================
// AUTO-UPDATE COUNTDOWN TIMER (5-minute intervals)
// =============================================

let countdownInterval = null;
let lastAutoRefreshMinute = -1;

// Start the countdown timer for next auto-update
function startAutoUpdateCountdown() {
    const countdownEl = document.getElementById("nextAutoUpdateCountdown");
    if (!countdownEl) return;
    
    // Clear any existing interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    // Reset last refresh minute
    lastAutoRefreshMinute = -1;
    
    // Update countdown every second
    countdownInterval = setInterval(() => {
        updateCountdown(countdownEl);
    }, 1000);
    
    // Initial update
    updateCountdown(countdownEl);
}

// Calculate and display time until next 5-minute mark
function updateCountdown(countdownEl) {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    // Calculate next 5-minute mark
    const minutesUntilNext = 5 - (minutes % 5);
    let totalSecondsUntilNext = (minutesUntilNext * 60) - seconds;
    
    // If we're exactly on a 5-minute mark, show 5:00
    if (totalSecondsUntilNext <= 0) {
        totalSecondsUntilNext = 5 * 60;
    }
    
    // Format as MM:SS
    const displayMinutes = Math.floor(totalSecondsUntilNext / 60);
    const displaySeconds = totalSecondsUntilNext % 60;
    
    const formattedTime = `${displayMinutes}:${displaySeconds.toString().padStart(2, '0')}`;
    
    if (countdownEl) {
        countdownEl.textContent = formattedTime;
        
        // Change color when less than 30 seconds
        if (totalSecondsUntilNext <= 30) {
            countdownEl.style.color = '#10b981'; // Green
            countdownEl.style.animation = 'pulse 0.5s ease-in-out infinite';
        } else if (totalSecondsUntilNext <= 60) {
            countdownEl.style.color = '#f59e0b'; // Orange
            countdownEl.style.animation = 'none';
        } else {
            countdownEl.style.color = '#2563eb'; // Blue
            countdownEl.style.animation = 'none';
        }
    }
    
    // AUTO-REFRESH: When countdown reaches ~5 seconds after a 5-minute mark,
    // refresh the table to show new data from the scheduled job
    const currentFiveMinMark = Math.floor(minutes / 5);
    if (totalSecondsUntilNext >= 295 && totalSecondsUntilNext <= 300) {
        // We just passed a 5-minute mark (within first 5 seconds)
        if (lastAutoRefreshMinute !== currentFiveMinMark) {
            lastAutoRefreshMinute = currentFiveMinMark;
            console.log('🔄 Auto-refreshing hourly report after scheduled update...');
            
            // Refresh the hourly report table
            const hourlyReportPage = document.getElementById("hourlyReportPage");
            if (hourlyReportPage && hourlyReportPage.classList.contains("active")) {
                loadHourlyReportTable(paginationState.hourlyReport.currentPage || 1);
            }
        }
    }
}

// Stop the countdown timer
function stopAutoUpdateCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    lastAutoRefreshMinute = -1;
}

// Initialize countdown when hourly report page is shown
function initAutoUpdateCountdown() {
    // Start countdown when on hourly report page
    const hourlyReportPage = document.getElementById("hourlyReportPage");
    if (hourlyReportPage && hourlyReportPage.classList.contains("active")) {
        startAutoUpdateCountdown();
    }
}

// Fetch the latest timestamp from the entire HourlyReport table
async function fetchHourlyReportLastUpdated() {
    try {
        const { data, error } = await window.supabase
            .from("HourlyReport")
            .select('updated_at, created_at, "Work Day Date"')
            .order('"updated_at"', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        
        // Use updated_at timestamp to show when report was last generated
        const timestamp = data && data.length > 0 ? (data[0]["updated_at"] || data[0]["created_at"] || data[0]["Work Day Date"]) : null;
        
        if (timestamp) {
            const lastUpdatedContainer = document.getElementById("hourlyReportLastUpdated");
            const lastUpdatedTime = document.getElementById("hourlyReportLastUpdatedTime");
            
            if (lastUpdatedContainer && lastUpdatedTime) {
                // Properly handle timezone
                let iso = String(timestamp);
                if (!iso.includes("Z") && !iso.includes("+")) {
                    iso = iso + "Z";
                }
                const mostRecentDate = new Date(iso);
                
                const formattedDate = mostRecentDate.toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                    timeZone: 'Asia/Kolkata'
                });
                lastUpdatedTime.textContent = formattedDate;
                lastUpdatedContainer.style.display = "flex";
            }
        }
    } catch (error) {
        console.error("Error fetching last updated timestamp:", error);
    }
}

// Generate Hour Group Production Report (using Supabase backend function)
async function generateHourlyReport() {
    const generateBtn = document.getElementById("generateHourlyReportBtn");
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
    }

    try {
        showToast("Generating hour group production report...", "info");

        // Call backend function to generate report server-side
        const { data, error } = await window.supabase.rpc('generate_hourly_report_scheduled');
        if (error) throw error;

        const created = data?.reports_created ?? 0;
        showToast(`Hourly report generated. ${created} records created.`, "success");

        // Supabase handles all the processing now

        // Reload table and update dashboard
        loadHourlyReportTable(1);
        loadPMSDashboardStats();

        // Reload settings table
        const currentPage = document.getElementById("settingsPage")?.getAttribute("data-page") ||
                           paginationState.settings.currentPage || 1;
        loadSettingsTable(parseInt(currentPage));

    } catch (error) {
        console.error("Error generating hour group production report:", error);
        showToast("Error generating report: " + error.message, "error");
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<span class="btn-icon">📊</span> Generate Report';
        }
    }
}

// Check if a date can be modified (not archived)
async function canModifyDate(dateStr) {
    try {
        // Parse the date string (format: DD/MM/YYYY)
        const [day, month, year] = dateStr.split('/');
        const reportDate = new Date(year, month - 1, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Calculate 8 days ago
        const eightDaysAgo = new Date(today);
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
        
        // Check if date is within the last 8 days
        return reportDate >= eightDaysAgo;
    } catch (error) {
        console.error("Error checking if date can be modified:", error);
        return false;
    }
}

// Check if IoT data timestamp is within modifiable period (last 8 days)
function canModifyIoTData(timestamp) {
    try {
        const dataDate = new Date(timestamp);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const eightDaysAgo = new Date(today);
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
        
        return dataDate >= eightDaysAgo;
    } catch (error) {
        console.error("Error checking if IoT data can be modified:", error);
        return false;
    }
}

// Manually trigger archiving (on-demand) - Archives both Hourly Reports and IoT Data
async function archiveOldHourlyReports() {
    try {
        showToast("Archiving old reports and IoT data...", "info");
        
        // Archive hourly reports (now also unarchives records within the window)
        const { data: reportData, error: reportError } = await window.supabase.rpc('archive_old_hourly_reports');
        if (reportError) throw reportError;
        
        // Archive IoT data (now also unarchives records within the window)
        const { data: iotData, error: iotError } = await window.supabase.rpc('archive_old_iot_data');
        if (iotError) throw iotError;
        
        const reportArchived = reportData?.[0]?.archived_count || 0;
        const reportUnarchived = reportData?.[0]?.unarchived_count || 0;
        const iotArchived = iotData?.[0]?.archived_count || 0;
        const iotUnarchived = iotData?.[0]?.unarchived_count || 0;
        
        let message = `Archived ${reportArchived} hourly reports and ${iotArchived} IoT data records.`;
        if (reportUnarchived > 0 || iotUnarchived > 0) {
            message += ` Unarchived ${reportUnarchived + iotUnarchived} records within the archive window.`;
        }
        
        showToast(message, "success");
        
        // Reload the tables to reflect changes
        loadHourlyReportTable(paginationState.hourlyReport.currentPage);
        loadIoTDataTable(paginationState.iotData.currentPage);
        
        return { 
            success: true, 
            reportArchived, 
            reportUnarchived,
            iotArchived, 
            iotUnarchived,
            message 
        };
    } catch (error) {
        console.error("Error archiving:", error);
        showToast("Error archiving: " + error.message, "error");
        return { success: false, error: error.message };
    }
}

// Unarchive IoT data and trigger reprocessing
async function unarchiveIoTData(startDate = null, endDate = null, machineNo = null) {
    try {
        showToast("Unarchiving IoT data...", "info");
        
        const { data, error } = await window.supabase.rpc('unarchive_iot_data', {
            p_start_date: startDate,
            p_end_date: endDate,
            p_machine_no: machineNo
        });
        
        if (error) throw error;
        
        const unarchivedCount = data?.[0]?.unarchived_count || 0;
        const message = data?.[0]?.message || 'Unarchiving completed';
        
        showToast(`${message}. ${unarchivedCount} records unarchived.`, "success");
        
        // Optionally trigger hourly report regeneration
        if (unarchivedCount > 0) {
            const regenerate = confirm(`${unarchivedCount} IoT data records unarchived. Do you want to regenerate hourly reports for this data?`);
            if (regenerate) {
                await generateHourlyReport();
            }
        }
        
        return { success: true, unarchivedCount, message };
    } catch (error) {
        console.error("Error unarchiving IoT data:", error);
        showToast("Error unarchiving IoT data: " + error.message, "error");
        return { success: false, error: error.message };
    }
}

// Process Hour Group Data - Groups IoT data by schedule time groups
async function processHourGroupData(iotData, timeGroups, timeGroupMap) {
    const reportRecords = [];
    const now = new Date();
    
    // Helper function to calculate Work Day Date
    // Work day starts at 07:00 and ends at 06:59 next day
    // If time is 00:00 - 06:59, use previous day as work day
    // If time is 07:00 - 23:59, use same day as work day
    function getWorkDayDate(timestamp) {
        const istFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });
        const timeParts = istFormatter.formatToParts(timestamp);
        const hour = parseInt(timeParts.find(p => p.type === "hour").value);
        
        // Create a copy of the timestamp in IST
        const istDate = new Date(timestamp.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        
        // If hour is 00-06 (before 07:00), subtract one day to get work day
        if (hour >= 0 && hour < 7) {
            istDate.setDate(istDate.getDate() - 1);
        }
        
        // Return as ISO string for timestamp storage
        return istDate;
    }
    
    // Helper function to get time range from timestamp using IST timezone
    // Matches the time groups from schedule
    function getTimeRangeFromTimestamp(timestamp) {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });
        const timeParts = formatter.formatToParts(timestamp);
        const hour = parseInt(timeParts.find(p => p.type === "hour").value);
        const minute = parseInt(timeParts.find(p => p.type === "minute").value);
        
        // Find matching time group from schedule
        for (const timeRange of timeGroups) {
            // Skip undefined or invalid time ranges
            if (!timeRange || typeof timeRange !== 'string') continue;

            const [startTime, endTime] = timeRange.split(" - ");
            const [startHour, startMin] = startTime.split(":").map(Number);
            const [endHour, endMin] = endTime.split(":").map(Number);
            
            let startMinutes = startHour * 60 + startMin;
            let endMinutes = endHour * 60 + endMin;
            let checkMinutes = hour * 60 + minute;
            
            // Handle overnight shifts
            if (endMinutes < startMinutes) {
                endMinutes += 24 * 60;
                if (checkMinutes < startMinutes) {
                    checkMinutes += 24 * 60;
                }
            }
            
            if (checkMinutes >= startMinutes && checkMinutes < endMinutes) {
                return timeRange;
            }
        }
        
        // Fallback: create hour-based range if no match found
        const timeStart = String(hour).padStart(2, "0") + ":00";
        const timeEnd = String((hour + 1) % 24).padStart(2, "0") + ":00";
        return `${timeStart} - ${timeEnd}`;
    }
    
    // Helper function to get time range boundaries as Date objects
    function getTimeRangeBoundaries(timeRange, referenceDate) {
        const [startTime, endTime] = timeRange.split(" - ");
        const [startHour, startMin] = startTime.split(":").map(Number);
        const [endHour, endMin] = endTime.split(":").map(Number);
        
        const startDate = new Date(referenceDate);
        startDate.setHours(startHour, startMin, 0, 0);
        
        const endDate = new Date(referenceDate);
        endDate.setHours(endHour, endMin, 0, 0);
        
        // Handle overnight shifts
        if (endDate <= startDate) {
            endDate.setDate(endDate.getDate() + 1);
        }
        
        return { start: startDate, end: endDate };
    }
    
    // Group IoT data by date, time group, and other key fields
    const groupedData = {};
    
    for (let i = 0; i < iotData.length; i++) {
        const item = iotData[i];
        if (!item.Timestamp) continue;
        
        const timestamp = new Date(item.Timestamp);
        const timeRange = getTimeRangeFromTimestamp(timestamp);
        const dateFormatted = formatDateForReport(timestamp);
        
        // Get time group info from schedule
        // Prefer IoT Shift; fall back to schedule; allow missing schedule entry
        let timeGroupInfo = timeGroupMap[timeRange];
        if (!timeGroupInfo) {
            timeGroupInfo = {
                shift: item["Shift"] || "",
                availableTime: item["Available Time"] || 0,
                plannedDownTime: item["Planned Down Time"] || 0
            };
        }
        
        const shift = item["Shift"] || timeGroupInfo.shift || "";
        const scheduleAvailableTime = timeGroupInfo.availableTime || 0; // Keep schedule time for reference
        const lossReason = item["Loss Reasons"] || "No Loss";
        const partCountPerCycle = (item["Part Count Per Cycle"] > 0) ? item["Part Count Per Cycle"] : 1;
        const cycleTime = (item["Cycle Time"] > 0) ? item["Cycle Time"] : 1;
        
        // Create unique key: Date|Time|Shift|Operator|PartNo|PartName|Operation|LossReason
        const operator = item["Operator Code"] || "";
        const partNo = item["Part No."] || "";
        const partName = item["Part Name"] || "";
        const operation = item.Operation || "";
        
        const key = `${dateFormatted}|${timeRange}|${shift}|${operator}|${partNo}|${partName}|${operation}|${lossReason}`;
        
        if (!groupedData[key]) {
            groupedData[key] = {
                date: dateFormatted,
                timeRange: timeRange,
                shift: shift,
                operator: operator,
                partNo: partNo,
                partName: partName,
                operation: operation,
                lossReason: lossReason,
                plant: item.Plant || "",
                machineNo: item["Machine No."] || "",
                cellName: item["Cell Name"] || "",
                cellLeader: item["Cell Leader"] || "",
                cycleTime: cycleTime,
                partCountPerCycle: partCountPerCycle,
                scheduleAvailableTime: scheduleAvailableTime, // Original from schedule
                availableTime: 0, // Will be calculated from timestamps
                totalProducedQty: 0,
                operatingTime: 0,
                timestamps: [],
                firstTimestamp: null,
                lastTimestamp: null,
                workDayDate: item["Work Day Date"] || null
            };
        }
        
        // Aggregate data
        groupedData[key].totalProducedQty += (item.Value || 0) * partCountPerCycle;
        groupedData[key].operatingTime += ((item.Value || 0) * cycleTime) / 60; // Convert to minutes
        groupedData[key].timestamps.push(timestamp);
        
        // Track first and last timestamps
        if (!groupedData[key].firstTimestamp || timestamp < groupedData[key].firstTimestamp) {
            groupedData[key].firstTimestamp = timestamp;
        }
        if (!groupedData[key].lastTimestamp || timestamp > groupedData[key].lastTimestamp) {
            groupedData[key].lastTimestamp = timestamp;
        }
    }
    
    // STEP 2: Calculate Available Time based on timestamp ranges when settings change within an hour
    // Using proportional distribution based on actual timestamp durations (matching Google Apps Script logic)
    
    // Group records by date, time range, and machine to find overlapping settings
    const dateTimeGroups = {};
    for (const key of Object.keys(groupedData)) {
        const data = groupedData[key];
        const dateTimeKey = `${data.date}|${data.timeRange}|${data.machineNo}`;
        
        if (!dateTimeGroups[dateTimeKey]) {
            dateTimeGroups[dateTimeKey] = [];
        }
        dateTimeGroups[dateTimeKey].push({ key, data });
    }
    
    // For each date+time+machine group, calculate Available Time based on timestamp ranges
    for (const dateTimeKey of Object.keys(dateTimeGroups)) {
        const settingsInHour = dateTimeGroups[dateTimeKey];
        const totalScheduleMinutes = settingsInHour[0].data.scheduleAvailableTime;
        
        if (settingsInHour.length === 1) {
            // Only one setting in this hour - use the full schedule Available Time
            const { key, data } = settingsInHour[0];
            groupedData[key].availableTime = data.scheduleAvailableTime;
        } else {
            // Multiple settings in this hour - calculate Available Time proportionally
            // Based on actual timestamp duration (last - first timestamp) for each setting
            
            // Step 1: Calculate working time for each entry based on actual timestamp range
            let totalWorkingTime = 0;
            const workingEntries = [];
            
            for (const setting of settingsInHour) {
                const { key, data } = setting;
                
                // Sort timestamps and calculate duration from first to last
                data.timestamps.sort((a, b) => a - b);
                const startTimestamp = data.timestamps[0];
                const endTimestamp = data.timestamps[data.timestamps.length - 1];
                
                // Calculate entry working time in minutes (duration this setting was active)
                // Add 1 minute minimum to account for single-timestamp entries
                let entryWorkingTime = Math.ceil((endTimestamp - startTimestamp) / (1000 * 60));
                if (entryWorkingTime === 0) {
                    entryWorkingTime = 1; // Minimum 1 minute for entries with single timestamp
                }
                
                totalWorkingTime += entryWorkingTime;
                workingEntries.push({
                    key: key,
                    workingTime: entryWorkingTime,
                    startTimestamp: startTimestamp,
                    endTimestamp: endTimestamp
                });
            }
            
            // Step 2: Distribute available time proportionally based on working time
            for (const entry of workingEntries) {
                let availableTime;
                
                if (totalWorkingTime > 0) {
                    // Proportional distribution: (entryWorkingTime / totalWorkingTime) * totalAvailableTime
                    availableTime = Math.round((entry.workingTime / totalWorkingTime) * totalScheduleMinutes * 100) / 100;
                } else {
                    // Fallback: equal distribution
                    availableTime = Math.round((totalScheduleMinutes / settingsInHour.length) * 100) / 100;
                }
                
                groupedData[entry.key].availableTime = availableTime;
            }
            
            // Step 3: Adjust to ensure total equals schedule time (handle rounding)
            let totalCalculatedTime = workingEntries.reduce((sum, e) => sum + groupedData[e.key].availableTime, 0);
            const difference = totalScheduleMinutes - totalCalculatedTime;
            
            if (Math.abs(difference) > 0.01 && workingEntries.length > 0) {
                // Add/subtract difference to the largest entry
                const largestEntry = workingEntries.reduce((max, e) => 
                    groupedData[e.key].availableTime > groupedData[max.key].availableTime ? e : max
                );
                groupedData[largestEntry.key].availableTime = 
                    Math.round((groupedData[largestEntry.key].availableTime + difference) * 100) / 100;
            }
        }
    }
    
    // Convert grouped data to report records
    let srNo = 1;
    const sortedTimeGroups = [...timeGroups]; // Preserve schedule order
    
    // Sort by date, then by time group order, then by first timestamp
    const sortedKeys = Object.keys(groupedData).sort((a, b) => {
        const aParts = a.split("|");
        const bParts = b.split("|");
        const aDate = aParts[0];
        const bDate = bParts[0];
        const aTimeRange = aParts[1];
        const bTimeRange = bParts[1];
        
        // First sort by date
        if (aDate !== bDate) {
            return aDate.localeCompare(bDate);
        }
        
        // Then sort by time group order
        const aTimeIndex = sortedTimeGroups.indexOf(aTimeRange);
        const bTimeIndex = sortedTimeGroups.indexOf(bTimeRange);
        if (aTimeIndex !== bTimeIndex) {
        return aTimeIndex - bTimeIndex;
        }
        
        // Finally sort by first timestamp (for multiple settings within same hour)
        const aFirstTime = groupedData[a].firstTimestamp;
        const bFirstTime = groupedData[b].firstTimestamp;
        return aFirstTime - bFirstTime;
    });
    
    for (const key of sortedKeys) {
        const data = groupedData[key];
        const totalDownTime = Math.max(0, data.availableTime - data.operatingTime);
        const isWorkingHour = data.availableTime > 0;
        const hourlyTarget = isWorkingHour ? Math.floor((data.availableTime * 60) / data.cycleTime * data.partCountPerCycle) : 0;
        
        // Determine loss reason
        let finalLossReason = data.lossReason;
        if (data.availableTime === 0) {
            finalLossReason = "Planned Shutdown";
        } else if (data.lossReason === "No Plan" && data.totalProducedQty === 0) {
            finalLossReason = "No Plan";
        } else if (data.lossReason === "No Plan" && data.totalProducedQty > 0) {
            finalLossReason = "Production Occurred";
        }
        
        // Work Day Date: prefer IoT value, else derive from first timestamp
        const workDayDate = data.workDayDate ? new Date(data.workDayDate) : (data.firstTimestamp ? getWorkDayDate(data.firstTimestamp) : now);
        
        reportRecords.push({
            "Plant": data.plant,
            "Machine No.": data.machineNo,
            "Sr No": srNo++,
            "Shift": data.shift,
            "IoT Date": formatDateForDB(data.firstTimestamp),  // DATE type: YYYY-MM-DD format
            "Time": data.timeRange,
            "Operator": data.operator,
            "Part No.": data.partNo,
            "Part Name": data.partName,
            "Operation": data.operation,
            "Cycle Time (Second) per piece": data.cycleTime,
            "Hourly Target": hourlyTarget,
            "Total Produced Qty.": data.totalProducedQty,
            "OK Qty.": "",
            "Rej. Qty.": "",
            "Rew. Qty.": "",
            "Defect Type": "",
            "Available Time (Minutes)": parseFloat(data.availableTime.toFixed(2)),
            "Operating Time as per Cycle Time (Minutes)": parseFloat(data.operatingTime.toFixed(2)),
            "Total Down Time (Minutes)": parseFloat(totalDownTime.toFixed(2)),
            "Loss Reasons": finalLossReason,
            "Cell Name": data.cellName,
            "Cell Leader": data.cellLeader,
            "Work Day Date": formatDateForDB(workDayDate),  // DATE type: YYYY-MM-DD format
            "archived": false
        });
    }
    
    return reportRecords;
}

// Helper function to format date for PostgreSQL DATE type (YYYY-MM-DD)
// Used when inserting into database
function formatDateForDB(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    
    // Get date in IST timezone
    const istDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, "0");
    const day = String(istDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;  // PostgreSQL DATE format
}

// Helper function to format date for report (DD/MM/YYYY)
// Format date for report in DD/MM/YYYY format using IST timezone
function formatDateForReport(date) {
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    
    // Format date in IST timezone
    const istDateStr = d.toLocaleString("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
    
    // Parse the IST date string (format: DD/MM/YYYY)
    // If already in DD/MM/YYYY format, return as is
    if (istDateStr.includes('/')) {
        return istDateStr;
    }
    
    // Fallback: manual formatting using IST date components
    const istDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const day = String(istDate.getDate()).padStart(2, "0");
    const month = String(istDate.getMonth() + 1).padStart(2, "0");
    const year = istDate.getFullYear();
    return `${day}/${month}/${year}`;
}

// ==================== ARCHIVE CONFIGURATION FUNCTIONS ====================

// Load archive configuration
async function loadArchiveConfig() {
    try {
        const { data, error } = await window.supabase.rpc('get_archive_config');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            const config = data[0];
            
            // Populate form fields
            document.getElementById('archiveFrequencyDays').value = config.archive_frequency_days || 8;
            document.getElementById('autoArchiveEnabled').checked = config.auto_archive_enabled !== false;
            document.getElementById('archiveTimeHour').value = config.archive_time_hour || 0;
            document.getElementById('archiveTimeMinute').value = config.archive_time_minute || 0;
            document.getElementById('archiveTimezone').value = config.timezone || 'UTC';
            
            return config;
        }
        
        return null;
    } catch (error) {
        console.error("Error loading archive config:", error);
        showToast("Error loading archive configuration: " + error.message, "error");
        return null;
    }
}

// Save archive configuration
async function saveArchiveConfig(event) {
    if (event) {
        event.preventDefault();
    }
    
    const saveBtn = document.getElementById('saveArchiveConfigBtn');
    const statusDiv = document.getElementById('archiveConfigStatus');
    
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="btn-icon">⏳</span> Saving...';
    }
    
    try {
        const frequencyDays = parseInt(document.getElementById('archiveFrequencyDays').value);
        const autoEnabled = document.getElementById('autoArchiveEnabled').checked;
        const archiveHour = parseInt(document.getElementById('archiveTimeHour').value);
        const archiveMinute = parseInt(document.getElementById('archiveTimeMinute').value);
        const timezone = document.getElementById('archiveTimezone').value;
        
        // Validate inputs
        if (frequencyDays < 1 || frequencyDays > 365) {
            throw new Error("Archive frequency must be between 1 and 365 days");
        }
        
        if (archiveHour < 0 || archiveHour > 23) {
            throw new Error("Archive hour must be between 0 and 23");
        }
        
        if (archiveMinute < 0 || archiveMinute > 59) {
            throw new Error("Archive minute must be between 0 and 59");
        }
        
        const { data, error } = await window.supabase.rpc('update_archive_config', {
            p_frequency_days: frequencyDays,
            p_auto_enabled: autoEnabled,
            p_archive_hour: archiveHour,
            p_archive_minute: archiveMinute,
            p_timezone: timezone
        });
        
        if (error) throw error;
        
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.backgroundColor = '#d1fae5';
            statusDiv.style.color = '#065f46';
            statusDiv.textContent = 'Archive configuration saved successfully!';
        }
        
        showToast("Archive configuration saved successfully!", "success");
        
        // Close modal after a short delay
        setTimeout(() => {
            closeArchiveConfigModal();
        }, 1500);
        
    } catch (error) {
        console.error("Error saving archive config:", error);
        
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.backgroundColor = '#fee2e2';
            statusDiv.style.color = '#991b1b';
            statusDiv.textContent = 'Error: ' + error.message;
        }
        
        showToast("Error saving archive configuration: " + error.message, "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span class="btn-icon">💾</span> Save Configuration';
        }
    }
}

// Open archive configuration modal
function openArchiveConfigModal() {
    const modal = document.getElementById('archiveConfigModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        loadArchiveConfig();
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
    }
}

// Close archive configuration modal
function closeArchiveConfigModal() {
    const modal = document.getElementById('archiveConfigModal');
    const statusDiv = document.getElementById('archiveConfigStatus');
    
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    
    if (statusDiv) {
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
    }
    
    // Restore body scroll
    document.body.style.overflow = '';
}

// ==================== TASK MANAGER FUNCTIONS ====================

// Initialize Task Manager Modal
function initializeTaskManagerModal() {
    const modal = document.getElementById("taskManagerModal");
    const form = document.getElementById("taskManagerForm");
    const closeBtn = document.getElementById("closeTaskManagerModal");
    
    if (!modal || !form) return;
    
    const closeModal = () => {
        modal.style.display = "none";
        form.reset();
        // Clear any error messages
        const errorMsg = document.getElementById("taskManagerErrorMessage");
        if (errorMsg) errorMsg.style.display = "none";
    };
    
    if (closeBtn) {
        closeBtn.addEventListener("click", closeModal);
    }
    
    // Close modal when clicking outside
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.style.display === "flex") {
            closeModal();
        }
    });
    
    // Handle form submission
    form.addEventListener("submit", handleTaskFormSubmit);
}

// ==================== WORK CENTER MASTER FUNCTIONS ====================

async function handleWorkCenterFormSubmit() {
    const form = document.getElementById("workCenterForm");
    if (!form) return;
    
    const formData = new FormData(form);
    const workCenterData = {
        "Work Center": formData.get("workCenter"),
        "Plant": formData.get("plant"),
        "Machine No.": formData.get("machineNo"),
        "Machine No.": formData.get("machineName"),
        "Cell Name": formData.get("cellName"),
        "Cell Leader": formData.get("cellLeader")
    };
    
    try {
        const { error } = await window.supabase
            .from("Work Center Master")
            .insert([workCenterData]);
        
        if (error) throw error;
        
        showToast("Work center added successfully!", "success");
        form.reset();
        document.getElementById("workCenterModal").style.display = "none";
        loadWorkCenterMasterTable(1);
    } catch (error) {
        console.error("Error adding work center:", error);
        showToast("Error adding work center: " + error.message, "error");
    }
}

function openEditWorkCenterModal(item) {
    const modal = document.getElementById("workCenterModal");
    const form = document.getElementById("workCenterForm");
    
    if (!modal || !form) return;
    
    // Populate form with item data
    form.querySelector('[name="workCenter"]').value = item["Work Center"] || "";
    form.querySelector('[name="plant"]').value = item.Plant || "";
    form.querySelector('[name="machineNo"]').value = item["Machine No."] || "";
    form.querySelector('[name="machineName"]').value = item["Machine No."] || "";
    form.querySelector('[name="cellName"]').value = item["Cell Name"] || "";
    form.querySelector('[name="cellLeader"]').value = item["Cell Leader"] || "";
    
    // Store the item's ID or unique identifier for update
    form.dataset.editId = item.id || item["Sr No"] || "";
    
    modal.style.display = "flex";
}

async function deleteWorkCenter(id) {
    if (!confirm("Are you sure you want to delete this work center?")) return;
    
    try {
        const { error } = await window.supabase
            .from("Work Center Master")
            .delete()
            .eq("id", id);
        
        if (error) throw error;
        
        showToast("Work center deleted successfully!", "success");
        loadWorkCenterMasterTable(1);
    } catch (error) {
        console.error("Error deleting work center:", error);
        showToast("Error deleting work center: " + error.message, "error");
    }
}

function filterWorkCenterMasterData(data, searchTerm) {
    if (!searchTerm) return data;
    
    const term = searchTerm.toLowerCase();
    return data.filter(item => {
        return (
            (item["Work Center"] && item["Work Center"].toLowerCase().includes(term)) ||
            (item.Plant && item.Plant.toLowerCase().includes(term)) ||
            (item["Machine No."] && item["Machine No."].toLowerCase().includes(term)) ||
            (item["Machine No."] && item["Machine No."].toLowerCase().includes(term)) ||
            (item["Cell Name"] && item["Cell Name"].toLowerCase().includes(term)) ||
            (item["Cell Leader"] && item["Cell Leader"].toLowerCase().includes(term))
        );
    });
}

async function loadWorkCenterMasterTable(page = 1) {
    const tableBody = document.getElementById("workCenterMasterTableBody");
    const loadingMessage = document.getElementById("workCenterMasterLoadingMessage");
    const table = document.getElementById("workCenterMasterTable");
    const pagination = document.getElementById("workCenterMasterPagination");
    const errorMessage = document.getElementById("workCenterMasterErrorMessage");
    const emptyMessage = document.getElementById("workCenterMasterEmptyMessage");
    const searchInput = document.getElementById("workCenterMasterSearch");
    
    if (loadingMessage) loadingMessage.style.display = "block";
    if (table) table.style.display = "none";
    if (pagination) pagination.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";
    
    try {
        const pageSize = paginationState.workCenterMaster.pageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        
        const searchTerm = (paginationState.workCenterMaster.searchTerm || "").trim();
        
        // Build query
        let query = window.supabase
            .from("Work Center Master")
            .select("*", { count: "exact" });
        
        // Apply search filter if provided
        if (searchTerm) {
            // Fetch all data for client-side filtering
            const { data: allData, error: fetchError, count: totalCount } = await query;
            
            if (fetchError) throw fetchError;
            
            const filteredData = filterWorkCenterMasterData(allData || [], searchTerm);
            paginationState.workCenterMaster.totalItems = filteredData.length;
            paginationState.workCenterMaster.totalPages = Math.ceil(filteredData.length / pageSize) || 1;
            paginationState.workCenterMaster.currentPage = page;
            
            // Apply pagination to filtered data
            const paginatedData = filteredData.slice(from, to + 1);
            
            if (loadingMessage) loadingMessage.style.display = "none";
            
            if (paginatedData && paginatedData.length > 0) {
                if (tableBody) {
                    tableBody.innerHTML = "";
                    paginatedData.forEach((item) => {
                        const row = document.createElement("tr");
                        row.innerHTML = `
                            <td>${item["Work Center"] || "-"}</td>
                            <td>${item.Plant || "-"}</td>
                            <td>${item["Machine No."] || "-"}</td>
                            <td>${item["Machine No."] || "-"}</td>
                            <td>${item["Cell Name"] || "-"}</td>
                            <td>${item["Cell Leader"] || "-"}</td>
                            <td>
                                <button class="btn-icon" onclick="openEditWorkCenterModal(${JSON.stringify(item).replace(/"/g, '&quot;')})" title="Edit">✏️</button>
                                <button class="btn-icon" onclick="deleteWorkCenter('${item.id}')" title="Delete">🗑️</button>
                            </td>
                        `;
                        tableBody.appendChild(row);
                    });
                }
                if (table) table.style.display = "table";
                if (pagination) pagination.style.display = "flex";
                updateWorkCenterPagination();
            } else {
                if (tableBody) tableBody.innerHTML = "";
                if (table) table.style.display = "none";
                if (emptyMessage) emptyMessage.style.display = "block";
            }
            return;
        }
        
        // No search term - use server-side pagination
        const { data, error, count } = await query
            .order("id", { ascending: false })
            .range(from, to);
        
        if (error) throw error;
        
        if (loadingMessage) loadingMessage.style.display = "none";
        
        // Update pagination state
        paginationState.workCenterMaster.totalItems = count || 0;
        paginationState.workCenterMaster.totalPages = Math.ceil((paginationState.workCenterMaster.totalItems || 0) / pageSize) || 1;
        paginationState.workCenterMaster.currentPage = page;
        
        if (data && data.length > 0) {
            if (tableBody) {
                tableBody.innerHTML = "";
                data.forEach((item) => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${item["Work Center"] || "-"}</td>
                        <td>${item.Plant || "-"}</td>
                        <td>${item["Machine No."] || "-"}</td>
                        <td>${item["Machine No."] || "-"}</td>
                        <td>${item["Cell Name"] || "-"}</td>
                        <td>${item["Cell Leader"] || "-"}</td>
                        <td>
                            <button class="btn-icon" onclick="openEditWorkCenterModal(${JSON.stringify(item).replace(/"/g, '&quot;')})" title="Edit">✏️</button>
                            <button class="btn-icon" onclick="deleteWorkCenter('${item.id}')" title="Delete">🗑️</button>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });
            }
            if (table) table.style.display = "table";
            if (pagination) pagination.style.display = "flex";
            updateWorkCenterPagination();
        } else {
            if (tableBody) tableBody.innerHTML = "";
            if (table) table.style.display = "none";
            if (emptyMessage) emptyMessage.style.display = "block";
        }
    } catch (error) {
        console.error("Error loading Work Center Master data:", error);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading work center data: " + error.message;
            errorMessage.style.display = "block";
        }
        if (table) table.style.display = "none";
    }
}

function updateWorkCenterPagination() {
    const pagination = document.getElementById("workCenterMasterPagination");
    if (!pagination) return;
    
    const currentPage = paginationState.workCenterMaster.currentPage || 1;
    const totalPages = paginationState.workCenterMaster.totalPages || 1;
    const totalItems = paginationState.workCenterMaster.totalItems || 0;
    
    const pageInfo = pagination.querySelector(".pagination-info");
    if (pageInfo) {
        const pageSize = paginationState.workCenterMaster.pageSize;
        const from = (currentPage - 1) * pageSize + 1;
        const to = Math.min(currentPage * pageSize, totalItems);
        pageInfo.textContent = `Showing ${from}-${to} of ${totalItems}`;
    }
    
    const prevBtn = pagination.querySelector(".pagination-prev");
    const nextBtn = pagination.querySelector(".pagination-next");
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
        prevBtn.onclick = () => {
            if (currentPage > 1) {
                loadWorkCenterMasterTable(currentPage - 1);
            }
        };
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.onclick = () => {
            if (currentPage < totalPages) {
                loadWorkCenterMasterTable(currentPage + 1);
            }
        };
    }
    
    // Update page numbers
    const pageNumbers = pagination.querySelector(".pagination-numbers");
    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPagesToShow = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        
        if (endPage - startPage < maxPagesToShow - 1) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-page ${i === currentPage ? "active" : ""}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => loadWorkCenterMasterTable(i);
            pageNumbers.appendChild(pageBtn);
        }
    }
}

function initializeWorkCenterPagination() {
    const pageSizeSelect = document.getElementById("workCenterMasterPageSize");
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            paginationState.workCenterMaster.pageSize = parseInt(e.target.value);
            paginationState.workCenterMaster.currentPage = 1;
            loadWorkCenterMasterTable(1);
        });
    }
}

function initializeAddMachineButton_DEPRECATED() {
    // This function is deprecated - functionality moved to Work Center Master
}

// ==================== USER MANAGEMENT FUNCTIONS ====================

async function isCurrentUserAdmin() {
    try {
        const { data: { user } } = await window.supabase.auth.getUser();
        if (!user) return false;
        
        const { data, error } = await window.supabase
            .from("User Management")
            .select("Role")
            .eq("Email", user.email)
            .single();
        
        if (error || !data) return false;
        
        return data.Role === "Admin";
    } catch (error) {
        console.error("Error checking admin status:", error);
        return false;
    }
}

async function checkAdminStatus() {
    const isAdmin = await isCurrentUserAdmin();
    const adminElements = document.querySelectorAll(".admin-only");
    adminElements.forEach(el => {
        el.style.display = isAdmin ? "block" : "none";
    });
    return isAdmin;
}

async function checkAdminAndLoadUsers() {
    const isAdmin = await checkAdminStatus();
    if (isAdmin) {
        await loadUsersTable();
    }
}

async function syncUsersManually() {
    try {
        showToast("Syncing users from Supabase Auth...", "info");
        
        const { data: { users }, error: authError } = await window.supabase.auth.admin.listUsers();
        
        if (authError) throw authError;
        
        // Get existing users from User Management table
        const { data: existingUsers, error: existingError } = await window.supabase
            .from("User Management")
            .select("Email");
        
        if (existingError) throw existingError;
        
        const existingEmails = new Set(existingUsers?.map(u => u.Email) || []);
        
        // Add new users
        const newUsers = users
            .filter(u => !existingEmails.has(u.email))
            .map(u => ({
                Email: u.email,
                Role: "User",
                Status: "Pending"
            }));
        
        if (newUsers.length > 0) {
            const { error: insertError } = await window.supabase
                .from("User Management")
                .insert(newUsers);
            
            if (insertError) throw insertError;
        }
        
        showToast(`Synced ${newUsers.length} new users.`, "success");
        await loadUsersTable();
    } catch (error) {
        console.error("Error syncing users:", error);
        showToast("Error syncing users: " + error.message, "error");
    }
}

function initializeUserManagementModal() {
    const modal = document.getElementById("userManagementModal");
    const form = document.getElementById("userManagementForm");
    const closeBtn = document.getElementById("closeUserManagementModal");
    
    if (!modal || !form) return;
    
    const closeModal = () => {
        modal.style.display = "none";
        form.reset();
        // Clear any error messages
        const errorMsg = document.getElementById("userManagementErrorMessage");
        if (errorMsg) errorMsg.style.display = "none";
    };
    
    if (closeBtn) {
        closeBtn.addEventListener("click", closeModal);
    }
    
    // Close modal when clicking outside
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.style.display === "flex") {
            closeModal();
        }
    });
    
    // Handle form submission
    form.addEventListener("submit", handleUserFormSubmit);
}

async function handleUserFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const userData = {
        Email: formData.get("email"),
        Role: formData.get("role"),
        Status: formData.get("status")
    };
    
    try {
        const editId = form.dataset.editId;
        
        if (editId) {
            // Update existing user
            const { error } = await window.supabase
                .from("User Management")
                .update(userData)
                .eq("id", editId);
            
            if (error) throw error;
            
            showToast("User updated successfully!", "success");
        } else {
            // Add new user
            const { error } = await window.supabase
                .from("User Management")
                .insert([userData]);
            
            if (error) throw error;
            
            showToast("User added successfully!", "success");
        }
        
        form.reset();
        delete form.dataset.editId;
        document.getElementById("userManagementModal").style.display = "none";
        await loadUsersTable();
    } catch (error) {
        console.error("Error saving user:", error);
        showToast("Error saving user: " + error.message, "error");
    }
}

async function loadUsersTable() {
    const tableBody = document.getElementById("usersTableBody");
    const loadingMessage = document.getElementById("usersLoadingMessage");
    const table = document.getElementById("usersTable");
    const pagination = document.getElementById("usersPagination");
    const errorMessage = document.getElementById("usersErrorMessage");
    const emptyMessage = document.getElementById("usersEmptyMessage");
    
    if (loadingMessage) loadingMessage.style.display = "block";
    if (table) table.style.display = "none";
    if (pagination) pagination.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";
    
    try {
        const { data, error, count } = await window.supabase
            .from("User Management")
            .select("*", { count: "exact" })
            .order("Email", { ascending: true });
        
        if (error) throw error;
        
        if (loadingMessage) loadingMessage.style.display = "none";
        
        if (data && data.length > 0) {
            if (tableBody) {
                tableBody.innerHTML = "";
                data.forEach((user) => {
                    const row = document.createElement("tr");
                    const statusBadge = user.Status === "Approved" ? 
                        '<span class="status-badge status-approved">Approved</span>' :
                        user.Status === "Pending" ?
                        '<span class="status-badge status-pending">Pending</span>' :
                        '<span class="status-badge status-rejected">Rejected</span>';
                    
                    row.innerHTML = `
                        <td>${user.Email || "-"}</td>
                        <td>${user.Role || "-"}</td>
                        <td>${statusBadge}</td>
                        <td>
                            ${user.Status === "Pending" ? 
                                `<button class="btn-icon" onclick="approveUser('${user.id}')" title="Approve">✅</button>` : 
                                ''
                            }
                            <button class="btn-icon" onclick="openEditUserModal(${JSON.stringify(user).replace(/"/g, '&quot;')})" title="Edit">✏️</button>
                            <button class="btn-icon" onclick="deleteUser('${user.id}')" title="Delete">🗑️</button>
                            <button class="btn-icon" onclick="resetUserPassword('${user.Email}')" title="Reset Password">🔑</button>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });
            }
            if (table) table.style.display = "table";
        } else {
            if (tableBody) tableBody.innerHTML = "";
            if (table) table.style.display = "none";
            if (emptyMessage) emptyMessage.style.display = "block";
        }
    } catch (error) {
        console.error("Error loading users:", error);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading users: " + error.message;
            errorMessage.style.display = "block";
        }
        if (table) table.style.display = "none";
    }
}

function openEditUserModal(profile) {
    const modal = document.getElementById("userManagementModal");
    const form = document.getElementById("userManagementForm");
    
    if (!modal || !form) return;
    
    // Populate form with user data
    form.querySelector('[name="email"]').value = profile.Email || "";
    form.querySelector('[name="role"]').value = profile.Role || "User";
    form.querySelector('[name="status"]').value = profile.Status || "Pending";
    
    // Store the user's ID for update
    form.dataset.editId = profile.id;
    
    modal.style.display = "flex";
}

async function approveUser(userId) {
    try {
        const { error } = await window.supabase
            .from("User Management")
            .update({ Status: "Approved" })
            .eq("id", userId);
        
        if (error) throw error;
        
        showToast("User approved successfully!", "success");
        await loadUsersTable();
    } catch (error) {
        console.error("Error approving user:", error);
        showToast("Error approving user: " + error.message, "error");
    }
}

async function deleteUser(userId) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    
    try {
        const { error } = await window.supabase
            .from("User Management")
            .delete()
            .eq("id", userId);
        
        if (error) throw error;
        
        showToast("User deleted successfully!", "success");
        await loadUsersTable();
    } catch (error) {
        console.error("Error deleting user:", error);
        showToast("Error deleting user: " + error.message, "error");
    }
}

async function resetUserPassword(email) {
    if (!confirm(`Are you sure you want to reset password for ${email}?`)) return;
    
    try {
        const { error } = await window.supabase.auth.admin.generateLink({
            type: 'recovery',
            email: email
        });
        
        if (error) throw error;
        
        showToast("Password reset link generated. Please check Supabase dashboard.", "info");
    } catch (error) {
        console.error("Error resetting password:", error);
        showToast("Error resetting password: " + error.message, "error");
    }
}

function calculateDaysUntilArchive(timestampOrDate, archiveFrequencyDays) {
    try {
        // Handle undefined/null timestampOrDate
        if (!timestampOrDate) {
            return null;
        }

        let recordDate;
        if (typeof timestampOrDate === 'string') {
            // Try parsing as ISO date first
            recordDate = new Date(timestampOrDate);
            if (isNaN(recordDate.getTime())) {
                // Try parsing as DD/MM/YYYY
                const parts = timestampOrDate.split('/');
                if (parts.length === 3) {
                    recordDate = new Date(parts[2], parts[1] - 1, parts[0]);
                } else {
                    return null;
                }
            }
        } else {
            recordDate = new Date(timestampOrDate);
        }
        
        if (isNaN(recordDate.getTime())) {
            return null;
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        recordDate.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.ceil((today - recordDate) / (1000 * 60 * 60 * 24));
        const daysUntilArchive = archiveFrequencyDays - daysDiff;
        
        return daysUntilArchive >= 0 ? daysUntilArchive : null;
    } catch (error) {
        console.error("Error calculating days until archive:", error);
        return null;
    }
}

async function loadIoTDataTable(page = 1, isAutoRefresh = false) {
    const tableBody = document.getElementById("iotDataTableBody");
    const loadingMessage = document.getElementById("iotDataLoadingMessage");
    const table = document.getElementById("iotDataTable");
    const pagination = document.getElementById("iotDataPagination");
    const errorMessage = document.getElementById("iotDataErrorMessage");
    const emptyMessage = document.getElementById("iotDataEmptyMessage");
    
    if (!isAutoRefresh) {
        if (loadingMessage) loadingMessage.style.display = "block";
        if (table) table.style.display = "none";
        if (pagination) pagination.style.display = "none";
        if (errorMessage) errorMessage.style.display = "none";
        if (emptyMessage) emptyMessage.style.display = "none";
    }
    
    try {
        const pageSize = paginationState.iotData.pageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        
        // Build query
        let query = window.supabase
            .from("IoT Database")
            .select("*", { count: "exact" });
        
        // Apply filters
        const dateFilter = (paginationState.iotData.dateFilter || "").trim();
        const machineFilter = (paginationState.iotData.machineFilter || "").trim();
        const hideArchived = paginationState.iotData.hideArchived || false;
        
        if (dateFilter) {
            // Parse date filter (format: YYYY-MM-DD)
            const filterDate = new Date(dateFilter);
            const nextDay = new Date(filterDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            query = query.gte("Timestamp", filterDate.toISOString())
                        .lt("Timestamp", nextDay.toISOString());
        }
        
        if (machineFilter) {
            query = query.eq("Machine No.", machineFilter);
        }
        
        if (hideArchived) {
            query = query.eq("archived", false);
        }
        
        // Apply ordering and pagination
        const { data, error, count } = await query
            .order("Timestamp", { ascending: false })
            .range(from, to);
        
        if (error) throw error;
        
        if (!isAutoRefresh && loadingMessage) loadingMessage.style.display = "none";
        
        // Update pagination state
        paginationState.iotData.totalItems = count || 0;
        paginationState.iotData.totalPages = Math.ceil((paginationState.iotData.totalItems || 0) / pageSize) || 1;
        paginationState.iotData.currentPage = page;
        
        if (data && data.length > 0) {
            if (tableBody) {
                const updateTable = () => {
                    tableBody.innerHTML = "";
                    data.forEach((item) => {
                        const row = document.createElement("tr");
                        const isArchived = item.archived === true;
                        const archiveBadge = isArchived ? 
                            '<span class="status-badge status-archived">Archived</span>' : 
                            '<span class="status-badge status-active">Active</span>';
                        
                        row.innerHTML = `
                            <td>${formatTimestamp(item.Timestamp)}</td>
                            <td>${item.Plant || "-"}</td>
                            <td>${item["Machine No."] || "-"}</td>
                            <td>${item["Operator Code"] || "-"}</td>
                            <td>${item["Part No."] || "-"}</td>
                            <td>${item["Part Name"] || "-"}</td>
                            <td>${item.Operation || "-"}</td>
                            <td>${item.Value != null ? item.Value : "-"}</td>
                            <td>${item["Cycle Time"] != null ? item["Cycle Time"] : "-"}</td>
                            <td>${item["Loss Reasons"] || "-"}</td>
                            <td>${item.Shift || "-"}</td>
                            <td>${archiveBadge}</td>
                        `;
                        tableBody.appendChild(row);
                    });
                };
                
                updateTable();
            }
            if (table) table.style.display = "table";
            if (pagination) pagination.style.display = "flex";
            updateIoTDataPagination();
        } else {
            if (tableBody) tableBody.innerHTML = "";
            if (table) table.style.display = "none";
            if (emptyMessage) emptyMessage.style.display = "block";
        }
    } catch (error) {
        console.error("Error loading IoT Data:", error);
        if (!isAutoRefresh && loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading IoT data: " + error.message;
            errorMessage.style.display = "block";
        }
        if (table) table.style.display = "none";
    }
}

function updateIoTDataPagination() {
    const pagination = document.getElementById("iotDataPagination");
    if (!pagination) return;
    
    const currentPage = paginationState.iotData.currentPage || 1;
    const totalPages = paginationState.iotData.totalPages || 1;
    const totalItems = paginationState.iotData.totalItems || 0;
    
    const pageInfo = pagination.querySelector(".pagination-info");
    if (pageInfo) {
        const pageSize = paginationState.iotData.pageSize;
        const from = (currentPage - 1) * pageSize + 1;
        const to = Math.min(currentPage * pageSize, totalItems);
        pageInfo.textContent = `Showing ${from}-${to} of ${totalItems}`;
    }
    
    const prevBtn = pagination.querySelector(".pagination-prev");
    const nextBtn = pagination.querySelector(".pagination-next");
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
        prevBtn.onclick = () => {
            if (currentPage > 1) {
                loadIoTDataTable(currentPage - 1);
            }
        };
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.onclick = () => {
            if (currentPage < totalPages) {
                loadIoTDataTable(currentPage + 1);
            }
        };
    }
    
    // Update page numbers
    const pageNumbers = pagination.querySelector(".pagination-numbers");
    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPagesToShow = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        
        if (endPage - startPage < maxPagesToShow - 1) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-page ${i === currentPage ? "active" : ""}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => loadIoTDataTable(i);
            pageNumbers.appendChild(pageBtn);
        }
    }
}

// ==================== INITIALIZATION ====================

document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
    initializeAuthentication();
    initializeNavigation();
    initializeModal();
    initializeProcessMasterModal();
    initializeWorkCenterMasterModal();
    initializeShiftScheduleModal();
    initializeLossReasonModal();
    initializeTaskManagerModal();
    initializeUserManagementModal();
    initializeBrowserHistory();
    initializeSearchFunctionality();
    initializeWorkCenterPagination();
    
    // Hourly Report event listeners
    const generateBtn = document.getElementById("generateHourlyReportBtn");
    if (generateBtn) {
        generateBtn.addEventListener("click", generateHourlyReport);
    }
    
    // Archive configuration button
    const archiveConfigBtn = document.getElementById("archiveConfigBtn");
    if (archiveConfigBtn) {
        archiveConfigBtn.addEventListener("click", openArchiveConfigModal);
    }
    
    // Archive old reports button
    const archiveOldReportsBtn = document.getElementById("archiveOldReportsBtn");
    if (archiveOldReportsBtn) {
        archiveOldReportsBtn.addEventListener("click", async () => {
            if (confirm("Are you sure you want to archive old reports now? This will mark reports older than the configured days as archived.")) {
                await archiveOldHourlyReports();
            }
        });
    }
    
    // Close modal when clicking outside or pressing Escape
    const archiveConfigModal = document.getElementById("archiveConfigModal");
    if (archiveConfigModal) {
        archiveConfigModal.addEventListener("click", (e) => {
            if (e.target === archiveConfigModal) {
                closeArchiveConfigModal();
            }
        });
        
        // Close on Escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && archiveConfigModal.classList.contains("active")) {
                closeArchiveConfigModal();
            }
        });
    }
    
    // Hourly Report pagination
    const prevBtn = document.getElementById("hourlyReportPrevBtn");
    const nextBtn = document.getElementById("hourlyReportNextBtn");
    const pageSizeSelect = document.getElementById("hourlyReportPageSize");
    const dateFilter = document.getElementById("hourlyReportDateFilter");
    const shiftFilter = document.getElementById("hourlyReportShiftFilter");
    const clearFiltersBtn = document.getElementById("clearHourlyReportFiltersBtn");
    
    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            const currentPage = paginationState.hourlyReport.currentPage || 1;
            if (currentPage > 1) {
                loadHourlyReportTable(currentPage - 1);
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            const currentPage = paginationState.hourlyReport.currentPage || 1;
            const totalPages = paginationState.hourlyReport.totalPages || 1;
            if (currentPage < totalPages) {
                loadHourlyReportTable(currentPage + 1);
            }
        });
    }
    
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            paginationState.hourlyReport.pageSize = parseInt(e.target.value);
            paginationState.hourlyReport.currentPage = 1;
            loadHourlyReportTable(1);
        });
    }
    
    if (dateFilter) {
        dateFilter.addEventListener("change", (e) => {
            // Convert date from YYYY-MM-DD to DD/MM/YYYY for filtering
            const dateValue = e.target.value;
            if (dateValue) {
                // Keep YYYY-MM-DD format for PostgreSQL DATE type filtering
                paginationState.hourlyReport.dateFilter = dateValue;
            } else {
                paginationState.hourlyReport.dateFilter = "";
            }
            paginationState.hourlyReport.currentPage = 1;
            loadHourlyReportTable(1);
        });
    }
    
    if (shiftFilter) {
        shiftFilter.addEventListener("change", (e) => {
            paginationState.hourlyReport.shiftFilter = e.target.value;
            paginationState.hourlyReport.currentPage = 1;
            loadHourlyReportTable(1);
        });
    }
    
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener("click", () => {
            if (dateFilter) dateFilter.value = "";
            if (shiftFilter) shiftFilter.value = "";
            paginationState.hourlyReport.dateFilter = "";
            paginationState.hourlyReport.shiftFilter = "";
            paginationState.hourlyReport.currentPage = 1;
            loadHourlyReportTable(1);
        });
    }
    
    // Task Manager filters
    const taskDateFilter = document.getElementById("taskDateFilter");
    const taskFrequencyFilter = document.getElementById("taskFrequencyFilter");
    const taskStatusFilter = document.getElementById("taskStatusFilter");
    
    if (taskDateFilter) {
        taskDateFilter.addEventListener("change", (e) => {
            paginationState.taskManager.dateFilter = e.target.value;
            paginationState.taskManager.currentPage = 1;
            loadTaskManagerTable(1);
        });
    }
    
    if (taskFrequencyFilter) {
        taskFrequencyFilter.addEventListener("change", (e) => {
            paginationState.taskManager.frequencyFilter = e.target.value;
            paginationState.taskManager.currentPage = 1;
            loadTaskManagerTable(1);
        });
    }
    
    if (taskStatusFilter) {
        taskStatusFilter.addEventListener("change", (e) => {
            paginationState.taskManager.statusFilter = e.target.value;
            paginationState.taskManager.currentPage = 1;
            loadTaskManagerTable(1);
        });
    }
});

// Helper function to format date for report (DD/MM/YYYY)
// Format date for report in DD/MM/YYYY format using IST timezone
function formatDateForReport(date) {
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    
    // Format date in IST timezone
    const istDateStr = d.toLocaleString("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
    
    // Parse the IST date string (format: DD/MM/YYYY)
    // If already in DD/MM/YYYY format, return as is
    if (istDateStr.includes('/')) {
        return istDateStr;
    }
    
    // Fallback: manual formatting using IST date components
    const istDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const day = String(istDate.getDate()).padStart(2, "0");
    const month = String(istDate.getMonth() + 1).padStart(2, "0");
    const year = istDate.getFullYear();
    return `${day}/${month}/${year}`;
}

// ==================== ARCHIVE CONFIGURATION FUNCTIONS ====================

// Load archive configuration
async function loadArchiveConfig() {
    try {
        const { data, error } = await window.supabase.rpc('get_archive_config');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            const config = data[0];
            
            // Populate form fields
            document.getElementById('archiveFrequencyDays').value = config.archive_frequency_days || 8;
            document.getElementById('autoArchiveEnabled').checked = config.auto_archive_enabled !== false;
            document.getElementById('archiveTimeHour').value = config.archive_time_hour || 0;
            document.getElementById('archiveTimeMinute').value = config.archive_time_minute || 0;
            document.getElementById('archiveTimezone').value = config.timezone || 'UTC';
            
            return config;
        }
        
        return null;
    } catch (error) {
        console.error("Error loading archive config:", error);
        showToast("Error loading archive configuration: " + error.message, "error");
        return null;
    }
}

// Save archive configuration
async function saveArchiveConfig(event) {
    if (event) {
        event.preventDefault();
    }
    
    const saveBtn = document.getElementById('saveArchiveConfigBtn');
    const statusDiv = document.getElementById('archiveConfigStatus');
    
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="btn-icon">⏳</span> Saving...';
    }
    
    try {
        const frequencyDays = parseInt(document.getElementById('archiveFrequencyDays').value);
        const autoEnabled = document.getElementById('autoArchiveEnabled').checked;
        const archiveHour = parseInt(document.getElementById('archiveTimeHour').value);
        const archiveMinute = parseInt(document.getElementById('archiveTimeMinute').value);
        const timezone = document.getElementById('archiveTimezone').value;
        
        // Validate inputs
        if (frequencyDays < 1 || frequencyDays > 365) {
            throw new Error("Archive frequency must be between 1 and 365 days");
        }
        
        if (archiveHour < 0 || archiveHour > 23) {
            throw new Error("Archive hour must be between 0 and 23");
        }
        
        if (archiveMinute < 0 || archiveMinute > 59) {
            throw new Error("Archive minute must be between 0 and 59");
        }
        
        const { data, error } = await window.supabase.rpc('update_archive_config', {
            p_frequency_days: frequencyDays,
            p_auto_enabled: autoEnabled,
            p_archive_hour: archiveHour,
            p_archive_minute: archiveMinute,
            p_timezone: timezone
        });
        
        if (error) throw error;
        
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.backgroundColor = '#d1fae5';
            statusDiv.style.color = '#065f46';
            statusDiv.textContent = 'Archive configuration saved successfully!';
        }
        
        showToast("Archive configuration saved successfully!", "success");
        
        // Close modal after a short delay
        setTimeout(() => {
            closeArchiveConfigModal();
        }, 1500);
        
    } catch (error) {
        console.error("Error saving archive config:", error);
        
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.backgroundColor = '#fee2e2';
            statusDiv.style.color = '#991b1b';
            statusDiv.textContent = 'Error: ' + error.message;
        }
        
        showToast("Error saving archive configuration: " + error.message, "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span class="btn-icon">💾</span> Save Configuration';
        }
    }
}

// Open archive configuration modal
function openArchiveConfigModal() {
    const modal = document.getElementById('archiveConfigModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        loadArchiveConfig();
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
    }
}

// Close archive configuration modal
function closeArchiveConfigModal() {
    const modal = document.getElementById('archiveConfigModal');
    const statusDiv = document.getElementById('archiveConfigStatus');
    
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    
    if (statusDiv) {
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
    }
    
    // Restore body scroll
    document.body.style.overflow = '';
}

// Initialize Hourly Report event listeners
document.addEventListener("DOMContentLoaded", () => {
    const generateBtn = document.getElementById("generateHourlyReportBtn");
    const prevBtn = document.getElementById("hourlyReportPrevBtn");
    const nextBtn = document.getElementById("hourlyReportNextBtn");
    const pageSizeSelect = document.getElementById("hourlyReportPageSize");
    const dateFilter = document.getElementById("hourlyReportDateFilter");
    const shiftFilter = document.getElementById("hourlyReportShiftFilter");
    const clearFiltersBtn = document.getElementById("clearHourlyReportFiltersBtn");

    if (generateBtn) {
        generateBtn.addEventListener("click", generateHourlyReport);
    }

    // Archive configuration button
    const archiveConfigBtn = document.getElementById("archiveConfigBtn");
    if (archiveConfigBtn) {
        archiveConfigBtn.addEventListener("click", openArchiveConfigModal);
    }

    // Archive old reports button
    const archiveOldReportsBtn = document.getElementById("archiveOldReportsBtn");
    if (archiveOldReportsBtn) {
        archiveOldReportsBtn.addEventListener("click", async () => {
            if (confirm("Are you sure you want to archive old reports now? This will mark reports older than the configured days as archived.")) {
                await archiveOldHourlyReports();
            }
        });
    }

    // Close modal when clicking outside or pressing Escape
    const archiveConfigModal = document.getElementById("archiveConfigModal");
    if (archiveConfigModal) {
        archiveConfigModal.addEventListener("click", (e) => {
            if (e.target === archiveConfigModal) {
                closeArchiveConfigModal();
            }
        });
        
        // Close on Escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && archiveConfigModal.classList.contains("active")) {
                closeArchiveConfigModal();
            }
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (paginationState.hourlyReport.currentPage > 1) {
                loadHourlyReportTable(paginationState.hourlyReport.currentPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (paginationState.hourlyReport.currentPage < paginationState.hourlyReport.totalPages) {
                loadHourlyReportTable(paginationState.hourlyReport.currentPage + 1);
            }
        });
    }

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            paginationState.hourlyReport.pageSize = parseInt(e.target.value);
            paginationState.hourlyReport.currentPage = 1;
            loadHourlyReportTable(1);
        });
    }

    if (dateFilter) {
        dateFilter.addEventListener("change", (e) => {
            // Keep YYYY-MM-DD format for PostgreSQL DATE type filtering
            paginationState.hourlyReport.dateFilter = e.target.value || "";
            paginationState.hourlyReport.currentPage = 1;
            loadHourlyReportTable(1);
        });
    }

    if (shiftFilter) {
        shiftFilter.addEventListener("change", (e) => {
            paginationState.hourlyReport.shiftFilter = e.target.value;
            paginationState.hourlyReport.currentPage = 1;
            loadHourlyReportTable(1);
        });
    }

    // Hide archived checkbox
    const hideArchivedCheckbox = document.getElementById("hourlyReportHideArchived");
    if (hideArchivedCheckbox) {
        hideArchivedCheckbox.addEventListener("change", (e) => {
            paginationState.hourlyReport.hideArchived = e.target.checked;
            paginationState.hourlyReport.currentPage = 1;
            loadHourlyReportTable(1);
        });
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener("click", () => {
            paginationState.hourlyReport.dateFilter = "";
            paginationState.hourlyReport.shiftFilter = "";
            paginationState.hourlyReport.hideArchived = false;
            if (dateFilter) dateFilter.value = "";
            if (shiftFilter) shiftFilter.value = "";
            if (hideArchivedCheckbox) hideArchivedCheckbox.checked = false;
            paginationState.hourlyReport.currentPage = 1;
            loadHourlyReportTable(1);
        });
    }
});

// Initialize Task Manager modal
function initializeTaskManagerModal() {
    const openBtn = document.getElementById("openTaskFormBtn");
    const closeBtn = document.getElementById("closeTaskManagerModalBtn");
    const cancelBtn = document.getElementById("cancelTaskManagerFormBtn");
    const modalOverlay = document.getElementById("taskManagerModalOverlay");
    const form = document.getElementById("taskManagerForm");

    if (!modalOverlay || !form) return;

    if (openBtn) {
        openBtn.addEventListener("click", () => {
            const modalTitle = document.getElementById("taskManagerModalTitle");
            if (modalTitle) modalTitle.textContent = "Add Task";
            form.reset();
            modalOverlay.classList.add("active");
            document.body.style.overflow = "hidden";
        });
    }

    const closeModal = () => {
        modalOverlay.classList.remove("active");
        document.body.style.overflow = "";
        form.reset();
    };

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
            closeModal();
        }
    });

    form.addEventListener("submit", handleTaskFormSubmit);
}

// Handle Work Center Master form submission
async function handleWorkCenterFormSubmit() {
    const submitBtn = document.getElementById("workcenterSubmitBtn");
    const originalText = submitBtn.textContent;
    const editId = document.getElementById("workcenterEditId").value;
    const isEdit = editId !== "";

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? "Updating..." : "Saving...";

    // Get form values
    const machineInput = document.getElementById("wc_machine");
    const plantInput = document.getElementById("wc_plant");
    
    // Validate required fields
    if (!machineInput || !machineInput.value || machineInput.value.trim() === "") {
        showToast("Machine name is required", "error");
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
    }
    
    const iotEnabledInput = document.getElementById("wc_iot_enabled");
    const iotEnabled = iotEnabledInput ? iotEnabledInput.checked : false;
    
    const data = {
        "Machine": machineInput.value.trim(),
        "Plant": plantInput ? (plantInput.value ? plantInput.value.trim() : null) : null,
        "IoT Enabled": iotEnabled
    };

    try {
        let result;
        if (isEdit) {
            result = await window.supabase
                .from("WorkCenterMaster")
                .update(data)
                .eq("id", parseInt(editId));
        } else {
            result = await window.supabase
                .from("WorkCenterMaster")
                .insert([data]);
        }

        if (result.error) throw result.error;

        showToast(isEdit ? "Machine updated successfully!" : "Machine added successfully!", "success");
        
        // Close modal
        const modalOverlay = document.getElementById("workcenterModalOverlay");
        const workcenterForm = document.getElementById("workcenterForm");
        
        if (modalOverlay) {
            modalOverlay.classList.remove("active");
        }
        document.body.style.overflow = "";
        
        if (workcenterForm) {
            workcenterForm.reset();
        }
        
        // Clear edit ID
        const editIdField = document.getElementById("workcenterEditId");
        if (editIdField) {
            editIdField.value = "";
        }

        // Reload table
        loadWorkCenterMasterTable();
        
        // Reload machine dropdown in settings form
        await loadMachinesFromWorkCenterMaster();

    } catch (error) {
        console.error("Error saving work center:", error);
        
        // Provide more specific error messages
        let errorMessage = "Failed to save machine";
        if (error.message) {
            if (error.message.includes("duplicate") || error.message.includes("unique")) {
                errorMessage = "A machine with this name already exists. Duplicate machines for the same plant are allowed.";
            } else if (error.message.includes("violates")) {
                errorMessage = "Data validation error: " + error.message;
            } else {
                errorMessage = error.message;
            }
        }
        
        showToast("Error: " + errorMessage, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Open Work Center Master modal for editing
function openEditWorkCenterModal(item) {
    const modalOverlay = document.getElementById("workcenterModalOverlay");
    const form = document.getElementById("workcenterForm");
    const modalTitle = document.getElementById("workcenterModalTitle");

    modalTitle.textContent = "Edit Machine";
    
    document.getElementById("workcenterEditId").value = item.id || "";
    document.getElementById("wc_machine").value = item["Machine"] || item.Machine || "";
    document.getElementById("wc_plant").value = item["Plant"] || item.Plant || "";
    
    // Set IoT Enabled checkbox
    const iotEnabledInput = document.getElementById("wc_iot_enabled");
    if (iotEnabledInput) {
        const iotEnabled = item["IoT Enabled"] !== undefined ? item["IoT Enabled"] : (item["IoTEnabled"] !== undefined ? item["IoTEnabled"] : false);
        iotEnabledInput.checked = iotEnabled;
    }

    modalOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

// Delete Work Center Master entry
async function deleteWorkCenter(id) {
    if (!confirm("Are you sure you want to delete this machine?")) {
        return;
    }

    try {
        const { error } = await window.supabase
            .from("WorkCenterMaster")
            .delete()
            .eq("id", id);

        if (error) throw error;

        showToast("Machine deleted successfully!", "success");
        loadWorkCenterMasterTable();
        
        // Reload machine dropdown in settings form
        await loadMachinesFromWorkCenterMaster();

    } catch (err) {
        console.error("Error deleting work center:", err);
        showToast("Error: " + (err.message || "Failed to delete machine"), "error");
    }
}

// Pagination state for Work Center Master

// Function to filter Work Center Master data based on search term
function filterWorkCenterMasterData(data, searchTerm) {
    if (!searchTerm || searchTerm.trim() === "") {
        return data;
    }
    
    const term = searchTerm.toLowerCase().trim();
    return data.filter(item => {
        const machine = (item["Machine"] ?? item.Machine ?? "").toString().toLowerCase();
        const plant = (item["Plant"] ?? item.Plant ?? "").toString().toLowerCase();
        const id = (item.id ?? "").toString().toLowerCase();
        
        return machine.includes(term) ||
               plant.includes(term) ||
               id.includes(term);
    });
}

// Load Work Center Master table with pagination
async function loadWorkCenterMasterTable(page = 1) {
    const loadingMessage = document.getElementById("workcenterLoadingMessage");
    const table = document.getElementById("workcenterMasterTable");
    const tableBody = document.getElementById("workcenterMasterTableBody");
    const errorMessage = document.getElementById("workcenterErrorMessage");
    const emptyMessage = document.getElementById("workcenterEmptyMessage");
    const pagination = document.getElementById("workcenterPagination");

    const pageSize = workcenterPaginationState.pageSize;
    const searchTerm = workcenterPaginationState.searchTerm || "";

    loadingMessage.style.display = "flex";
    if (table) table.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";
    if (pagination) pagination.style.display = "none";

    try {
        // Get all data (we'll filter client-side for search)
        const { data: allData, error } = await window.supabase
            .from("WorkCenterMaster")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        // Filter data based on search term
        const filteredData = filterWorkCenterMasterData(allData || [], searchTerm);
        
        // Update pagination state with filtered data
        workcenterPaginationState.totalItems = filteredData.length;
        workcenterPaginationState.totalPages = Math.ceil(filteredData.length / pageSize) || 1;
        workcenterPaginationState.currentPage = page;
        
        // Get paginated data from filtered results
        const from = (page - 1) * pageSize;
        const to = from + pageSize;
        const data = filteredData.slice(from, to);

        if (loadingMessage) loadingMessage.style.display = "none";

        // Render paginated data
        if (data && data.length > 0) {
            if (tableBody) {
                tableBody.innerHTML = "";
                data.forEach((item) => {
                    const row = document.createElement("tr");
                    const iotEnabled = item["IoT Enabled"] !== undefined ? item["IoT Enabled"] : (item["IoTEnabled"] !== undefined ? item["IoTEnabled"] : false);
                    const iotBadge = iotEnabled ? 
                        '<span style="background-color: #28a745; color: white; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Yes</span>' :
                        '<span style="background-color: #6c757d; color: white; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">No</span>';
                    
                    row.innerHTML = `
                        <td>${item.id || "-"}</td>
                        <td>${item["Machine"] || item.Machine || "-"}</td>
                        <td>${item["Plant"] || item.Plant || "-"}</td>
                        <td>${iotBadge}</td>
                        <td>${formatTimestamp(item.created_at)}</td>
                        <td>${formatTimestamp(item.updated_at)}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-edit" data-item='${JSON.stringify(item).replace(/'/g, "&apos;")}' title="Edit">
                                    ✏️
                                </button>
                                <button class="btn-delete" data-id="${item.id}" title="Delete">
                                    🗑️
                                </button>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(row);
                    
                    // Add event listeners
                    const editBtn = row.querySelector(".btn-edit");
                    if (editBtn) {
                        editBtn.addEventListener("click", () => {
                            const itemData = JSON.parse(editBtn.getAttribute("data-item").replace(/&apos;/g, "'"));
                            openEditWorkCenterModal(itemData);
                        });
                    }
                    
                    const deleteBtn = row.querySelector(".btn-delete");
                    if (deleteBtn) {
                        deleteBtn.addEventListener("click", () => {
                            deleteWorkCenter(parseInt(deleteBtn.getAttribute("data-id")));
                        });
                    }
                });
            }
            if (table) table.style.display = "table";
            updateWorkCenterPagination();
        } else {
            if (emptyMessage) emptyMessage.style.display = "flex";
        }
    } catch (error) {
        console.error("Error loading work center master:", error);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading work center master: " + (error.message || "Unknown error");
            errorMessage.style.display = "block";
        }
    }
}

// Update Work Center Master pagination controls
function updateWorkCenterPagination() {
    const pagination = document.getElementById("workcenterPagination");
    const paginationInfo = document.getElementById("workcenterPaginationInfo");
    const prevBtn = document.getElementById("workcenterPrevBtn");
    const nextBtn = document.getElementById("workcenterNextBtn");
    const pageNumbers = document.getElementById("workcenterPageNumbers");
    const pageSizeSelect = document.getElementById("workcenterPageSize");

    if (!pagination) return;

    const { currentPage, totalPages, totalItems, pageSize } = workcenterPaginationState;

    if (totalItems === 0) {
        pagination.style.display = "none";
        return;
    }

    pagination.style.display = "flex";

    // Update info
    const from = (currentPage - 1) * pageSize + 1;
    const to = Math.min(currentPage * pageSize, totalItems);
    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${from}-${to} of ${totalItems}`;
    }

    // Update buttons
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;

    // Update page numbers
    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(totalPages, startPage + maxPages - 1);
        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-page ${i === currentPage ? "active" : ""}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener("click", () => loadWorkCenterMasterTable(i));
            pageNumbers.appendChild(pageBtn);
        }
    }

    // Page size selector
    if (pageSizeSelect) {
        pageSizeSelect.value = pageSize;
        pageSizeSelect.addEventListener("change", (e) => {
            workcenterPaginationState.pageSize = parseInt(e.target.value);
            workcenterPaginationState.currentPage = 1;
            loadWorkCenterMasterTable(1);
        });
    }
}

// Initialize Work Center Master pagination event listeners
function initializeWorkCenterPagination() {
    const prevBtn = document.getElementById("workcenterPrevBtn");
    const nextBtn = document.getElementById("workcenterNextBtn");

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (workcenterPaginationState.currentPage > 1) {
                loadWorkCenterMasterTable(workcenterPaginationState.currentPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (workcenterPaginationState.currentPage < workcenterPaginationState.totalPages) {
                loadWorkCenterMasterTable(workcenterPaginationState.currentPage + 1);
            }
        });
    }
}

// Initialize pagination on page load
initializeWorkCenterPagination();

// Add event listener for "Add Machine" button in settings form
// Removed initializeAddMachineButton - Add button removed from Machine Settings form
// Machines are now managed only through Work Center Master
function initializeAddMachineButton_DEPRECATED() {
    const addMachineBtn = document.getElementById("addMachineBtn");
    if (addMachineBtn) {
        addMachineBtn.addEventListener("click", () => {
            // Open Work Center Master modal
            const modalOverlay = document.getElementById("workcenterModalOverlay");
            const modalTitle = document.getElementById("workcenterModalTitle");
            const form = document.getElementById("workcenterForm");
            const editIdField = document.getElementById("workcenterEditId");
            
            if (!modalOverlay || !form) {
                console.error("WorkCenterMaster modal elements not found");
                showToast("Error: WorkCenterMaster form not available", "error");
                return;
            }
            
            if (modalTitle) modalTitle.textContent = "Add Machine";
            if (editIdField) editIdField.value = "";
            if (form) form.reset();
            
            // Pre-fill Plant if available from settings form
            const plantValue = document.getElementById("plant")?.value;
            const wcPlantField = document.getElementById("wc_plant");
            if (plantValue && wcPlantField) {
                wcPlantField.value = plantValue;
            }
            
            modalOverlay.classList.add("active");
            document.body.style.overflow = "hidden";
        });
    }
}

// ==================== User Management Functions (Admin Only) ====================

// Check if current user is admin
async function isCurrentUserAdmin() {
    try {
        const { data: { user }, error: userError } = await window.supabase.auth.getUser();
        if (userError) {
            console.error("Error getting user:", userError);
            return false;
        }
        if (!user) {
            console.log("No user logged in");
            return false;
        }

        const { data: profile, error: profileError } = await window.supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error("Error fetching profile:", profileError);
            return false;
        }

        const isAdmin = profile && profile.role === 'admin';
        console.log("Admin check result:", { 
            userId: user.id, 
            email: user.email, 
            profileRole: profile?.role, 
            isAdmin 
        });
        
        return isAdmin;
    } catch (error) {
        console.error("Error checking admin status:", error);
        return false;
    }
}

// Check admin status and show/hide admin-only menus (Settings)
async function checkAdminStatus() {
    try {
        const isAdmin = await isCurrentUserAdmin();
        
        // Show/hide Settings menu (admin only)
        const appSettingsNavItem = document.getElementById("appSettingsNavItem");
        const appSettingsNav = document.getElementById("appSettingsNav");
        
        console.log("Admin status check:", { isAdmin, hasSettingsNavItem: !!appSettingsNavItem });
        
        if (appSettingsNavItem) {
            appSettingsNavItem.style.display = isAdmin ? "block" : "none";
        } else if (appSettingsNav) {
            appSettingsNav.style.display = isAdmin ? "flex" : "none";
        }
        
        return isAdmin;
    } catch (error) {
        console.error("Error in checkAdminStatus:", error);
        return false;
    }
}

// Check admin and load users
async function checkAdminAndLoadUsers() {
    const isAdmin = await checkAdminStatus();
    if (!isAdmin) {
        showToast("Access denied. Admin privileges required.", "error");
        // Redirect to settings page
        const settingsNav = document.querySelector('.nav-item[data-page="settings"]');
        if (settingsNav) settingsNav.click();
        return;
    }
    loadUsersTable();
}

// Sync users manually - ensures all auth.users appear in the table
async function syncUsersManually() {
    const syncBtn = document.getElementById("syncUsersBtn");
    const originalText = syncBtn ? syncBtn.innerHTML : "";
    
    try {
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<span class="btn-icon">⏳</span> Syncing...';
        }
        
        showToast("Syncing users from authentication...", "info");
        
        // Call the RPC function to sync and get all users
        const { data: allUsers, error: syncError } = await window.supabase
            .rpc('get_all_users_for_admin');
        
        if (syncError) {
            console.error("Sync error:", syncError);
            throw new Error("Failed to sync users: " + (syncError.message || "Unknown error"));
        }
        
        const syncedCount = allUsers ? allUsers.length : 0;
        const pendingCount = allUsers ? allUsers.filter(u => !u.is_approved && u.role !== 'admin').length : 0;
        
        showToast(`Sync complete! Found ${syncedCount} users (${pendingCount} pending approval)`, "success");
        
        // Reload the table to show synced users
        await loadUsersTable();
        
    } catch (error) {
        console.error("Error syncing users:", error);
        showToast("Sync failed: " + (error.message || "Unknown error"), "error");
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalText || '<span class="btn-icon">🔄</span> Sync Users';
        }
    }
}

// Initialize User Management Modal
function initializeUserManagementModal() {
    const openBtn = document.getElementById("openUserFormBtn");
    const syncBtn = document.getElementById("syncUsersBtn");
    const closeBtn = document.getElementById("closeUserModalBtn");
    const cancelBtn = document.getElementById("cancelUserFormBtn");
    const modalOverlay = document.getElementById("userModalOverlay");
    const form = document.getElementById("userForm");
    
    // Add sync button event listener
    if (syncBtn) {
        syncBtn.addEventListener("click", async () => {
            await syncUsersManually();
        });
    }

    if (openBtn) {
        openBtn.addEventListener("click", () => {
            const modalTitle = document.getElementById("userModalTitle");
            const emailField = document.getElementById("user_email");
            const passwordField = document.getElementById("user_password");
            
            if (modalTitle) modalTitle.textContent = "Add New User";
            document.getElementById("userEditId").value = "";
            
            // Enable email field for new user
            if (emailField) {
                emailField.disabled = false;
                emailField.value = "";
            }
            
            // Make password required for new user
            if (passwordField) {
                passwordField.required = true;
                passwordField.value = "";
                passwordField.placeholder = "Minimum 6 characters";
            }
            
            if (form) form.reset();
            modalOverlay.classList.add("active");
            document.body.style.overflow = "hidden";
        });
    }

    const closeModal = () => {
        modalOverlay.classList.remove("active");
        document.body.style.overflow = "";
        if (form) form.reset();
    };

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
            closeModal();
        }
    });

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            await handleUserFormSubmit();
        });
    }
}

// Handle User Form Submission
async function handleUserFormSubmit() {
    const submitBtn = document.getElementById("userSubmitBtn");
    const originalText = submitBtn.textContent;
    const editId = document.getElementById("userEditId").value;
    const isEdit = editId !== "";

    // Check if user is admin
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
        showToast("Access denied. Admin privileges required.", "error");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? "Updating..." : "Creating...";

    const email = document.getElementById("user_email").value.trim();
    const password = document.getElementById("user_password").value;
    const fullName = document.getElementById("user_full_name").value.trim();
    const role = document.getElementById("user_role").value;
    const plant = document.getElementById("user_plant").value.trim() || null;

    try {
        if (isEdit) {
            // Update existing user
            const userId = editId;
            
            // Update profile
            const { error: profileError } = await window.supabase
                .from('profiles')
                .update({
                    full_name: fullName || email.split('@')[0],
                    role: role,
                    plant: plant
                })
                .eq('id', userId);

            if (profileError) throw profileError;

            // Update password if provided
            // Note: Direct password update requires Supabase Admin API (server-side)
            // For client-side, we'll send a password reset email instead
            if (password && password.length >= 6) {
                try {
                    const { error: resetError } = await window.supabase.auth.resetPasswordForEmail(email, {
                        redirectTo: window.location.origin
                    });
                    if (resetError) {
                        console.warn("Password reset email error:", resetError);
                        showToast("User updated successfully! Note: Password reset email could not be sent.", "success");
                    } else {
                        showToast("User updated successfully! Password reset email sent to user.", "success");
                    }
                } catch (resetErr) {
                    console.warn("Password reset email error:", resetErr);
                    showToast("User updated successfully! Note: Password reset email could not be sent.", "success");
                }
            } else {
                showToast("User updated successfully!", "success");
            }
        } else {
            // Create new user
            if (!password || password.length < 6) {
                throw new Error("Password is required and must be at least 6 characters");
            }

            // Create user - signUp will create the user in auth.users
            // Note: Email confirmation should be disabled in Supabase settings for admin-created users
            const { data: authData, error: authError } = await window.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    emailRedirectTo: undefined, // Don't require email confirmation
                    data: {
                        full_name: fullName || email.split('@')[0],
                        role: role,
                        plant: plant
                    }
                }
            });

            if (authError) {
                console.error("User creation error:", authError);
                throw authError;
            }
            
            // If email confirmation is required, the user won't have a session yet
            // But the user will still be created and can login later
            if (!authData.user) {
                throw new Error("User creation failed - no user data returned");
            }

            if (authData.user) {
                // The handle_new_user trigger should automatically create the profile
                // We just need to wait for it and then update it with the correct role and details
                // Wait a bit longer to ensure the user is fully committed and trigger has run
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                
                // Try to update the profile (it should exist by now due to trigger)
                let retries = 3;
                let profileUpdated = false;
                
                while (retries > 0 && !profileUpdated) {
                    const { error: updateError } = await window.supabase
                        .from('profiles')
                        .update({
                            email: email,
                            full_name: fullName || email.split('@')[0],
                            role: role,
                            plant: plant,
                            is_approved: true // Admin-created users are approved immediately
                        })
                        .eq('id', authData.user.id);
                    
                    if (!updateError) {
                        profileUpdated = true;
                        break;
                    } else if (updateError.code === 'PGRST116') {
                        // Profile doesn't exist yet, wait and retry
                        console.log(`Profile not found, retrying... (${retries} attempts left)`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        retries--;
                    } else {
                        // Other error - log it but don't fail the user creation
                        console.warn("Profile update error (non-critical):", updateError);
                        // Don't throw - user was created successfully, profile can be updated later
                        break;
                    }
                }
                
                if (!profileUpdated) {
                    console.warn("Profile could not be updated immediately, but user was created successfully.");
                    console.warn("The profile should be created by the trigger. You may need to refresh and manually update the role.");
                }
            }

            showToast("User created successfully!", "success");
        }

        // Close modal
        const modalOverlay = document.getElementById("userModalOverlay");
        const form = document.getElementById("userForm");
        if (modalOverlay) {
            modalOverlay.classList.remove("active");
            document.body.style.overflow = "";
        }
        if (form) form.reset();

        // Reload users table after a short delay to ensure database has updated
        setTimeout(() => {
            loadUsersTable();
        }, 500);

    } catch (error) {
        console.error("Error saving user:", error);
        showToast("Error: " + (error.message || "Failed to save user"), "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Load Users Table
async function loadUsersTable() {
    const loadingMessage = document.getElementById("userLoadingMessage");
    const table = document.getElementById("userManagementTable");
    const tableBody = document.getElementById("userManagementTableBody");
    const errorMessage = document.getElementById("userErrorMessage");
    const emptyMessage = document.getElementById("userEmptyMessage");

    if (loadingMessage) loadingMessage.style.display = "flex";
    if (table) table.style.display = "none";
    if (errorMessage) errorMessage.style.display = "none";
    if (emptyMessage) emptyMessage.style.display = "none";

    try {
        // Check admin status
        const isAdmin = await isCurrentUserAdmin();
        if (!isAdmin) {
            throw new Error("Admin privileges required");
        }

        // Get all users from auth.users (via RPC function)
        // This ensures all users in auth.users appear in the management table
        let profiles = [];
        
        const { data: allUsers, error: usersError } = await window.supabase
            .rpc('get_all_users_for_admin');

        if (usersError) {
            console.error("Error fetching all users:", usersError);
            console.error("RPC Error details:", JSON.stringify(usersError, null, 2));
            
            // Show helpful error message
            if (usersError.message && (usersError.message.includes('function') || usersError.message.includes('does not exist'))) {
                showToast("Please run SYNC_ALL_AUTH_USERS_TO_PROFILES.sql in Supabase SQL Editor first, or click 'Sync Users' button", "error");
            }
            
            // Fallback to profiles table if RPC fails
            console.warn("Falling back to profiles table only. Make sure to run SYNC_ALL_AUTH_USERS_TO_PROFILES.sql");
            const { data: profilesData, error: profilesError } = await window.supabase
            .from('profiles')
                .select('id, email, full_name, role, plant, is_approved, created_at')
            .order('created_at', { ascending: false });

            if (profilesError) {
                console.error("Error fetching profiles:", profilesError);
                throw profilesError;
            }
            
            // Use profiles as fallback
            profiles = profilesData || [];
            
            // Warn admin that some users might be missing
            if (profiles.length > 0) {
                console.warn("Using profiles table only. Some users from auth.users might not appear. Click 'Sync Users' button to sync all users.");
            }
        } else {
            // Use allUsers from RPC function
            profiles = allUsers || [];
        }
        
        // Debug: Log users to see what we're getting
        console.log("Loaded users:", profiles);
        console.log("Users count:", profiles?.length);
        if (profiles) {
            const pendingUsers = profiles.filter(p => !p.is_approved && p.role !== 'admin');
            console.log("Pending approval users:", pendingUsers);
            const usersWithoutProfiles = profiles.filter(p => p.profile_exists === false);
            if (usersWithoutProfiles.length > 0) {
                console.log("Users without profiles (should be auto-created):", usersWithoutProfiles);
            }
        }

        if (loadingMessage) loadingMessage.style.display = "none";

        if (profiles && profiles.length > 0) {
            if (tableBody) {
                tableBody.innerHTML = "";
                
                // Display users with their profiles
                for (const profile of profiles) {
                    try {
                        // Get user email - try from profile.email first
                        let email = profile.email || null;
                        
                        // If email not in profile.email, check if full_name is actually an email
                        if (!email && profile.full_name && profile.full_name.includes('@')) {
                            email = profile.full_name;
                        }
                        
                        // If still no email, try to get from auth (only works for current user)
                        if (!email) {
                            const { data: { user } } = await window.supabase.auth.getUser();
                            const profileId = profile.user_id || profile.id;
                            if (user && user.id === profileId) {
                                email = user.email || null;
                            }
                        }
                        
                        // Determine display email and full name
                        const displayEmail = email || "N/A";
                        
                        // If full_name is an email address, extract a name from it or use a default
                        let displayName = profile.full_name || "-";
                        if (displayName.includes('@')) {
                            // If full_name is an email, try to create a name from it
                            const emailPrefix = displayName.split('@')[0];
                            // Capitalize first letter and replace dots/underscores with spaces
                            displayName = emailPrefix
                                .replace(/[._]/g, ' ')
                                .split(' ')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(' ') || emailPrefix;
                        }
                        
                        const row = document.createElement("tr");
                        
                        // Determine status: Admins are always active, others depend on is_approved
                        const isAdmin = profile.role === 'admin';
                        // Admins are always active, non-admins need explicit approval
                        // Check for false, null, or undefined - all mean pending approval
                        const isApproved = profile.is_approved === true;
                        const showActive = isAdmin || isApproved;
                        const needsApproval = !isAdmin && !isApproved; // Show approve button if not admin and not approved
                        const statusBadge = showActive ? 
                            '<span class="status-badge">Active</span>' : 
                            '<span class="status-badge" style="background-color: #ffc107; color: #000;">Pending Approval</span>';
                        
                        // Use user_id if available (from RPC function), otherwise use id (from profiles table)
                        const userId = profile.user_id || profile.id;
                        
                        row.innerHTML = `
                            <td>${displayEmail}</td>
                            <td>${displayName}</td>
                            <td><span class="role-badge role-${profile.role}">${profile.role || "operator"}</span></td>
                            <td>${profile.plant || "-"}</td>
                            <td>${formatTimestamp(profile.created_at)}</td>
                            <td>-</td>
                            <td>${statusBadge}</td>
                            <td>
                                <div class="action-buttons">
                                    ${needsApproval ? 
                                        `<button class="btn-approve" data-user-id="${userId}" title="Approve User">
                                            ✓
                                        </button>` : ''
                                    }
                                    <button class="btn-edit" data-user-id="${userId}" data-profile='${JSON.stringify(profile).replace(/'/g, "&apos;")}' title="Edit">
                                        ✏️
                                    </button>
                                    <button class="btn-delete" data-user-id="${userId}" title="Delete">
                                        🗑️
                                    </button>
                                    <button class="btn-reset-password" data-user-email="${displayEmail}" title="Reset Password">
                                        🔑
                                    </button>
                                </div>
                            </td>
                        `;
                        tableBody.appendChild(row);
                    } catch (err) {
                        console.error("Error processing user:", err);
                    }
                }

                // Add event listeners
                tableBody.querySelectorAll('.btn-approve').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const userId = btn.getAttribute('data-user-id');
                        approveUser(userId);
                    });
                });

                tableBody.querySelectorAll('.btn-edit').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const profileData = JSON.parse(btn.getAttribute('data-profile').replace(/&apos;/g, "'"));
                        openEditUserModal(profileData);
                    });
                });

                tableBody.querySelectorAll('.btn-delete').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const userId = btn.getAttribute('data-user-id');
                        deleteUser(userId);
                    });
                });

                tableBody.querySelectorAll('.btn-reset-password').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const userEmail = btn.getAttribute('data-user-email');
                        resetUserPassword(userEmail);
                    });
                });
            }
            if (table) table.style.display = "table";
        } else {
            if (emptyMessage) emptyMessage.style.display = "flex";
        }
    } catch (error) {
        console.error("Error loading users:", error);
        if (loadingMessage) loadingMessage.style.display = "none";
        if (errorMessage) {
            errorMessage.textContent = "Error loading users: " + (error.message || "Unknown error");
            errorMessage.style.display = "block";
        }
    }
}

// Open Edit User Modal
function openEditUserModal(profile) {
    const modalOverlay = document.getElementById("userModalOverlay");
    const modalTitle = document.getElementById("userModalTitle");
    const form = document.getElementById("userForm");

    if (modalTitle) modalTitle.textContent = "Edit User";
    document.getElementById("userEditId").value = profile.user_id || profile.id || "";
    document.getElementById("user_email").value = profile.email || "";
    document.getElementById("user_email").disabled = true; // Don't allow email change
    document.getElementById("user_password").required = false; // Password optional when editing
    document.getElementById("user_full_name").value = profile.full_name || "";
    document.getElementById("user_role").value = profile.role || "operator";
    document.getElementById("user_plant").value = profile.plant || "";

    modalOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

// Approve User
async function approveUser(userId) {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
        showToast("Access denied. Admin privileges required.", "error");
        return;
    }

    try {
        const { error } = await window.supabase
            .from('profiles')
            .update({ is_approved: true })
            .eq('id', userId);

        if (error) throw error;

        showToast("User approved successfully! They can now access the application.", "success");
        loadUsersTable();
    } catch (error) {
        console.error("Error approving user:", error);
        showToast("Error: " + (error.message || "Failed to approve user"), "error");
    }
}

// Delete User
async function deleteUser(userId) {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
        showToast("Access denied. Admin privileges required.", "error");
        return;
    }

    try {
        // First, check if the user being deleted is an admin
        const { data: userProfile, error: fetchError } = await window.supabase
            .from('profiles')
            .select('role, email, full_name')
            .eq('id', userId)
            .single();

        if (fetchError) {
            throw new Error("Failed to fetch user information");
        }

        // If deleting an admin, check if it's the last admin
        if (userProfile && userProfile.role === 'admin') {
            // Count total admin users
            const { data: adminUsers, error: countError } = await window.supabase
                .from('profiles')
                .select('id', { count: 'exact', head: false })
                .eq('role', 'admin');

            if (countError) {
                throw new Error("Failed to check admin count");
            }

            const adminCount = adminUsers ? adminUsers.length : 0;

            if (adminCount <= 1) {
                showToast("Cannot delete the last admin user! At least one admin must exist to manage the system.", "error");
                return;
            }

            // Warn about deleting admin
            if (!confirm(`Warning: You are about to delete an admin user (${userProfile.email || userProfile.full_name || 'Admin'}).\n\nThis will remove their access permanently.\n\nAre you sure you want to continue?`)) {
                return;
            }
        } else {
            // Regular user deletion confirmation
            if (!confirm(`Are you sure you want to delete user "${userProfile?.email || userProfile?.full_name || userId}"?\n\nThis action cannot be undone and will remove their access permanently.`)) {
                return;
            }
        }

        // Call the RPC function to delete user from both profiles and auth.users
        const { data: deleteResult, error: deleteError } = await window.supabase
            .rpc('delete_user_completely', { user_id_to_delete: userId });

        if (deleteError) {
            console.error("Delete error details:", deleteError);
            throw deleteError;
        }

        if (deleteResult === false) {
            throw new Error("User deletion failed. The user may not exist or you may not have permission.");
        }

        showToast("User deleted successfully! The user has been removed from both the system and authentication records.", "success");
        
        // Reload the table to reflect the deletion
        await loadUsersTable();
    } catch (error) {
        console.error("Error deleting user:", error);
        const errorMessage = error.message || "Failed to delete user";
        
        // Provide more helpful error messages
        if (errorMessage.includes("RLS") || errorMessage.includes("policy")) {
            showToast("Error: Delete permission denied. Please ensure DELETE policy is set for admins.", "error");
        } else if (errorMessage.includes("last admin")) {
            showToast("Error: Cannot delete the last admin user.", "error");
        } else {
            showToast("Error: " + errorMessage, "error");
        }
    }
}

// Reset User Password
async function resetUserPassword(email) {
    if (!confirm(`Send password reset email to ${email}?`)) {
        return;
    }

    try {
        const { error } = await window.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password'
        });

        if (error) throw error;

        showToast("Password reset email sent successfully!", "success");
    } catch (error) {
        console.error("Error sending password reset:", error);
        showToast("Error: " + (error.message || "Failed to send password reset email"), "error");
    }
}

// Check admin status on page load - REMOVED duplicate listener
// Admin status is already checked in updateUIForAuth() which is called by the main auth listener
// window.addEventListener('DOMContentLoaded', ...) - REMOVED to prevent duplicate calls

// NOTE: Auth state listener moved to initializeApp() to prevent duplicate listeners
// The listener in initializeApp() already calls updateUIForAuth() which calls checkAdminStatus()

// Legacy code - keeping for reference but disabled to prevent infinite loop
/*
if (window.supabase && window.supabase.auth) {
    window.supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            await checkAdminStatus();
        } else if (event === 'SIGNED_OUT') {
            const userManagementNavItem = document.getElementById("userManagementNavItem");
            if (userManagementNavItem) userManagementNavItem.style.display = "none";
        }
    });
}
*/

// Calculate days until archive for a record using IST timezone
function calculateDaysUntilArchive(timestampOrDate, archiveFrequencyDays) {
    if (!timestampOrDate) return null;
    
    let recordDate;
    
    // Handle different date formats
    if (timestampOrDate instanceof Date) {
        recordDate = new Date(timestampOrDate);
    } else if (typeof timestampOrDate === 'string') {
        // Check if it's a date string in DD/MM/YYYY format (from hourly reports)
        if (timestampOrDate.includes('/')) {
            const parts = timestampOrDate.split('/');
            if (parts.length === 3) {
                // DD/MM/YYYY format - parse as IST date
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                const year = parseInt(parts[2], 10);
                // Create date in IST timezone
                const istDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+05:30`;
                recordDate = new Date(istDateStr);
            } else {
                recordDate = new Date(timestampOrDate);
            }
        } else {
            // ISO format or timestamp
            recordDate = new Date(timestampOrDate);
        }
    } else {
        recordDate = new Date(timestampOrDate);
    }
    
    // Check if date is valid
    if (isNaN(recordDate.getTime())) {
        return null;
    }
    
    // Get today's date in IST timezone
    const todayIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    todayIST.setHours(0, 0, 0, 0);
    
    // Get record date in IST timezone
    const recordDateIST = new Date(recordDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    recordDateIST.setHours(0, 0, 0, 0);
    
    // Calculate days difference
    const daysSinceRecord = Math.floor((todayIST - recordDateIST) / (1000 * 60 * 60 * 24));
    const daysUntilArchive = archiveFrequencyDays - daysSinceRecord;
    
    return Math.max(0, daysUntilArchive); // Don't show negative days
}

// Load IoT Data Table
async function loadIoTDataTable(page = 1, isAutoRefresh = false) {
    const tableBody = document.getElementById("iotDataTableBody");
    const loadingMessage = document.getElementById("iotDataLoadingMessage");
    const table = document.getElementById("iotDataTable");
    const pagination = document.getElementById("iotDataPagination");
    const tableContainer = document.querySelector("#iotDataPage .table-container");
    
    // During auto-refresh, keep table visible and show subtle loading indicator
    if (isAutoRefresh) {
        // Add subtle loading overlay instead of hiding table
        if (tableContainer) {
            tableContainer.classList.add("refreshing");
        }
        // Don't hide table during auto-refresh to prevent blinking
    } else {
        // Initial load or manual refresh - show full loading state
        if (loadingMessage) loadingMessage.style.display = "block";
        if (table) table.style.display = "none";
        if (pagination) pagination.style.display = "none";
    }

    try {
        const pageSize = paginationState.iotData.pageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const plantFilter = (paginationState.iotData.plantFilter || "").trim();
        const machineFilter = (paginationState.iotData.machineFilter || "").trim();

        // Build base query
        let query = window.supabase
            .from("IoT Database")
            .select("*", { count: "exact" });

        // Apply filters if present
        if (plantFilter) {
            query = query.eq("Plant", plantFilter);
        }
        if (machineFilter) {
            // Column name has a space and dot; must be quoted explicitly
            query = query.eq('"Machine No."', machineFilter);
        }

        // Apply ordering and pagination
        const { data, error, count } = await query
            .order("Timestamp", { ascending: false })
            .range(from, to);

        if (error) {
            throw error;
        }

        // Remove refreshing state
        if (tableContainer) {
            tableContainer.classList.remove("refreshing");
        }

        if (!isAutoRefresh) {
            if (loadingMessage) loadingMessage.style.display = "none";
        }

        // Update pagination state
        paginationState.iotData.totalItems = count || 0;
        paginationState.iotData.totalPages = Math.ceil((paginationState.iotData.totalItems || 0) / pageSize) || 1;
        paginationState.iotData.currentPage = page;

        // Get archive frequency for calculating days until archive
        let archiveFrequencyDays = 8; // Default
        try {
            const { data: archiveConfig } = await window.supabase.rpc('get_archive_config');
            if (archiveConfig && archiveConfig.length > 0) {
                archiveFrequencyDays = archiveConfig[0].archive_frequency_days || 8;
            }
        } catch (error) {
            console.warn("Could not fetch archive config, using default 8 days:", error);
        }

        if (data && data.length > 0) {
            if (tableBody) {
                // Use requestAnimationFrame for smooth updates during auto-refresh
                const updateTable = () => {
                    tableBody.innerHTML = "";
                    data.forEach((item) => {
                        const row = document.createElement("tr");
                        const isArchived = item.archived === true;
                        
                        // Calculate archive status display
                        let archiveStatus;
                        if (isArchived) {
                            archiveStatus = '<span class="status-badge status-archived" title="Archived - Not processed for reports">Archived</span>';
                        } else {
                            const daysUntilArchive = calculateDaysUntilArchive(item["Timestamp"], archiveFrequencyDays);
                            if (daysUntilArchive !== null) {
                                if (daysUntilArchive === 0) {
                                    archiveStatus = '<span class="status-badge status-active" title="Will be archived soon">Archiving soon</span>';
                                } else {
                                    const dayText = daysUntilArchive === 1 ? 'day' : 'days';
                                    archiveStatus = `<span class="status-badge status-active" title="Will be archived in ${daysUntilArchive} ${dayText}">${daysUntilArchive} ${dayText} to archive</span>`;
                                }
                            } else {
                                archiveStatus = '<span class="status-badge status-active" title="Active - Processed for reports">Active</span>';
                            }
                        }
                        
                        row.innerHTML = `
                            <td>${formatTimestamp(item["Timestamp"])}</td>
                            <td>${item["Plant"] || "-"}</td>
                            <td>${item["Part No."] || "-"}</td>
                            <td>${item["Part Name"] || "-"}</td>
                            <td>${item["Operation"] || "-"}</td>
                            <td>${item["Cycle Time"] != null ? item["Cycle Time"] : "-"}</td>
                            <td>${item["Part Count Per Cycle"] != null ? item["Part Count Per Cycle"] : "-"}</td>
                            <td>${item["Inspection Applicability"] || "-"}</td>
                            <td>${item["Cell Name"] || "-"}</td>
                            <td>${item["Cell Leader"] || "-"}</td>
                            <td>${item["Work Stations"] != null ? item["Work Stations"] : "-"}</td>
                            <td>${item["Mandays"] != null ? item["Mandays"] : "-"}</td>
                            <td>${item["Tool Code"] || "-"}</td>
                            <td>${item["Operator Code"] || "-"}</td>
                            <td>${item["Loss Reasons"] || "-"}</td>
                            <td>${item["Machine No."] || "-"}</td>
                            <td>${item["Value"] != null ? item["Value"] : "-"}</td>
                            <td>${archiveStatus}</td>
                        `;
                        tableBody.appendChild(row);
                    });
                };

                if (isAutoRefresh) {
                    // Smooth update during auto-refresh
                    requestAnimationFrame(updateTable);
                } else {
                    // Immediate update for initial load
                    updateTable();
                }
            }
            if (!isAutoRefresh) {
                if (table) table.style.display = "table";
                if (pagination) pagination.style.display = "flex";
            }
            updateIoTDataPagination();
        } else {
            if (tableBody) tableBody.innerHTML = "<tr><td colspan='17' style='text-align: center; padding: 2rem;'>No IoT data found</td></tr>";
            if (!isAutoRefresh) {
                if (table) table.style.display = "table";
            }
        }
    } catch (error) {
        console.error("Error loading IoT data:", error);
        // Remove refreshing state on error
        const tableContainer = document.querySelector("#iotDataPage .table-container");
        if (tableContainer) {
            tableContainer.classList.remove("refreshing");
        }
        if (!isAutoRefresh) {
            if (loadingMessage) loadingMessage.style.display = "none";
        }
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan='17' style='text-align: center; padding: 2rem; color: var(--error-color);'>Error loading IoT data: ${error.message}</td></tr>`;
        }
        if (!isAutoRefresh) {
            if (table) table.style.display = "table";
        }
        // Only show toast on non-auto-refresh errors to avoid spam
        if (!isAutoRefresh) {
            showToast("Error loading IoT data: " + error.message, "error");
        }
    }
}

// Update IoT Data Pagination UI
function updateIoTDataPagination() {
    const state = paginationState.iotData;
    const prevBtn = document.getElementById("iotDataPrevBtn");
    const nextBtn = document.getElementById("iotDataNextBtn");
    const pageNumbers = document.getElementById("iotDataPageNumbers");
    const paginationInfo = document.getElementById("iotDataPaginationInfo");

    // Update prev/next buttons
    if (prevBtn) prevBtn.disabled = state.currentPage === 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;

    // Update pagination info
    if (paginationInfo) {
        const from = state.totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
        const to = Math.min(state.currentPage * state.pageSize, state.totalItems);
        paginationInfo.textContent = `Showing ${from}-${to} of ${state.totalItems} entries`;
    }

    // Update page numbers
    if (pageNumbers) {
        pageNumbers.innerHTML = "";
        const maxPages = 5;
        let startPage = Math.max(1, state.currentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(state.totalPages, startPage + maxPages - 1);
        
        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-page ${i === state.currentPage ? "active" : ""}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener("click", () => loadIoTDataTable(i));
            pageNumbers.appendChild(pageBtn);
        }
    }
}

// Initialize IoT Data pagination event listeners
document.addEventListener("DOMContentLoaded", () => {
    const prevBtn = document.getElementById("iotDataPrevBtn");
    const nextBtn = document.getElementById("iotDataNextBtn");
    const pageSizeSelect = document.getElementById("iotDataPageSize");
    const plantFilterInput = document.getElementById("iotPlantFilter");
    const machineFilterInput = document.getElementById("iotMachineFilter");
    const clearFiltersBtn = document.getElementById("iotClearFiltersBtn");

    // Pagination controls
    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (paginationState.iotData.currentPage > 1) {
                loadIoTDataTable(paginationState.iotData.currentPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (paginationState.iotData.currentPage < paginationState.iotData.totalPages) {
                loadIoTDataTable(paginationState.iotData.currentPage + 1);
            }
        });
    }

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            paginationState.iotData.pageSize = parseInt(e.target.value);
            paginationState.iotData.currentPage = 1;
            loadIoTDataTable(1);
        });
    }

    // Filter inputs (debounced)
    if (plantFilterInput) {
        let plantDebounce;
        plantFilterInput.addEventListener("input", (e) => {
            clearTimeout(plantDebounce);
            plantDebounce = setTimeout(() => {
                paginationState.iotData.plantFilter = e.target.value;
                paginationState.iotData.currentPage = 1;
                loadIoTDataTable(1);
            }, 400);
        });
    }

    if (machineFilterInput) {
        let machineDebounce;
        machineFilterInput.addEventListener("input", (e) => {
            clearTimeout(machineDebounce);
            machineDebounce = setTimeout(() => {
                paginationState.iotData.machineFilter = e.target.value;
                paginationState.iotData.currentPage = 1;
                loadIoTDataTable(1);
            }, 400);
        });
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener("click", () => {
            if (plantFilterInput) plantFilterInput.value = "";
            if (machineFilterInput) machineFilterInput.value = "";
            paginationState.iotData.plantFilter = "";
            paginationState.iotData.machineFilter = "";
            paginationState.iotData.currentPage = 1;
            loadIoTDataTable(1);
        });
    }

    // Task Manager pagination & search
    const taskPrevBtn = document.getElementById("taskManagerPrevBtn");
    const taskNextBtn = document.getElementById("taskManagerNextBtn");
    const taskPageSizeSelect = document.getElementById("taskManagerPageSize");
    const taskSearchInput = document.getElementById("taskManagerSearch");
    const taskPlantFilter = document.getElementById("taskPlantFilter");
    const taskFrequencyFilter = document.getElementById("taskFrequencyFilter");
    const taskStatusFilter = document.getElementById("taskStatusFilter");

    if (taskPrevBtn) {
        taskPrevBtn.addEventListener("click", () => {
            if (paginationState.taskManager.currentPage > 1) {
                loadTaskManagerTable(paginationState.taskManager.currentPage - 1);
            }
        });
    }

    if (taskNextBtn) {
        taskNextBtn.addEventListener("click", () => {
            if (paginationState.taskManager.currentPage < paginationState.taskManager.totalPages) {
                loadTaskManagerTable(paginationState.taskManager.currentPage + 1);
            }
        });
    }

    if (taskPageSizeSelect) {
        taskPageSizeSelect.addEventListener("change", (e) => {
            paginationState.taskManager.pageSize = parseInt(e.target.value);
            paginationState.taskManager.currentPage = 1;
            loadTaskManagerTable(1);
        });
    }

    if (taskSearchInput) {
        let taskSearchDebounce;
        taskSearchInput.addEventListener("input", (e) => {
            clearTimeout(taskSearchDebounce);
            taskSearchDebounce = setTimeout(() => {
                paginationState.taskManager.searchTerm = e.target.value;
                paginationState.taskManager.currentPage = 1;
                loadTaskManagerTable(1);
            }, 400);
        });
    }

    if (taskPlantFilter) {
        taskPlantFilter.addEventListener("change", (e) => {
            paginationState.taskManager.plantFilter = e.target.value;
            paginationState.taskManager.currentPage = 1;
            loadTaskManagerTable(1);
        });
    }

    if (taskFrequencyFilter) {
        taskFrequencyFilter.addEventListener("change", (e) => {
            paginationState.taskManager.frequencyFilter = e.target.value;
            paginationState.taskManager.currentPage = 1;
            loadTaskManagerTable(1);
        });
    }

    if (taskStatusFilter) {
        taskStatusFilter.addEventListener("change", (e) => {
            paginationState.taskManager.statusFilter = e.target.value;
            paginationState.taskManager.currentPage = 1;
            loadTaskManagerTable(1);
        });
    }
});

// ==================== APP BRANDING & SETTINGS ====================

// Default branding settings
const defaultBranding = {
    app_short_name: 'DMS',
    app_full_name: 'Dhananjay Manufacturing System',
    app_logo_url: '',
    app_logo_text: 'DMS',
    app_primary_color: '#0ea5e9',
    app_secondary_color: '#6366f1'
};

// Current branding settings (loaded from Supabase)
let currentBranding = { ...defaultBranding };

// Load branding settings from Supabase
async function loadAppBranding() {
    if (!window.supabase) {
        console.log('Supabase not available, using default branding');
        applyBranding(defaultBranding);
        return;
    }

    try {
        const { data, error } = await window.supabase
            .from('app_settings')
            .select('*')
            .eq('setting_key', 'branding')
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error loading branding:', error);
            applyBranding(defaultBranding);
            return;
        }

        if (data && data.setting_value) {
            currentBranding = { ...defaultBranding, ...data.setting_value };
        } else {
            currentBranding = { ...defaultBranding };
        }
        
        applyBranding(currentBranding);
    } catch (err) {
        console.error('Error loading branding:', err);
        applyBranding(defaultBranding);
    }
}

// Apply branding to the UI
function applyBranding(branding) {
    // Update CSS variables for colors
    document.documentElement.style.setProperty('--app-primary-color', branding.app_primary_color);
    document.documentElement.style.setProperty('--app-secondary-color', branding.app_secondary_color);

    // Update sidebar logo
    const sidebarLogoImg = document.getElementById('sidebarLogoImg');
    const sidebarLogoDefault = document.getElementById('sidebarLogoDefault');
    const sidebarAppName = document.getElementById('sidebarAppName');
    
    if (branding.app_logo_url) {
        if (sidebarLogoImg) {
            sidebarLogoImg.src = branding.app_logo_url;
            sidebarLogoImg.style.display = 'block';
        }
        if (sidebarLogoDefault) sidebarLogoDefault.style.display = 'none';
    } else {
        if (sidebarLogoImg) sidebarLogoImg.style.display = 'none';
        if (sidebarLogoDefault) {
            sidebarLogoDefault.style.display = 'flex';
            const logoText = sidebarLogoDefault.querySelector('.logo-text');
            if (logoText) logoText.textContent = branding.app_logo_text || branding.app_short_name;
        }
    }
    if (sidebarAppName) sidebarAppName.textContent = branding.app_short_name;

    // Update header logo
    const headerLogoImg = document.getElementById('headerLogoImg');
    const headerLogoDefault = document.getElementById('headerLogoDefault');
    
    if (branding.app_logo_url) {
        if (headerLogoImg) {
            headerLogoImg.src = branding.app_logo_url;
            headerLogoImg.style.display = 'block';
        }
        if (headerLogoDefault) headerLogoDefault.style.display = 'none';
    } else {
        if (headerLogoImg) headerLogoImg.style.display = 'none';
        if (headerLogoDefault) {
            headerLogoDefault.style.display = 'flex';
            const logoText = headerLogoDefault.querySelector('.logo-text');
            if (logoText) logoText.textContent = branding.app_logo_text || branding.app_short_name;
        }
    }

    // Update login page branding
    const loginLogoImg = document.getElementById('loginLogoImg');
    const loginLogoDefault = document.getElementById('loginLogoDefault');
    const loginAppName = document.getElementById('loginAppName');
    const loginAppFullName = document.getElementById('loginAppFullName');
    const loginLogoText = document.getElementById('loginLogoText');
    
    if (branding.app_logo_url) {
        if (loginLogoImg) {
            loginLogoImg.src = branding.app_logo_url;
            loginLogoImg.style.display = 'block';
        }
        if (loginLogoDefault) loginLogoDefault.style.display = 'none';
    } else {
        if (loginLogoImg) loginLogoImg.style.display = 'none';
        if (loginLogoDefault) loginLogoDefault.style.display = 'flex';
        if (loginLogoText) loginLogoText.textContent = branding.app_logo_text || branding.app_short_name;
    }
    if (loginAppName) loginAppName.textContent = branding.app_short_name;
    if (loginAppFullName) loginAppFullName.textContent = branding.app_full_name;

    // Update page title
    document.title = `${branding.app_short_name} - ${branding.app_full_name}`;
    
    // Update settings page display
    const currentAppNameDisplay = document.getElementById('currentAppNameDisplay');
    if (currentAppNameDisplay) currentAppNameDisplay.textContent = branding.app_short_name;
}

// Load branding settings into the form
function loadBrandingSettings() {
    const shortNameInput = document.getElementById('appShortName');
    const fullNameInput = document.getElementById('appFullName');
    const logoUrlInput = document.getElementById('appLogoUrl');
    const logoTextInput = document.getElementById('appLogoText');
    const primaryColorInput = document.getElementById('appPrimaryColor');
    const primaryColorTextInput = document.getElementById('appPrimaryColorText');
    const secondaryColorInput = document.getElementById('appSecondaryColor');
    const secondaryColorTextInput = document.getElementById('appSecondaryColorText');
    const fileNameSpan = document.getElementById('logoFileName');
    const removeLogoBtn = document.getElementById('removeLogoBtn');

    if (shortNameInput) shortNameInput.value = currentBranding.app_short_name;
    if (fullNameInput) fullNameInput.value = currentBranding.app_full_name;
    if (logoUrlInput) logoUrlInput.value = currentBranding.app_logo_url || '';
    if (logoTextInput) logoTextInput.value = currentBranding.app_logo_text || currentBranding.app_short_name;
    if (primaryColorInput) primaryColorInput.value = currentBranding.app_primary_color;
    if (primaryColorTextInput) primaryColorTextInput.value = currentBranding.app_primary_color;
    if (secondaryColorInput) secondaryColorInput.value = currentBranding.app_secondary_color;
    if (secondaryColorTextInput) secondaryColorTextInput.value = currentBranding.app_secondary_color;

    // Update logo file display
    if (currentBranding.app_logo_url) {
        // Extract filename from URL
        const urlParts = currentBranding.app_logo_url.split('/');
        const fileName = urlParts[urlParts.length - 1] || 'Current logo';
        if (fileNameSpan) fileNameSpan.textContent = fileName;
        if (removeLogoBtn) removeLogoBtn.style.display = 'flex';
    } else {
        if (fileNameSpan) fileNameSpan.textContent = 'No file chosen';
        if (removeLogoBtn) removeLogoBtn.style.display = 'none';
    }

    // Update preview
    updateBrandingPreview();
}

// Update branding preview
function updateBrandingPreview() {
    const shortName = document.getElementById('appShortName')?.value || 'DMS';
    const fullName = document.getElementById('appFullName')?.value || 'Dhananjay Manufacturing System';
    const logoUrl = document.getElementById('appLogoUrl')?.value || '';
    const logoText = document.getElementById('appLogoText')?.value || shortName;
    const primaryColor = document.getElementById('appPrimaryColor')?.value || '#0ea5e9';
    const secondaryColor = document.getElementById('appSecondaryColor')?.value || '#6366f1';

    const previewLogoImg = document.getElementById('previewLogoImg');
    const previewLogoDefault = document.getElementById('previewLogoDefault');
    const previewLogoText = document.getElementById('previewLogoText');
    const previewAppName = document.getElementById('previewAppName');
    const previewAppFullName = document.getElementById('previewAppFullName');

    if (logoUrl) {
        if (previewLogoImg) {
            previewLogoImg.src = logoUrl;
            previewLogoImg.style.display = 'block';
        }
        if (previewLogoDefault) previewLogoDefault.style.display = 'none';
    } else {
        if (previewLogoImg) previewLogoImg.style.display = 'none';
        if (previewLogoDefault) {
            previewLogoDefault.style.display = 'flex';
            previewLogoDefault.style.background = `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
        }
        if (previewLogoText) previewLogoText.textContent = logoText.substring(0, 4);
    }
    if (previewAppName) previewAppName.textContent = shortName;
    if (previewAppFullName) previewAppFullName.textContent = fullName;
}

// Save branding settings to Supabase
async function saveBrandingSettings(e) {
    e.preventDefault();
    
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
        showToast('Access denied. Admin privileges required.', 'error');
        return;
    }

    const branding = {
        app_short_name: document.getElementById('appShortName')?.value || 'DMS',
        app_full_name: document.getElementById('appFullName')?.value || 'Dhananjay Manufacturing System',
        app_logo_url: document.getElementById('appLogoUrl')?.value || '',
        app_logo_text: document.getElementById('appLogoText')?.value || 'DMS',
        app_primary_color: document.getElementById('appPrimaryColor')?.value || '#0ea5e9',
        app_secondary_color: document.getElementById('appSecondaryColor')?.value || '#6366f1'
    };

    try {
        // Check if branding settings exist
        const { data: existing } = await window.supabase
            .from('app_settings')
            .select('id')
            .eq('setting_key', 'branding')
            .single();

        if (existing) {
            // Update existing
            const { error } = await window.supabase
                .from('app_settings')
                .update({ setting_value: branding, updated_at: new Date().toISOString() })
                .eq('setting_key', 'branding');

            if (error) throw error;
        } else {
            // Insert new
            const { error } = await window.supabase
                .from('app_settings')
                .insert({ setting_key: 'branding', setting_value: branding });

            if (error) throw error;
        }

        currentBranding = branding;
        applyBranding(branding);
        showToast('Branding settings saved successfully!', 'success');
    } catch (err) {
        console.error('Error saving branding:', err);
        showToast('Failed to save branding settings: ' + err.message, 'error');
    }
}

// Reset branding to default
function resetBranding() {
    if (confirm('Are you sure you want to reset branding to default settings?')) {
        currentBranding = { ...defaultBranding };
        loadBrandingSettings();
        applyBranding(defaultBranding);
    }
}

// Load Settings page statistics
async function loadSettingsPageStats() {
    if (!window.supabase) return;
    
    try {
        // Load user count from profiles table
        const { count: userCount } = await window.supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });
        
        const settingsUserCount = document.getElementById('settingsUserCount');
        if (settingsUserCount) settingsUserCount.textContent = userCount || 0;
    } catch (err) {
        console.error('Error loading settings stats:', err);
    }
}

// Upload logo file to Supabase Storage
async function uploadLogoFile(file) {
    if (!window.supabase) {
        throw new Error('Supabase not available');
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
        throw new Error('File size exceeds 2MB limit');
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Allowed: PNG, JPG, SVG, WebP');
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `logo_${Date.now()}.${fileExt}`;
    const filePath = `branding/${fileName}`;

    // Show progress
    const progressContainer = document.getElementById('logoUploadProgress');
    const progressFill = document.getElementById('logoProgressFill');
    const progressText = document.getElementById('logoProgressText');
    
    if (progressContainer) progressContainer.style.display = 'block';
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = 'Uploading...';

    try {
        // Simulate progress (Supabase doesn't provide upload progress)
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            if (progress <= 90 && progressFill) {
                progressFill.style.width = `${progress}%`;
            }
        }, 100);

        // Upload to Supabase Storage
        const { data, error } = await window.supabase.storage
            .from('app-assets')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true
            });

        clearInterval(progressInterval);

        if (error) {
            // If bucket doesn't exist error, provide helpful message
            if (error.message.includes('bucket') || error.statusCode === 400) {
                throw new Error('Storage bucket "app-assets" not found. Please create it in Supabase Storage.');
            }
            throw error;
        }

        // Get public URL
        const { data: urlData } = window.supabase.storage
            .from('app-assets')
            .getPublicUrl(filePath);

        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = 'Upload complete!';

        // Hide progress after delay
        setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
        }, 1500);

        return urlData.publicUrl;
    } catch (err) {
        if (progressContainer) progressContainer.style.display = 'none';
        throw err;
    }
}

// Delete old logo from Supabase Storage
async function deleteOldLogo(logoUrl) {
    if (!window.supabase || !logoUrl) return;

    try {
        // Extract file path from URL
        const urlParts = logoUrl.split('/app-assets/');
        if (urlParts.length < 2) return;
        
        const filePath = urlParts[1];
        
        await window.supabase.storage
            .from('app-assets')
            .remove([filePath]);
    } catch (err) {
        console.warn('Could not delete old logo:', err);
    }
}

// Handle logo file selection
async function handleLogoFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileNameSpan = document.getElementById('logoFileName');
    const removeBtn = document.getElementById('removeLogoBtn');
    const logoUrlInput = document.getElementById('appLogoUrl');

    try {
        // Update file name display
        if (fileNameSpan) fileNameSpan.textContent = file.name;

        // Upload file
        const logoUrl = await uploadLogoFile(file);

        // Delete old logo if exists
        if (currentBranding.app_logo_url) {
            await deleteOldLogo(currentBranding.app_logo_url);
        }

        // Update hidden input
        if (logoUrlInput) logoUrlInput.value = logoUrl;

        // Show remove button
        if (removeBtn) removeBtn.style.display = 'flex';

        // Update preview
        updateBrandingPreview();

        showToast('Logo uploaded successfully!', 'success');
    } catch (err) {
        console.error('Error uploading logo:', err);
        showToast('Failed to upload logo: ' + err.message, 'error');
        
        // Reset file input
        e.target.value = '';
        if (fileNameSpan) fileNameSpan.textContent = 'No file chosen';
    }
}

// Remove uploaded logo
async function removeUploadedLogo() {
    const logoUrlInput = document.getElementById('appLogoUrl');
    const fileInput = document.getElementById('appLogoFile');
    const fileNameSpan = document.getElementById('logoFileName');
    const removeBtn = document.getElementById('removeLogoBtn');

    // Delete from storage if it's our uploaded file
    const currentUrl = logoUrlInput?.value || currentBranding.app_logo_url;
    if (currentUrl && currentUrl.includes('app-assets')) {
        await deleteOldLogo(currentUrl);
    }

    // Clear inputs
    if (logoUrlInput) logoUrlInput.value = '';
    if (fileInput) fileInput.value = '';
    if (fileNameSpan) fileNameSpan.textContent = 'No file chosen';
    if (removeBtn) removeBtn.style.display = 'none';

    // Update preview
    updateBrandingPreview();
}

// Initialize branding form
function initializeBrandingForm() {
    const brandingForm = document.getElementById('brandingForm');
    const resetBrandingBtn = document.getElementById('resetBrandingBtn');
    const shortNameInput = document.getElementById('appShortName');
    const fullNameInput = document.getElementById('appFullName');
    const logoFileInput = document.getElementById('appLogoFile');
    const logoUrlInput = document.getElementById('appLogoUrl');
    const logoTextInput = document.getElementById('appLogoText');
    const primaryColorInput = document.getElementById('appPrimaryColor');
    const primaryColorTextInput = document.getElementById('appPrimaryColorText');
    const secondaryColorInput = document.getElementById('appSecondaryColor');
    const secondaryColorTextInput = document.getElementById('appSecondaryColorText');
    const removeLogoBtn = document.getElementById('removeLogoBtn');

    if (brandingForm) {
        brandingForm.addEventListener('submit', saveBrandingSettings);
    }

    if (resetBrandingBtn) {
        resetBrandingBtn.addEventListener('click', resetBranding);
    }

    // Logo file upload handler
    if (logoFileInput) {
        logoFileInput.addEventListener('change', handleLogoFileSelect);
    }

    // Remove logo button
    if (removeLogoBtn) {
        removeLogoBtn.addEventListener('click', removeUploadedLogo);
    }

    // Live preview updates
    [shortNameInput, fullNameInput, logoTextInput].forEach(input => {
        if (input) {
            input.addEventListener('input', updateBrandingPreview);
        }
    });

    // Color input synchronization
    if (primaryColorInput && primaryColorTextInput) {
        primaryColorInput.addEventListener('input', (e) => {
            primaryColorTextInput.value = e.target.value;
            updateBrandingPreview();
        });
        primaryColorTextInput.addEventListener('input', (e) => {
            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                primaryColorInput.value = e.target.value;
                updateBrandingPreview();
            }
        });
    }

    if (secondaryColorInput && secondaryColorTextInput) {
        secondaryColorInput.addEventListener('input', (e) => {
            secondaryColorTextInput.value = e.target.value;
            updateBrandingPreview();
        });
        secondaryColorTextInput.addEventListener('input', (e) => {
            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                secondaryColorInput.value = e.target.value;
                updateBrandingPreview();
            }
        });
    }
}

// Initialize branding on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Load branding first to apply it to the UI
    loadAppBranding();
    
    // Initialize branding form handlers
    initializeBrandingForm();
});
