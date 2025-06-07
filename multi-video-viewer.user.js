// ==UserScript==
// @name         Multi-Video Viewer
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Load 4 videos in a 2x2 grid layout with individual controls and right-click context menu
// @author       You
// @match        *://*/*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const MAX_VIDEOS = 4;
    let videoUrls = [];
    let isGridMode = false;
    let gridContainer = null;
    let contextMenu = null;
    let rightClickedLink = null;

    // Storage keys
    const STORAGE_KEY = 'multiVideoUrls';
    const GRID_STATE_KEY = 'multiVideoGridState';
    const VIDEO_STATES_KEY = 'multiVideoStates';
    const GRID_TAB_ID_KEY = 'multiVideoGridTabId';

    // Check if this is the dedicated grid tab
    const isGridTab = window.location.href.includes('#multi-video-grid') ||
                      GM_getValue('currentGridTabId') === getTabId();

    // CSS Styles
    const styles = `
        .multi-video-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: #000;
            z-index: 10000;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 2px;
        }
        
        .video-box {
            position: relative;
            background: #111;
            overflow: hidden;
            border: 2px solid #333;
        }
        
        .video-box.fullscreen {
            grid-column: 1 / -1;
            grid-row: 1 / -1;
            z-index: 10001;
        }
        
        .video-box video, .video-box iframe {
            width: 100%;
            height: calc(100% - 60px);
            object-fit: contain;
        }

        .video-controls {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 60px;
            background: rgba(0,0,0,0.9);
            padding: 10px;
            border-radius: 0;
            display: flex;
            gap: 10px;
            align-items: center;
            justify-content: center;
            transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .video-controls.hidden {
            opacity: 0;
            transform: translateY(100%);
            pointer-events: none;
        }

        .video-box:hover .video-controls.hidden {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }

        .controls-toggle {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.7);
            color: white;
            border: none;
            padding: 5px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            z-index: 10001;
        }

        .controls-toggle:hover {
            background: rgba(0,0,0,0.9);
        }
        
        .control-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .control-btn:hover {
            background: #0056b3;
        }

        .control-btn.remove-btn {
            background: #dc3545;
        }

        .control-btn.remove-btn:hover {
            background: #c82333;
        }
        
        .video-title {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 12px;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .main-controls {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10002;
            display: flex;
            gap: 10px;
        }
        
        .url-input-container {
            position: fixed;
            top: 50px;
            right: 10px;
            z-index: 10002;
            background: rgba(0,0,0,0.8);
            padding: 15px;
            border-radius: 5px;
            display: none;
        }
        
        .url-input {
            width: 300px;
            padding: 8px;
            margin: 5px 0;
            border: 1px solid #ccc;
            border-radius: 3px;
        }

        .context-menu {
            position: fixed;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10003;
            padding: 5px 0;
            min-width: 150px;
        }

        .context-menu-item {
            padding: 8px 15px;
            cursor: pointer;
            font-size: 14px;
            color: #333;
        }

        .context-menu-item:hover {
            background: #f0f0f0;
        }

        .multi-video-add-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            font-size: 24px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }

        .multi-video-add-btn:hover {
            background: #0056b3;
            transform: scale(1.1);
        }

        .multi-video-add-btn.added {
            background: #28a745;
        }

        .multi-video-add-btn.added:hover {
            background: #1e7e34;
        }
    `;

    // Add styles to page
    function addStyles() {
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    // Check if URL is a direct video file
    function isDirectVideoUrl(url) {
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.wmv', '.flv', '.m4v'];
        const urlLower = url.toLowerCase();
        return videoExtensions.some(ext => urlLower.includes(ext));
    }

    // Get domain from URL for display
    function getUrlDomain(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return 'Unknown';
        }
    }

    // Generate a unique tab ID
    function getTabId() {
        if (!window.tabId) {
            window.tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        return window.tabId;
    }

    // Open or focus the dedicated grid tab
    function openGridTab() {
        // Check if we're already in a grid tab
        if (isGridTab) {
            showGridInCurrentTab();
            return;
        }

        // Check if a grid tab already exists by trying to communicate with it
        const gridTabExists = GM_getValue('gridTabActive', false);
        const lastGridTabPing = GM_getValue('lastGridTabPing', 0);
        const now = Date.now();

        // If grid tab pinged recently (within 5 seconds), it's probably still open
        if (gridTabExists && (now - lastGridTabPing) < 5000) {
            // Signal the existing grid tab to show itself
            GM_setValue('showGridSignal', now);
            // Don't open a new tab
            return;
        }

        // No active grid tab found, create grid in current tab
        createGridInCurrentTab();
    }

    // Create grid directly in current tab
    function createGridInCurrentTab() {
        // Mark current tab as grid tab
        window.location.hash = '#multi-video-grid';

        // Clear the page content
        document.body.innerHTML = '';
        document.head.innerHTML = '<title>Multi-Video Grid</title><meta charset="utf-8">';

        // Re-add our styles
        addStyles();

        // Initialize as grid tab
        showGridInCurrentTab();
    }

    // Show grid in current tab (for grid tab only)
    function showGridInCurrentTab() {
        if (!isGridTab) return;

        // Mark this tab as the active grid tab
        GM_setValue('gridTabActive', true);
        GM_setValue('lastGridTabPing', Date.now());

        // Clear the loading message if it exists
        document.body.innerHTML = '';

        loadVideoUrls();
        if (videoUrls.length > 0) {
            if (!isGridMode) {
                createMainControls();
            }
            createGrid();
        } else {
            // Show a message if no videos yet
            const message = document.createElement('div');
            message.style.cssText = 'color: white; text-align: center; padding: 50px; font-size: 18px;';
            message.textContent = 'Multi-Video Grid - Add videos using the + button on video pages';
            document.body.appendChild(message);
        }

        // Keep pinging to show this tab is active
        setInterval(() => {
            GM_setValue('lastGridTabPing', Date.now());
        }, 2000);

        // Listen for signals to show the grid
        setInterval(() => {
            const showSignal = GM_getValue('showGridSignal', 0);
            const lastProcessed = GM_getValue('lastProcessedSignal', 0);

            if (showSignal > lastProcessed) {
                GM_setValue('lastProcessedSignal', showSignal);
                // Bring this tab to focus (browser will handle this)
                window.focus();

                // Update grid if needed
                loadVideoUrls();
                if (videoUrls.length > 0 && !isGridMode) {
                    if (!isGridMode) {
                        createMainControls();
                    }
                    createGrid();
                }
            }
        }, 500);
    }

    // Storage functions
    function saveVideoUrls() {
        GM_setValue(STORAGE_KEY, JSON.stringify(videoUrls));
        GM_setValue(GRID_STATE_KEY, isGridMode);
    }

    function loadVideoUrls() {
        const saved = GM_getValue(STORAGE_KEY, '[]');
        videoUrls = JSON.parse(saved);
        isGridMode = GM_getValue(GRID_STATE_KEY, false);
    }

    function clearStorage() {
        GM_deleteValue(STORAGE_KEY);
        GM_deleteValue(GRID_STATE_KEY);
        GM_deleteValue(VIDEO_STATES_KEY);
    }

    // Save video states (playback position, playing status, mute status)
    function saveVideoStates() {
        const states = [];
        document.querySelectorAll('.video-box').forEach((box, index) => {
            const video = box.querySelector('video');
            if (video) {
                states[index] = {
                    currentTime: video.currentTime,
                    paused: video.paused,
                    muted: video.muted,
                    volume: video.volume
                };
            } else {
                states[index] = null; // For iframes, we can't save state
            }
        });
        GM_setValue(VIDEO_STATES_KEY, JSON.stringify(states));
    }

    // Restore video states
    function restoreVideoStates() {
        const savedStates = GM_getValue(VIDEO_STATES_KEY, '[]');
        const states = JSON.parse(savedStates);

        document.querySelectorAll('.video-box').forEach((box, index) => {
            const video = box.querySelector('video');
            if (video && states[index]) {
                const state = states[index];
                video.currentTime = state.currentTime || 0;
                video.muted = state.muted || false;
                video.volume = state.volume || 1;

                // Restore play/pause state
                if (!state.paused) {
                    video.play().catch(e => console.log('Auto-play prevented:', e));
                }

                // Update button text
                const playBtn = box.querySelector('.control-btn');
                if (playBtn) {
                    playBtn.textContent = state.paused ? 'Play' : 'Pause';
                }

                const muteBtn = box.querySelectorAll('.control-btn')[1];
                if (muteBtn) {
                    muteBtn.textContent = state.muted ? 'Unmute' : 'Mute';
                }
            }
        });
    }

    // Create video box
    function createVideoBox(url, index) {
        const box = document.createElement('div');
        box.className = 'video-box';
        box.dataset.index = index;

        // Create video element or iframe based on URL
        let videoElement;
        if (isDirectVideoUrl(url)) {
            videoElement = document.createElement('video');
            videoElement.src = url;
            videoElement.controls = false;
            videoElement.muted = true;
            videoElement.crossOrigin = "anonymous";
        } else {
            // For non-direct video URLs, create an iframe
            videoElement = document.createElement('iframe');
            videoElement.src = url;
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.border = 'none';
            videoElement.allow = 'autoplay; fullscreen';
        }

        const title = document.createElement('div');
        title.className = 'video-title';
        title.textContent = `Video ${index + 1}: ${getUrlDomain(url)}`;

        const controls = document.createElement('div');
        controls.className = 'video-controls hidden'; // Start hidden

        const playBtn = document.createElement('button');
        playBtn.className = 'control-btn';
        playBtn.textContent = 'Play';
        playBtn.onclick = () => togglePlay(videoElement, playBtn);

        const muteBtn = document.createElement('button');
        muteBtn.className = 'control-btn';
        muteBtn.textContent = 'Unmute';
        muteBtn.onclick = () => toggleMute(videoElement, muteBtn);

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'control-btn';
        fullscreenBtn.textContent = 'Fullscreen';
        fullscreenBtn.onclick = () => toggleBoxFullscreen(box);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'control-btn remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => removeVideoBox(index);

        controls.appendChild(playBtn);
        controls.appendChild(muteBtn);
        controls.appendChild(fullscreenBtn);
        controls.appendChild(removeBtn);

        // Create toggle button for controls
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'controls-toggle';
        toggleBtn.textContent = '⚙️';
        toggleBtn.title = 'Toggle controls';
        toggleBtn.onclick = () => toggleControls(controls, toggleBtn);

        box.appendChild(videoElement);
        box.appendChild(title);
        box.appendChild(controls);
        box.appendChild(toggleBtn);

        return box;
    }

    // Toggle play/pause
    function togglePlay(video, button) {
        if (video.tagName === 'VIDEO') {
            if (video.paused) {
                video.play();
                button.textContent = 'Pause';
            } else {
                video.pause();
                button.textContent = 'Play';
            }
        } else {
            // For iframes, we can't control playback directly
            button.textContent = 'N/A (iframe)';
        }
    }

    // Toggle mute/unmute
    function toggleMute(video, button) {
        if (video.tagName === 'VIDEO') {
            video.muted = !video.muted;
            button.textContent = video.muted ? 'Unmute' : 'Mute';
        } else {
            // For iframes, we can't control mute directly
            button.textContent = 'N/A (iframe)';
        }
    }

    // Toggle box fullscreen
    function toggleBoxFullscreen(box) {
        if (box.classList.contains('fullscreen')) {
            box.classList.remove('fullscreen');
        } else {
            // Remove fullscreen from other boxes
            document.querySelectorAll('.video-box.fullscreen').forEach(b => {
                b.classList.remove('fullscreen');
            });
            box.classList.add('fullscreen');
        }
    }

    // Toggle controls visibility
    function toggleControls(controls, toggleBtn) {
        if (controls.classList.contains('hidden')) {
            controls.classList.remove('hidden');
            toggleBtn.textContent = '🔽';
            toggleBtn.title = 'Hide controls';
        } else {
            controls.classList.add('hidden');
            toggleBtn.textContent = '⚙️';
            toggleBtn.title = 'Show controls';
        }
    }

    // Remove video box
    function removeVideoBox(index) {
        // Load current state and remove the URL from the array
        loadVideoUrls();
        videoUrls.splice(index, 1);
        saveVideoUrls();

        // Update button in all tabs
        updateAddButton();

        // If no videos left, exit grid mode
        if (videoUrls.length === 0) {
            exitGrid();
            return;
        }

        // Recreate the grid with remaining videos
        createGrid();
    }

    // Create main grid
    function createGrid() {
        // Save current video states before recreating grid
        if (gridContainer) {
            saveVideoStates();
            document.body.removeChild(gridContainer);
        }

        gridContainer = document.createElement('div');
        gridContainer.className = 'multi-video-container';

        videoUrls.forEach((url, index) => {
            const box = createVideoBox(url, index);
            gridContainer.appendChild(box);
        });

        document.body.appendChild(gridContainer);
        isGridMode = true;

        // Restore video states after grid is created
        setTimeout(() => {
            restoreVideoStates();
        }, 100); // Small delay to ensure videos are loaded
    }

    // Create main controls
    function createMainControls() {
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'main-controls';

        const addUrlBtn = document.createElement('button');
        addUrlBtn.className = 'control-btn';
        addUrlBtn.textContent = 'Add URLs';
        addUrlBtn.onclick = showUrlInput;

        const exitBtn = document.createElement('button');
        exitBtn.className = 'control-btn';
        exitBtn.textContent = 'Exit Grid';
        exitBtn.onclick = exitGrid;

        controlsContainer.appendChild(addUrlBtn);
        controlsContainer.appendChild(exitBtn);
        document.body.appendChild(controlsContainer);

        // Create URL input container
        createUrlInput();
    }

    // Create URL input interface
    function createUrlInput() {
        const container = document.createElement('div');
        container.className = 'url-input-container';
        container.id = 'urlInputContainer';

        for (let i = 0; i < MAX_VIDEOS; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'url-input';
            input.placeholder = `Video URL ${i + 1}`;
            input.id = `urlInput${i}`;
            container.appendChild(input);
        }

        const loadBtn = document.createElement('button');
        loadBtn.className = 'control-btn';
        loadBtn.textContent = 'Load Videos';
        loadBtn.onclick = loadVideosFromInput;

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'control-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = hideUrlInput;

        container.appendChild(loadBtn);
        container.appendChild(cancelBtn);
        document.body.appendChild(container);
    }

    // Show URL input
    function showUrlInput() {
        document.getElementById('urlInputContainer').style.display = 'block';
    }

    // Hide URL input
    function hideUrlInput() {
        document.getElementById('urlInputContainer').style.display = 'none';
    }

    // Load videos from input
    function loadVideosFromInput() {
        videoUrls = [];
        for (let i = 0; i < MAX_VIDEOS; i++) {
            const input = document.getElementById(`urlInput${i}`);
            if (input.value.trim()) {
                videoUrls.push(input.value.trim());
            }
        }
        
        if (videoUrls.length > 0) {
            createGrid();
            hideUrlInput();
        }
    }

    // Exit grid mode
    function exitGrid() {
        if (gridContainer) {
            document.body.removeChild(gridContainer);
            gridContainer = null;
        }
        isGridMode = false;

        // Clear storage and update all tabs
        clearStorage();
        videoUrls = [];
        updateAddButton();

        // Remove controls
        const controls = document.querySelector('.main-controls');
        const urlContainer = document.getElementById('urlInputContainer');
        if (controls) document.body.removeChild(controls);
        if (urlContainer) document.body.removeChild(urlContainer);
    }

    // Create context menu
    function createContextMenu(x, y, link) {
        console.log('Creating context menu at:', x, y, 'for link:', link);
        removeContextMenu();

        contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.style.position = 'fixed';
        contextMenu.style.zIndex = '10003';

        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.textContent = 'Add this link to video grid';
        menuItem.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Adding link to grid:', link);
            addLinkToGrid(link);
            removeContextMenu();
        };

        contextMenu.appendChild(menuItem);
        document.body.appendChild(contextMenu);

        console.log('Context menu created and added to body');
    }

    // Remove context menu
    function removeContextMenu() {
        if (contextMenu && contextMenu.parentNode) {
            contextMenu.parentNode.removeChild(contextMenu);
            contextMenu = null;
        }
    }

    // Add link to grid
    function addLinkToGrid(link) {
        // Load current state from storage
        loadVideoUrls();

        // Add link to videoUrls if not already present and if there's space
        if (videoUrls.length < MAX_VIDEOS && !videoUrls.includes(link)) {
            videoUrls.push(link);
            saveVideoUrls();
            updateAddButton();
        }

        // Open or focus the dedicated grid tab
        openGridTab();
    }

    // Create floating add button
    function createAddButton() {
        const addBtn = document.createElement('button');
        addBtn.className = 'multi-video-add-btn';
        addBtn.innerHTML = '+';
        addBtn.title = 'Add this page to multi-video viewer';
        addBtn.id = 'multiVideoAddBtn';

        addBtn.onclick = function() {
            const currentUrl = window.location.href;
            addLinkToGrid(currentUrl);
        };

        document.body.appendChild(addBtn);
        return addBtn;
    }

    // Update add button appearance
    function updateAddButton() {
        const addBtn = document.getElementById('multiVideoAddBtn');
        if (addBtn) {
            const currentUrl = window.location.href;
            if (videoUrls.includes(currentUrl)) {
                addBtn.classList.add('added');
                addBtn.innerHTML = '✓';
                addBtn.title = 'This page is already in the multi-video viewer';
            } else if (videoUrls.length >= MAX_VIDEOS) {
                addBtn.style.background = '#6c757d';
                addBtn.innerHTML = '✗';
                addBtn.title = 'Maximum videos reached (4/4)';
                addBtn.disabled = true;
            } else {
                addBtn.classList.remove('added');
                addBtn.innerHTML = '+';
                addBtn.title = `Add this page to multi-video viewer (${videoUrls.length}/${MAX_VIDEOS})`;
                addBtn.disabled = false;
                addBtn.style.background = '#007bff';
            }
        }
    }

    // Initialize
    function init() {
        console.log('Multi-Video Viewer script initialized');
        addStyles();

        // Load existing video URLs from storage
        loadVideoUrls();

        // If this is the grid tab, show the grid
        if (isGridTab) {
            showGridInCurrentTab();

            // Clean up when grid tab is closed
            window.addEventListener('beforeunload', () => {
                GM_setValue('gridTabActive', false);
            });
        } else {
            // For regular tabs, create the floating add button
            createAddButton();
            updateAddButton();
        }

        // Monitor storage changes from other tabs
        setInterval(() => {
            const currentUrls = JSON.stringify(videoUrls);
            loadVideoUrls();
            const newUrls = JSON.stringify(videoUrls);

            if (currentUrls !== newUrls) {
                console.log('Video URLs updated from another tab');

                if (isGridTab) {
                    // If this is the grid tab and URLs changed, update the grid
                    if (videoUrls.length > 0) {
                        if (!isGridMode) {
                            createMainControls();
                        }
                        createGrid();
                    }
                } else {
                    // For regular tabs, just update the button
                    updateAddButton();
                }
            }
        }, 1000); // Check every second

        // Test if event listeners are working
        document.addEventListener('click', function(e) {
            console.log('Click detected on:', e.target.tagName);
        });

        // Add right-click context menu for links with multiple event types
        ['contextmenu', 'mousedown'].forEach(eventType => {
            document.addEventListener(eventType, function(e) {
                if (eventType === 'contextmenu' || (eventType === 'mousedown' && e.button === 2)) {
                    console.log(`${eventType} event triggered on:`, e.target.tagName, e.target);

                    // First remove any existing context menu
                    removeContextMenu();

                    // Check for link in target or parent elements
                    let link = e.target.closest('a');

                    // Also check if the target itself is a link
                    if (!link && e.target.tagName === 'A') {
                        link = e.target;
                    }

                    // Check if target has href attribute
                    if (!link && e.target.href) {
                        link = e.target;
                    }

                    console.log('Found link:', link);

                    if (link && (link.href || link.getAttribute('href'))) {
                        console.log('Creating context menu for:', link.href || link.getAttribute('href'));

                        if (eventType === 'contextmenu') {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();

                            const linkUrl = link.href || link.getAttribute('href');
                            rightClickedLink = linkUrl;

                            // Create context menu immediately
                            createContextMenu(e.pageX, e.pageY, linkUrl);

                            return false;
                        }
                    }
                }
            }, true); // Use capture phase
        });

        // Remove context menu on click elsewhere
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.context-menu')) {
                removeContextMenu();
            }
        });

        // Also remove context menu on scroll or resize
        document.addEventListener('scroll', removeContextMenu);
        window.addEventListener('resize', removeContextMenu);

        // Add keyboard shortcut to activate (Ctrl+Shift+V)
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && e.key === 'V') {
                if (!isGridMode) {
                    createMainControls();
                    showUrlInput();
                } else {
                    exitGrid();
                }
            }
        });
    }

    // Start the script
    init();

})();
