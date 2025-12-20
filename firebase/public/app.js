/**
 * Pam's Recipe Collection App
 * Firebase-powered version with authentication and real-time updates
 */

// State
let allRecipes = [];
let filteredRecipes = [];
let currentUser = null;
let unsubscribeRecipes = null;
let unsubscribeBoards = null;
let wakeLock = null;
let allBoards = [];
let currentView = 'recipes'; // 'recipes' or 'boards'
let currentBoardFilter = null; // null means show all recipes
let currentRecipeForBoard = null; // Recipe being added to board
let selectedBoards = []; // Boards selected in the modal

// Check if device supports wake lock and is touch-enabled
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const supportsWakeLock = 'wakeLock' in navigator;

// DOM Elements
const recipeGrid = document.getElementById('recipeGrid');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const recipeCount = document.getElementById('recipeCount');
const authContainer = document.getElementById('authContainer');
const addRecipeButtons = document.getElementById('addRecipeButtons');

// Recipe Detail Modal
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');

// Import Modal
const importModalOverlay = document.getElementById('importModalOverlay');
const importForm = document.getElementById('importForm');
const importModalClose = document.getElementById('importModalClose');
const cancelImport = document.getElementById('cancelImport');
const importFromWebBtn = document.getElementById('importFromWebBtn');

// Create Modal
const createModalOverlay = document.getElementById('createModalOverlay');
const createForm = document.getElementById('createForm');
const createModalClose = document.getElementById('createModalClose');
const cancelCreate = document.getElementById('cancelCreate');
const createRecipeBtn = document.getElementById('createRecipeBtn');
const photoUploadArea = document.getElementById('photoUploadArea');
const recipePhoto = document.getElementById('recipePhoto');
const photoPreview = document.getElementById('photoPreview');
const photoPlaceholder = document.getElementById('photoPlaceholder');

// Board Modal
const boardModalOverlay = document.getElementById('boardModalOverlay');
const boardModalClose = document.getElementById('boardModalClose');
const cancelBoard = document.getElementById('cancelBoard');
const saveBoardSelection = document.getElementById('saveBoardSelection');
const newBoardName = document.getElementById('newBoardName');
const createBoardBtn = document.getElementById('createBoardBtn');
const boardsList = document.getElementById('boardsList');

// View Tabs
const recipesTab = document.getElementById('recipesTab');
const boardsTab = document.getElementById('boardsTab');
const boardsView = document.getElementById('boardsView');
const boardsGrid = document.getElementById('boardsGrid');

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    showLoading();
    setupAuth();
    setupEventListeners();
    loadRecipes();
    loadBoards();
}

// ============================================
// AUTHENTICATION
// ============================================

function setupAuth() {
    // Create auth button
    updateAuthUI(null);

    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
        currentUser = user;
        updateAuthUI(user);
        updateAddButtonsVisibility();
    });
}

function updateAuthUI(user) {
    if (user) {
        authContainer.innerHTML = `
            <div class="user-info">
                <img src="${user.photoURL || 'https://www.gravatar.com/avatar/?d=mp'}" alt="${user.displayName}" class="user-avatar">
                <span class="user-name">${user.displayName || user.email}</span>
                <button class="auth-button sign-out" onclick="signOut()">Sign Out</button>
            </div>
        `;
    } else {
        authContainer.innerHTML = `
            <button class="auth-button sign-in" onclick="signInWithGoogle()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
            </button>
        `;
    }
}

function updateAddButtonsVisibility() {
    if (currentUser && isAuthorizedUser(currentUser)) {
        addRecipeButtons.style.display = 'flex';
    } else {
        addRecipeButtons.style.display = 'none';
    }
}

async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
    } catch (error) {
        console.error('Sign in error:', error);
        alert('Failed to sign in. Please try again.');
    }
}

async function signOut() {
    try {
        await auth.signOut();
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

// Make functions available globally
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;

// ============================================
// LOAD RECIPES FROM FIRESTORE
// ============================================

function loadRecipes() {
    // Real-time listener for recipes (sorting done client-side)
    unsubscribeRecipes = db.collection('recipes')
        .onSnapshot((snapshot) => {
            allRecipes = [];
            snapshot.forEach((doc) => {
                allRecipes.push({ id: doc.id, ...doc.data() });
            });
            filteredRecipes = [...allRecipes];
            applyCurrentSort();
            renderRecipes();
        }, (error) => {
            console.error('Error loading recipes:', error);
            recipeGrid.innerHTML = `
                <div class="loading">
                    <p>Unable to load recipes. Please check your connection.</p>
                </div>
            `;
        });
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', debounce(handleSearch, 300));

    // Sort
    sortSelect.addEventListener('change', handleSort);

    // Recipe Detail Modal
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Import Modal
    importFromWebBtn.addEventListener('click', openImportModal);
    importModalClose.addEventListener('click', closeImportModal);
    cancelImport.addEventListener('click', closeImportModal);
    importModalOverlay.addEventListener('click', (e) => {
        if (e.target === importModalOverlay) closeImportModal();
    });
    importForm.addEventListener('submit', handleImportSubmit);

    // Create Modal
    createRecipeBtn.addEventListener('click', openCreateModal);
    createModalClose.addEventListener('click', closeCreateModal);
    cancelCreate.addEventListener('click', closeCreateModal);
    createModalOverlay.addEventListener('click', (e) => {
        if (e.target === createModalOverlay) closeCreateModal();
    });
    createForm.addEventListener('submit', handleCreateSubmit);

    // Photo upload
    photoUploadArea.addEventListener('click', () => recipePhoto.click());
    recipePhoto.addEventListener('change', handlePhotoSelect);

    // Board Modal
    boardModalClose.addEventListener('click', closeBoardModal);
    cancelBoard.addEventListener('click', closeBoardModal);
    boardModalOverlay.addEventListener('click', (e) => {
        if (e.target === boardModalOverlay) closeBoardModal();
    });
    saveBoardSelection.addEventListener('click', saveRecipeToBoards);
    createBoardBtn.addEventListener('click', handleCreateBoard);
    newBoardName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCreateBoard();
        }
    });

    // View Tabs
    recipesTab.addEventListener('click', () => switchView('recipes'));
    boardsTab.addEventListener('click', () => switchView('boards'));

    // Escape key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeImportModal();
            closeCreateModal();
            closeBoardModal();
        }
    });
}

// ============================================
// IMPORT FROM WEB
// ============================================

function openImportModal() {
    importModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('recipeUrl').focus();
}

function closeImportModal() {
    importModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    importForm.reset();
    hideImportError();
}

async function handleImportSubmit(e) {
    e.preventDefault();

    const url = document.getElementById('recipeUrl').value.trim();
    if (!url) return;

    const submitBtn = document.getElementById('submitImport');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');

    // Show loading state
    btnText.style.display = 'none';
    btnLoading.style.display = 'flex';
    submitBtn.disabled = true;
    hideImportError();

    try {
        // Get the user's ID token for authentication
        const idToken = await currentUser.getIdToken();

        // Call Cloud Function HTTP endpoint
        const response = await fetch('https://us-central1-pams-recipes.cloudfunctions.net/scrape_recipe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ url })
        });

        const result = await response.json();

        if (result.success) {
            closeImportModal();
            // Recipe will appear via real-time listener
        } else {
            showImportError(result.error || 'Failed to import recipe. Please try again.');
        }
    } catch (error) {
        console.error('Import error:', error);
        showImportError(error.message || 'Failed to import recipe. Please check the URL and try again.');
    } finally {
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        submitBtn.disabled = false;
    }
}

function showImportError(message) {
    const errorEl = document.getElementById('importError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function hideImportError() {
    document.getElementById('importError').style.display = 'none';
}

// ============================================
// CREATE PERSONAL RECIPE
// ============================================

let selectedPhotoFile = null;

function openCreateModal() {
    createModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('recipeTitle').focus();
}

function closeCreateModal() {
    createModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    createForm.reset();
    selectedPhotoFile = null;
    photoPreview.style.display = 'none';
    photoPlaceholder.style.display = 'flex';
    hideCreateError();
}

function handlePhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
        showCreateError('Please select an image file.');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showCreateError('Image must be less than 5MB.');
        return;
    }

    selectedPhotoFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        photoPreview.src = e.target.result;
        photoPreview.style.display = 'block';
        photoPlaceholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function handleCreateSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('recipeTitle').value.trim();
    if (!title) return;

    const submitBtn = document.getElementById('submitCreate');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');

    // Show loading state
    btnText.style.display = 'none';
    btnLoading.style.display = 'flex';
    submitBtn.disabled = true;
    hideCreateError();

    try {
        let imageUrl = null;

        // Upload photo if selected
        if (selectedPhotoFile) {
            const fileExt = selectedPhotoFile.name.split('.').pop();
            const fileName = `${Date.now()}-${slugify(title)}.${fileExt}`;
            const storageRef = storage.ref(`images/${fileName}`);

            await storageRef.put(selectedPhotoFile);
            imageUrl = await storageRef.getDownloadURL();
        }

        // Parse ingredients and instructions
        const ingredientsText = document.getElementById('recipeIngredients').value;
        const directionsText = document.getElementById('recipeDirections').value;

        const ingredients = ingredientsText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const instructions = directionsText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        // Build total time
        const hours = parseInt(document.getElementById('timeHours').value) || 0;
        const mins = parseInt(document.getElementById('timeMins').value) || 0;
        let totalTime = null;
        if (hours > 0 || mins > 0) {
            totalTime = `PT${hours > 0 ? hours + 'H' : ''}${mins > 0 ? mins + 'M' : ''}`;
        }

        // Create recipe document
        const recipeData = {
            title,
            author: currentUser.displayName || 'Personal Recipe',
            ingredients,
            instructions,
            servings: document.getElementById('recipeYield').value.trim() || null,
            total_time: totalTime,
            description: document.getElementById('recipeNotes').value.trim() || null,
            image_url: imageUrl,
            date_added: new Date().toISOString(),
            source: 'personal',
            created_by: currentUser.uid,
        };

        // Remove null values
        Object.keys(recipeData).forEach(key => {
            if (recipeData[key] === null) delete recipeData[key];
        });

        await db.collection('recipes').add(recipeData);

        closeCreateModal();
        // Recipe will appear via real-time listener

    } catch (error) {
        console.error('Create error:', error);
        showCreateError(error.message || 'Failed to save recipe. Please try again.');
    } finally {
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        submitBtn.disabled = false;
    }
}

function showCreateError(message) {
    const errorEl = document.getElementById('createError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function hideCreateError() {
    document.getElementById('createError').style.display = 'none';
}

// ============================================
// BOARDS
// ============================================

function loadBoards() {
    // Real-time listener for boards
    unsubscribeBoards = db.collection('boards')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            allBoards = [];
            snapshot.forEach((doc) => {
                allBoards.push({ id: doc.id, ...doc.data() });
            });
            if (currentView === 'boards') {
                renderBoards();
            }
        }, (error) => {
            console.error('Error loading boards:', error);
        });
}

function switchView(view) {
    currentView = view;
    currentBoardFilter = null;

    // Update tabs
    recipesTab.classList.toggle('active', view === 'recipes');
    boardsTab.classList.toggle('active', view === 'boards');

    // Show/hide views
    recipeGrid.style.display = view === 'recipes' ? 'grid' : 'none';
    boardsView.style.display = view === 'boards' ? 'block' : 'none';

    // Remove board view header if exists
    const existingHeader = document.querySelector('.board-view-header');
    if (existingHeader) existingHeader.remove();

    // Update count label
    if (view === 'boards') {
        renderBoards();
        recipeCount.textContent = allBoards.length;
        document.querySelector('.recipe-count').innerHTML = `<span id="recipeCount">${allBoards.length}</span> boards`;
    } else {
        filteredRecipes = [...allRecipes];
        applyCurrentSort();
        renderRecipes();
        document.querySelector('.recipe-count').innerHTML = `<span id="recipeCount">${filteredRecipes.length}</span> recipes`;
    }
}

function renderBoards() {
    // Calculate recipe counts for each board
    const boardCounts = {};
    allBoards.forEach(board => {
        boardCounts[board.id] = allRecipes.filter(r => r.boards && r.boards.includes(board.name)).length;
    });

    let boardsHtml = '';

    // Add "Create New Board" card first (only for authorized users)
    if (currentUser && isAuthorizedUser(currentUser)) {
        boardsHtml += `
            <div class="board-card create-board" onclick="openCreateBoardPrompt()">
                <div class="create-board-content">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5v14"></path>
                        <path d="M5 12h14"></path>
                    </svg>
                    <span>New Board</span>
                </div>
            </div>
        `;
    }

    // Add existing boards
    allBoards.forEach(board => {
        const count = boardCounts[board.id] || 0;
        const coverImage = board.coverImage;
        const showEditBtn = currentUser && isAuthorizedUser(currentUser);

        boardsHtml += `
            <div class="board-card" onclick="openBoard('${board.id}')">
                <div class="board-card-image">
                    ${coverImage
                        ? `<img src="${coverImage}" alt="${escapeHtml(board.name)}" loading="lazy">`
                        : `<div class="board-card-placeholder">${getPlaceholderSVGRaw()}</div>`
                    }
                </div>
                <div class="board-card-overlay">
                    <div class="board-card-name">${escapeHtml(board.name)}</div>
                    <div class="board-card-count">${count} ${count === 1 ? 'item' : 'items'}</div>
                </div>
                ${showEditBtn ? `
                <button class="board-edit-btn" onclick="event.stopPropagation(); openBoardEditMenu('${board.id}', event)" aria-label="Edit board">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                </button>
                ` : ''}
            </div>
        `;
    });

    if (allBoards.length === 0 && (!currentUser || !isAuthorizedUser(currentUser))) {
        boardsHtml = `
            <div class="loading" style="grid-column: 1 / -1;">
                <p>No boards yet.</p>
            </div>
        `;
    }

    boardsGrid.innerHTML = boardsHtml;
}

function openCreateBoardPrompt() {
    const name = prompt('Enter board name:');
    if (name && name.trim()) {
        createBoard(name.trim());
    }
}

async function createBoard(name) {
    try {
        await db.collection('boards').add({
            name: name,
            coverImage: null,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error creating board:', error);
        alert('Failed to create board: ' + error.message);
    }
}

function openBoard(boardId) {
    const board = allBoards.find(b => b.id === boardId);
    if (!board) return;

    currentBoardFilter = board.name;
    currentView = 'recipes';

    // Update tabs
    recipesTab.classList.remove('active');
    boardsTab.classList.add('active');

    // Filter recipes by board
    filteredRecipes = allRecipes.filter(r => r.boards && r.boards.includes(board.name));

    // Show recipe grid with back button
    boardsView.style.display = 'none';
    recipeGrid.style.display = 'grid';

    // Add header for board view
    const existingHeader = document.querySelector('.board-view-header');
    if (existingHeader) existingHeader.remove();

    const header = document.createElement('div');
    header.className = 'board-view-header';
    header.innerHTML = `
        <button class="back-to-boards" onclick="switchView('boards')">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m15 18-6-6 6-6"></path>
            </svg>
            Back
        </button>
        <h2 class="board-view-title">${escapeHtml(board.name)}</h2>
        <span class="board-view-count">${filteredRecipes.length} ${filteredRecipes.length === 1 ? 'recipe' : 'recipes'}</span>
    `;

    recipeGrid.parentElement.insertBefore(header, recipeGrid);

    // Update count
    document.querySelector('.recipe-count').innerHTML = `<span id="recipeCount">${filteredRecipes.length}</span> recipes in board`;

    renderRecipes();
}

function openBoardEditMenu(boardId, event) {
    const board = allBoards.find(b => b.id === boardId);
    if (!board) return;
    
    // Remove any existing menu
    const existingMenu = document.querySelector('.board-dropdown-menu');
    if (existingMenu) existingMenu.remove();
    
    // Create dropdown menu
    const menu = document.createElement('div');
    menu.className = 'board-dropdown-menu';
    menu.innerHTML = `
        <button class="board-menu-item" onclick="renameBoard('${boardId}', '${escapeHtml(board.name)}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
            </svg>
            Rename
        </button>
        <button class="board-menu-item board-menu-item-danger" onclick="deleteBoard('${boardId}', '${escapeHtml(board.name)}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"></path>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
            Delete
        </button>
    `;
    
    // Position near the button
    const btn = event.target.closest('.board-edit-btn');
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    
    document.body.appendChild(menu);
    
    // Close menu when clicking elsewhere
    const closeMenu = (e) => {
        if (!menu.contains(e.target) && e.target !== btn) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
}

async function renameBoard(boardId, currentName) {
    // Close dropdown menu
    const menu = document.querySelector('.board-dropdown-menu');
    if (menu) menu.remove();
    
    const newName = prompt(`Enter new name for "${currentName}":`, currentName);
    
    if (!newName || newName.trim() === '' || newName.trim() === currentName) return;
    
    const trimmedName = newName.trim();

    // Check if name already exists
    if (allBoards.some(b => b.name.toLowerCase() === trimmedName.toLowerCase() && b.id !== boardId)) {
        alert('A board with this name already exists.');
        return;
    }

    try {
        // Update board name
        await db.collection('boards').doc(boardId).update({
            name: trimmedName
        });

        // Update all recipes that have this board
        const recipesWithBoard = allRecipes.filter(r => r.boards && r.boards.includes(currentName));
        for (const recipe of recipesWithBoard) {
            const updatedBoards = recipe.boards.map(b => b === currentName ? trimmedName : b);
            await db.collection('recipes').doc(recipe.id).update({
                boards: updatedBoards
            });
        }

        // Boards will refresh via real-time listener
    } catch (error) {
        console.error('Error renaming board:', error);
        alert('Failed to rename board: ' + error.message);
    }
}

async function deleteBoard(boardId, boardName) {
    // Close dropdown menu
    const menu = document.querySelector('.board-dropdown-menu');
    if (menu) menu.remove();
    
    const recipeCount = allRecipes.filter(r => r.boards && r.boards.includes(boardName)).length;

    const confirmMsg = recipeCount > 0
        ? `Are you sure you want to delete "${boardName}"?\n\nThis board contains ${recipeCount} recipe(s). The recipes will NOT be deleted, just removed from this board.`
        : `Are you sure you want to delete "${boardName}"?`;

    if (!confirm(confirmMsg)) return;

    try {
        // Remove board from all recipes
        const recipesWithBoard = allRecipes.filter(r => r.boards && r.boards.includes(boardName));
        for (const recipe of recipesWithBoard) {
            const updatedBoards = recipe.boards.filter(b => b !== boardName);
            await db.collection('recipes').doc(recipe.id).update({
                boards: updatedBoards
            });
        }

        // Delete the board
        await db.collection('boards').doc(boardId).delete();

        // Boards will refresh via real-time listener
    } catch (error) {
        console.error('Error deleting board:', error);
        alert('Failed to delete board: ' + error.message);
    }
}

// Make functions available globally
window.openCreateBoardPrompt = openCreateBoardPrompt;
window.openBoard = openBoard;
window.openBoardEditMenu = openBoardEditMenu;
window.renameBoard = renameBoard;
window.deleteBoard = deleteBoard;

// Board Modal Functions
function openBoardModal(recipe) {
    currentRecipeForBoard = recipe;
    selectedBoards = recipe.boards ? [...recipe.boards] : [];

    renderBoardsList();
    boardModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeBoardModal() {
    boardModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    currentRecipeForBoard = null;
    selectedBoards = [];
    newBoardName.value = '';
}

function renderBoardsList() {
    if (allBoards.length === 0) {
        boardsList.innerHTML = `
            <div class="boards-list-empty">
                No boards yet. Create one above!
            </div>
        `;
        return;
    }

    boardsList.innerHTML = allBoards.map(board => {
        const isSelected = selectedBoards.includes(board.name);
        const count = allRecipes.filter(r => r.boards && r.boards.includes(board.name)).length;

        return `
            <div class="board-list-item ${isSelected ? 'selected' : ''}" onclick="toggleBoardSelection('${escapeHtml(board.name)}')">
                <div class="board-list-thumb">
                    ${board.coverImage
                        ? `<img src="${board.coverImage}" alt="${escapeHtml(board.name)}">`
                        : `<div class="board-list-thumb-placeholder">${getPlaceholderSVGRaw()}</div>`
                    }
                </div>
                <div class="board-list-info">
                    <div class="board-list-name">${escapeHtml(board.name)}</div>
                    <div class="board-list-count">${count} ${count === 1 ? 'item' : 'items'}</div>
                </div>
                <div class="board-list-check">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
            </div>
        `;
    }).join('');
}

function toggleBoardSelection(boardName) {
    const index = selectedBoards.indexOf(boardName);
    if (index > -1) {
        selectedBoards.splice(index, 1);
    } else {
        selectedBoards.push(boardName);
    }
    renderBoardsList();
}

window.toggleBoardSelection = toggleBoardSelection;

async function handleCreateBoard() {
    const name = newBoardName.value.trim();
    if (!name) return;

    // Check if board already exists
    if (allBoards.some(b => b.name.toLowerCase() === name.toLowerCase())) {
        alert('A board with this name already exists.');
        return;
    }

    try {
        // Get cover image from current recipe if available
        let coverImage = null;
        if (currentRecipeForBoard) {
            coverImage = getImageUrl(currentRecipeForBoard);
        }

        await db.collection('boards').add({
            name: name,
            coverImage: coverImage,
            createdAt: new Date().toISOString()
        });

        // Add to selected boards
        selectedBoards.push(name);
        newBoardName.value = '';

        // Re-render after a short delay to allow Firestore to update
        setTimeout(() => renderBoardsList(), 500);

    } catch (error) {
        console.error('Error creating board:', error);
        alert('Failed to create board: ' + error.message);
    }
}

async function saveRecipeToBoards() {
    if (!currentRecipeForBoard) return;

    // Store references before closing modal
    const recipeId = currentRecipeForBoard.id;
    const recipeImage = getImageUrl(currentRecipeForBoard);
    const boardsToSave = [...selectedBoards];

    try {
        // Update recipe with selected boards
        await db.collection('recipes').doc(recipeId).update({
            boards: boardsToSave
        });

        // If this is the first recipe being added to a board that has no cover image, set the cover
        for (const boardName of boardsToSave) {
            const board = allBoards.find(b => b.name === boardName);
            if (board && !board.coverImage && recipeImage) {
                await db.collection('boards').doc(board.id).update({
                    coverImage: recipeImage
                });
            }
        }

        closeBoardModal();

        // Refresh the recipe modal if it's still open
        if (modalOverlay.classList.contains('active')) {
            // Update the recipe in our local state
            const recipeIndex = allRecipes.findIndex(r => r.id === recipeId);
            if (recipeIndex > -1) {
                allRecipes[recipeIndex].boards = boardsToSave;
                openRecipeModal(allRecipes[recipeIndex]);
            }
        }

    } catch (error) {
        console.error('Error saving to boards:', error);
        alert('Failed to save to boards: ' + error.message);
    }
}

// ============================================
// RENDER RECIPES
// ============================================

function renderRecipes() {
    recipeCount.textContent = filteredRecipes.length;

    if (filteredRecipes.length === 0) {
        recipeGrid.innerHTML = `
            <div class="loading" style="grid-column: 1 / -1;">
                <p>No recipes found matching your search.</p>
            </div>
        `;
        return;
    }

    recipeGrid.innerHTML = filteredRecipes.map((recipe, index) => createRecipeCard(recipe, index)).join('');

    // Add click and keyboard listeners to cards
    document.querySelectorAll('.recipe-card').forEach((card, index) => {
        card.addEventListener('click', () => openRecipeModal(filteredRecipes[index]));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openRecipeModal(filteredRecipes[index]);
            }
        });
    });
}

function createRecipeCard(recipe, index) {
    const totalTime = formatDuration(recipe.total_time);
    const servings = recipe.servings ? recipe.servings.replace(/^(yields?|makes?|serves?):?\s*/i, '') : '';
    const imageUrl = getImageUrl(recipe);
    const isPersonal = recipe.source === 'personal';

    return `
        <article class="recipe-card ${isPersonal ? 'personal-recipe' : ''}" data-index="${index}" role="button" tabindex="0" aria-label="${escapeHtml(recipe.title)} by ${escapeHtml(recipe.author || 'Unknown')}">
            <div class="card-image">
                ${imageUrl ? `<img src="${imageUrl}" alt="${escapeHtml(recipe.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="card-placeholder" style="display:none">${getPlaceholderSVGRaw()}</div>` : `<div class="card-placeholder">${getPlaceholderSVGRaw()}</div>`}
            </div>
            <div class="card-content">
                <div class="card-author">${escapeHtml(recipe.author || 'Unknown')}${isPersonal ? ' <span class="personal-badge">Personal</span>' : ''}</div>
                <h3 class="card-title">${escapeHtml(recipe.title)}</h3>
                <div class="card-meta">
                    ${totalTime ? `
                        <span class="card-meta-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${totalTime}
                        </span>
                    ` : ''}
                    ${servings ? `
                        <span class="card-meta-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            ${servings}
                        </span>
                    ` : ''}
                </div>
            </div>
        </article>
    `;
}

// ============================================
// RECIPE MODAL
// ============================================

function openRecipeModal(recipe) {
    modalContent.innerHTML = createRecipeDetail(recipe);
    modalContent.scrollTop = 0; // Reset scroll position to top
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Attach delete handler if button exists
    const deleteBtn = modalContent.querySelector('.delete-recipe-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => confirmDeleteRecipe(recipe));
    }

    // Attach add to board handler if button exists
    const addToBoardBtn = modalContent.querySelector('#addToBoardBtn');
    if (addToBoardBtn) {
        addToBoardBtn.addEventListener('click', () => openBoardModal(recipe));
    }
}

function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    // Release wake lock when closing modal
    releaseCookMode();
}

// Cook Mode - Screen Wake Lock
async function toggleCookMode(enabled) {
    if (enabled) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Cook Mode: Screen wake lock acquired');

            // When wake lock is released (e.g., switching apps), update the toggle
            wakeLock.addEventListener('release', () => {
                console.log('Cook Mode: Screen wake lock released');
                wakeLock = null;
                const toggle = document.getElementById('cookModeToggle');
                if (toggle) toggle.checked = false;
            });
        } catch (err) {
            console.error('Cook Mode failed:', err);
            // Uncheck the toggle if it failed
            const toggle = document.getElementById('cookModeToggle');
            if (toggle) toggle.checked = false;
        }
    } else {
        releaseCookMode();
    }
}

function releaseCookMode() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
}

async function confirmDeleteRecipe(recipe) {
    const confirmed = confirm(`Are you sure you want to delete "${recipe.title}"?\n\nThis cannot be undone.`);

    if (confirmed) {
        try {
            // Show loading state on button
            const deleteBtn = modalContent.querySelector('.delete-recipe-btn');
            if (deleteBtn) {
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = `
                    <span class="btn-loading" style="display: flex;">
                        <span class="loading-spinner" style="width: 16px; height: 16px;"></span>
                        Deleting...
                    </span>
                `;
            }

            // Delete from Firestore
            await db.collection('recipes').doc(recipe.id).delete();

            // Close modal - the recipe will disappear from the list via the real-time listener
            closeModal();

        } catch (error) {
            console.error('Delete error:', error);
            alert('Failed to delete recipe: ' + error.message);

            // Reset button
            const deleteBtn = modalContent.querySelector('.delete-recipe-btn');
            if (deleteBtn) {
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        <line x1="10" x2="10" y1="11" y2="17"></line>
                        <line x1="14" x2="14" y1="11" y2="17"></line>
                    </svg>
                    Delete Recipe
                `;
            }
        }
    }
}

function createRecipeDetail(recipe) {
    const prepTime = formatDuration(recipe.prep_time);
    const cookTime = formatDuration(recipe.cook_time);
    const totalTime = formatDuration(recipe.total_time);
    const servings = recipe.servings ? recipe.servings.replace(/^(yields?|makes?|serves?):?\s*/i, '') : '';
    const imageUrl = getImageUrl(recipe);

    const ingredientsList = recipe.ingredients
        ? recipe.ingredients.map(ing => `<li>${escapeHtml(ing)}</li>`).join('')
        : '<li>No ingredients listed</li>';

    const instructionsList = recipe.instructions
        ? recipe.instructions.map(inst => `<li>${escapeHtml(inst)}</li>`).join('')
        : '<li>No instructions listed</li>';

    // Shorten long nutrition labels
    const nutritionLabels = {
        'Carbohydrates': 'Carbs',
        'Cholesterol': 'Chol',
        'Saturated Fat': 'Sat Fat'
    };
    const getNutritionLabel = (key) => nutritionLabels[key] || key;

    // Add space between number and unit (e.g., "3g" -> "3 g")
    const formatNutritionValue = (value) => String(value).replace(/(\d)([a-zA-Z])/g, '$1 $2');

    const nutritionHtml = recipe.nutrition && Object.keys(recipe.nutrition).length > 0
        ? `
            <section class="nutrition-section">
                <h3 class="section-title">Nutrition Info</h3>
                <div class="nutrition-grid">
                    ${Object.entries(recipe.nutrition).map(([key, value]) => `
                        <div class="nutrition-item">
                            <div class="nutrition-value">${escapeHtml(formatNutritionValue(value))}</div>
                            <div class="nutrition-label">${escapeHtml(getNutritionLabel(key))}</div>
                        </div>
                    `).join('')}
                </div>
            </section>
        `
        : '';

    const sourceHtml = recipe.url
        ? `
            <div class="recipe-source">
                <a href="${escapeHtml(recipe.url)}" target="_blank" rel="noopener noreferrer">
                    View original recipe →
                </a>
            </div>
        `
        : '';

    // Delete button - only show for authorized users
    const deleteButtonHtml = currentUser && isAuthorizedUser(currentUser)
        ? `
            <div class="delete-recipe-container">
                <button class="delete-recipe-btn" type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        <line x1="10" x2="10" y1="11" y2="17"></line>
                        <line x1="14" x2="14" y1="11" y2="17"></line>
                    </svg>
                    Delete Recipe
                </button>
            </div>
        `
        : '';

    return `
        <div class="recipe-detail">
            <div class="recipe-hero">
                ${imageUrl
                    ? `<img src="${imageUrl}" alt="${escapeHtml(recipe.title)}">`
                    : `<div class="recipe-hero-placeholder">${getPlaceholderSVGRaw()}</div>`
                }
            </div>
            <div class="recipe-body">
                <header class="recipe-header">
                    <div class="recipe-author">Recipe by ${escapeHtml(recipe.author || 'Unknown')}</div>
                    <h1 class="recipe-title">${escapeHtml(recipe.title)}</h1>
                    ${recipe.description ? `<p class="recipe-description">${escapeHtml(recipe.description)}</p>` : ''}
                    <div class="recipe-meta-bar">
                        ${prepTime ? `
                            <div class="meta-item">
                                <span class="meta-label">Prep</span>
                                <span class="meta-value">${prepTime}</span>
                            </div>
                        ` : ''}
                        ${cookTime ? `
                            <div class="meta-item">
                                <span class="meta-label">Cook</span>
                                <span class="meta-value">${cookTime}</span>
                            </div>
                        ` : ''}
                        ${totalTime ? `
                            <div class="meta-item">
                                <span class="meta-label">Total</span>
                                <span class="meta-value">${totalTime}</span>
                            </div>
                        ` : ''}
                        ${servings ? `
                            <div class="meta-item">
                                <span class="meta-label">Yield</span>
                                <span class="meta-value">${servings}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="recipe-header-actions">
                        <button class="print-button" onclick="window.print()">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                <rect width="12" height="8" x="6" y="14"></rect>
                            </svg>
                            Print Recipe
                        </button>
                        ${currentUser && isAuthorizedUser(currentUser) ? `
                        <button class="add-to-board-btn" id="addToBoardBtn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                            Add to Board
                        </button>
                        ` : ''}
                    </div>
                    ${recipe.boards && recipe.boards.length > 0 ? `
                    <div class="recipe-boards-tags">
                        ${recipe.boards.map(boardName => `
                            <span class="board-tag">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                </svg>
                                ${escapeHtml(boardName)}
                            </span>
                        `).join('')}
                    </div>
                    ` : ''}
                    ${(isTouchDevice && supportsWakeLock) ? `
                    <div class="cook-mode">
                        <label class="cook-mode-toggle">
                            <input type="checkbox" id="cookModeToggle" onchange="toggleCookMode(this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                        <span class="cook-mode-label">Cook Mode <span class="cook-mode-hint">(Keep screen awake)</span></span>
                    </div>
                    ` : ''}
                </header>

                <div class="recipe-content">
                    <section class="ingredients-section">
                        <h3 class="section-title">Ingredients</h3>
                        <ul class="ingredients-list">
                            ${ingredientsList}
                        </ul>
                    </section>

                    <section class="instructions-section">
                        <h3 class="section-title">Directions</h3>
                        <ol class="instructions-list">
                            ${instructionsList}
                        </ol>
                    </section>
                </div>

                ${nutritionHtml}
                ${sourceHtml}
                ${deleteButtonHtml}
            </div>
        </div>
    `;
}

// ============================================
// SEARCH & SORT
// ============================================

function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();

    if (!query) {
        filteredRecipes = [...allRecipes];
    } else {
        filteredRecipes = allRecipes.filter(recipe => {
            const titleMatch = recipe.title?.toLowerCase().includes(query);
            const authorMatch = recipe.author?.toLowerCase().includes(query);
            const descMatch = recipe.description?.toLowerCase().includes(query);
            const ingredientMatch = recipe.ingredients?.some(ing => ing.toLowerCase().includes(query));
            return titleMatch || authorMatch || descMatch || ingredientMatch;
        });
    }

    applyCurrentSort();
    renderRecipes();
}

function handleSort() {
    applyCurrentSort();
    renderRecipes();
}

function applyCurrentSort() {
    const sortValue = sortSelect.value;

    switch (sortValue) {
        case 'az':
            filteredRecipes.sort((a, b) =>
                (a.title || '').localeCompare(b.title || '')
            );
            break;
        case 'za':
            filteredRecipes.sort((a, b) =>
                (b.title || '').localeCompare(a.title || '')
            );
            break;
        case 'author':
            filteredRecipes.sort((a, b) =>
                (a.author || '').localeCompare(b.author || '')
            );
            break;
        case 'newest':
        default:
            filteredRecipes.sort((a, b) => {
                const dateA = a.date_added || '';
                const dateB = b.date_added || '';
                return dateB.localeCompare(dateA);
            });
            break;
    }
}

// ============================================
// UTILITIES
// ============================================

function showLoading() {
    recipeGrid.innerHTML = `
        <div class="loading" style="grid-column: 1 / -1;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 1rem;">Loading recipes...</p>
        </div>
    `;
}

function formatDuration(isoDuration) {
    if (!isoDuration) return '';

    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!match) return '';

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;

    if (hours === 0 && minutes === 0) return '';

    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours} hr${hours > 1 ? 's' : ''}`;
    } else {
        return `${minutes} min`;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function getPlaceholderSVGRaw() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" x2="18" y1="17" y2="17"/></svg>`;
}

// Get image URL - convert local_image_path to Cloud Storage URL
function getImageUrl(recipe) {
    // If it's already a full URL (http/https), use it directly
    if (recipe.image_url && recipe.image_url.startsWith('http')) {
        return recipe.image_url;
    }
    // If we have a local_image_path, construct the Cloud Storage URL
    if (recipe.local_image_path) {
        return `https://storage.googleapis.com/pams-recipes.firebasestorage.app/${recipe.local_image_path}`;
    }
    // Fallback to image_url if it exists
    return recipe.image_url || null;
}

