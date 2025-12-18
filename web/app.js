/**
 * Recipe Collection App
 * Displays and manages a collection of recipes from Food Network
 */

// State
let allRecipes = [];
let filteredRecipes = [];

// DOM Elements
const recipeGrid = document.getElementById('recipeGrid');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const recipeCount = document.getElementById('recipeCount');
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
    showLoading();
    await loadRecipes();
    setupEventListeners();
}

// Load recipes from JSON file
async function loadRecipes() {
    try {
        const response = await fetch('../output/all_recipes_final.json');
        allRecipes = await response.json();
        filteredRecipes = [...allRecipes];
        renderRecipes();
    } catch (error) {
        console.error('Failed to load recipes:', error);
        recipeGrid.innerHTML = `
            <div class="loading">
                <p>Unable to load recipes. Please ensure the JSON file is accessible.</p>
            </div>
        `;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', debounce(handleSearch, 300));

    // Sort
    sortSelect.addEventListener('change', handleSort);

    // Modal close
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// Render recipes grid
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

// Create recipe card HTML
function createRecipeCard(recipe, index) {
    const totalTime = formatDuration(recipe.total_time);
    const servings = recipe.servings ? recipe.servings.replace(/^(yields?|makes?|serves?):?\s*/i, '') : '';

    return `
        <article class="recipe-card" data-index="${index}" role="button" tabindex="0" aria-label="${escapeHtml(recipe.title)} by ${escapeHtml(recipe.author || 'Unknown')}">
            <div class="card-image">
                ${recipe.image_url ? `<img src="${recipe.image_url}" alt="${escapeHtml(recipe.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="card-placeholder" style="display:none">${getPlaceholderSVGRaw()}</div>` : `<div class="card-placeholder">${getPlaceholderSVGRaw()}</div>`}
            </div>
            <div class="card-content">
                <div class="card-author">${escapeHtml(recipe.author || 'Unknown')}</div>
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

// Open recipe modal
function openRecipeModal(recipe) {
    modalContent.innerHTML = createRecipeDetail(recipe);
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Create recipe detail HTML
function createRecipeDetail(recipe) {
    const prepTime = formatDuration(recipe.prep_time);
    const cookTime = formatDuration(recipe.cook_time);
    const totalTime = formatDuration(recipe.total_time);
    const servings = recipe.servings ? recipe.servings.replace(/^(yields?|makes?|serves?):?\s*/i, '') : '';

    const ingredientsList = recipe.ingredients
        ? recipe.ingredients.map(ing => `<li>${escapeHtml(ing)}</li>`).join('')
        : '<li>No ingredients listed</li>';

    const instructionsList = recipe.instructions
        ? recipe.instructions.map(inst => `<li>${escapeHtml(inst)}</li>`).join('')
        : '<li>No instructions listed</li>';

    const nutritionHtml = recipe.nutrition && Object.keys(recipe.nutrition).length > 0
        ? `
            <section class="nutrition-section">
                <h3 class="section-title">Nutrition Info</h3>
                <div class="nutrition-grid">
                    ${Object.entries(recipe.nutrition).map(([key, value]) => `
                        <div class="nutrition-item">
                            <div class="nutrition-value">${escapeHtml(String(value))}</div>
                            <div class="nutrition-label">${escapeHtml(key)}</div>
                        </div>
                    `).join('')}
                </div>
            </section>
        `
        : '';

    return `
        <div class="recipe-detail">
            <div class="recipe-hero">
                ${recipe.image_url
                    ? `<img src="${recipe.image_url}" alt="${escapeHtml(recipe.title)}">`
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
                    <button class="print-button" onclick="window.print()">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 6 2 18 2 18 9"></polyline>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                            <rect width="12" height="8" x="6" y="14"></rect>
                        </svg>
                        Print Recipe
                    </button>
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

                <div class="recipe-source">
                    <a href="${escapeHtml(recipe.url)}" target="_blank" rel="noopener noreferrer">
                        View original on Food Network →
                    </a>
                </div>
            </div>
        </div>
    `;
}

// Search handler
function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();

    if (!query) {
        filteredRecipes = [...allRecipes];
    } else {
        filteredRecipes = allRecipes.filter(recipe => {
            const titleMatch = recipe.title?.toLowerCase().includes(query);
            const authorMatch = recipe.author?.toLowerCase().includes(query);
            const ingredientMatch = recipe.ingredients?.some(ing =>
                ing.toLowerCase().includes(query)
            );
            const descMatch = recipe.description?.toLowerCase().includes(query);

            return titleMatch || authorMatch || ingredientMatch || descMatch;
        });
    }

    // Re-apply current sort
    applyCurrentSort();
    renderRecipes();
}

// Sort handler
function handleSort() {
    applyCurrentSort();
    renderRecipes();
}

// Apply current sort option
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
            // Keep original order (order from JSON file)
            const originalOrder = new Map(allRecipes.map((r, i) => [r.url, i]));
            filteredRecipes.sort((a, b) =>
                (originalOrder.get(a.url) || 0) - (originalOrder.get(b.url) || 0)
            );
            break;
    }
}

// Show loading state
function showLoading() {
    recipeGrid.innerHTML = `
        <div class="loading" style="grid-column: 1 / -1;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 1rem;">Loading recipes...</p>
        </div>
    `;
}

// Utility: Format ISO 8601 duration to human readable
function formatDuration(isoDuration) {
    if (!isoDuration) return '';

    // Parse ISO 8601 duration: P0Y0M0DT0H15M0.000S
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

// Utility: Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility: Debounce function
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

// Placeholder SVG for cards without images
function getPlaceholderSVG() {
    return `<div class="card-placeholder"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" x2="18" y1="17" y2="17"/></svg></div>`;
}

function getPlaceholderSVGRaw() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" x2="18" y1="17" y2="17"/></svg>`;
}

